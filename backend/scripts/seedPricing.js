import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import connectDB from '../config/db.js';
import Pricing from '../models/pricing.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '..', '.env') });

async function run() {
  await connectDB();

  // deactivate all existing active versions
  await Pricing.updateMany({ active: true }, { $set: { active: false } });

  const doc = await Pricing.create({
    name: 'Default WEIGHT',
    mode: 'WEIGHT',
    perKg: 120,
    baseFee: 0,
    minCharge: 150,
    taxPercent: 0,
    volumetricDivisor: 5000,
    active: true,
    currency: 'AFN',
    notes: 'Seeded default pricing',
  });

  console.log('Seeded pricing:', { id: String(doc._id), mode: doc.mode });
  process.exit(0);
}

run().catch((e) => { console.error(e); process.exit(1); });
