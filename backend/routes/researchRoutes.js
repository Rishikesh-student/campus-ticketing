const express = require('express');
const Resource = require('../models/Resource');
const Event = require('../models/Event');
const Ticket = require('../models/Ticket');
const { protect } = require('../middleware/auth');

const router = express.Router();

// @route   POST /api/research/recommend-venue
// @desc    Multi-Criteria Utility Scoring for Optimal Venue & Slot Allocation
router.post('/recommend-venue', protect, async (req, res) => {
  try {
    const { expectedAttendees = 50, startTime, endTime } = req.body;
    const targetSeats = Math.max(1, Number(expectedAttendees));

    const [resources, approvedEvents] = await Promise.all([
      Resource.find({ isActive: true }),
      Event.find({ status: 'approved' }).select('resource startTime endTime'),
    ]);

    const reqStart = startTime ? new Date(startTime).getTime() : null;
    const reqEnd = endTime ? new Date(endTime).getTime() : null;

    const scored = resources.map((r) => {
      let capacityScore = 0;
      if (r.capacity < targetSeats) {
        capacityScore = Math.max(0, 0.3 * (r.capacity / targetSeats));
      } else {
        const utilization = targetSeats / r.capacity;
        capacityScore = 0.4 + 0.6 * utilization;
      }

      const governanceScore = r.requiresApproval ? 0.65 : 1.0;

      let hasConflict = false;
      if (reqStart && reqEnd && reqEnd > reqStart) {
        hasConflict = approvedEvents.some((ev) => {
          if (ev.resource?.toString() !== r._id.toString()) return false;
          const evStart = new Date(ev.startTime).getTime();
          const evEnd = new Date(ev.endTime).getTime();
          return reqStart < evEnd && reqEnd > evStart;
        });
      }

      const rawScore =
        0.65 * capacityScore +
        0.2 * governanceScore +
        0.15 * (hasConflict ? 0 : 1);

      const fitPercentage = Math.round(rawScore * 100);
      const seatUtilization = Math.min(100, Math.round((targetSeats / r.capacity) * 100));

      return {
        resourceId: r._id,
        name: r.name,
        category: r.category,
        location: r.location,
        capacity: r.capacity,
        requiresApproval: r.requiresApproval,
        hasConflict,
        seatUtilization,
        fitScore: fitPercentage,
      };
    });

    scored.sort((a, b) => {
      if (a.hasConflict !== b.hasConflict) return a.hasConflict ? 1 : -1;
      return b.fitScore - a.fitScore;
    });

    res.json({
      targetAttendees: targetSeats,
      topRecommendation: scored.find((s) => !s.hasConflict) || scored[0] || null,
      rankedVenues: scored,
    });
  } catch (error) {
    res.status(500).json({ message: 'Venue recommendation failed', error: error.message });
  }
});

// @route   GET /api/research/standby-forecast
// @desc    Bounded Probabilistic Standby Waitlist Capacity & Cancellation Rate Telemetry
router.get('/standby-forecast', protect, async (req, res) => {
  try {
    const requestedSeats = Math.max(1, Number(req.query.maxSeats) || 50);
    const [totalTickets, cancelledTickets, activeWaitlisted] = await Promise.all([
      Ticket.countDocuments(),
      Ticket.countDocuments({ status: 'cancelled' }),
      Ticket.countDocuments({ status: 'waitlisted' }),
    ]);

    const empiricalCancelRate = (cancelledTickets + 10 * 0.15) / (totalTickets + 10);
    const recommendedStandbyCap = Math.min(Math.max(2, Math.ceil(0.15 * requestedSeats)), 25);

    res.json({
      baseCapacity: requestedSeats,
      recommendedStandbyCap,
      historicalCancelRatePct: Math.round(empiricalCancelRate * 100),
      activeWaitlistedCount: activeWaitlisted,
    });
  } catch (error) {
    res.status(500).json({ message: 'Standby forecast failed', error: error.message });
  }
});

module.exports = router;