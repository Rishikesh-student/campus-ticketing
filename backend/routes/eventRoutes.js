const express = require('express');
const Event = require('../models/Event');
const Resource = require('../models/Resource');
const { protect, authorize } = require('../middleware/auth');
const { checkResourceConflict, findAlternativeResources } = require('../utils/conflictChecker');

const router = express.Router();

// @route   GET /api/events
// @desc    Get all approved upcoming/active campus events (for students & public view)
router.get('/', protect, async (req, res) => {
  try {
    const filter = req.user.role === 'admin' ? {} : { status: 'approved' };
    const events = await Event.find(filter)
      .populate('resource', 'name category location capacity')
      .populate('organizer', 'name email')
      .sort({ startTime: 1 });
    res.json(events);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch events', error: error.message });
  }
});

// @route   GET /api/events/my
// @desc    Organizer views their own created events (pending, approved, rejected)
router.get('/my', protect, authorize('organizer', 'admin'), async (req, res) => {
  try {
    const events = await Event.find({ organizer: req.user.id })
      .populate('resource', 'name category location capacity')
      .sort({ createdAt: -1 });
    res.json(events);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch organizer events', error: error.message });
  }
});

// @route   POST /api/events
// @desc    Organizer creates an event & reserves a hall/resource with unified conflict check
router.post('/', protect, authorize('organizer', 'admin'), async (req, res) => {
  try {
    const { title, description, clubName, resourceId, startTime, endTime, maxSeats } = req.body;

    if (!title || !description || !clubName || !resourceId || !startTime || !endTime || !maxSeats) {
      return res.status(400).json({ message: 'All event fields are required' });
    }

    if (new Date(startTime) >= new Date(endTime)) {
      return res.status(400).json({ message: 'End time must be after start time' });
    }

    const resource = await Resource.findById(resourceId);
    if (!resource || !resource.isActive) {
      return res.status(404).json({ message: 'Selected venue/resource not found' });
    }

    if (Number(maxSeats) > resource.capacity) {
      return res.status(400).json({
        message: `Max seats (${maxSeats}) exceeds ${resource.name}'s capacity (${resource.capacity})`,
      });
    }

    // Unified conflict check across BOTH standalone ResourceBookings AND other Events
    const conflict = await checkResourceConflict(resourceId, startTime, endTime);
    if (conflict.hasConflict) {
      const alternatives = await findAlternativeResources(resource, startTime, endTime);
      return res.status(409).json({
        message: `Venue Clash (${conflict.type}): ${conflict.details}`,
        alternatives,
      });
    }

    const event = await Event.create({
      title,
      description,
      clubName,
      organizer: req.user.id,
      resource: resourceId,
      startTime,
      endTime,
      maxSeats: Number(maxSeats),
      status: req.user.role === 'admin' ? 'approved' : 'pending_approval',
    });

    const populated = await event.populate('resource', 'name location capacity');
    res.status(201).json({
      message:
        event.status === 'approved'
          ? 'Event created and published!'
          : 'Event submitted for Admin venue approval.',
      event: populated,
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to create event', error: error.message });
  }
});

// @route   PATCH /api/events/:id/status
// @desc    Admin approves or rejects an event
router.patch('/:id/status', protect, authorize('admin'), async (req, res) => {
  try {
    const { status } = req.body; // 'approved' or 'rejected'
    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    const event = await Event.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    ).populate('resource', 'name location capacity');

    if (!event) return res.status(404).json({ message: 'Event not found' });
    res.json(event);
  } catch (error) {
    res.status(500).json({ message: 'Failed to update event status', error: error.message });
  }
});

module.exports = router;