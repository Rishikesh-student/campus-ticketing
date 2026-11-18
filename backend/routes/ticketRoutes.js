const express = require('express');
const crypto = require('crypto');
const mongoose = require('mongoose');
const QRCode = require('qrcode');
const Event = require('../models/Event');
const Ticket = require('../models/Ticket');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

// Helper: Create tamper-proof HMAC-SHA256 signed QR payload
const signTicketPayload = (ticketId, eventId, studentId) => {
  const rawPayload = `${ticketId}:${eventId}:${studentId}`;
  const signature = crypto
    .createHmac('sha256', process.env.QR_HMAC_SECRET)
    .update(rawPayload)
    .digest('hex')
    .slice(0, 24); // Compact 24-char hex MAC for fast mobile QR scanning
  return `${rawPayload}:${signature}`;
};

// @route   POST /api/tickets/book/:eventId
// @desc    Atomically reserve 1 seat and generate HMAC-signed QR pass
router.post('/book/:eventId', protect, async (req, res) => {
  const { eventId } = req.params;
  const studentId = req.user.id;

  try {
    // 1. Check if student already holds a ticket for this event
    const existingTicket = await Ticket.findOne({ event: eventId, student: studentId });
    if (existingTicket) {
      return res.status(400).json({ message: 'You have already booked a pass for this event' });
    }

    // 2. Atomic seat reservation: prevents race-condition overbooking under heavy load
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

    // 3. Pre-generate MongoDB ObjectId so we can sign it immediately
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
      // Roll back seat count if ticket creation failed (e.g., duplicate rapid double-click)
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

// @route   POST /api/tickets/verify
// @desc    Gate scanner verifies HMAC signature & marks single-use check-in
router.post('/verify', protect, authorize('organizer', 'admin'), async (req, res) => {
  try {
    const { qrToken, eventId } = req.body;
    if (!qrToken) {
      return res.status(400).json({ valid: false, status: 'INVALID', message: 'No QR data received' });
    }

    const parts = qrToken.trim().split(':');
    if (parts.length !== 4) {
      return res.status(400).json({ valid: false, status: 'INVALID', message: 'Malformed QR pass' });
    }

    const [ticketId, tokenEventId, studentId, providedSig] = parts;

    // 1. Verify cryptographic HMAC signature
    const expectedToken = signTicketPayload(ticketId, tokenEventId, studentId);
    const expectedSig = expectedToken.split(':')[3];

    if (providedSig !== expectedSig) {
      return res.status(403).json({
        valid: false,
        status: 'FORGED',
        message: 'ALERT: Tampered or fake QR signature detected!',
      });
    }

    // 2. Optional check if organizer selected a specific event on the scanner screen
    if (eventId && eventId !== tokenEventId) {
      return res.status(400).json({
        valid: false,
        status: 'WRONG_EVENT',
        message: 'This pass belongs to a different event!',
      });
    }

    // 3. Look up ticket in database
    const ticket = await Ticket.findById(ticketId)
      .populate('student', 'name email rollNo')
      .populate('event', 'title clubName');

    if (!ticket) {
      return res.status(404).json({ valid: false, status: 'INVALID', message: 'Ticket record not found' });
    }

    // 4. Prevent duplicate/screenshot entry
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

    // 5. Mark checked in
    ticket.isCheckedIn = true;
    ticket.checkedInAt = new Date();
    await ticket.save();

    res.json({
      valid: true,
      status: 'VALID',
      message: 'Entry Approved! Welcome.',
      student: ticket.student,
      event: ticket.event,
      checkedInAt: ticket.checkedInAt,
    });
  } catch (error) {
    res.status(500).json({ valid: false, status: 'ERROR', message: error.message });
  }
});

// @route   GET /api/tickets/event/:eventId/attendees
// @desc    Organizer views live check-in stats & attendee list for an event
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
