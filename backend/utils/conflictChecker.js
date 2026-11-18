const Resource = require('../models/Resource');
const ResourceBooking = require('../models/ResourceBooking');
const Event = require('../models/Event');

/**
 * Checks if a resource has any overlapping ResourceBooking OR Event
 * during [startTime, endTime].
 * Overlap formula: (ExistingStart < RequestedEnd) AND (ExistingEnd > RequestedStart)
 */
const checkResourceConflict = async (resourceId, startTime, endTime) => {
  const start = new Date(startTime);
  const end = new Date(endTime);

  const [conflictingBooking, conflictingEvent] = await Promise.all([
    ResourceBooking.findOne({
      resource: resourceId,
      status: { $in: ['pending_approval', 'approved'] },
      startTime: { $lt: end },
      endTime: { $gt: start },
    }).populate('bookedBy', 'name role'),

    Event.findOne({
      resource: resourceId,
      status: { $in: ['pending_approval', 'approved'] },
      startTime: { $lt: end },
      endTime: { $gt: start },
    }).populate('organizer', 'name clubName'),
  ]);

  if (conflictingBooking) {
    return {
      hasConflict: true,
      type: 'Resource Reservation',
      details: `Reserved for "${conflictingBooking.purpose}" (${new Date(
        conflictingBooking.startTime
      ).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${new Date(
        conflictingBooking.endTime
      ).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`,
    };
  }

  if (conflictingEvent) {
    return {
      hasConflict: true,
      type: 'Campus Event',
      details: `Booked for event "${conflictingEvent.title}" by ${conflictingEvent.clubName}`,
    };
  }

  return { hasConflict: false };
};

/**
 * Smart Recommender: Finds alternative active resources of the same category
 * (with equal or greater capacity) that are completely free during [startTime, endTime].
 */
const findAlternativeResources = async (targetResource, startTime, endTime) => {
  const candidates = await Resource.find({
    _id: { $ne: targetResource._id },
    category: targetResource.category,
    capacity: { $gte: targetResource.capacity },
    isActive: true,
  });

  const available = [];
  for (const candidate of candidates) {
    const { hasConflict } = await checkResourceConflict(candidate._id, startTime, endTime);
    if (!hasConflict) {
      available.push({
        id: candidate._id,
        name: candidate.name,
        location: candidate.location,
        capacity: candidate.capacity,
      });
    }
  }
  return available;
};

module.exports = { checkResourceConflict, findAlternativeResources };