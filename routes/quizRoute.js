import express from "express";
import multer from "multer";

import { optionalAuth, protect } from "../controllers/authController.js";
import {
  createQuiz,
  deleteQuiz,
  getQuiz,
  getQuizByShareCode,
  getQuizLikers,
  likeQuiz,
  submitQuiz,
  unlikeQuiz,
  updateQuiz,
  uploadQuizIcon,
} from "../controllers/quizController.js";
import AppError from "../utils/appError.js";
import { MAX_QUIZ_ICON_BYTES } from "../utils/quizIcon.js";

const router = express.Router();

const iconUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_QUIZ_ICON_BYTES, files: 1 },
}).single("image");

const handleIconUpload = (req, res, next) => {
  iconUpload(req, res, (error) => {
    if (!error) {
      next();
      return;
    }

    if (
      error instanceof multer.MulterError &&
      error.code === "LIMIT_FILE_SIZE"
    ) {
      next(new AppError("Icon images must be 2 MB or smaller", 400));
      return;
    }

    next(new AppError("Could not read the uploaded icon", 400));
  });
};

router.post("/", protect, createQuiz);
router.post("/icon", protect, handleIconUpload, uploadQuizIcon);
router.get("/code/:code", optionalAuth, getQuizByShareCode);
router.get("/:id/likes", protect, getQuizLikers);
router.get("/:id", protect, getQuiz);
router.patch("/:id", protect, updateQuiz);
router.delete("/:id", protect, deleteQuiz);
router.post("/:id/submit", protect, submitQuiz);
router.post("/:id/like", protect, likeQuiz);
router.delete("/:id/like", protect, unlikeQuiz);

export default router;
