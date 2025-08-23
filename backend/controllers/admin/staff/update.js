// backend/controllers/admin/staff/update.js
import Staff from '../../../models/staff.js';
import { staffIdParams, updateStaffBody } from '../../../validators/staffSchemas.js';
import { withHandler, requireAdmin, httpError, redactStaffForRole, zodError } from '../_shared.js';

export const updateStaff = withHandler(async (req, res) => {
  if (!requireAdmin(req, res)) return;

  const idOk = staffIdParams.safeParse(req.params || {});
  if (!idOk.success) return zodError(res, idOk.error);

  const parsed = updateStaffBody.safeParse(req.body || {});
  if (!parsed.success) return zodError(res, parsed.error);
  const data = parsed.data;

  // If changing employeeCode, enforce uppercase + unique
  if (data.employeeCode) {
    const nextCode = String(data.employeeCode).toUpperCase();
    const clash = await Staff.findOne({ employeeCode: nextCode, _id: { $ne: idOk.data.id } }).select('_id').lean();
    if (clash) return httpError(res, 409, 'employeeCode already exists');
    data.employeeCode = nextCode;
  }

  const doc = await Staff.findById(idOk.data.id).exec();
  if (!doc) return httpError(res, 404, 'Staff not found');

  Object.assign(doc, data, { meta: { ...(doc.meta || {}), lastManualEditAt: new Date() } });
  await doc.save();

  const clean = redactStaffForRole(doc, req);
  res.json({ success: true, data: clean });
});

export default updateStaff;
