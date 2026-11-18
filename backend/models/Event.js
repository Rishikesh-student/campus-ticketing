const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true },
    clubName: { type: String, required: true, trim: true },
    organizer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    resource: { type: mongoose.Schema.Types.ObjectId, ref: 'Resource', required: true },
    startTime: { type: Date, required: true },
    endTime: { type: Date, required: true },
    maxSeats: { type: Number, required: true },
    bookedSeats: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ['pending_approval', 'approved', 'rejected'],
      default: 'pending_approval',
    },
  },
  { timestamps: true }
);

eventSchema.index({ resource: 1, startTime: 1, endTime: 1 });

module.exports = mongoose.model('Event', eventSchema);