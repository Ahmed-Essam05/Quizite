import Quiz from "../model/quizModel.js";
import catchAsync from "../utils/catchAsync.js";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

const parsePositiveInteger = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return parsed;
};

export const getOverview = catchAsync(async (req, res) => {
  const page = parsePositiveInteger(req.query.page, 1);
  const limit = Math.min(
    parsePositiveInteger(req.query.limit, DEFAULT_LIMIT),
    MAX_LIMIT,
  );

  const filter = { owner: req.user._id };
  const likedFilter = {
    likes: req.user._id,
    $or: [{ status: "published" }, { owner: req.user._id }],
  };
  if (req.user.role === "admin") {
    delete likedFilter.$or;
  }

  const [total, quizzes, likedQuizCount] = await Promise.all([
    Quiz.countDocuments(filter),
    Quiz.find(filter)
      .select(
        "title description status pages likeCount likes allowRetakes shareCode updatedAt",
      )
      .sort({ updatedAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Quiz.countDocuments(likedFilter),
  ]);

  const completedQuizIds = new Set(
    (req.user.completedQuizzes || []).map(String),
  );
  const quizSummaries = quizzes.map((quiz) => ({
    id: quiz._id,
    title: quiz.title,
    description: quiz.description || "",
    status: quiz.status,
    questionCount: (quiz.pages || []).reduce(
      (total, pageItem) => total + (pageItem.questions || []).length,
      0,
    ),
    likeCount: quiz.likeCount || 0,
    likedByMe: (quiz.likes || []).some((userId) => userId.equals(req.user._id)),
    allowRetakes: Boolean(quiz.allowRetakes),
    completedByMe: completedQuizIds.has(String(quiz._id)),
    updatedAt: quiz.updatedAt,
    shareUrl: `/quiz/${quiz._id}`,
    shareCode: quiz.shareCode,
  }));

  const totalPages = Math.max(Math.ceil(total / limit), 1);

  return res.status(200).json({
    status: "success",
    data: {
      user: {
        id: req.user._id,
        username: req.user.username,
      },
      quizzes: quizSummaries,
      likedQuizCount,
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
