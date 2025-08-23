import Expense from '../../../models/expense.js';
import { createExpenseBody } from '../../../validators/expenseSchemas.js';
import { withHandler, requireAdmin, zodError } from '../_shared.js';

export const createExpense = withHandler(async (req, res) => {
  if (!requireAdmin(req, res)) return;

  const parsed = createExpenseBody.safeParse(req.body || {});
  if (!parsed.success) return zodError(res, parsed.error);

  const doc = await Expense.create({ ...parsed.data, createdBy: req.user?._id || null });
  res.status(201).json({ success: true, data: doc.toObject() });
});

export default createExpense;
