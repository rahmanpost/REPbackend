// backend/controllers/admin/metrics/financeMonthly.js
import Shipment from '../../../models/shipment.js';
import Expense from '../../../models/expense.js';
import Payroll from '../../../models/payroll.js';
import { rangeQuery } from '../../../validators/metricsSchemas.js';
import { withHandler, requireAdmin, zodError } from '../_shared.js';

function startOfMonth(d) { return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 0, 0, 0)); }
function endOfDay(d) { return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999)); }
function monthsAgoUTC(n) {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - n, 1, 0, 0, 0));
}
function round2(n) { return Math.round((Number(n) || 0) * 100) / 100; }

export const financeMonthly = withHandler(async (req, res) => {
  if (!requireAdmin(req, res)) return;

  const parsed = rangeQuery.safeParse(req.query || {});
  if (!parsed.success) return zodError(res, parsed.error);
  const { tz = 'Asia/Kabul', includeApproved = false } = parsed.data || {};
  let { from, to, months = 12 } = parsed.data || {};

  // Default window: last `months` months up to today
  if (!from && !to) {
    from = monthsAgoUTC(months - 1); // e.g. 12 → include current and 11 prior
    to = new Date();
  }
  from = startOfMonth(from || monthsAgoUTC(months - 1));
  to = endOfDay(to || new Date());

  // --- Shipments (createdAt): totals, paid, balance grouped by YYYY-MM (TZ aware)
  const shipAgg = await Shipment.aggregate([
    { $match: { createdAt: { $gte: from, $lte: to } } },
    {
      $addFields: {
        __month: { $dateToString: { format: '%Y-%m', date: '$createdAt', timezone: tz } },
        __grandTotal: { $add: ['$actualCharges', '$otherCharges', '$tax'] },
        __paid: { $ifNull: ['$payment.summary.totalPaid', 0] },
      },
    },
    {
      $group: {
        _id: '$__month',
        shipmentsTotal: { $sum: '$__grandTotal' },
        shipmentsPaid: { $sum: '$__paid' },
      },
    },
    { $project: { _id: 0, month: '$_id', shipmentsTotal: 1, shipmentsPaid: 1 } },
    { $sort: { month: 1 } },
  ]);

  // --- Expenses (date): paid (and optionally approved) grouped by YYYY-MM
  const expenseMatch = {
    deleted: { $ne: true },
    date: { $gte: from, $lte: to },
    ...(includeApproved ? { status: { $in: ['APPROVED', 'PAID'] } } : { status: 'PAID' }),
  };
  const expAgg = await Expense.aggregate([
    { $match: expenseMatch },
    {
      $addFields: {
        __month: { $dateToString: { format: '%Y-%m', date: '$date', timezone: tz } },
      },
    },
    {
      $group: {
        _id: '$__month',
        expensesTotal: { $sum: '$amount' },
      },
    },
    { $project: { _id: 0, month: '$_id', expensesTotal: 1 } },
    { $sort: { month: 1 } },
  ]);

  // --- Payroll (paidAt): paid netPay grouped by YYYY-MM
  const payMatch = { status: 'PAID', paidAt: { $gte: from, $lte: to } };
  const payAgg = await Payroll.aggregate([
    { $match: payMatch },
    {
      $addFields: {
        __month: { $dateToString: { format: '%Y-%m', date: '$paidAt', timezone: tz } },
      },
    },
    {
      $group: {
        _id: '$__month',
        payrollPaid: { $sum: '$netPay' },
      },
    },
    { $project: { _id: 0, month: '$_id', payrollPaid: 1 } },
    { $sort: { month: 1 } },
  ]);

  // Merge by month key
  const map = new Map();
  const ensure = (m) => {
    if (!map.has(m)) map.set(m, { month: m, shipmentsTotal: 0, shipmentsPaid: 0, expensesTotal: 0, payrollPaid: 0, netCash: 0 });
    return map.get(m);
  };
  shipAgg.forEach((r) => Object.assign(ensure(r.month), { shipmentsTotal: round2(r.shipmentsTotal), shipmentsPaid: round2(r.shipmentsPaid) }));
  expAgg.forEach((r) => Object.assign(ensure(r.month), { expensesTotal: round2(r.expensesTotal) }));
  payAgg.forEach((r) => Object.assign(ensure(r.month), { payrollPaid: round2(r.payrollPaid) }));

  // Compute netCash = shipmentsPaid - expensesTotal - payrollPaid
  for (const r of map.values()) {
    r.netCash = round2((r.shipmentsPaid || 0) - (r.expensesTotal || 0) - (r.payrollPaid || 0));
  }

  // Build continuous month labels across the range (even if no data)
  const monthsOut = [];
  const cur = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1));
  const stop = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), 1));
  while (cur <= stop) {
    const key = `${cur.getUTCFullYear()}-${String(cur.getUTCMonth() + 1).padStart(2, '0')}`;
    monthsOut.push(map.get(key) || { month: key, shipmentsTotal: 0, shipmentsPaid: 0, expensesTotal: 0, payrollPaid: 0, netCash: 0 });
    cur.setUTCMonth(cur.getUTCMonth() + 1);
  }

  res.json({
    success: true,
    meta: {
      from,
      to,
      tz,
      includeApproved,
      note: 'Values rounded to 2 decimals; shipmentsTotal = actual + other + tax; netCash = shipmentsPaid - expensesTotal - payrollPaid.',
    },
    data: monthsOut,
  });
});

export default financeMonthly;
