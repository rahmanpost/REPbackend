import express from 'express';
import { protect } from '../../middleware/authMiddleware.js';

import createExpense from '../../controllers/admin/expenses/create.js';
import listExpenses from '../../controllers/admin/expenses/list.js';
import getExpense from '../../controllers/admin/expenses/getOne.js';
import updateExpense from '../../controllers/admin/expenses/update.js';
import approveExpense from '../../controllers/admin/expenses/approve.js';
import payExpense from '../../controllers/admin/expenses/pay.js';
import removeExpense from '../../controllers/admin/expenses/remove.js';

const router = express.Router();
router.use(protect);

// POST /api/admin/expenses
router.post('/', createExpense);

// GET /api/admin/expenses
router.get('/', listExpenses);

// GET /api/admin/expenses/:id
router.get('/:id', getExpense);

// PATCH /api/admin/expenses/:id
router.patch('/:id', updateExpense);

// POST /api/admin/expenses/:id/approve
router.post('/:id/approve', approveExpense);

// POST /api/admin/expenses/:id/pay
router.post('/:id/pay', payExpense);

// DELETE /api/admin/expenses/:id
router.delete('/:id', removeExpense);

export default router;
