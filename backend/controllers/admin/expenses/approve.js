import Expense from '../../../models/expense.js';
import { expenseIdParams, approveExpenseBody } from '../../../validators/expenseSchemas.js';
import { withHandler, requireAdmin, httpError, zodError } from '../_shared.js';

export const approveExpense = withHandler(async (req, res) => {
  if (!requireAdmin(req, res)) return;

  const idOk = expenseIdParams.safeParse(req.params || {});
  if (!idOk.success) return zodError(res, idOk.error);

  const body = approveExpenseBody.safeParse(req.body || {});
  if (!body.success) return zodError(res, body.error);

  const doc = await Expense.findById(idOk.data.id).exec();
  if (!doc || doc.deleted) return httpError(res, 404, 'Expense not found');
  if (doc.status !== 'DRAFT') return httpError(res, 409, 'Only DRAFT expense can be approved');

  doc.status = 'APPROVED';
  doc.approvedBy = req.user?._id || null;
  if (body.data.notes) {
    doc.notes = [doc.notes, body.data.notes].filter(Boolean).join('\n');
  }
  await doc.save();

  res.json({ success: true, data: doc.toObject() });
});

export default approveExpense;
