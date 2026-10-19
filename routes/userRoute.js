import express from "express";

import { protect } from "../controllers/authController.js";
import {
  changePassword,
  getCompletedQuizzes,
  getLikedQuizzes,
  getMe,
} from "../controllers/userController.js";

const router = express.Router();

router.use(protect);

router.get("/me", getMe);
router.get("/me/completed", getCompletedQuizzes);
router.get("/me/liked", getLikedQuizzes);
router.patch("/me/password", changePassword);

export default router;
