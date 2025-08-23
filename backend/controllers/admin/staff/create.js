// backend/controllers/admin/staff/create.js
import Staff from '../../../models/staff.js';
import { createStaffBody } from '../../../validators/staffSchemas.js';
import { withHandler, requireAdmin, httpError, redactStaffForRole, zodError } from '../_shared.js';

export const createStaff = withHandler(async (req, res) => {
  if (!requireAdmin(req, res)) return;

  const parsed = createStaffBody.safeParse(req.body || {});
  if (!parsed.success) return zodError(res, parsed.error);
  const data = parsed.data;

  // Ensure uppercase code uniqueness
  const code = String(data.employeeCode).toUpperCase();
  const exists = await Staff.exists({ employeeCode: code });
  if (exists) return httpError(res, 409, 'employeeCode already exists');

  const doc = await Staff.create({ ...data, employeeCode: code });
  const clean = redactStaffForRole(doc, req);
  res.status(201).json({ success: true, data: clean });
});

export default createStaff;
