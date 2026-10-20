import express from "express";

import { optionalAuth, protect } from "../controllers/authController.js";
import {
  createQuiz,
  deleteQuiz,
  getQuiz,
  getQuizByShareCode,
  likeQuiz,
  submitQuiz,
  unlikeQuiz,
  updateQuiz,
} from "../controllers/quizController.js";

const router = express.Router();

router.post("/", protect, createQuiz);
router.get("/code/:code", optionalAuth, getQuizByShareCode);
router.get("/:id", optionalAuth, getQuiz);
router.patch("/:id", protect, updateQuiz);
router.delete("/:id", protect, deleteQuiz);
router.post("/:id/submit", optionalAuth, submitQuiz);
router.post("/:id/like", protect, likeQuiz);
router.delete("/:id/like", protect, unlikeQuiz);

export default router;

