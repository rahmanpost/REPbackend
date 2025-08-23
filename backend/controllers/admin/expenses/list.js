import Expense from '../../../models/expense.js';
import { listExpensesQuery } from '../../../validators/expenseSchemas.js';
import { withHandler, requireAdmin, zodError } from '../_shared.js';

export const listExpenses = withHandler(async (req, res) => {
  if (!requireAdmin(req, res)) return;

  const parsed = listExpensesQuery.safeParse(req.query || {});
  if (!parsed.success) return zodError(res, parsed.error);
  const { page = 1, limit = 20, category, status, from, to, q, tag } = parsed.data || {};

  const filter = { deleted: { $ne: true } };
  if (category) filter.category = category;
  if (status) filter.status = status;
  if (from) filter.date = { ...(filter.date || {}), $gte: from };
  if (to) filter.date = { ...(filter.date || {}), $lte: to };
  if (q) {
    const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ description: rx }, { vendor: rx }, { invoiceNumber: rx }, { txnRef: rx }];
  }
  if (tag) {
    filter.tags = tag;
  }

  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    Expense.find(filter).sort({ date: -1, createdAt: -1 }).skip(skip).limit(limit).lean().exec(),
    Expense.countDocuments(filter),
  ]);

  res.json({ success: true, data: items, page, limit, total, pages: Math.ceil(total / limit) });
});

export default listExpenses;
