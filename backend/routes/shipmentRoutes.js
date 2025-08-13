// backend/routes/shipmentRoutes.js
import express from 'express';
import {
  createShipment,
  updateShipmentStatus,
  assignAgent,
  getShipmentByIdForUser,
  getMyShipments,
  cancelShipment,
  updateShipmentLocation,
  previewRepriceShipment,
  repriceShipment,
} from '../controllers/shipments/index.js';
import { protect } from '../middleware/authMiddleware.js';
import {
  createShipmentBody,
  updateStatusBody,
  assignAgentBody,
  pushLocationBody,
  cancelShipmentBody,
  listShipmentsQuery,
  adminRepriceSchema,
} from '../validators/shipmentSchemas.js';
import { uploadShipmentFiles } from '../controllers/shipments/uploadFiles.js';
import { shipmentFilesFields } from '../middleware/uploadMiddleware.js';

const router = express.Router();

/** Generic Zod validator middleware (Express v5 safe) */
const validate = (schema) => (req, res, next) => {
  if (!schema) return next();

  const input = req.method === 'GET' ? req.query : { ...req.body, ...req.params };
  const parsed = schema.safeParse(input);

  if (parsed.success) {
    if (req.method === 'GET') {
      const q = parsed.data || {};
      for (const k of Object.keys(req.query)) delete req.query[k];
      Object.assign(req.query, q);
    } else {
      req.body = parsed.data;
    }
    return next();
  }

  return res.status(400).json({
    success: false,
    message: 'Validation failed',
    errors: parsed.error.issues.map((i) => ({
      path: Array.isArray(i.path) ? i.path.join('.') : String(i.path),
      message: i.message,
      code: i.code,
    })),
  });
};

/** Role gate: AGENT or ADMIN only */
const requireAgentOrAdmin = (req, res, next) => {
  const role = String(req.user?.role || '').toLowerCase();
  if (role === 'admin' || role === 'agent') return next();
  return res.status(403).json({ success: false, message: 'Forbidden' });
};

/** Map :id → body.shipmentId for location validator reuse */
const mapParamIdToShipmentId = (req, _res, next) => {
  if (req.params?.id && !req.body?.shipmentId) {
    req.body = { ...(req.body || {}), shipmentId: req.params.id };
  }
  next();
};

// ── Create & list mine ───────────────────────────────────────
router.post('/', protect, validate(createShipmentBody), createShipment);
router.get('/mine', protect, validate(listShipmentsQuery), getMyShipments);

// ── Reprice ─────────────────────────────────────────────────
router.get('/:id/reprice/preview', protect, requireAgentOrAdmin, previewRepriceShipment);
router.patch('/:id/reprice', protect, requireAgentOrAdmin, validate(adminRepriceSchema), repriceShipment);

// ── Status, assign, location, cancel ────────────────────────
router.patch('/:id/status', protect, requireAgentOrAdmin, validate(updateStatusBody), updateShipmentStatus);
router.patch('/:id/assign-agent', protect, requireAgentOrAdmin, validate(assignAgentBody), assignAgent);
router.patch('/:id/location', protect, requireAgentOrAdmin, mapParamIdToShipmentId, validate(pushLocationBody), updateShipmentLocation);
router.patch('/:id/cancel', protect, validate(cancelShipmentBody), cancelShipment);

// ── Files upload (accept PATCH and POST) ─────────────────────
const filesMiddleware = [
  protect,
  requireAgentOrAdmin,
  shipmentFilesFields,  // parses beforePhoto/afterPhoto/receipt
  uploadShipmentFiles,  // controller reads req.files
];
router.patch('/:id/files', ...filesMiddleware);
router.post('/:id/files',  ...filesMiddleware);

// ── Get by id (last) ────────────────────────────────────────
router.get('/:id', protect, getShipmentByIdForUser);

export default router;
