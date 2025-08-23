import Payroll from '../../../models/payroll.js';
import { payrollIdParams, updatePayrollBody } from '../../../validators/payrollSchemas.js';
import { withHandler, requireAdmin, httpError, zodError, isSuper } from '../_shared.js';

export const updatePayroll = withHandler(async (req, res) => {
  if (!requireAdmin(req, res)) return;

  const idOk = payrollIdParams.safeParse(req.params || {});
  if (!idOk.success) return zodError(res, idOk.error);

  const body = updatePayrollBody.safeParse(req.body || {});
  if (!body.success) return zodError(res, body.error);

  const doc = await Payroll.findById(idOk.data.id).exec();
  if (!doc) return httpError(res, 404, 'Payroll not found');

  if (doc.status !== 'DRAFT' && !isSuper(req)) {
    return httpError(res, 403, 'Only SUPER_ADMIN can edit approved/paid payroll.');
  }

  Object.assign(doc, body.data, { meta: { ...(doc.meta || {}), lastManualEditAt: new Date() } });
  await doc.save();

  res.json({ success: true, data: doc.toObject() });
});

export default updatePayroll;
