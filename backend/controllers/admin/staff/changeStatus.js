// backend/controllers/admin/staff/changeStatus.js
import Staff from '../../../models/staff.js';
import { staffIdParams, changeStatusBody } from '../../../validators/staffSchemas.js';
import { withHandler, requireAdmin, httpError, redactStaffForRole, zodError } from '../_shared.js';

export const changeStatus = withHandler(async (req, res) => {
  if (!requireAdmin(req, res)) return;

  const idOk = staffIdParams.safeParse(req.params || {});
  if (!idOk.success) return zodError(res, idOk.error);

  const parsed = changeStatusBody.safeParse(req.body || {});
  if (!parsed.success) return zodError(res, parsed.error);

  const doc = await Staff.findById(idOk.data.id).exec();
  if (!doc) return httpError(res, 404, 'Staff not found');

  doc.status = parsed.data.status;
  if (parsed.data.status === 'TERMINATED' && !doc.endDate) {
    doc.endDate = new Date();
  }
  if (parsed.data.notes) {
    doc.notes = [doc.notes, parsed.data.notes].filter(Boolean).join('\n');
  }
  doc.meta = { ...(doc.meta || {}), lastManualEditAt: new Date() };
  await doc.save();

  const clean = redactStaffForRole(doc, req);
  res.json({ success: true, data: clean });
});

export default changeStatus;
