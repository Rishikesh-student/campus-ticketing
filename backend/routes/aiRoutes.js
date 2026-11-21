const express = require('express');
const Resource = require('../models/Resource');
const Event = require('../models/Event');

const router = express.Router();

router.post('/chat', async (req, res) => {
  try {
    const { message, history = [] } = req.body;
    if (!message || !message.trim()) {
      return res.status(400).json({ message: 'Message is required.' });
    }

    // Fetch live campus context from MongoDB
    const [resources, events] = await Promise.all([
      Resource.find({ isActive: true }).select('name category location capacity amenities requiresApproval'),
      Event.find({ status: 'approved' })
        .populate('resource', 'name location')
        .select('title clubName startTime endTime maxSeats bookedSeats resource'),
    ]);

    const resourceSummary =
      resources.length > 0
        ? resources
            .map(
              (r) =>
                `- ${r.name} (${r.category}, ${r.location}, Cap: ${r.capacity}, ${
                  r.requiresApproval ? 'Admin approval required' : 'Instant auto-approve'
                })`
            )
            .join('\n')
        : 'No active campus resources listed yet.';

    const eventSummary =
      events.length > 0
        ? events
            .map(
              (e) =>
                `- ${e.title} by ${e.clubName} at ${e.resource?.name || 'TBA'} on ${new Date(
                  e.startTime
                ).toLocaleString()} (${e.maxSeats - e.bookedSeats}/${e.maxSeats} seats left)`
            )
            .join('\n')
        : 'No approved upcoming events currently scheduled.';

    const systemPrompt = `You are CampusHub AI, the smart assistant for a college Resource & Event Ticketing System.
Help students, organizers, and admins with campus venue availability, event tickets, QR gate passes, and event descriptions.
Keep replies concise, friendly, and directly grounded in the live database below.

LIVE CAMPUS RESOURCES:
${resourceSummary}

LIVE APPROVED EVENTS:
${eventSummary}

SYSTEM RULES TO EXPLAIN WHEN ASKED:
- Students can claim free single-use HMAC-SHA256 QR passes under "Events & Passes".
- Study rooms/pods auto-approve immediately; halls, labs, and equipment require Admin approval.
- Organizers can create events under "Events & Passes" and scan passes under "Gate Scanner".`;

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      return res.json({
        reply: `AI key not configured yet, but here is live campus data:\n\n**Resources:**\n${resourceSummary}\n\n**Events:**\n${eventSummary}`,
      });
    }

    const recentMessages = history.slice(-6).map((m) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content,
    }));

    const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: systemPrompt },
          ...recentMessages,
          { role: 'user', content: message.trim() },
        ],
        temperature: 0.4,
        max_tokens: 350,
      }),
    });

    if (!groqResponse.ok) {
      throw new Error(`Groq API status ${groqResponse.status}`);
    }

    const data = await groqResponse.json();
    const reply = data.choices?.[0]?.message?.content || 'Sorry, I could not generate a response.';
    res.json({ reply });
  } catch (err) {
    console.error('AI Helper Error:', err.message);
    res.json({
      reply:
        'CampusHub AI is temporarily busy, but you can check live seat counts under **Events & Passes** or reserve rooms directly under **Campus Resources**!',
    });
  }
});

module.exports = router;