import express from 'express';
import { protect } from '../../middleware/authMiddleware.js';

import createStaff from '../../controllers/admin/staff/create.js';
import listStaff from '../../controllers/admin/staff/list.js';
import getStaff from '../../controllers/admin/staff/getOne.js';
import updateStaff from '../../controllers/admin/staff/update.js';
import terminateStaff from '../../controllers/admin/staff/terminate.js';

const router = express.Router();
router.use(protect);

// POST /api/admin/staff
router.post('/', createStaff);

// GET /api/admin/staff
router.get('/', listStaff);

// GET /api/admin/staff/:id
router.get('/:id', getStaff);

// PATCH /api/admin/staff/:id
router.patch('/:id', updateStaff);

// POST /api/admin/staff/:id/terminate
router.post('/:id/terminate', terminateStaff);

export default router;
