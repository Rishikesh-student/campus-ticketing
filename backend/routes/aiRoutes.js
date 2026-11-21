const express = require('express');
const Resource = require('../models/Resource');
const Event = require('../models/Event');

const router = express.Router();

router.post('/chat', async (req, res) => {
  let resourceSummary = 'No active campus resources listed yet.';
  let eventSummary = 'No approved upcoming events currently scheduled.';

  try {
    const { message, history = [] } = req.body;
    if (!message || !message.trim()) {
      return res.status(400).json({ message: 'Message is required.' });
    }

    // 1. Fetch live campus context from MongoDB
    const [resources, events] = await Promise.all([
      Resource.find({ isActive: true }).select('name category location capacity requiresApproval'),
      Event.find({ status: 'approved' })
        .populate('resource', 'name location')
        .select('title clubName startTime endTime maxSeats bookedSeats resource'),
    ]);

    if (resources.length > 0) {
      resourceSummary = resources
        .map(
          (r) =>
            `• ${r.name} (${r.category}, ${r.location}, Cap: ${r.capacity}, ${
              r.requiresApproval ? 'Admin approval required' : 'Instant auto-approve'
            })`
        )
        .join('\n');
    }

    if (events.length > 0) {
      eventSummary = events
        .map(
          (e) =>
            `• ${e.title} by ${e.clubName} at ${e.resource?.name || 'TBA'} on ${new Date(
              e.startTime
            ).toLocaleString()} (${e.maxSeats - e.bookedSeats}/${e.maxSeats} seats left)`
        )
        .join('\n');
    }

    const apiKey = process.env.GROQ_API_KEY?.trim();
    if (!apiKey) {
      console.error('GROQ_API_KEY is missing in environment variables');
      return res.json({
        reply: `Here is the live campus schedule from our database:\n\nVenues & Labs:\n${resourceSummary}\n\nUpcoming Events:\n${eventSummary}`,
      });
    }

    const systemPrompt = `You are CampusHub AI, the smart assistant for a college Resource & Event Ticketing System.
Answer concisely and warmly using ONLY the live database info below.

LIVE CAMPUS RESOURCES:
${resourceSummary}

LIVE APPROVED EVENTS:
${eventSummary}

SYSTEM RULES:
- Students claim free single-use HMAC-SHA256 QR passes under "Events & Passes".
- Study pods/rooms auto-approve immediately; halls, labs, and equipment require Admin approval.
- Organizers create events under "Events & Passes" and scan passes under "Gate Scanner".`;

    const recentMessages = history.slice(-6).map((m) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content,
    }));

    // 2. Call Groq with a 10-second timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [
          { role: 'system', content: systemPrompt },
          ...recentMessages,
          { role: 'user', content: message.trim() },
        ],
        temperature: 0.4,
        max_tokens: 350,
      }),
    });
    clearTimeout(timeout);

    if (!groqResponse.ok) {
      const errBody = await groqResponse.text();
      console.error(`Groq API Error (${groqResponse.status}):`, errBody);
      throw new Error(`Groq API status ${groqResponse.status}`);
    }

    const data = await groqResponse.json();
    const reply = data.choices?.[0]?.message?.content || 'Sorry, I could not generate a response.';
    return res.json({ reply });
  } catch (err) {
    console.error('AI Helper Error:', err.message);
    // Smart DB fallback so the user ALWAYS gets real campus info even if Groq fails
    return res.json({
      reply: `Here is the live campus availability directly from our database:\n\nVenues & Labs:\n${resourceSummary}\n\nUpcoming Events:\n${eventSummary}`,
    });
  }
});

module.exports = router;