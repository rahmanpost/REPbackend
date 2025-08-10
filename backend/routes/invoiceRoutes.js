// backend/routes/invoiceRoutes.js
import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { validate } from '../middleware/validate.js';
import {
  generateInvoice,
  downloadInvoice,
  emailInvoice,
} from '../controllers/invoiceController.js';
import {
  invoiceIdParams,
  generateInvoiceQuery,
  emailInvoiceBody,
} from '../validators/invoiceSchemas.js';

const router = express.Router();

router.get(
  '/:id/generate',
  protect,
  validate(invoiceIdParams, 'params'),
  validate(generateInvoiceQuery, 'query'),
  generateInvoice
);

router.get(
  '/:id/download',
  protect,
  validate(invoiceIdParams, 'params'),
  downloadInvoice
);

router.post(
  '/:id/email',
  protect,
  validate(invoiceIdParams, 'params'),
  validate(emailInvoiceBody, 'body'),
  emailInvoice
);

router.get('/:id/download', protect, downloadInvoice);


export default router;
