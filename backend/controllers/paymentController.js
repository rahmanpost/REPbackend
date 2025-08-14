// backend/controllers/paymentController.js
import asyncHandler from 'express-async-handler';
import Shipment from '../models/shipment.js';
import { httpError } from './shipments/_shared.js';
import {
  addPaymentBody,
  voidPaymentBody,
  settlePaymentBody,
  changePaymentMethodBody,
  idParamSchema as shipmentIdParams,
  paymentIdParams,
} from '../validators/shipmentSchemas.js';

/* ------------------------------ helpers ------------------------------ */
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const safeString = (v, max = 240) =>
  typeof v === 'string'
    ? v.replace(/[\u0000-\u001F\u007F]/g, '').replace(/\s+/g, ' ').trim().slice(0, max)
    : v;

function roleOf(req) {
  return String(req.user?.role || '').toLowerCase();
}
function isOwner(req, sh) {
  return String(sh.sender) === String(req.user?._id);
}
function isAssignedAgent(req, sh) {
  const role = roleOf(req);
  if (role !== 'agent') return false;
  const uid = String(req.user?._id || '');
  return uid === String(sh.pickupAgent || '') || uid === String(sh.deliveryAgent || '');
}
function isAdminish(req) {
  const r = roleOf(req);
  return r === 'admin' || r === 'super_admin';
}

function ensureCanView(req, sh) {
  if (isOwner(req, sh) || isAdminish(req) || isAssignedAgent(req, sh)) return true;
  return false;
}

function ensureCanAddPayment(req, sh, body) {
  const method = String(body?.method || '').toUpperCase();
  const at = String(body?.at || '').toUpperCase();

  // Block ledger writes for cancelled shipments
  if (sh.status === 'CANCELLED') return 'Cannot add payments to a cancelled shipment.';

  // If not priced yet (grandTotal 0), block to avoid orphan payments
  if ((sh.payment?.summary?.totalDue || 0) <= 0) {
    return 'Shipment must be priced before accepting payments.';
  }

  // Admins and assigned agents can collect in-person payments
  if (isAdminish(req) || isAssignedAgent(req, sh)) return null;

  // Customer can add ONLINE payments (e.g., from portal/webhook)
  if (isOwner(req, sh) && method === 'ONLINE' && (at === 'ONLINE' || at === 'OFFICE')) {
    return null;
  }

  return 'Not authorized to add a payment for this shipment.';
}

function ensureCanVoid(req, sh) {
  if (sh.status === 'CANCELLED') return 'Cannot modify payments of a cancelled shipment.';
  return isAdminish(req) ? null : 'Only admin/super_admin can void a payment.';
}

function ensureCanChangeMethod(req, sh) {
  // Only before fully paid
  const status = String(sh.payment?.summary?.status || 'PENDING');
  if (status === 'PAID') return 'Cannot change payment method after full payment.';
  if (isAdminish(req) || isOwner(req, sh)) return null;
  return 'Not authorized to change payment method for this shipment.';
}

/* ------------------------------ controllers ------------------------------ */

// GET /api/shipments/:id/payments
export const listPayments = asyncHandler(async (req, res) => {
  const { id } = shipmentIdParams.parse(req.params);
  const sh = await Shipment.findById(id);
  if (!sh) return httpError(res, 404, 'Shipment not found');

  if (!ensureCanView(req, sh)) return httpError(res, 403, 'Not authorized');

  // Ensure summary is available (model recomputes on save; we mirror cheap calc if stale)
  const summary = sh.payment?.summary || { totalDue: 0, totalPaid: 0, balance: 0, status: 'PENDING' };
  return res.json({
    success: true,
    data: {
      summary,
      payments: (sh.payment?.payments || []).filter(Boolean),
    },
  });
});

// POST /api/shipments/:id/payments
export const addPayment = asyncHandler(async (req, res) => {
  const { id } = shipmentIdParams.parse(req.params);
  const body = addPaymentBody.parse(req.body);

  const sh = await Shipment.findById(id);
  if (!sh) return httpError(res, 404, 'Shipment not found');

  const authErr = ensureCanAddPayment(req, sh, body);
  if (authErr) return httpError(res, 403, authErr);

  const summary = sh.payment?.summary || { totalDue: 0, totalPaid: 0, balance: 0 };
  let balance = Number(summary.balance || 0);
  if (balance <= 0) return httpError(res, 400, 'Nothing to pay. Shipment is already settled.');

  // Clamp overpayments
  const amount = r2(Math.max(0.01, Math.min(Number(body.amount), balance)));
  const entry = {
    amount,
    method: String(body.method).toUpperCase(),
    at: String(body.at || 'OFFICE').toUpperCase(),
    when: body.when ? new Date(body.when) : new Date(),
    txnRef: safeString(body.txnRef || '', 120) || '',
    collectedBy: (isAdminish(req) || isAssignedAgent(req, sh)) ? req.user?._id : null,
    note: safeString(body.note || '', 240) || '',
    voided: false,
  };

  sh.payment = sh.payment || {};
  sh.payment.payments = Array.isArray(sh.payment.payments) ? sh.payment.payments : [];
  sh.payment.payments.push(entry);

  // Log it
  sh.logs = sh.logs || [];
  sh.logs.push({
    type: 'INFO',
    at: new Date(),
    by: req.user?._id,
    message: `Payment added: ${entry.method} ${amount} at ${entry.at}${entry.txnRef ? ` (#${entry.txnRef})` : ''}`,
    data: { amount, method: entry.method, at: entry.at, txnRef: entry.txnRef },
  });

  await sh.save(); // model hook recomputes summary

  return res.status(201).json({
    success: true,
    data: {
      summary: sh.payment.summary,
      payment: entry,
      payments: sh.payment.payments,
    },
  });
});

// PATCH /api/shipments/:id/payments/:pid/void
export const voidPayment = asyncHandler(async (req, res) => {
  const { id, pid } = paymentIdParams.parse({ ...req.params });
  const body = voidPaymentBody.parse(req.body || {});

  const sh = await Shipment.findById(id);
  if (!sh) return httpError(res, 404, 'Shipment not found');

  const authErr = ensureCanVoid(req, sh);
  if (authErr) return httpError(res, 403, authErr);

  const list = Array.isArray(sh.payment?.payments) ? sh.payment.payments : [];
  const p = list.find((x) => String(x._id) === String(pid));
  if (!p) return httpError(res, 404, 'Payment entry not found');

  if (p.voided) return httpError(res, 400, 'Payment is already voided');
  p.voided = true;
  if (body.reason) p.note = `${safeString(body.reason, 200)} | ${p.note || ''}`.slice(0, 240);

  sh.logs = sh.logs || [];
  sh.logs.push({
    type: 'WARN',
    at: new Date(),
    by: req.user?._id,
    message: `Payment voided: ${p.method} ${p.amount}${p.txnRef ? ` (#${p.txnRef})` : ''}`,
    data: { paymentId: p._id, reason: body.reason || null },
  });

  await sh.save(); // recompute summary

  return res.json({
    success: true,
    data: {
      summary: sh.payment.summary,
      payments: sh.payment.payments,
    },
  });
});

// PATCH /api/shipments/:id/payment/settle
export const settleBalance = asyncHandler(async (req, res) => {
  const { id } = shipmentIdParams.parse(req.params);
  const body = settlePaymentBody.parse(req.body);

  const sh = await Shipment.findById(id);
  if (!sh) return httpError(res, 404, 'Shipment not found');

  // Reuse add-permission rules (same constraints)
  const authErr = ensureCanAddPayment(req, sh, { method: body.method, at: body.at });
  if (authErr) return httpError(res, 403, authErr);

  const summary = sh.payment?.summary || { totalDue: 0, totalPaid: 0, balance: 0 };
  const balance = r2(Number(summary.balance || 0));
  if (balance <= 0) return httpError(res, 400, 'Nothing to settle. Shipment is already paid.');

  const entry = {
    amount: balance,
    method: String(body.method).toUpperCase(),
    at: String(body.at || 'OFFICE').toUpperCase(),
    when: body.when ? new Date(body.when) : new Date(),
    txnRef: safeString(body.txnRef || '', 120) || '',
    collectedBy: (isAdminish(req) || isAssignedAgent(req, sh)) ? req.user?._id : null,
    note: safeString(body.note || 'Auto-settle remaining balance', 240),
    voided: false,
  };

  sh.payment = sh.payment || {};
  sh.payment.payments = Array.isArray(sh.payment.payments) ? sh.payment.payments : [];
  sh.payment.payments.push(entry);

  sh.logs = sh.logs || [];
  sh.logs.push({
    type: 'INFO',
    at: new Date(),
    by: req.user?._id,
    message: `Balance settled: ${entry.method} ${entry.amount} at ${entry.at}`,
  });

  await sh.save();

  return res.json({
    success: true,
    data: {
      summary: sh.payment.summary,
      payment: entry,
      payments: sh.payment.payments,
    },
  });
});

// PATCH /api/shipments/:id/payment-method
export const changePaymentMethod = asyncHandler(async (req, res) => {
  const { id } = shipmentIdParams.parse(req.params);
  const body = changePaymentMethodBody.parse(req.body);

  const sh = await Shipment.findById(id);
  if (!sh) return httpError(res, 404, 'Shipment not found');

  const err = ensureCanChangeMethod(req, sh);
  if (err) return httpError(res, 403, err);

  if (body.mode) sh.payment.mode = body.mode;
  if (body.method) sh.payment.method = body.method;

  sh.logs = sh.logs || [];
  sh.logs.push({
    type: 'INFO',
    at: new Date(),
    by: req.user?._id,
    message: `Payment preference updated${body.mode ? ' mode=' + body.mode : ''}${body.method ? ' method=' + body.method : ''}`,
  });

  await sh.save();

  return res.json({
    success: true,
    data: {
      summary: sh.payment.summary,
      payment: {
        mode: sh.payment.mode,
        method: sh.payment.method,
        status: sh.payment.status,
      },
    },
  });
});

export default {
  listPayments,
  addPayment,
  voidPayment,
  settleBalance,
  changePaymentMethod,
};
