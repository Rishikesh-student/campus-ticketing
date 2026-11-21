const express = require('express');
const Resource = require('../models/Resource');
const Event = require('../models/Event');
const Ticket = require('../models/Ticket');
const { protect } = require('../middleware/auth');

const router = express.Router();

// @route   POST /api/research/recommend-venue
// @desc    Multi-Criteria Utility Scoring for Optimal Venue & Slot Allocation (Option A)
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
      // 1. Capacity Fit Score (penalizes under-capacity heavily, penalizes wasted seats proportionally)
      let capacityScore = 0;
      if (r.capacity < targetSeats) {
        capacityScore = Math.max(0, 0.3 * (r.capacity / targetSeats)); // Too small
      } else {
        const utilization = targetSeats / r.capacity; // 1.0 = exact fit, 0.2 = 80% empty seats
        capacityScore = 0.4 + 0.6 * utilization;
      }

      // 2. Governance Friction Score (auto-approve venues score higher for agile scheduling)
      const governanceScore = r.requiresApproval ? 0.65 : 1.0;

      // 3. Temporal Conflict Check
      let hasConflict = false;
      if (reqStart && reqEnd && reqEnd > reqStart) {
        hasConflict = approvedEvents.some((ev) => {
          if (ev.resource?.toString() !== r._id.toString()) return false;
          const evStart = new Date(ev.startTime).getTime();
          const evEnd = new Date(ev.endTime).getTime();
          return reqStart < evEnd && reqEnd > evStart;
        });
      }

      // Weighted Composite Utility Score (w1=0.65 capacity, w2=0.20 governance, w3=0.15 availability)
      const rawScore =
        0.65 * capacityScore +
        0.20 * governanceScore +
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

    // Sort conflict-free venues first, then by highest fitScore
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

// @route   GET /api/research/overbooking-forecast
// @desc    Historical No-Show Rate & Safe Overbooking Buffer Predictor (Option C)
router.get('/overbooking-forecast', protect, async (req, res) => {
  try {
    const requestedSeats = Math.max(10, Number(req.query.maxSeats) || 100);
    const [totalTickets, checkedInTickets, totalEvents] = await Promise.all([
      Ticket.countDocuments(),
      Ticket.countDocuments({ isCheckedIn: true }),
      Event.countDocuments({ status: 'approved' }),
    ]);

    // Bayesian-smoothed attendance rate (prior = 0.78 show rate / 22% campus no-show baseline)
    const priorWeight = 10;
    const priorShowRate = 0.78;
    const empiricalShowRate =
      (checkedInTickets + priorWeight * priorShowRate) / (totalTickets + priorWeight);
    const predictedNoShowRate = Math.max(0.05, Math.min(0.45, 1 - empiricalShowRate));

    // Conservative safety factor alpha = 0.65 to prevent physical overcrowding
    const safetyAlpha = 0.65;
    const recommendedExtraBuffer = Math.floor(requestedSeats * predictedNoShowRate * safetyAlpha);

    res.json({
      historicalSample: {
        approvedEvents: totalEvents,
        totalPassesIssued: totalTickets,
        verifiedCheckIns: checkedInTickets,
      },
      empiricalShowRatePct: Math.round(empiricalShowRate * 100),
      predictedNoShowRatePct: Math.round(predictedNoShowRate * 100),
      baseCapacity: requestedSeats,
      recommendedOverbookBuffer: recommendedExtraBuffer,
      suggestedReleaseCap: requestedSeats + recommendedExtraBuffer,
    });
  } catch (error) {
    res.status(500).json({ message: 'Overbooking forecast failed', error: error.message });
  }
});

module.exports = router;