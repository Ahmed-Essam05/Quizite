import bcrypt from "bcryptjs";

import Quiz from "../model/quizModel.js";
import QuizAttempt from "../model/quizAttemptModel.js";
import User from "../model/userModel.js";
import AppError from "../utils/appError.js";
import catchAsync from "../utils/catchAsync.js";
import { sendToken, validatePassword } from "./authController.js";

const countQuestions = (pages = []) =>
  pages.reduce((total, page) => total + (page.questions || []).length, 0);

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

const parsePositiveInteger = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return parsed;
};

// Likes are stored only on the quiz document, so a deleted quiz automatically
// disappears from every user's liked list. Drafts owned by other users must
// never leak through this query; admins retain their existing draft access.
const buildVisibleLikedFilter = (user) => {
  const filter = { likes: user._id };
  if (user.role !== "admin") {
    filter.$or = [{ status: "published" }, { owner: user._id }];
  }
  return filter;
};

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
    Quiz.countDocuments(buildVisibleLikedFilter(req.user)),
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
    select:
      "title description status pages likeCount likes allowRetakes updatedAt",
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
        likeCount: quiz.likeCount || 0,
        likedByMe: (quiz.likes || []).some((userId) =>
          userId.equals(req.user._id),
        ),
        allowRetakes: Boolean(quiz.allowRetakes),
        completedByMe: true,
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

export const getLikedQuizzes = catchAsync(async (req, res) => {
  const page = parsePositiveInteger(req.query.page, 1);
  const limit = Math.min(
    parsePositiveInteger(req.query.limit, DEFAULT_LIMIT),
    MAX_LIMIT,
  );
  const filter = buildVisibleLikedFilter(req.user);

  const [total, quizzes] = await Promise.all([
    Quiz.countDocuments(filter),
    Quiz.find(filter)
      .select(
        "title description status pages likeCount owner allowRetakes updatedAt",
      )
      .populate("owner", "username")
      .sort({ updatedAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
  ]);

  const completedQuizIds = new Set(
    (req.user.completedQuizzes || []).map(String),
  );
  const likedQuizzes = quizzes.map((quiz) => ({
    id: quiz._id,
    title: quiz.title,
    description: quiz.description || "",
    status: quiz.status,
    questionCount: countQuestions(quiz.pages),
    likeCount: quiz.likeCount || 0,
    likedByMe: true,
    allowRetakes: Boolean(quiz.allowRetakes),
    completedByMe: completedQuizIds.has(String(quiz._id)),
    owner: {
      username: quiz.owner?.username || "Anonymous",
    },
    updatedAt: quiz.updatedAt,
    shareUrl: `/quiz/${quiz._id}`,
  }));

  const totalPages = Math.max(Math.ceil(total / limit), 1);

  return res.status(200).json({
    status: "success",
    results: likedQuizzes.length,
    data: {
      quizzes: likedQuizzes,
    },
    meta: {
      page,
      limit,
      total,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
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
