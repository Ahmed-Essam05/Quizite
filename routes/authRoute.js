import express from "express";
import rateLimit from "express-rate-limit";

import {
  login,
  logout,
  resetPassword,
  signup,
  updatePassword,
} from "../controllers/authController.js";

const router = express.Router();

router.get("/logout", logout);

const credentialLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: "Too many authentication attempts. Please try again in 15 minutes.",
  skip: () => process.env.NODE_ENV === "test",
});

router.post("/signup", credentialLimiter, signup);
router.post("/login", credentialLimiter, login);
router.post("/reset-password", credentialLimiter, resetPassword);
router.post("/update-password", credentialLimiter, updatePassword);

export default router;
