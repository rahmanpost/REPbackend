import Payroll from '../../../models/payroll.js';
import { payrollIdParams, payPayrollBody } from '../../../validators/payrollSchemas.js';
import { withHandler, requireAdmin, httpError, zodError } from '../_shared.js';

export const payPayroll = withHandler(async (req, res) => {
  if (!requireAdmin(req, res)) return;

  const idOk = payrollIdParams.safeParse(req.params || {});
  if (!idOk.success) return zodError(res, idOk.error);

  const body = payPayrollBody.safeParse(req.body || {});
  if (!body.success) return zodError(res, body.error);

  const doc = await Payroll.findById(idOk.data.id).exec();
  if (!doc) return httpError(res, 404, 'Payroll not found');

  if (doc.status === 'PAID') return httpError(res, 409, 'Payroll already marked as PAID');

  if (doc.status === 'DRAFT') {
    doc.status = 'APPROVED';
    doc.approvedBy = req.user?._id || null;
  }

  doc.paidAt = body.data.paidAt || new Date();
  doc.txnRef = body.data.txnRef || doc.txnRef;
  doc.paidBy = req.user?._id || null;
  doc.status = 'PAID';
  await doc.save();

  res.json({ success: true, data: doc.toObject() });
});

export default payPayroll;
