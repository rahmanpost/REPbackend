import Expense from '../../../models/expense.js';
import { expenseIdParams } from '../../../validators/expenseSchemas.js';
import { withHandler, requireAdmin, httpError, zodError } from '../_shared.js';

export const getExpense = withHandler(async (req, res) => {
  if (!requireAdmin(req, res)) return;

  const idOk = expenseIdParams.safeParse(req.params || {});
  if (!idOk.success) return zodError(res, idOk.error);

  const doc = await Expense.findById(idOk.data.id).exec();
  if (!doc || doc.deleted) return httpError(res, 404, 'Expense not found');

  res.json({ success: true, data: doc.toObject() });
});

export default getExpense;
