// backend/config/db.js
import mongoose from 'mongoose';

let conn = null;

/**
 * Connect to MongoDB with clean logging and sensible defaults.
 * - Retries automatically via Mongoose driver
 * - Fails fast with a readable error if URI is missing
 */
const connectDB = async () => {
  if (conn) return conn;

  const uri = process.env.MONGO_URI;
  if (!uri || typeof uri !== 'string') {
    console.error('❌ MONGO_URI missing. Set it in backend/.env');
    process.exit(1);
  }

  try {
    // Keep Query filters strict and reduce deprecation warnings noise
    mongoose.set('strictQuery', true);

    conn = await mongoose.connect(uri, {
      // modern drivers don't need many legacy flags; keep it simple & stable
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 15000,
      socketTimeoutMS: 45000,
      // retry writes is on by default for srv; leave as driver-managed
    });

    const host = conn.connection.host;
    console.log(`✅ MongoDB connected: ${host}`);
    return conn;
  } catch (err) {
    console.error('❌ MongoDB connection error:', err?.message || err);
    // Exit so process managers (e.g., nodemon/pm2) can restart
    process.exit(1);
  }
};

// Helpful signals (optional): close connections on process exit
process.on('SIGINT', async () => {
  try {
    await mongoose.connection.close();
    console.log('🔌 MongoDB connection closed (SIGINT)');
  } finally {
    process.exit(0);
  }
});

export default connectDB;
