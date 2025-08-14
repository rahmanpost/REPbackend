// backend/routes/paymentRoutes.js
import express from 'express';
import { protect, requireRoles } from '../middleware/authMiddleware.js';
import {
  listPayments,
  addPayment,
  voidPayment,
  settleBalance,
  changePaymentMethod,
} from '../controllers/paymentController.js';

const router = express.Router();

/**
 * All payment endpoints require authentication.
 * Role/ownership checks are also enforced in the controller.
 */
router.use(protect);

// List all ledger entries for a shipment (owner, admin/super_admin, assigned agent)
router.get('/shipments/:id/payments', listPayments);

// Add a payment (admin/super_admin or assigned agent; owner allowed for ONLINE)
router.post('/shipments/:id/payments', addPayment);

// Void a payment (route-level hard gate + controller check)
router.patch(
  '/shipments/:id/payments/:pid/void',
  requireRoles('admin', 'super_admin'), // your middleware lower-cases roles
  voidPayment
);

// Settle remaining balance (same rules as add)
router.patch('/shipments/:id/payment/settle', settleBalance);

// Change preferred payment mode/method (owner or admin/super_admin; controller enforces)
router.patch('/shipments/:id/payment-method', changePaymentMethod);

export default router;
