// backend/controllers/admin/staff/getOne.js
import Staff from '../../../models/staff.js';
import { staffIdParams } from '../../../validators/staffSchemas.js';
import { withHandler, requireAdmin, httpError, redactStaffForRole, zodError } from '../_shared.js';

export const getStaff = withHandler(async (req, res) => {
  if (!requireAdmin(req, res)) return;

  const parsed = staffIdParams.safeParse(req.params || {});
  if (!parsed.success) return zodError(res, parsed.error);

  const doc = await Staff.findById(parsed.data.id).exec();
  if (!doc) return httpError(res, 404, 'Staff not found');

  const clean = redactStaffForRole(doc, req);
  res.json({ success: true, data: clean });
});

export default getStaff;
