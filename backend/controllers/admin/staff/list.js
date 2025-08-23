// backend/controllers/admin/staff/list.js
import Staff from '../../../models/staff.js';
import { listStaffQuery } from '../../../validators/staffSchemas.js';
import { withHandler, requireAdmin, escapeRegExp, redactStaffForRole, zodError } from '../_shared.js';

export const listStaff = withHandler(async (req, res) => {
  if (!requireAdmin(req, res)) return;

  const parsed = listStaffQuery.safeParse(req.query || {});
  if (!parsed.success) return zodError(res, parsed.error);
  const { page = 1, limit = 20, role, status, q } = parsed.data || {};

  const filter = {};
  if (role) filter.role = role;
  if (status) filter.status = status;

  if (q) {
    const rx = new RegExp(escapeRegExp(q), 'i');
    filter.$or = [
      { fullName: rx },
      { phone: rx },
      { email: rx },
      { employeeCode: rx },
    ];
  }

  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    Staff.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean().exec(),
    Staff.countDocuments(filter),
  ]);

  const data = items.map((it) => redactStaffForRole(it, req));
  res.json({ success: true, data, page, limit, total, pages: Math.ceil(total / limit) });
});

export default listStaff;
