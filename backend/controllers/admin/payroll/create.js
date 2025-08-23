import Payroll from '../../../models/payroll.js';
import { createPayrollBody } from '../../../validators/payrollSchemas.js';
import { withHandler, requireAdmin, httpError, zodError } from '../_shared.js';

export const createPayroll = withHandler(async (req, res) => {
  if (!requireAdmin(req, res)) return;

  const parsed = createPayrollBody.safeParse(req.body || {});
  if (!parsed.success) return zodError(res, parsed.error);
  const data = parsed.data;

  const existing = await Payroll.findOne({
    staff: data.staff,
    periodYear: data.periodYear,
    periodMonth: data.periodMonth,
  }).exec();

  if (existing) {
    if (existing.status !== 'DRAFT') {
      return httpError(res, 409, 'Payroll for this staff & period already finalized.');
    }
    Object.assign(existing, data, { meta: { ...(existing.meta || {}), lastManualEditAt: new Date() } });
    await existing.save();
    return res.status(200).json({ success: true, data: existing.toObject() });
  }

  const doc = await Payroll.create(data);
  res.status(201).json({ success: true, data: doc.toObject() });
});

export default createPayroll;
