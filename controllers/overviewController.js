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

  const [total, quizzes] = await Promise.all([
    Quiz.countDocuments(filter),
    Quiz.find(filter)
      .select("title description status pages updatedAt")
      .sort({ updatedAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
  ]);

  const quizSummaries = quizzes.map((quiz) => ({
    id: quiz._id,
    title: quiz.title,
    description: quiz.description || "",
    status: quiz.status,
    questionCount: (quiz.pages || []).reduce(
      (total, pageItem) => total + (pageItem.questions || []).length,
      0,
    ),
    updatedAt: quiz.updatedAt,
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
