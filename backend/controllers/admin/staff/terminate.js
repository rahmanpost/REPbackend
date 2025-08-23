// backend/controllers/admin/staff/terminate.js
import Staff from '../../../models/staff.js';
import { staffIdParams } from '../../../validators/staffSchemas.js';
import { withHandler, requireAdmin, httpError, redactStaffForRole, zodError } from '../_shared.js';

export const terminateStaff = withHandler(async (req, res) => {
  if (!requireAdmin(req, res)) return;

  const idOk = staffIdParams.safeParse(req.params || {});
  if (!idOk.success) return zodError(res, idOk.error);

  const doc = await Staff.findById(idOk.data.id).exec();
  if (!doc) return httpError(res, 404, 'Staff not found');

  doc.status = 'TERMINATED';
  doc.endDate = doc.endDate || new Date();
  doc.meta = { ...(doc.meta || {}), lastManualEditAt: new Date() };
  await doc.save();

  const clean = redactStaffForRole(doc, req);
  res.json({ success: true, data: clean });
});

export default terminateStaff;
