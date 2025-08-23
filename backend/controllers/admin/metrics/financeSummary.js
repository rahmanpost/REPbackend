// backend/controllers/admin/metrics/financeSummary.js
import Shipment from '../../../models/shipment.js';
import Expense from '../../../models/expense.js';
import Payroll from '../../../models/payroll.js';
import { rangeQuery } from '../../../validators/metricsSchemas.js';
import { withHandler, requireAdmin, zodError } from '../_shared.js';

function startOfDay(d) { return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0)); }
function endOfDay(d) { return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999)); }
function monthsAgoUTC(n) {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - n, 1, 0, 0, 0));
}
function round2(n) { return Math.round((Number(n) || 0) * 100) / 100; }

export const financeSummary = withHandler(async (req, res) => {
  if (!requireAdmin(req, res)) return;

  const parsed = rangeQuery.safeParse(req.query || {});
  if (!parsed.success) return zodError(res, parsed.error);
  const { includeApproved = false } = parsed.data || {};
  let { from, to, months = 12 } = parsed.data || {};

  if (!from && !to) {
    from = monthsAgoUTC(months - 1);
    to = new Date();
  }
  from = startOfDay(from || monthsAgoUTC(months - 1));
  to = endOfDay(to || new Date());

  // Shipments totals across range
  const shipAgg = await Shipment.aggregate([
    { $match: { createdAt: { $gte: from, $lte: to } } },
    {
      $group: {
        _id: null,
        total: { $sum: { $add: ['$actualCharges', '$otherCharges', '$tax'] } },
        paid: { $sum: { $ifNull: ['$payment.summary.totalPaid', 0] } },
      },
    },
  ]);
  const shipmentsTotal = round2(shipAgg?.[0]?.total || 0);
  const shipmentsPaid = round2(shipAgg?.[0]?.paid || 0);
  const shipmentsOutstanding = round2(shipmentsTotal - shipmentsPaid);

  // Expenses totals
  const expMatch = {
    deleted: { $ne: true },
    date: { $gte: from, $lte: to },
    ...(includeApproved ? { status: { $in: ['APPROVED', 'PAID'] } } : { status: 'PAID' }),
  };
  const expAgg = await Expense.aggregate([
    { $match: expMatch },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ]);
  const expensesTotal = round2(expAgg?.[0]?.total || 0);

  // Payroll paid totals
  const payAgg = await Payroll.aggregate([
    { $match: { status: 'PAID', paidAt: { $gte: from, $lte: to } } },
    { $group: { _id: null, total: { $sum: '$netPay' } } },
  ]);
  const payrollPaid = round2(payAgg?.[0]?.total || 0);

  const netCash = round2(shipmentsPaid - expensesTotal - payrollPaid);

  res.json({
    success: true,
    meta: { from, to, includeApproved, note: 'NetCash = ShipmentsPaid - ExpensesTotal - PayrollPaid' },
    data: {
      shipments: { total: shipmentsTotal, paid: shipmentsPaid, outstanding: shipmentsOutstanding },
      expenses: { total: expensesTotal },
      payroll: { paid: payrollPaid },
      netCash,
    },
  });
});

export default financeSummary;
