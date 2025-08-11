// backend/scripts/bulkReprice.js
// Run examples:
//   node backend/scripts/bulkReprice.js
//   node backend/scripts/bulkReprice.js --apply
//   node backend/scripts/bulkReprice.js --since=2025-08-01 --limit=500 --apply
//   node backend/scripts/bulkReprice.js --pricingVersion=<ObjectId> --apply

import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import mongoose from 'mongoose';

import connectDB from '../config/db.js';
import Shipment from '../models/shipment.js';
import Pricing from '../models/pricing.js';
import computeTotals from '../utils/computeTotals.js';

process.on('unhandledRejection', (r) => console.error('UNHANDLED REJECTION:', r));
process.on('uncaughtException', (e) => console.error('UNCAUGHT EXCEPTION:', e));

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function parseArgs(argv) {
  const args = { apply: false, limit: 0, since: null, pricingVersion: null };
  for (const a of argv.slice(2)) {
    if (a === '--apply') args.apply = true;
    else if (a.startsWith('--limit=')) args.limit = Number(a.split('=')[1] || '0');
    else if (a.startsWith('--since=')) args.since = new Date(a.split('=')[1]);
    else if (a.startsWith('--pricingVersion=')) args.pricingVersion = a.split('=')[1];
  }
  return args;
}
const ARGS = parseArgs(process.argv);

dotenv.config({ path: path.join(__dirname, '..', '.env') });

console.log('bulkReprice: start');
console.log('  cwd        :', process.cwd());
console.log('  script dir :', __dirname);
console.log('  args       :', ARGS);
console.log('  NODE_ENV   :', process.env.NODE_ENV || '(not set)');
console.log('  MONGO_URI? :', process.env.MONGO_URI ? 'present' : 'MISSING');

async function loadPricing() {
  if (ARGS.pricingVersion) {
    if (!mongoose.Types.ObjectId.isValid(ARGS.pricingVersion)) throw new Error('Invalid --pricingVersion ObjectId');
    const p = await Pricing.findById(ARGS.pricingVersion);
    if (!p) throw new Error('pricingVersion not found');
    return p;
  }
  const active = await Pricing.findOne({ active: true, archived: { $ne: true } }).sort({ updatedAt: -1 });
  if (!active) throw new Error('No active pricing configured');
  return active;
}

function toShipmentLike(s, divisor) {
  return {
    boxType: s.boxType,
    dimensionsCm: s.dimensionsCm, // ok if legacy doc has only dimensionsCm
    weightKg: s.weightKg ?? 0,
    volumetricDivisor: divisor ?? s.volumetricDivisor ?? 5000,
  };
}

async function main() {
  console.log('Connecting to MongoDB...');
  await connectDB();
  console.log('Connected.');

  const pricing = await loadPricing();
  console.log('Pricing loaded:', { id: String(pricing._id), mode: pricing.mode, divisor: pricing.volumetricDivisor });

  const query = { needsReprice: true };
  if (ARGS.since && !isNaN(ARGS.since.valueOf())) query.updatedAt = { $gte: ARGS.since };

  const totalToProcess = await Shipment.countDocuments(query);
  console.log(`Shipments to process: ${totalToProcess}${ARGS.limit ? ` (limit ${ARGS.limit})` : ''}`);
  if (totalToProcess === 0) { console.log('Nothing to reprice. Exiting.'); await mongoose.connection.close(); return; }

  const cursor = Shipment.find(query).sort({ updatedAt: 1 }).cursor();

  let scanned = 0, updated = 0, errors = 0;

  for await (const s of cursor) {
    scanned++;
    try {
      const totals = computeTotals(toShipmentLike(s, pricing.volumetricDivisor), pricing.toObject());

      if (ARGS.apply) {
        const update = {
          $set: {
            actualCharges: totals.actualCharges,
            tax: totals.tax,
            volumetricDivisor: totals.volumetricDivisor,
            volumetricWeightKg: totals.volumetricWeightKg,
            chargeableWeightKg: totals.chargeableWeightKg,
            pricingVersion: pricing._id,
            needsReprice: false,
          },
          $push: {
            logs: {
              type: 'INFO',
              message: `Bulk repriced (version=${pricing._id}, grand=${totals.grandTotal.toFixed(2)})`,
              at: new Date(),
              by: null,
              data: totals.breakdown,
            },
          },
        };

        const result = await Shipment.updateOne({ _id: s._id }, update, { runValidators: false });
        if (result.modifiedCount > 0) updated++;
      } else {
        console.log(
          `[DRY] ${s._id} chargeable=${totals.chargeableWeightKg}kg actual=${totals.actualCharges} tax=${totals.tax} grand=${totals.grandTotal}`
        );
      }

      if (ARGS.limit && updated >= ARGS.limit) { console.log('Hit --limit, stopping early.'); break; }
    } catch (e) {
      errors++;
      console.error(`Error repricing shipment ${s._id}:`, e.message);
    }
  }

  console.log(`Done. scanned=${scanned}, updated=${updated}, errors=${errors}, mode=${ARGS.apply ? 'APPLY' : 'DRY-RUN'}`);
  await mongoose.connection.close();
}

main().catch(async (e) => {
  console.error('Bulk reprice failed:', e?.message || e);
  try { await mongoose.connection.close(); } catch {}
  process.exit(1);
});
