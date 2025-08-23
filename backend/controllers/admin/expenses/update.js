import Expense from '../../../models/expense.js';
import { expenseIdParams, updateExpenseBody } from '../../../validators/expenseSchemas.js';
import { withHandler, requireAdmin, httpError, zodError, isSuper } from '../_shared.js';

export const updateExpense = withHandler(async (req, res) => {
  if (!requireAdmin(req, res)) return;

  const idOk = expenseIdParams.safeParse(req.params || {});
  if (!idOk.success) return zodError(res, idOk.error);

  const body = updateExpenseBody.safeParse(req.body || {});
  if (!body.success) return zodError(res, body.error);

  const doc = await Expense.findById(idOk.data.id).exec();
  if (!doc || doc.deleted) return httpError(res, 404, 'Expense not found');

  if (doc.status === 'PAID' && !isSuper(req)) {
    return httpError(res, 403, 'Only SUPER_ADMIN can edit a paid expense.');
  }

  Object.assign(doc, body.data, { meta: { ...(doc.meta || {}), lastManualEditAt: new Date() } });
  await doc.save();

  res.json({ success: true, data: doc.toObject() });
});

export default updateExpense;
