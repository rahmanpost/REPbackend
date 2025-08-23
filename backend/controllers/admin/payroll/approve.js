import Payroll from '../../../models/payroll.js';
import { payrollIdParams, approvePayrollBody } from '../../../validators/payrollSchemas.js';
import { withHandler, requireAdmin, httpError, zodError } from '../_shared.js';

export const approvePayroll = withHandler(async (req, res) => {
  if (!requireAdmin(req, res)) return;

  const idOk = payrollIdParams.safeParse(req.params || {});
  if (!idOk.success) return zodError(res, idOk.error);

  const body = approvePayrollBody.safeParse(req.body || {});
  if (!body.success) return zodError(res, body.error);

  const doc = await Payroll.findById(idOk.data.id).exec();
  if (!doc) return httpError(res, 404, 'Payroll not found');
  if (doc.status !== 'DRAFT') return httpError(res, 409, 'Only DRAFT payroll can be approved');

  doc.status = 'APPROVED';
  doc.approvedBy = req.user?._id || null;
  if (body.data.notes) {
    doc.notes = [doc.notes, body.data.notes].filter(Boolean).join('\n');
  }
  await doc.save();

  res.json({ success: true, data: doc.toObject() });
});

export default approvePayroll;
