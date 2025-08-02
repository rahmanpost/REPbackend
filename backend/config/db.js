import mongoose from 'mongoose';
import User from '../models/User.js'; // Import the model to sync indexes

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI, {
      
      autoIndex: process.env.NODE_ENV === 'development', // autoIndex only in dev
    });

    console.log(`✅ MongoDB connected: ${conn.connection.host}`);

    // Optional: Drop and rebuild indexes only in development
    if (process.env.NODE_ENV === 'development') {
      await User.syncIndexes();
      console.log('🔁 User indexes synced (dev only)');
    }
  } catch (err) {
    console.error('❌ MongoDB connection error:', err.message);
    process.exit(1);
  }
};

export default connectDB;
