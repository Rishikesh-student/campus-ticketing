const express = require('express');
const crypto = require('crypto');
const mongoose = require('mongoose');
const QRCode = require('qrcode');
const Event = require('../models/Event');
const Ticket = require('../models/Ticket');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

const WINDOW_SECONDS = 30;

// Helper 1: Static tamper-proof HMAC-SHA256 payload (stored in DB)
const signTicketPayload = (ticketId, eventId, studentId) => {
  const rawPayload = `${ticketId}:${eventId}:${studentId}`;
  const signature = crypto
    .createHmac('sha256', process.env.QR_HMAC_SECRET)
    .update(rawPayload)
    .digest('hex')
    .slice(0, 24);
  return `${rawPayload}:${signature}`;
};

// Helper 2: Time-Windowed Dynamic HMAC-SHA256 payload (anti-screenshot proxy defense)
const signRotatingPayload = (ticketId, eventId, studentId, timeWindow) => {
  const rawPayload = `${ticketId}:${eventId}:${studentId}:${timeWindow}`;
  const signature = crypto
    .createHmac('sha256', process.env.QR_HMAC_SECRET)
    .update(rawPayload)
    .digest('hex')
    .slice(0, 24);
  return `${rawPayload}:${signature}`;
};

// @route   POST /api/tickets/book/:eventId
// @desc    Atomically reserve 1 seat and generate HMAC-signed QR pass
router.post('/book/:eventId', protect, async (req, res) => {
  const { eventId } = req.params;
  const studentId = req.user.id;

  try {
    const existingTicket = await Ticket.findOne({ event: eventId, student: studentId });
    if (existingTicket) {
      return res.status(400).json({ message: 'You have already booked a pass for this event' });
    }

    const updatedEvent = await Event.findOneAndUpdate(
      {
        _id: eventId,
        status: 'approved',
        $expr: { $lt: ['$bookedSeats', '$maxSeats'] },
      },
      { $inc: { bookedSeats: 1 } },
      { new: true }
    );

    if (!updatedEvent) {
      return res.status(400).json({
        message: 'Event is sold out, not approved yet, or does not exist',
      });
    }

    const ticketId = new mongoose.Types.ObjectId();
    const qrToken = signTicketPayload(ticketId.toString(), eventId, studentId);
    const qrImage = await QRCode.toDataURL(qrToken, { width: 300, margin: 2 });

    try {
      const ticket = await Ticket.create({
        _id: ticketId,
        event: eventId,
        student: studentId,
        qrToken,
        qrImage,
      });

      const populated = await ticket.populate({
        path: 'event',
        select: 'title clubName startTime endTime',
        populate: { path: 'resource', select: 'name location' },
      });

      res.status(201).json({
        message: 'Seat reserved! Your QR pass is ready.',
        ticket: populated,
      });
    } catch (createErr) {
      await Event.findByIdAndUpdate(eventId, { $inc: { bookedSeats: -1 } });
      return res.status(400).json({ message: 'Could not issue ticket (possible duplicate request)' });
    }
  } catch (error) {
    res.status(500).json({ message: 'Ticket booking failed', error: error.message });
  }
});

// @route   GET /api/tickets/my
// @desc    Get all QR passes booked by the logged-in user
router.get('/my', protect, async (req, res) => {
  try {
    const tickets = await Ticket.find({ student: req.user.id })
      .populate({
        path: 'event',
        select: 'title clubName startTime endTime',
        populate: { path: 'resource', select: 'name location' },
      })
      .sort({ createdAt: -1 });
    res.json(tickets);
  } catch (error) {
    res.status(500).json({ message: 'Failed to load your tickets', error: error.message });
  }
});

// @route   GET /api/tickets/rotating/:ticketId
// @desc    Issue a fresh 30-second time-windowed HMAC QR image for active gate entry
router.get('/rotating/:ticketId', protect, async (req, res) => {
  try {
    const ticket = await Ticket.findOne({ _id: req.params.ticketId, student: req.user.id });
    if (!ticket) {
      return res.status(404).json({ message: 'Ticket not found' });
    }

    const nowSec = Math.floor(Date.now() / 1000);
    const currentWindow = Math.floor(nowSec / WINDOW_SECONDS);
    const secondsRemaining = WINDOW_SECONDS - (nowSec % WINDOW_SECONDS);

    const rotatingToken = signRotatingPayload(
      ticket._id.toString(),
      ticket.event.toString(),
      req.user.id,
      currentWindow
    );
    const rotatingQrImage = await QRCode.toDataURL(rotatingToken, { width: 300, margin: 2 });

    res.json({
      rotatingToken,
      rotatingQrImage,
      window: currentWindow,
      secondsRemaining,
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to generate dynamic QR', error: error.message });
  }
});

// @route   POST /api/tickets/verify
// @desc    Gate scanner verifies static OR 30s time-windowed HMAC signature & marks single-use check-in
router.post('/verify', protect, authorize('organizer', 'admin'), async (req, res) => {
  try {
    const { qrToken, eventId } = req.body;
    if (!qrToken) {
      return res.status(400).json({ valid: false, status: 'INVALID', message: 'No QR data received' });
    }

    const parts = qrToken.trim().split(':');
    if (parts.length !== 4 && parts.length !== 5) {
      return res.status(400).json({ valid: false, status: 'INVALID', message: 'Malformed QR pass' });
    }

    let ticketId, tokenEventId, studentId;
    let verificationMode = 'STATIC_HMAC';

    if (parts.length === 4) {
      // Legacy 4-part static HMAC token
      let providedSig;
      [ticketId, tokenEventId, studentId, providedSig] = parts;
      const expectedSig = signTicketPayload(ticketId, tokenEventId, studentId).split(':')[3];

      if (providedSig !== expectedSig) {
        return res.status(403).json({
          valid: false,
          status: 'FORGED',
          message: 'ALERT: Tampered or fake QR signature detected!',
        });
      }
    } else {
      // Dynamic 5-part 30-second rotating HMAC token
      let windowStr, providedSig;
      [ticketId, tokenEventId, studentId, windowStr, providedSig] = parts;
      const tokenWindow = parseInt(windowStr, 10);
      const currentWindow = Math.floor(Math.floor(Date.now() / 1000) / WINDOW_SECONDS);

      const expectedSig = signRotatingPayload(ticketId, tokenEventId, studentId, tokenWindow).split(':')[4];
      if (providedSig !== expectedSig) {
        return res.status(403).json({
          valid: false,
          status: 'FORGED',
          message: 'ALERT: Tampered or fake dynamic QR signature detected!',
        });
      }

      // Allow current window or 1 prior window (30s grace for clock drift)
      if (Math.abs(currentWindow - tokenWindow) > 1) {
        return res.status(410).json({
          valid: false,
          status: 'EXPIRED_QR',
          message: 'Dynamic QR screenshot expired (>30s old). Ask student to refresh live pass!',
        });
      }
      verificationMode = 'DYNAMIC_30S_HMAC';
    }

    if (eventId && eventId !== tokenEventId) {
      return res.status(400).json({
        valid: false,
        status: 'WRONG_EVENT',
        message: 'This pass belongs to a different event!',
      });
    }

    const ticket = await Ticket.findById(ticketId)
      .populate('student', 'name email rollNo')
      .populate('event', 'title clubName');

    if (!ticket) {
      return res.status(404).json({ valid: false, status: 'INVALID', message: 'Ticket record not found' });
    }

    if (ticket.isCheckedIn) {
      return res.status(409).json({
        valid: false,
        status: 'ALREADY_USED',
        message: `Already checked in at ${new Date(ticket.checkedInAt).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        })}`,
        student: ticket.student,
        event: ticket.event,
      });
    }

    ticket.isCheckedIn = true;
    ticket.checkedInAt = new Date();
    await ticket.save();

    res.json({
      valid: true,
      status: 'VALID',
      verificationMode,
      message: `Entry Approved (${verificationMode})! Welcome.`,
      student: ticket.student,
      event: ticket.event,
      checkedInAt: ticket.checkedInAt,
    });
  } catch (error) {
    res.status(500).json({ valid: false, status: 'ERROR', message: error.message });
  }
});

// @route   GET /api/tickets/event/:eventId/attendees
router.get('/event/:eventId/attendees', protect, authorize('organizer', 'admin'), async (req, res) => {
  try {
    const tickets = await Ticket.find({ event: req.params.eventId })
      .populate('student', 'name email rollNo')
      .sort({ isCheckedIn: -1, createdAt: 1 });

    const totalRegistered = tickets.length;
    const totalCheckedIn = tickets.filter((t) => t.isCheckedIn).length;

    res.json({
      totalRegistered,
      totalCheckedIn,
      attendees: tickets,
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to load attendees', error: error.message });
  }
});

module.exports = router;