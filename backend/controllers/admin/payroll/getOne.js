import Payroll from '../../../models/payroll.js';
import { payrollIdParams } from '../../../validators/payrollSchemas.js';
import { withHandler, requireAdmin, httpError, zodError } from '../_shared.js';

export const getPayroll = withHandler(async (req, res) => {
  if (!requireAdmin(req, res)) return;

  const idOk = payrollIdParams.safeParse(req.params || {});
  if (!idOk.success) return zodError(res, idOk.error);

  const doc = await Payroll.findById(idOk.data.id).exec();
  if (!doc) return httpError(res, 404, 'Payroll not found');

  res.json({ success: true, data: doc.toObject() });
});

export default getPayroll;
