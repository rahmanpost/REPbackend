import express from "express";
import { registerUser, loginUser } from "../controllers/userController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";

const router = express.Router();
router.get('/api/profile', authMiddleware, (req, res) => {
  res.json({ message: 'Access granted', user: req.user });
});

router.post("/login", loginUser);
router.post("/register", registerUser);

export default router;
