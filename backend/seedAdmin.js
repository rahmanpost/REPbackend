// backend/seedAdmin.js
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import User from './models/User.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 🔧 Load the .env that sits in the *backend* folder
dotenv.config({ path: path.join(__dirname, '.env') });

async function main() {
  try {
    if (!process.env.MONGO_URI) {
      throw new Error('MONGO_URI is missing. Check backend/.env');
    }

    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Mongo connected');

    const payload = {
      fullName: 'Super Admin',
      email: 'admin@example.com',
      phone: '0700000000',
      password: 'Admin@12345',
      role: 'admin',
      addresses: [],
    };

    const exists = await User.findOne({ phone: payload.phone });
    if (exists) {
      console.log('ℹ️ Admin already exists:', payload.phone);
    } else {
      const admin = await User.create(payload);
      console.log('🚀 Admin created:', { id: admin._id, phone: admin.phone, role: admin.role });
    }
  } catch (err) {
    console.error('❌ Seed error:', err);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected');
  }
}

main();
