// backend/routes/shipmentRoutes.js
import express from 'express';
import { z } from 'zod';
import {
  createShipment,
  updateShipmentStatus,
  assignAgent,
  getShipmentByIdForUser,
  getMyShipments,
  cancelShipment,
  updateShipmentLocation,
  uploadShipmentFiles,
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

const router = express.Router();

/** Generic Zod validator middleware (Express v5 safe) */
const validate = (schema) => (req, res, next) => {
  if (!schema) return next();

  // For GET validate query only; for others validate merged body+params
  const input = req.method === 'GET'
    ? req.query
    : { ...req.body, ...req.params };

  const parsed = schema.safeParse(input);

  if (parsed.success) {
    if (req.method === 'GET') {
      // Express v5: mutate req.query in place (no reassignment)
      const q = parsed.data || {};
      for (const k of Object.keys(req.query)) delete req.query[k];
      Object.assign(req.query, q);
    } else {
      // For body, assignment is fine; params stay as-is
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

/** Role gate: AGENT or ADMIN only (DB stores roles lowercase) */
const requireAgentOrAdmin = (req, res, next) => {
  const role = String(req.user?.role || '').toLowerCase();
  if (role === 'admin' || role === 'agent') return next();
  return res.status(403).json({ success: false, message: 'Forbidden' });
};

/** Map :id param to pushLocationBody.shipmentId so we can reuse the validator */
const mapParamIdToShipmentId = (req, _res, next) => {
  if (req.params?.id && !req.body?.shipmentId) {
    req.body = { ...(req.body || {}), shipmentId: req.params.id };
  }
  next();
};

// ─────────────────────────────────────────────────────────────
// Create & list mine (specific before :id routes)
// ─────────────────────────────────────────────────────────────

router.post(
  '/',
  protect,
  validate(createShipmentBody),
  createShipment
);

router.get(
  '/mine',
  protect,
  validate(listShipmentsQuery),
  getMyShipments
);

// ─────────────────────────────────────────────────────────────
// Reprice (specific paths before generic :id routes)
// ─────────────────────────────────────────────────────────────

router.get(
  '/:id/reprice/preview',
  protect,
  requireAgentOrAdmin,
  previewRepriceShipment // (optional) add query validator later if needed
);

router.patch(
  '/:id/reprice',
  protect,
  requireAgentOrAdmin,
  validate(adminRepriceSchema),
  repriceShipment
);

// ─────────────────────────────────────────────────────────────
// Status, assign, location, cancel
// ─────────────────────────────────────────────────────────────

router.patch(
  '/:id/status',
  protect,
  requireAgentOrAdmin,
  validate(updateStatusBody),
  updateShipmentStatus
);

router.patch(
  '/:id/assign-agent',
  protect,
  requireAgentOrAdmin,
  validate(assignAgentBody),
  assignAgent
);

router.patch(
  '/:id/location',
  protect,
  requireAgentOrAdmin,
  mapParamIdToShipmentId,
  validate(pushLocationBody),
  updateShipmentLocation
);

router.patch(
  '/:id/cancel',
  protect,
  validate(cancelShipmentBody), // controller enforces owner/admin
  cancelShipment
);

// Files (multer/validation handled in controller)
router.post(
  '/:id/files',
  protect,
  uploadShipmentFiles
);

// ─────────────────────────────────────────────────────────────
// Get by id (keep last so it doesn't shadow above routes)
// ─────────────────────────────────────────────────────────────

router.get(
  '/:id',
  protect,
  getShipmentByIdForUser
);

export default router;
