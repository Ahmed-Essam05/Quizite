import bcrypt from "bcryptjs";

import Quiz from "../model/quizModel.js";
import QuizAttempt from "../model/quizAttemptModel.js";
import User from "../model/userModel.js";
import AppError from "../utils/appError.js";
import catchAsync from "../utils/catchAsync.js";
import { sendToken, validatePassword } from "./authController.js";

const countQuestions = (pages = []) =>
  pages.reduce((total, page) => total + (page.questions || []).length, 0);

export const getMe = catchAsync(async (req, res) => {
  const userId = req.user._id;

  const [
    quizCount,
    publishedCount,
    attemptCount,
    likedCount,
  ] = await Promise.all([
    Quiz.countDocuments({ owner: userId }),
    Quiz.countDocuments({ owner: userId, status: "published" }),
    QuizAttempt.countDocuments({ user: userId }),
    Quiz.countDocuments({ likes: userId }),
  ]);

  return res.status(200).json({
    status: "success",
    data: {
      user: {
        id: req.user._id,
        username: req.user.username,
        email: req.user.email,
        role: req.user.role,
        memberSince: req.user.createdAt,
      },
      stats: {
        quizCount,
        publishedCount,
        takenCount: (req.user.completedQuizzes || []).length,
        attemptCount,
        likedCount,
      },
    },
  });
});

export const getCompletedQuizzes = catchAsync(async (req, res) => {
  const user = await User.findById(req.user._id).populate({
    path: "completedQuizzes",
    select: "title description status pages updatedAt",
  });

  const quizzes = (user.completedQuizzes || []).filter(Boolean);

  const attemptStats = await QuizAttempt.aggregate([
    { $match: { user: user._id } },
    { $sort: { completedAt: -1 } },
    {
      $group: {
        _id: "$quiz",
        attempts: { $sum: 1 },
        lastCompletedAt: { $first: "$completedAt" },
        lastPercentage: { $first: "$percentage" },
      },
    },
  ]);

  const statsByQuiz = new Map(
    attemptStats.map((stat) => [String(stat._id), stat]),
  );

  const completed = quizzes
    .map((quiz) => {
      const stats = statsByQuiz.get(String(quiz._id)) || {};
      return {
        id: quiz._id,
        title: quiz.title,
        description: quiz.description || "",
        status: quiz.status,
        questionCount: countQuestions(quiz.pages),
        attempts: stats.attempts || 0,
        lastPercentage: stats.lastPercentage ?? null,
        lastCompletedAt: stats.lastCompletedAt || null,
      };
    })
    .sort((a, b) => {
      const dateA = a.lastCompletedAt ? new Date(a.lastCompletedAt) : 0;
      const dateB = b.lastCompletedAt ? new Date(b.lastCompletedAt) : 0;
      return dateB - dateA;
    });

  return res.status(200).json({
    status: "success",
    results: completed.length,
    data: {
      quizzes: completed,
    },
  });
});

export const changePassword = catchAsync(async (req, res, next) => {
  const { currentPassword, newPassword } = req.body;

  if (typeof currentPassword !== "string" || !currentPassword) {
    return next(new AppError("Provide your current password", 400));
  }

  const passwordError = validatePassword(newPassword);
  if (passwordError) {
    return next(new AppError(passwordError, 400));
  }

  const user = await User.findById(req.user._id).select("+passwordHash");

  if (!user) {
    return next(new AppError("No account found for this session", 401));
  }

  const passwordIsCorrect = await bcrypt.compare(
    currentPassword,
    user.passwordHash,
  );

  if (!passwordIsCorrect) {
    return next(new AppError("Your current password is incorrect", 401));
  }

  user.passwordHash = await bcrypt.hash(newPassword, 12);
  user.passwordChangedAt = new Date();
  await user.save();

  // Re-issue the session token so the current browser stays logged in while
  // other sessions are invalidated by passwordChangedAt.
  return sendToken(user, 200, res);
});
