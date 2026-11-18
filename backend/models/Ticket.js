const mongoose = require('mongoose');

const ticketSchema = new mongoose.Schema(
  {
    event: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    qrToken: { type: String, required: true, unique: true },
    qrImage: { type: String, required: true }, // Base64 PNG data URL
    isCheckedIn: { type: Boolean, default: false },
    checkedInAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// Prevent the same student from booking two tickets for the same event
ticketSchema.index({ event: 1, student: 1 }, { unique: true });

module.exports = mongoose.model('Ticket', ticketSchema);