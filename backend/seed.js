const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const User = require('./models/User');
const Resource = require('./models/Resource');

const seedData = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB for seeding...');

    // Clear existing resources & demo users (optional - comment out if you want to keep existing)
    await Resource.deleteMany({});

    const resources = await Resource.insertMany([
      {
        name: 'Main Auditorium',
        category: 'hall',
        location: 'Academic Block A, Ground Floor',
        capacity: 300,
        amenities: ['AC', 'Dolby Sound System', '4K Laser Projector', 'Stage Lighting'],
        requiresApproval: true,
      },
      {
        name: 'Seminar Hall B',
        category: 'hall',
        location: 'Academic Block B, 2nd Floor',
        capacity: 120,
        amenities: ['AC', 'Projector', 'Wireless Mics'],
        requiresApproval: true,
      },
      {
        name: 'AI & Cloud Computing Lab 3',
        category: 'lab',
        location: 'CS Building, 3rd Floor',
        capacity: 60,
        amenities: ['60 Workstations', 'High-Speed LAN', 'Smart Board'],
        requiresApproval: true,
      },
      {
        name: 'Library Discussion Pod 1',
        category: 'study_room',
        location: 'Central Library, 1st Floor',
        capacity: 8,
        amenities: ['Whiteboard', 'Wi-Fi', 'Power Outlets'],
        requiresApproval: false, // Auto-approves instantly!
      },
      {
        name: 'Library Discussion Pod 2',
        category: 'study_room',
        location: 'Central Library, 1st Floor',
        capacity: 8,
        amenities: ['Whiteboard', 'Wi-Fi', 'TV Screen'],
        requiresApproval: false, // Auto-approves instantly!
      },
      {
        name: 'Portable PA & Cordless Mic Kit',
        category: 'equipment',
        location: 'Student Council Store Room',
        capacity: 1,
        amenities: ['2 Cordless Mics', 'Bluetooth Speaker', 'Stand'],
        requiresApproval: true,
      },
    ]);

    // Create default demo accounts (password: 123456)
    const hashedPassword = await bcrypt.hash('123456', 10);
    const demoUsers = [
      { name: 'Dean Admin', email: 'admin@campus.edu', password: hashedPassword, role: 'admin' },
      { name: 'ACM Tech Club', email: 'organizer@campus.edu', password: hashedPassword, role: 'organizer' },
      { name: 'Rohan Sharma', email: 'student@campus.edu', rollNo: 'CS2026-042', password: hashedPassword, role: 'student' },
    ];

    for (const u of demoUsers) {
      await User.updateOne({ email: u.email }, { $setOnInsert: u }, { upsert: true });
    }

    console.log(`✅ Seeded ${resources.length} campus resources and 3 demo accounts (password: 123456)`);
    process.exit(0);
  } catch (err) {
    console.error('❌ Seeding failed:', err);
    process.exit(1);
  }
};

seedData();