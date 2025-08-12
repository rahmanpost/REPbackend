// backend/controllers/shipments/updateStatus.js
import asyncHandler from 'express-async-handler';
import Shipment from '../../models/shipment.js';
import Pricing from '../../models/pricing.js';
import computeTotals from '../../utils/computeTotals.js';
import { isObjectId, httpError } from './_shared.js';

/**
 * Allowed lifecycle:
 * CREATED → PICKUP_SCHEDULED → PICKED_UP → AT_ORIGIN_HUB → IN_TRANSIT →
 * AT_DESTINATION_HUB → OUT_FOR_DELIVERY → DELIVERED
 * Plus: ON_HOLD, RETURN_TO_SENDER, CANCELLED (terminal: DELIVERED, CANCELLED)
 */
const TERMINAL = new Set(['DELIVERED', 'CANCELLED']);

const NEXTS = {
  CREATED: ['PICKUP_SCHEDULED', 'CANCELLED', 'ON_HOLD'],
  PICKUP_SCHEDULED: ['PICKED_UP', 'CANCELLED', 'ON_HOLD'],
  PICKED_UP: ['AT_ORIGIN_HUB', 'RETURN_TO_SENDER', 'ON_HOLD'],
  AT_ORIGIN_HUB: ['IN_TRANSIT', 'RETURN_TO_SENDER', 'ON_HOLD'],
  IN_TRANSIT: ['AT_DESTINATION_HUB', 'RETURN_TO_SENDER', 'ON_HOLD'],
  AT_DESTINATION_HUB: ['OUT_FOR_DELIVERY', 'RETURN_TO_SENDER', 'ON_HOLD'],
  OUT_FOR_DELIVERY: ['DELIVERED', 'RETURN_TO_SENDER', 'ON_HOLD'],
  ON_HOLD: [
    // allow resume from hold based on previous plausible steps
    'PICKUP_SCHEDULED',
    'PICKED_UP',
    'AT_ORIGIN_HUB',
    'IN_TRANSIT',
    'AT_DESTINATION_HUB',
    'OUT_FOR_DELIVERY',
    'RETURN_TO_SENDER',
    'CANCELLED',
  ],
  RETURN_TO_SENDER: ['AT_ORIGIN_HUB', 'CANCELLED'], // simplified backflow
  DELIVERED: [],
  CANCELLED: [],
};

function canTransition(from, to) {
  if (!from || !to) return false;
  if (from === to) return true; // idempotent update
  const list = NEXTS[from] || [];
  return list.includes(to);
}

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

async function findActivePricing() {
  return Pricing.findOne({ active: true, archived: false })
    .sort({ updatedAt: -1 })
    .lean()
    .exec();
}

function mapPricingToTotalsInput(p) {
  if (!p) return null;
  return {
    pricingVersion: p.name, // human-readable tag
    volumetricDivisor: p.volumetricDivisor ?? 5000,
    mode: p.mode || 'WEIGHT',
    perKg: p.perKg,
    baseFee: p.baseFee || 0,
    minCharge: p.minCharge || 0,
    pricePerCubicCm: p.pricePerCubicCm || null,
    pricePerCubicMeter: p.pricePerCubicMeter || null,
    taxPercent: p.taxPercent ?? 0,
    // Extras not in your schema (harmless defaults):
    fuelPct: 0,
    remoteAreaFee: 0,
    remoteProvinces: [],
    otherCharges: [],
  };
}

function toShipmentLikeFromDoc(doc) {
  return {
    boxType: doc.boxType,
    weightKg: doc.weightKg,
    volumetricDivisor: doc.volumetricDivisor,
    pickupAddress: doc.pickupAddress,
    deliveryAddress: doc.deliveryAddress,
    // If you later store labeled charges, map them here:
    otherCharges: [],
  };
}

/**
 * PATCH /api/shipments/:id/status
 * Body:
 *  {
 *    status: string,              // required
 *    note?: string,               // optional log message
 *    repriceWithActive?: boolean  // optional: recompute charges using active pricing
 *  }
 * Roles: protected; agent/admin typically; customers only for limited moves (enforce upstream).
 */
export const updateStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status: newStatusRaw, note, repriceWithActive } = req.body || {};

  if (!isObjectId(id)) return httpError(res, 400, 'Invalid shipment id.');
  const shipment = await Shipment.findById(id);
  if (!shipment) return httpError(res, 404, 'Shipment not found.');

  const currentStatus = shipment.status || 'CREATED';
  const newStatus = String(newStatusRaw || '').toUpperCase();

  if (!newStatus) return httpError(res, 400, 'status is required.');
  if (TERMINAL.has(currentStatus) && currentStatus !== newStatus) {
    return httpError(res, 409, `Shipment is terminal (${currentStatus}); cannot transition to ${newStatus}.`);
  }
  if (!canTransition(currentStatus, newStatus)) {
    return httpError(res, 409, `Invalid transition: ${currentStatus} → ${newStatus}.`);
  }

  let totals = null;
  if (repriceWithActive) {
    const pricingDoc = await findActivePricing();
    if (!pricingDoc) {
      // If no pricing is active, we keep needsReprice true and proceed with status change.
      shipment.needsReprice = true;
    } else {
      const pricing = mapPricingToTotalsInput(pricingDoc);
      const shipmentLike = toShipmentLikeFromDoc(shipment);
      totals = computeTotals(shipmentLike, pricing);

      // Persist charges
      shipment.actualCharges = totals.actualCharges;
      shipment.otherCharges = r2(
        (totals.surcharges?.fuel || 0) +
        (totals.surcharges?.remote || 0) +
        (totals.surcharges?.other || 0)
      );
      shipment.tax = totals.tax;
      shipment.pricingVersion = totals.pricingVersion || pricing.pricingVersion;
      shipment.needsReprice = false;
    }
  }

  // Apply status
  shipment.status = newStatus;

  // Optional: maintain a simple status history if your model supports it
  if (Array.isArray(shipment.statusHistory)) {
    shipment.statusHistory.push({ status: newStatus, at: new Date(), by: req.user?._id });
  }

  // Log entry
  shipment.logs = shipment.logs || [];
  shipment.logs.push({
    type: 'STATUS',
    message: `Status ${currentStatus} → ${newStatus}${totals ? ' (repriced)' : ''}${note ? ` — ${note}` : ''}`,
    at: new Date(),
    by: req.user?._id,
  });

  // Light-weight invoice regeneration signal (no binary storage here)
  // Your invoice streaming endpoint can check invoiceVersion or invoiceRegeneratedAt.
  const shouldBumpInvoice =
    !!totals || newStatus === 'DELIVERED' || newStatus === 'CANCELLED' || newStatus === 'PICKED_UP';
  if (shouldBumpInvoice) {
    shipment.invoiceVersion = (shipment.invoiceVersion || 0) + 1;
    shipment.invoiceRegeneratedAt = new Date();
  }

  await shipment.save();

  return res.json({
    success: true,
    data: {
      ...shipment.toObject(),
      ...(totals
        ? {
            breakdown: totals.breakdown,
            surcharges: totals.surcharges,
            grandTotal: totals.grandTotal,
          }
        : {}),
    },
  });
});

export default updateStatus;
