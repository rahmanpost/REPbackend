// backend/controllers/shipments/create.js
import asyncHandler from 'express-async-handler';
import Shipment from '../../models/shipment.js';
import { generateTrackingIdWithRetry } from '../../utils/generateTrackingId.js';
import { generateInvoiceNumber } from '../../utils/generateInvoiceNumber.js';
import { isObjectId, httpError } from './_shared.js';

/**
 * Upgraded create:
 *  - Expects validated body with:
 *    pickupAddress, deliveryAddress, boxType (PRESET|CUSTOM), weightKg?, volumetricDivisor?,
 *    isCOD?, codAmount?, payment?, notes?, invoiceNumber?, trackingId?, sender? (admin only)
 *  - No legacy fields (from/to, serviceType, items, pieces, declaredValue, zoneName)
 *  - Pricing is NOT computed here. We set needsReprice=true and charges=0.
 */
export const createShipment = asyncHandler(async (req, res) => {
  const {
    // actors
    sender,
    // identity (optional overrides)
    invoiceNumber,
    trackingId,
    // addresses
    pickupAddress,
    deliveryAddress,
    // box & weight
    boxType,
    weightKg,
    volumetricDivisor,
    // pricing flags
    isCOD,
    codAmount,
    // payment & misc
    payment,
    notes,
    // optional currency override (defaults to AFN)
    currency,
  } = req.body || {};

  // Sender: admin may override, otherwise use authenticated user
  const isAdmin = req.user?.role === 'ADMIN';
  const senderId = isAdmin && sender ? sender : req.user?._id;
  if (!senderId || !isObjectId(senderId)) {
    return httpError(res, 400, 'Valid sender is required.');
  }

  // Basic required shape should already be enforced by validator,
  // but keep defensive checks in case a route bypassed it.
  if (!pickupAddress || !deliveryAddress) {
    return httpError(res, 400, 'pickupAddress and deliveryAddress are required.');
  }
  if (!boxType || !boxType.kind) {
    return httpError(res, 400, 'boxType is required (PRESET or CUSTOM).');
  }

  // Invoice number (accept or generate; ensure uniqueness)
  let finalInvoiceNumber =
    typeof invoiceNumber === 'string' && invoiceNumber.trim()
      ? invoiceNumber.trim()
      : null;

  if (finalInvoiceNumber) {
    const exists = await Shipment.exists({ invoiceNumber: finalInvoiceNumber });
    if (exists) return httpError(res, 409, 'invoiceNumber already exists.');
  } else {
    const isTaken = async (num) => !!(await Shipment.exists({ invoiceNumber: num }));
    finalInvoiceNumber = await generateInvoiceNumber({}, isTaken);
  }

  // Tracking ID (accept if unique, else generate with retry)
  let finalTrackingId = null;
  if (typeof trackingId === 'string' && trackingId.trim()) {
    const id = trackingId.trim();
    const taken = await Shipment.exists({ trackingId: id });
    if (taken) return httpError(res, 409, 'trackingId already exists.');
    finalTrackingId = id;
  } else {
    finalTrackingId = await generateTrackingIdWithRetry(
      async (id) => !!(await Shipment.exists({ trackingId: id })),
      { maxAttempts: 7 }
    );
  }

  // Build the doc according to the upgraded model
  const doc = {
    sender: senderId,

    invoiceNumber: finalInvoiceNumber,
    trackingId: finalTrackingId,

    pickupAddress,
    deliveryAddress,

    boxType,
    weightKg: weightKg != null ? Number(weightKg) : 0,
    volumetricDivisor: volumetricDivisor != null ? Number(volumetricDivisor) : 5000,

    // charges are assigned by admin later; start at zero and mark for repricing
    actualCharges: 0,
    otherCharges: 0,
    tax: 0,
    needsReprice: true,

    // COD & payment
    isCOD: !!isCOD,
    codAmount: codAmount != null ? Number(codAmount) : 0,
    payment: {
      mode: payment?.mode || 'DELIVERY',
      method: payment?.method || 'CASH',
      status: payment?.status || 'UNPAID',
      transactionId: payment?.transactionId || undefined,
    },

    currency: currency || 'AFN',
    status: 'CREATED',
    notes: notes || undefined,

    // initial log entry
    logs: [
      {
        type: 'INFO',
        message: 'Shipment created',
        at: new Date(),
        by: req.user?._id,
      },
    ],
  };

  const shipment = await Shipment.create(doc);
  // Model pre-validate will auto-derive dimensions, volumetricWeightKg, chargeableWeightKg

  return res.status(201).json({ success: true, data: shipment });
});
