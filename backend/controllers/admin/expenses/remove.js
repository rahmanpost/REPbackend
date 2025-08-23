import Expense from '../../../models/expense.js';
import { expenseIdParams } from '../../../validators/expenseSchemas.js';
import { withHandler, requireAdmin, httpError, zodError, isSuper } from '../_shared.js';

export const removeExpense = withHandler(async (req, res) => {
  if (!requireAdmin(req, res)) return;
  if (!isSuper(req)) return httpError(res, 403, 'Only SUPER_ADMIN can delete expenses');

  const idOk = expenseIdParams.safeParse(req.params || {});
  if (!idOk.success) return zodError(res, idOk.error);

  const doc = await Expense.findById(idOk.data.id).exec();
  if (!doc || doc.deleted) return httpError(res, 404, 'Expense not found');

  doc.deleted = true;
  doc.meta = { ...(doc.meta || {}), lastManualEditAt: new Date() };
  await doc.save();

  res.json({ success: true, data: { deleted: true, id: doc._id } });
});

export default removeExpense;
