const mongoose = require('mongoose');

const resourceSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true }, // e.g., "Main Auditorium", "Library Study Pod 2", "Epson 4K Projector #1"
    category: {
      type: String,
      enum: ['hall', 'lab', 'study_room', 'equipment'],
      required: true,
    },
    location: { type: String, required: true, trim: true }, // e.g., "Block A, 2nd Floor" or "Central Inventory"
    capacity: { type: Number, default: 1 }, // Seat capacity for rooms, or unit count for equipment
    amenities: [{ type: String }], // e.g., ['AC', 'Projector', 'Wi-Fi']
    requiresApproval: { type: Boolean, default: true }, // Study pods can auto-approve; auditoriums require admin approval
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Resource', resourceSchema);