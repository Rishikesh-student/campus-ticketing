const express = require('express');
const crypto = require('crypto');
const mongoose = require('mongoose');
const QRCode = require('qrcode');
const Event = require('../models/Event');
const Ticket = require('../models/Ticket');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

const WINDOW_SECONDS = 30;

// Dynamic standby buffer cap: 15% of event seats, capped at 25 standby passes
const getMaxWaitlistCap = (maxSeats) => Math.min(Math.max(2, Math.ceil(0.15 * maxSeats)), 25);

// Helper: checks if an event's date/time has already passed
const isEventPast = (eventDoc) => {
  const cutoff = eventDoc.endTime ? new Date(eventDoc.endTime) : new Date(eventDoc.startTime);
  return !Number.isNaN(cutoff.getTime()) && cutoff.getTime() <= Date.now();
};

// Poisson tail probability: P(at least k cancellations occur before event start)
const computeConfirmationProbability = (position, maxSeats, startTime, historicalCancelRate = 0.15) => {
  if (!position || position <= 0) return 100;
  const hoursRemaining = Math.max(0.25, (new Date(startTime).getTime() - Date.now()) / (1000 * 60 * 60));
  const timeFactor = Math.min(1, hoursRemaining / 24);
  const lambda = Math.max(0.15, maxSeats * historicalCancelRate * timeFactor);

  // Sum P(X = i) for i = 0 .. position - 1
  let cdf = 0;
  let term = Math.exp(-lambda);
  for (let i = 0; i < position; i++) {
    if (i > 0) term = (term * lambda) / i;
    cdf += term;
  }
  const prob = Math.max(0.03, Math.min(0.99, 1 - cdf));
  return Math.round(prob * 100);
};

// Static tamper-proof HMAC-SHA256 payload
const signTicketPayload = (ticketId, eventId, studentId) => {
  const rawPayload = `${ticketId}:${eventId}:${studentId}`;
  const signature = crypto
    .createHmac('sha256', process.env.QR_HMAC_SECRET)
    .update(rawPayload)
    .digest('hex')
    .slice(0, 24);
  return `${rawPayload}:${signature}`;
};

// Time-windowed 30-second rotating HMAC-SHA256 payload
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
// @desc    Atomically reserve a confirmed seat OR join bounded probabilistic standby waitlist
router.post('/book/:eventId', protect, async (req, res) => {
  const { eventId } = req.params;
  const studentId = req.user.id;

  try {
    const eventDoc = await Event.findById(eventId);
    if (!eventDoc || eventDoc.status !== 'approved') {
      return res.status(400).json({ message: 'Event is not approved or does not exist' });
    }

    // 0. Block pass claims & standby enrollment if event date/time has already passed
    if (isEventPast(eventDoc)) {
      return res.status(400).json({
        message: 'Cannot claim pass or join waitlist: this event has already passed.',
      });
    }

    const existingTicket = await Ticket.findOne({ event: eventId, student: studentId });
    if (existingTicket && existingTicket.status !== 'cancelled') {
      return res.status(400).json({
        message:
          existingTicket.status === 'waitlisted'
            ? `You are already on Standby Waitlist (#${existingTicket.waitlistPosition})`
            : 'You already hold a confirmed pass for this event',
      });
    }

    // 1. Try atomic confirmed seat reservation first
    const updatedEvent = await Event.findOneAndUpdate(
      {
        _id: eventId,
        status: 'approved',
        $expr: { $lt: ['$bookedSeats', '$maxSeats'] },
      },
      { $inc: { bookedSeats: 1 } },
      { new: true }
    );

    let assignedStatus = 'confirmed';
    let waitlistPos = null;

    if (!updatedEvent) {
      // 2. Event is full -> check if any unscanned confirmed ticket still exists
      // Once a pass is scanned it cannot be cancelled, so if all confirmed passes are scanned, no waitlist is possible
      const unscannedConfirmedCount = await Ticket.countDocuments({
        event: eventId,
        status: 'confirmed',
        isCheckedIn: false,
      });

      if (unscannedConfirmedCount === 0) {
        return res.status(400).json({
          message: 'All confirmed passes have already been scanned; standby waitlist is closed.',
        });
      }

      // 3. Check bounded standby waitlist capacity
      const maxWaitlist = getMaxWaitlistCap(eventDoc.maxSeats);
      const currentWaitlistCount = await Ticket.countDocuments({
        event: eventId,
        status: 'waitlisted',
      });

      if (currentWaitlistCount >= maxWaitlist) {
        return res.status(400).json({
          message: `Event & Standby Waitlist (${maxWaitlist} slots) are completely full`,
        });
      }

      assignedStatus = 'waitlisted';
      waitlistPos = currentWaitlistCount + 1;
    }

    // Re-activate if user previously cancelled, else create new Ticket
    let ticket;
    if (existingTicket && existingTicket.status === 'cancelled') {
      existingTicket.status = assignedStatus;
      existingTicket.waitlistPosition = waitlistPos;
      existingTicket.isCheckedIn = false;
      existingTicket.checkedInAt = null;
      await existingTicket.save();
      ticket = existingTicket;
    } else {
      const ticketId = new mongoose.Types.ObjectId();
      const qrToken = signTicketPayload(ticketId.toString(), eventId, studentId);
      const qrImage = await QRCode.toDataURL(qrToken, { width: 300, margin: 2 });

      try {
        ticket = await Ticket.create({
          _id: ticketId,
          event: eventId,
          student: studentId,
          qrToken,
          qrImage,
          status: assignedStatus,
          waitlistPosition: waitlistPos,
        });
      } catch (createErr) {
        if (assignedStatus === 'confirmed') {
          await Event.findByIdAndUpdate(eventId, { $inc: { bookedSeats: -1 } });
        }
        return res.status(400).json({ message: 'Could not issue pass (possible duplicate request)' });
      }
    }

    const populated = await ticket.populate({
      path: 'event',
      select: 'title clubName startTime endTime maxSeats',
      populate: { path: 'resource', select: 'name location' },
    });

    const confirmationProbability =
      assignedStatus === 'waitlisted'
        ? computeConfirmationProbability(waitlistPos, eventDoc.maxSeats, eventDoc.startTime)
        : 100;

    res.status(201).json({
      message:
        assignedStatus === 'confirmed'
          ? 'Seat reserved! Your live QR pass is ready.'
          : `Added to Standby Waitlist (#${waitlistPos}) • ${confirmationProbability}% estimated confirmation chance.`,
      ticket: populated,
      confirmationProbability,
    });
  } catch (error) {
    res.status(500).json({ message: 'Ticket booking failed', error: error.message });
  }
});

// @route   POST /api/tickets/cancel/:ticketId
// @desc    Cancel pass (only if not scanned) & atomically promote FIFO #1 standby waitlisted student
router.post('/cancel/:ticketId', protect, async (req, res) => {
  try {
    const ticket = await Ticket.findOne({ _id: req.params.ticketId, student: req.user.id });
    if (!ticket || ticket.status === 'cancelled') {
      return res.status(404).json({ message: 'Active pass not found' });
    }
    if (ticket.isCheckedIn) {
      return res.status(400).json({
        message: 'Cannot cancel a pass after it has been scanned at the gate',
      });
    }

    const previousStatus = ticket.status;
    const previousPos = ticket.waitlistPosition;
    const eventId = ticket.event;

    ticket.status = 'cancelled';
    ticket.waitlistPosition = null;
    await ticket.save();

    if (previousStatus === 'confirmed') {
      // Find FIFO #1 waitlisted ticket and promote it immediately
      const nextInLine = await Ticket.findOneAndUpdate(
        { event: eventId, status: 'waitlisted' },
        { $set: { status: 'confirmed', waitlistPosition: null } },
        { sort: { waitlistPosition: 1, createdAt: 1 }, new: true }
      );

      if (nextInLine) {
        // Shift remaining waitlist positions up by 1 (#2 -> #1, #3 -> #2...)
        await Ticket.updateMany(
          { event: eventId, status: 'waitlisted', waitlistPosition: { $gt: 1 } },
          { $inc: { waitlistPosition: -1 } }
        );
      } else {
        // No one on waitlist -> free up 1 confirmed seat on the event
        await Event.findByIdAndUpdate(eventId, { $inc: { bookedSeats: -1 } });
      }
    } else if (previousStatus === 'waitlisted' && previousPos) {
      // Shift anyone behind this waitlisted student up by 1
      await Ticket.updateMany(
        { event: eventId, status: 'waitlisted', waitlistPosition: { $gt: previousPos } },
        { $inc: { waitlistPosition: -1 } }
      );
    }

    res.json({
      message:
        previousStatus === 'confirmed'
          ? 'Pass cancelled. Seat released (auto-promoted next standby student if queued).'
          : 'Removed from standby waitlist.',
    });
  } catch (error) {
    res.status(500).json({ message: 'Cancellation failed', error: error.message });
  }
});

// @route   GET /api/tickets/my
// @desc    Get all active/waitlisted passes with real-time Poisson confirmation probabilities
router.get('/my', protect, async (req, res) => {
  try {
    const [tickets, totalTickets, cancelledTickets] = await Promise.all([
      Ticket.find({ student: req.user.id, status: { $ne: 'cancelled' } })
        .populate({
          path: 'event',
          select: 'title clubName startTime endTime maxSeats bookedSeats',
          populate: { path: 'resource', select: 'name location' },
        })
        .sort({ createdAt: -1 }),
      Ticket.countDocuments(),
      Ticket.countDocuments({ status: 'cancelled' }),
    ]);

    // Bayesian smoothed cancellation rate (prior = 15% campus baseline)
    const smoothedCancelRate = (cancelledTickets + 10 * 0.15) / (totalTickets + 10);

    const enriched = tickets.map((t) => {
      const obj = t.toObject();
      if (obj.status === 'waitlisted' && obj.event) {
        obj.confirmationProbability = computeConfirmationProbability(
          obj.waitlistPosition,
          obj.event.maxSeats,
          obj.event.startTime,
          smoothedCancelRate
        );
      } else {
        obj.confirmationProbability = 100;
      }
      return obj;
    });

    res.json(enriched);
  } catch (error) {
    res.status(500).json({ message: 'Failed to load your tickets', error: error.message });
  }
});

// @route   GET /api/tickets/rotating/:ticketId
// @desc    Issue a fresh 30-second time-windowed HMAC QR image for confirmed passes
router.get('/rotating/:ticketId', protect, async (req, res) => {
  try {
    const ticket = await Ticket.findOne({ _id: req.params.ticketId, student: req.user.id });
    if (!ticket || ticket.status !== 'confirmed') {
      return res.status(403).json({ message: 'QR pass is only active for confirmed tickets' });
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
// @desc    Gate scanner verifies static OR 30s rotating HMAC signature & blocks waitlisted/cancelled passes
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

    if (ticket.status === 'waitlisted') {
      return res.status(403).json({
        valid: false,
        status: 'WAITLISTED',
        message: `Pass is still on Standby Waitlist (#${ticket.waitlistPosition}) — not yet confirmed!`,
        student: ticket.student,
        event: ticket.event,
      });
    }

    if (ticket.status === 'cancelled') {
      return res.status(403).json({
        valid: false,
        status: 'CANCELLED',
        message: 'This pass was cancelled by the student.',
        student: ticket.student,
        event: ticket.event,
      });
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
    const tickets = await Ticket.find({ event: req.params.eventId, status: { $ne: 'cancelled' } })
      .populate('student', 'name email rollNo')
      .sort({ status: 1, isCheckedIn: -1, waitlistPosition: 1, createdAt: 1 });

    const totalRegistered = tickets.filter((t) => t.status === 'confirmed').length;
    const totalWaitlisted = tickets.filter((t) => t.status === 'waitlisted').length;
    const totalCheckedIn = tickets.filter((t) => t.isCheckedIn).length;

    res.json({
      totalRegistered,
      totalWaitlisted,
      totalCheckedIn,
      attendees: tickets,
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to load attendees', error: error.message });
  }
});

module.exports = router;