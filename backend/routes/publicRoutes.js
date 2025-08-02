// backend/routes/publicRoutes.js
import express from 'express';
import { trackShipment } from '../controllers/publicController.js';

const router = express.Router();

router.get('/track/:trackingId', trackShipment);

export default router;
