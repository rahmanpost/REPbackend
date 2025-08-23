import Expense from '../../../models/expense.js';
import { expenseIdParams, payExpenseBody } from '../../../validators/expenseSchemas.js';
import { withHandler, requireAdmin, httpError, zodError } from '../_shared.js';

export const payExpense = withHandler(async (req, res) => {
  if (!requireAdmin(req, res)) return;

  const idOk = expenseIdParams.safeParse(req.params || {});
  if (!idOk.success) return zodError(res, idOk.error);

  const body = payExpenseBody.safeParse(req.body || {});
  if (!body.success) return zodError(res, body.error);

  const doc = await Expense.findById(idOk.data.id).exec();
  if (!doc || doc.deleted) return httpError(res, 404, 'Expense not found');
  if (doc.status === 'PAID') return httpError(res, 409, 'Expense already marked as PAID');

  if (doc.status === 'DRAFT') {
    doc.status = 'APPROVED';
    doc.approvedBy = req.user?._id || null;
  }

  doc.paidAt = body.data.paidAt || new Date();
  doc.paidVia = body.data.paidVia;
  doc.txnRef = body.data.txnRef || doc.txnRef;
  doc.paidBy = req.user?._id || null;
  doc.status = 'PAID';
  await doc.save();

  res.json({ success: true, data: doc.toObject() });
});

export default payExpense;
