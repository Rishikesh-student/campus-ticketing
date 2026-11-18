const express = require('express');
const Resource = require('../models/Resource');
const ResourceBooking = require('../models/ResourceBooking');
const { protect, authorize } = require('../middleware/auth');
const { checkResourceConflict, findAlternativeResources } = require('../utils/conflictChecker');

const router = express.Router();

// @route   GET /api/resources
// @desc    Get all active campus resources (halls, labs, study rooms, equipment)
router.get('/', protect, async (req, res) => {
  try {
    const filter = { isActive: true };
    if (req.query.category) filter.category = req.query.category;

    const resources = await Resource.find(filter).sort({ category: 1, name: 1 });
    res.json(resources);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch resources', error: error.message });
  }
});

// @route   POST /api/resources
// @desc    Admin creates a new campus resource
router.post('/', protect, authorize('admin'), async (req, res) => {
  try {
    const { name, category, location, capacity, amenities, requiresApproval } = req.body;

    const resource = await Resource.create({
      name,
      category,
      location,
      capacity: capacity || 1,
      amenities: amenities || [],
      requiresApproval: requiresApproval !== undefined ? requiresApproval : true,
    });

    res.status(201).json(resource);
  } catch (error) {
    res.status(400).json({ message: 'Failed to create resource', error: error.message });
  }
});

// @route   POST /api/resources/book
// @desc    Book a standalone resource (study pod, lab, projector) with conflict check + smart alternatives
router.post('/book', protect, async (req, res) => {
  try {
    const { resourceId, purpose, startTime, endTime } = req.body;

    if (!resourceId || !purpose || !startTime || !endTime) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    if (new Date(startTime) >= new Date(endTime)) {
      return res.status(400).json({ message: 'End time must be after start time' });
    }

    const resource = await Resource.findById(resourceId);
    if (!resource || !resource.isActive) {
      return res.status(404).json({ message: 'Resource not found or inactive' });
    }

    // Run unified conflict check across both ResourceBookings and Events
    const conflict = await checkResourceConflict(resourceId, startTime, endTime);
    if (conflict.hasConflict) {
      const alternatives = await findAlternativeResources(resource, startTime, endTime);
      return res.status(409).json({
        message: `Schedule Clash (${conflict.type}): ${conflict.details}`,
        alternatives,
      });
    }

    // Auto-approve if resource does not require admin sign-off (e.g., Library Study Pods)
    const initialStatus = resource.requiresApproval ? 'pending_approval' : 'approved';

    const booking = await ResourceBooking.create({
      resource: resourceId,
      bookedBy: req.user.id,
      purpose,
      startTime,
      endTime,
      status: initialStatus,
    });

    const populated = await booking.populate('resource', 'name category location');
    res.status(201).json({
      message:
        initialStatus === 'approved'
          ? 'Resource booked and auto-approved!'
          : 'Booking request submitted for Admin approval.',
      booking: populated,
    });
  } catch (error) {
    res.status(500).json({ message: 'Booking failed', error: error.message });
  }
});

// @route   GET /api/resources/bookings/my
// @desc    Get current user's resource reservations
router.get('/bookings/my', protect, async (req, res) => {
  try {
    const bookings = await ResourceBooking.find({ bookedBy: req.user.id })
      .populate('resource', 'name category location')
      .sort({ startTime: -1 });
    res.json(bookings);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch your bookings', error: error.message });
  }
});

// @route   GET /api/resources/bookings/all
// @desc    Admin views all resource reservations
router.get('/bookings/all', protect, authorize('admin'), async (req, res) => {
  try {
    const bookings = await ResourceBooking.find()
      .populate('resource', 'name category location')
      .populate('bookedBy', 'name email rollNo role')
      .sort({ createdAt: -1 });
    res.json(bookings);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch all bookings', error: error.message });
  }
});

// @route   PATCH /api/resources/bookings/:id/status
// @desc    Admin approves or rejects a resource reservation
router.patch('/bookings/:id/status', protect, authorize('admin'), async (req, res) => {
  try {
    const { status } = req.body; // 'approved' or 'rejected'
    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    const booking = await ResourceBooking.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    ).populate('resource', 'name category location');

    if (!booking) return res.status(404).json({ message: 'Booking not found' });
    res.json(booking);
  } catch (error) {
    res.status(500).json({ message: 'Failed to update booking status', error: error.message });
  }
});

module.exports = router;