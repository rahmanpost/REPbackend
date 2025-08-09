// backend/routes/uploadRoutes.js
import express from 'express';
import upload from '../middleware/uploadMiddleware.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

// Example upload endpoint (adjust path/field names to your needs)
router.post('/upload/photo', protect, upload.single('photo'), (req, res) => {
  // If you serve static files from /uploads, this path is fine; otherwise return req.file.path
  res.json({ success: true, filePath: `/uploads/${req.file.filename}` });
});

export default router;
