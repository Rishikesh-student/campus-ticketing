const mongoose = require('mongoose');

const resourceBookingSchema = new mongoose.Schema(
  {
    resource: { type: mongoose.Schema.Types.ObjectId, ref: 'Resource', required: true },
    bookedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    purpose: { type: String, required: true, trim: true }, // e.g., "Final Year Project Team Sync" or "Extra DBMS Lecture"
    startTime: { type: Date, required: true },
    endTime: { type: Date, required: true },
    status: {
      type: String,
      enum: ['pending_approval', 'approved', 'rejected', 'cancelled'],
      default: 'pending_approval',
    },
  },
  { timestamps: true }
);

resourceBookingSchema.index({ resource: 1, startTime: 1, endTime: 1 });

module.exports = mongoose.model('ResourceBooking', resourceBookingSchema);