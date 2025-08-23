import express from 'express';
import { protect } from '../../middleware/authMiddleware.js';

import createPayroll from '../../controllers/admin/payroll/create.js';
import listPayroll from '../../controllers/admin/payroll/list.js';
import getPayroll from '../../controllers/admin/payroll/getOne.js';
import updatePayroll from '../../controllers/admin/payroll/update.js';
import approvePayroll from '../../controllers/admin/payroll/approve.js';

const router = express.Router();
router.use(protect);

// POST /api/admin/payroll
router.post('/', createPayroll);

// GET /api/admin/payroll
router.get('/', listPayroll);

// GET /api/admin/payroll/:id
router.get('/:id', getPayroll);

// PATCH /api/admin/payroll/:id
router.patch('/:id', updatePayroll);

// POST /api/admin/payroll/:id/approve
router.post('/:id/approve', approvePayroll);

export default router;
