import Payroll from '../../../models/payroll.js';
import { listPayrollQuery } from '../../../validators/payrollSchemas.js';
import { withHandler, requireAdmin, zodError } from '../_shared.js';

export const listPayroll = withHandler(async (req, res) => {
  if (!requireAdmin(req, res)) return;

  const parsed = listPayrollQuery.safeParse(req.query || {});
  if (!parsed.success) return zodError(res, parsed.error);
  const { page = 1, limit = 20, staff, status, year, month, from, to } = parsed.data || {};

  const filter = {};
  if (staff) filter.staff = staff;
  if (status) filter.status = status;
  if (year) filter.periodYear = year;
  if (month) filter.periodMonth = month;

  if (from || to) {
    const fromKey = from ? (from.getUTCFullYear() * 100 + (from.getUTCMonth() + 1)) : null;
    const toKey = to ? (to.getUTCFullYear() * 100 + (to.getUTCMonth() + 1)) : null;
    filter.$expr = { $and: [] };
    const keyExpr = { $add: [{ $multiply: ['$periodYear', 100] }, '$periodMonth'] };
    if (fromKey) filter.$expr.$and.push({ $gte: [keyExpr, fromKey] });
    if (toKey) filter.$expr.$and.push({ $lte: [keyExpr, toKey] });
    if (!filter.$expr.$and.length) delete filter.$expr;
  }

  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    Payroll.find(filter).sort({ periodYear: -1, periodMonth: -1, createdAt: -1 }).skip(skip).limit(limit).lean().exec(),
    Payroll.countDocuments(filter),
  ]);

  res.json({ success: true, data: items, page, limit, total, pages: Math.ceil(total / limit) });
});

export default listPayroll;
