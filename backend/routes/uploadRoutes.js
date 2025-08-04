import express from 'express';
import upload from '../middleware/uploadMiddleware.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

// Example: Upload user photo
router.post('/upload/photo', protect, upload.single('photo'), (req, res) => {
  res.json({ filePath: `/uploads/${req.file.filename}` });
});

export default router;
