const express = require('express');
const Resource = require('../models/Resource');
const Event = require('../models/Event');
const Ticket = require('../models/Ticket');
const { protect } = require('../middleware/auth');

const router = express.Router();

let cachedGroqModel = null;

// Poisson tail probability helper (matches ticketRoutes.js)
const computeConfirmationProbability = (position, maxSeats, startTime, historicalCancelRate = 0.15) => {
  if (!position || position <= 0) return 100;
  const hoursRemaining = Math.max(0.25, (new Date(startTime).getTime() - Date.now()) / (1000 * 60 * 60));
  const timeFactor = Math.min(1, hoursRemaining / 24);
  const lambda = Math.max(0.15, maxSeats * historicalCancelRate * timeFactor);

  let cdf = 0;
  let term = Math.exp(-lambda);
  for (let i = 0; i < position; i++) {
    if (i > 0) term = (term * lambda) / i;
    cdf += term;
  }
  const prob = Math.max(0.03, Math.min(0.99, 1 - cdf));
  return Math.round(prob * 100);
};

async function getAvailableGroqModel(apiKey) {
  if (cachedGroqModel) return cachedGroqModel;

  const res = await fetch('https://api.groq.com/openai/v1/models', {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch Groq models: ${res.status}`);
  }

  const data = await res.json();
  const models = (data.data || [])
    .map((m) => m.id)
    .filter(
      (id) =>
        !id.includes('whisper') &&
        !id.includes('guard') &&
        !id.includes('tts') &&
        !id.includes('embed')
    );

  const preferred =
    models.find((id) => id.includes('llama-3.3-70b')) ||
    models.find((id) => id.includes('llama-4')) ||
    models.find((id) => id.includes('llama')) ||
    models.find((id) => id.includes('qwen')) ||
    models[0];

  if (!preferred) {
    throw new Error('No active text models found on Groq account');
  }

  cachedGroqModel = preferred;
  console.log('✅ Selected Groq model:', cachedGroqModel);
  return cachedGroqModel;
}

router.post('/chat', protect, async (req, res) => {
  let resourceSummary = 'No active campus resources listed yet.';
  let eventSummary = 'No approved upcoming events currently scheduled.';
  let personalPassSummary = 'You currently hold 0 active QR passes or standby waitlist entries.';

  try {
    const { message, history = [] } = req.body;
    if (!message || !message.trim()) {
      return res.status(400).json({ message: 'Message is required.' });
    }

    const [resources, events, myTickets, totalTickets, cancelledTickets] = await Promise.all([
      Resource.find({ isActive: true }).select('name category location capacity requiresApproval'),
      Event.find({ status: 'approved' })
        .populate('resource', 'name location')
        .select('title clubName startTime endTime maxSeats bookedSeats resource'),
      Ticket.find({ student: req.user.id, status: { $ne: 'cancelled' } })
        .populate({
          path: 'event',
          select: 'title clubName startTime maxSeats',
          populate: { path: 'resource', select: 'name location' },
        })
        .sort({ createdAt: -1 }),
      Ticket.countDocuments(),
      Ticket.countDocuments({ status: 'cancelled' }),
    ]);

    const smoothedCancelRate = (cancelledTickets + 10 * 0.15) / (totalTickets + 10);

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
            ).toLocaleString()} (${Math.max(0, e.maxSeats - e.bookedSeats)}/${e.maxSeats} seats left)`
        )
        .join('\n');
    }

    if (myTickets.length > 0) {
      personalPassSummary = myTickets
        .map((t) => {
          const evTitle = t.event?.title || 'Unknown Event';
          const club = t.event?.clubName || '';
          const venue = t.event?.resource?.name || 'TBA';
          const dateStr = t.event?.startTime ? new Date(t.event.startTime).toLocaleString() : '';

          if (t.status === 'waitlisted') {
            const prob = t.event
              ? computeConfirmationProbability(
                  t.waitlistPosition,
                  t.event.maxSeats,
                  t.event.startTime,
                  smoothedCancelRate
                )
              : 75;
            return `• ${evTitle} (${club}, ${venue}, ${dateStr}) -> WAITLISTED at Standby Queue #${t.waitlistPosition} (${prob}% estimated confirmation probability)`;
          }

          return `• ${evTitle} (${club}, ${venue}, ${dateStr}) -> CONFIRMED (${
            t.isCheckedIn
              ? `Already Checked In at ${new Date(t.checkedInAt).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}`
              : 'Active 30-second Rotating HMAC-SHA256 QR Pass'
          })`;
        })
        .join('\n');
    }

    const apiKey = process.env.GROQ_API_KEY?.trim();
    if (!apiKey) {
      return res.json({
        reply: `Here is your live campus snapshot from our database:\n\nYour Passes & Standby Status:\n${personalPassSummary}\n\nUpcoming Events:\n${eventSummary}\n\nVenues & Labs:\n${resourceSummary}`,
      });
    }

    const activeModel = await getAvailableGroqModel(apiKey);

    const systemPrompt = `You are CampusHub AI, the smart assistant for a college Resource & Event Ticketing System.
You ARE connected to the logged-in user's live MongoDB account records below. Answer their personal pass, standby queue, event, and venue questions directly, concisely, and warmly using ONLY the live database info provided. Do not dump the entire list unless asked.

LOGGED-IN USER (${req.user.name || 'User'}, Role: ${req.user.role}) — PERSONAL PASSES & STANDBY QUEUE:
${personalPassSummary}

LIVE APPROVED EVENTS:
${eventSummary}

LIVE CAMPUS RESOURCES:
${resourceSummary}

SYSTEM RULES:
- Students claim free 30-second rotating HMAC-SHA256 QR passes under "Events & Passes", and can cancel anytime to trigger FIFO auto-promotion for standby #1.
- Full events allow a bounded standby waitlist (15% of capacity, max 25) with Poisson confirmation probability estimates.
- Study pods/rooms auto-approve immediately; halls, labs, and equipment require Admin approval.
- Organizers create events (with Multi-Criteria Venue Fit-Score recommendations) under "Events & Passes" and scan passes under "Gate Scanner".`;

    const recentMessages = history.slice(-6).map((m) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content,
    }));

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
        model: activeModel,
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
      cachedGroqModel = null;
      console.error(`Groq API Error (${groqResponse.status}):`, errBody);
      throw new Error(`Groq API status ${groqResponse.status}`);
    }

    const data = await groqResponse.json();
    const reply = data.choices?.[0]?.message?.content || 'Sorry, I could not generate a response.';
    return res.json({ reply });
  } catch (err) {
    console.error('AI Helper Error:', err.message);
    return res.json({
      reply: `Here is your live campus snapshot directly from our database:\n\nYour Passes & Standby Status:\n${personalPassSummary}\n\nUpcoming Events:\n${eventSummary}\n\nVenues & Labs:\n${resourceSummary}`,
    });
  }
});

module.exports = router;