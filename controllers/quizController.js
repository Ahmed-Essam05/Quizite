import mongoose from "mongoose";

import Quiz from "../model/quizModel.js";
import QuizAttempt from "../model/quizAttemptModel.js";
import User from "../model/userModel.js";
import AppError from "../utils/appError.js";
import catchAsync from "../utils/catchAsync.js";
import {
  isValidQuizCode,
  normalizeQuizCode,
  saveWithUniqueShareCode,
} from "../utils/quizCode.js";
import {
  countQuestions,
  parseQuizPayload,
} from "../utils/quizValidation.js";
import {
  deleteQuizIconFile,
  isUploadIconReference,
  quizIconFileExists,
  saveQuizIconImage,
  serializeQuizIcon,
} from "../utils/quizIcon.js";
import { getUniqueParticipantCount } from "../utils/participantStats.js";

const isValidIdString = (value) => {
  if (typeof value !== "string") return false;
  if (!mongoose.Types.ObjectId.isValid(value)) return false;
  try {
    return String(new mongoose.Types.ObjectId(value)) === value.toLowerCase();
  } catch {
    return false;
  }
};

const ensureQuizId = (req, next) => {
  if (!isValidIdString(req.params.id)) {
    next(new AppError("Invalid quiz ID", 400));
    return false;
  }
  return true;
};

const isOwnerOf = (quiz, user) => {
  if (!user || !quiz.owner) return false;
  const ownerId = quiz.owner._id || quiz.owner;
  if (typeof ownerId.equals === "function") return ownerId.equals(user._id);
  return String(ownerId) === String(user._id);
};

const isAdminUser = (user) => Boolean(user && user.role === "admin");

const buildQuestionDto = (question, includeAnswerKey) => {
  const dto = {
    id: question._id,
    type: question.type,
    title: question.title,
    required: question.required,
    choices: (question.choices || []).map((choice) => ({
      id: choice._id,
      text: choice.text,
    })),
  };

  if (includeAnswerKey) {
    if (question.type === "writtenAnswer") {
      if (Array.isArray(question.acceptedAnswers) && question.acceptedAnswers.length > 0) {
        dto.acceptedAnswers = question.acceptedAnswers;
      } else {
        dto.acceptedAnswers = question.correctText ? [question.correctText] : [];
      }
    } else {
      dto.correctChoiceId = question.correctChoiceId || null;
    }
  }

  return dto;
};

const buildQuizDto = (
  quiz,
  {
    includeAnswerKey = false,
    includeShareCode = false,
    peopleTookCount,
  } = {},
) => ({
  id: quiz._id,
  title: quiz.title,
  description: quiz.description,
  status: quiz.status,
  owner: {
    id: quiz.owner?._id || quiz.owner,
    username: quiz.owner?.username || "Anonymous",
  },
  questionCount: countQuestions(quiz.pages),
  icon: serializeQuizIcon(quiz.icon),
  peopleTookCount:
    typeof peopleTookCount === "number"
      ? peopleTookCount
      : quiz.peopleTookCount || 0,
  likeCount: quiz.likeCount || 0,
  allowRetakes: Boolean(quiz.allowRetakes),
  showCorrectAnswers: Boolean(quiz.showCorrectAnswers),
  publishedAt: quiz.publishedAt,
  shareUrl: `/quiz/${quiz._id}`,
  ...(includeShareCode ? { shareCode: quiz.shareCode } : {}),
  pages: (quiz.pages || []).map((page) => ({
    id: page._id,
    title: page.title,
    questions: (page.questions || []).map((question) =>
      buildQuestionDto(question, includeAnswerKey),
    ),
  })),
});

export const createQuiz = catchAsync(async (req, res, next) => {
  const payload = parseQuizPayload(req.body, {
    requireTitle: true,
    userId: req.user._id,
  });
  const pages = payload.pages || [];
  const status = payload.status || "draft";
  const totalQuestions = countQuestions(pages);

  if (status === "published" && totalQuestions === 0) {
    return next(
      new AppError("A published quiz must contain at least one question.", 400),
    );
  }

  if (
    isUploadIconReference(payload.icon) &&
    !(await quizIconFileExists(payload.icon))
  ) {
    return next(
      new AppError(
        "The uploaded quiz icon is no longer available. Please upload it again.",
        400,
      ),
    );
  }

  const quiz = new Quiz({
    title: payload.title,
    description: payload.description || "",
    icon: payload.icon ?? null,
    owner: req.user._id,
    status,
    pages,
    allowRetakes: payload.allowRetakes ?? false,
    showCorrectAnswers: payload.showCorrectAnswers ?? false,
    publishedAt: status === "published" ? new Date() : undefined,
  });

  await saveWithUniqueShareCode(quiz);

  // Atomically denormalize into user's ownedQuizzes
  await User.findByIdAndUpdate(req.user._id, {
    $addToSet: { ownedQuizzes: quiz._id },
  });

  return res.status(201).json({
    status: "success",
    data: {
      quiz: {
        id: quiz._id,
        title: quiz.title,
        description: quiz.description,
        status: quiz.status,
        questionCount: totalQuestions,
        icon: serializeQuizIcon(quiz.icon),
        allowRetakes: quiz.allowRetakes,
        showCorrectAnswers: quiz.showCorrectAnswers,
        publishedAt: quiz.publishedAt,
        shareUrl: `/quiz/${quiz._id}`,
        shareCode: quiz.shareCode,
      },
    },
  });
});

export const getQuiz = catchAsync(async (req, res, next) => {
  if (!ensureQuizId(req, next)) return undefined;

  const quiz = await Quiz.findById(req.params.id)
    .select(
      "+pages.questions.correctChoiceId +pages.questions.correctText +pages.questions.acceptedAnswers",
    )
    .populate("owner", "username")
    .lean();

  if (!quiz) {
    return next(new AppError("No quiz found with that ID", 404));
  }

  const isOwner = isOwnerOf(quiz, req.user);

  if (quiz.status === "draft" && !isOwner && !isAdminUser(req.user)) {
    return next(
      new AppError(
        "This quiz is currently a private draft and is not public yet.",
        403,
      ),
    );
  }

  const alreadyCompleted = Boolean(
    req.user &&
      (req.user.completedQuizzes || []).some((quizId) =>
        quizId.equals(quiz._id),
      ),
  );
  const peopleTookCount = await getUniqueParticipantCount(quiz._id);

  return res.status(200).json({
    status: "success",
    data: {
      quiz: buildQuizDto(quiz, {
        includeAnswerKey: isOwner,
        includeShareCode: isOwner,
        peopleTookCount,
      }),
      isOwner,
      likedByMe: Boolean(
        req.user && (quiz.likes || []).some((id) => id.equals(req.user._id)),
      ),
      canRetake: quiz.allowRetakes || !req.user || !alreadyCompleted,
    },
  });
});

export const getQuizLikers = catchAsync(async (req, res, next) => {
  if (!ensureQuizId(req, next)) return undefined;

  const quiz = await Quiz.findById(req.params.id)
    .select("title owner likes")
    .populate({ path: "likes", select: "username" })
    .lean();

  if (!quiz) {
    return next(new AppError("No quiz found with that ID", 404));
  }

  if (!isOwnerOf(quiz, req.user)) {
    return next(
      new AppError("You do not have permission to view this quiz's likes", 403),
    );
  }

  const seen = new Set();
  const likers = [];

  for (const liker of quiz.likes || []) {
    if (!liker?._id || !liker.username) continue;
    const id = String(liker._id);
    if (seen.has(id)) continue;
    seen.add(id);
    likers.push({
      id: liker._id,
      username: liker.username,
      profileUrl: `/users/${encodeURIComponent(liker.username)}`,
    });
  }

  likers.sort((first, second) =>
    first.username.localeCompare(second.username, "en", {
      sensitivity: "base",
    }),
  );

  return res.status(200).json({
    status: "success",
    data: {
      quiz: {
        id: quiz._id,
        title: quiz.title,
      },
      likeCount: likers.length,
      likers,
    },
  });
});

export const getQuizByShareCode = catchAsync(async (req, res, next) => {
  const shareCode = normalizeQuizCode(req.params.code);

  if (!isValidQuizCode(shareCode)) {
    return next(
      new AppError("Enter a valid 8-character quiz code.", 400),
    );
  }

  const quiz = await Quiz.findOne({ shareCode })
    .select("_id status owner")
    .lean();

  if (!quiz) {
    return next(new AppError("No quiz found with that code.", 404));
  }

  if (
    quiz.status === "draft" &&
    !isOwnerOf(quiz, req.user) &&
    !isAdminUser(req.user)
  ) {
    return next(
      new AppError(
        "This quiz is currently a private draft and is not public yet.",
        403,
      ),
    );
  }

  return res.status(200).json({
    status: "success",
    data: {
      quiz: {
        id: quiz._id,
        shareUrl: `/quiz/${quiz._id}`,
      },
    },
  });
});

export const uploadQuizIcon = catchAsync(async (req, res, next) => {
  if (!req.file) {
    return next(new AppError("Please choose an image to upload", 400));
  }

  const reference = await saveQuizIconImage(req.file.buffer, req.user._id);

  return res.status(201).json({
    status: "success",
    data: {
      icon: serializeQuizIcon(reference),
      reference,
    },
  });
});

export const updateQuiz = catchAsync(async (req, res, next) => {
  if (!ensureQuizId(req, next)) return undefined;

  const quiz = await Quiz.findById(req.params.id);

  if (!quiz) {
    return next(new AppError("No quiz found with that ID", 404));
  }

  if (!isOwnerOf(quiz, req.user)) {
    return next(
      new AppError("You do not have permission to edit this quiz", 403),
    );
  }

  const payload = parseQuizPayload(req.body, { userId: req.user._id });

  const recognizedFields = [
    "title",
    "description",
    "icon",
    "status",
    "pages",
    "allowRetakes",
    "showCorrectAnswers",
  ].filter((field) => payload[field] !== undefined);

  if (recognizedFields.length === 0) {
    return next(
      new AppError("No valid quiz fields were provided to update", 400),
    );
  }

  if (
    isUploadIconReference(payload.icon) &&
    !(await quizIconFileExists(payload.icon))
  ) {
    return next(
      new AppError(
        "The uploaded quiz icon is no longer available. Please upload it again.",
        400,
      ),
    );
  }

  const previousIcon = quiz.icon;

  if (payload.title !== undefined) {
    quiz.title = payload.title;
  }

  if (payload.description !== undefined) {
    quiz.description = payload.description;
  }

  if (payload.icon !== undefined) {
    quiz.icon = payload.icon;
  }

  if (payload.pages !== undefined) {
    quiz.pages = payload.pages;
  }

  if (payload.allowRetakes !== undefined) {
    quiz.allowRetakes = payload.allowRetakes;
  }

  if (payload.showCorrectAnswers !== undefined) {
    quiz.showCorrectAnswers = payload.showCorrectAnswers;
  }

  if (payload.status !== undefined) {
    const totalQuestions = countQuestions(quiz.pages);
    if (payload.status === "published" && totalQuestions === 0) {
      return next(
        new AppError(
          "A published quiz must contain at least one question.",
          400,
        ),
      );
    }

    quiz.status = payload.status;
    if (payload.status === "published" && !quiz.publishedAt) {
      quiz.publishedAt = new Date();
    }
  }

  await quiz.save();

  if (previousIcon !== quiz.icon) {
    const stillReferenced = isUploadIconReference(previousIcon)
      ? await Quiz.exists({ icon: previousIcon, _id: { $ne: quiz._id } })
      : false;

    if (!stillReferenced) {
      await deleteQuizIconFile(previousIcon);
    }
  }

  return res.status(200).json({
    status: "success",
    data: {
      quiz: {
        id: quiz._id,
        title: quiz.title,
        description: quiz.description,
        status: quiz.status,
        questionCount: countQuestions(quiz.pages),
        icon: serializeQuizIcon(quiz.icon),
        allowRetakes: quiz.allowRetakes,
        showCorrectAnswers: quiz.showCorrectAnswers,
        publishedAt: quiz.publishedAt,
        shareUrl: `/quiz/${quiz._id}`,
        shareCode: quiz.shareCode,
      },
    },
  });
});

export const deleteQuiz = catchAsync(async (req, res, next) => {
  if (!ensureQuizId(req, next)) return undefined;

  const quiz = await Quiz.findById(req.params.id);

  if (!quiz) {
    return next(new AppError("No quiz found with that ID", 404));
  }

  if (!isOwnerOf(quiz, req.user)) {
    return next(
      new AppError("You do not have permission to delete this quiz", 403),
    );
  }

  await Quiz.findByIdAndDelete(req.params.id);

  await Promise.all([
    User.findByIdAndUpdate(req.user._id, {
      $pull: { ownedQuizzes: req.params.id },
    }),
    User.updateMany(
      { completedQuizzes: quiz._id },
      { $pull: { completedQuizzes: quiz._id } },
    ),
    QuizAttempt.deleteMany({ quiz: quiz._id }),
  ]);

  if (isUploadIconReference(quiz.icon)) {
    const stillReferenced = await Quiz.exists({ icon: quiz.icon });
    if (!stillReferenced) {
      await deleteQuizIconFile(quiz.icon);
    }
  }

  return res.status(204).json({
    status: "success",
    data: null,
  });
});

const normalizeAnswerText = (value) =>
  String(value ?? "")
    .trim()
    .toLowerCase();

const parseSubmittedAnswers = (rawAnswers) => {
  if (!Array.isArray(rawAnswers)) {
    throw new AppError("Answers must be provided as an array", 400);
  }

  const parsed = [];

  for (const rawAnswer of rawAnswers) {
    if (
      rawAnswer === null ||
      typeof rawAnswer !== "object" ||
      Array.isArray(rawAnswer)
    ) {
      throw new AppError("Each submitted answer must be an object", 400);
    }

    const questionId = isValidIdString(rawAnswer.questionId)
      ? String(rawAnswer.questionId)
      : null;

    if (!questionId) {
      throw new AppError(
        "Each submitted answer needs a valid questionId",
        400,
      );
    }

    let choiceId = null;
    if (
      rawAnswer.choiceId !== undefined &&
      rawAnswer.choiceId !== null &&
      rawAnswer.choiceId !== ""
    ) {
      if (!isValidIdString(rawAnswer.choiceId)) {
        throw new AppError("A submitted choiceId is invalid", 400);
      }
      choiceId = String(rawAnswer.choiceId);
    }

    let writtenText = null;
    if (rawAnswer.writtenText !== undefined && rawAnswer.writtenText !== null) {
      if (typeof rawAnswer.writtenText !== "string") {
        throw new AppError("A submitted writtenText must be text", 400);
      }
      const trimmed = rawAnswer.writtenText.trim();
      if (trimmed.length > 2000) {
        throw new AppError(
          "A submitted written answer cannot exceed 2000 characters",
          400,
        );
      }
      writtenText = trimmed || null;
    }

    parsed.push({ questionId, choiceId, writtenText });
  }

  return parsed;
};

const gradeQuestion = (question, submittedAnswer) => {
  const isWritten = question.type === "writtenAnswer";

  if (isWritten) {
    const userText = submittedAnswer?.writtenText || "";
    const acceptedAnswers = (() => {
      if (Array.isArray(question.acceptedAnswers)) {
        return question.acceptedAnswers
          .filter((answer) => typeof answer === "string" && answer.trim())
          .map((answer) => answer.trim());
      }
      return typeof question.correctText === "string" && question.correctText.trim()
        ? [question.correctText.trim()]
        : [];
    })();

    const graded = acceptedAnswers.length > 0;
    const isCorrect =
      graded &&
      acceptedAnswers.some(
        (accepted) =>
          normalizeAnswerText(accepted) === normalizeAnswerText(userText),
      );

    return {
      graded,
      isCorrect,
      userAnswer: userText || "No answer",
      correctAnswer: graded ? acceptedAnswers[0] : null,
    };
  }

  const selectedChoiceId = submittedAnswer?.choiceId
    ? String(submittedAnswer.choiceId)
    : null;
  const selectedChoice = (question.choices || []).find(
    (choice) => String(choice._id) === selectedChoiceId,
  );
  const correctChoice = (question.choices || []).find((choice) =>
    question.correctChoiceId
      ? choice._id.equals(question.correctChoiceId)
      : false,
  );

  const graded = Boolean(question.correctChoiceId);
  const isCorrect = Boolean(
    graded &&
      selectedChoiceId &&
      question.correctChoiceId.equals(selectedChoiceId),
  );

  return {
    graded,
    isCorrect,
    userAnswer: selectedChoice ? selectedChoice.text : "No answer",
    correctAnswer: correctChoice ? correctChoice.text : null,
  };
};

export const submitQuiz = catchAsync(async (req, res, next) => {
  if (!ensureQuizId(req, next)) return undefined;

  const quiz = await Quiz.findById(req.params.id).select(
    "+pages.questions.correctChoiceId +pages.questions.correctText +pages.questions.acceptedAnswers",
  );

  if (!quiz) {
    return next(new AppError("No quiz found with that ID", 404));
  }

  const isOwner = isOwnerOf(quiz, req.user);

  if (quiz.status === "draft" && !isOwner && !isAdminUser(req.user)) {
    return next(
      new AppError(
        "This quiz is currently a private draft and cannot be taken.",
        403,
      ),
    );
  }

  if (req.user && !quiz.allowRetakes) {
    const existingAttempt = await QuizAttempt.exists({
      quiz: quiz._id,
      user: req.user._id,
    });
    if (existingAttempt) {
      return next(
        new AppError(
          "You have already completed this quiz and retakes are not allowed.",
          403,
        ),
      );
    }
  }

  let submittedAnswers;
  try {
    submittedAnswers = parseSubmittedAnswers(req.body?.answers);
  } catch (error) {
    return next(error);
  }

  const answerMap = new Map();
  for (const answer of submittedAnswers) {
    answerMap.set(answer.questionId, answer);
  }

  let totalQuestions = 0;
  let gradedQuestions = 0;
  let correctCount = 0;
  const questionResults = [];
  const recordedAnswers = [];

  for (const page of quiz.pages || []) {
    for (const question of page.questions || []) {
      totalQuestions += 1;
      const answer = answerMap.get(String(question._id));
      const grade = gradeQuestion(question, answer);

      if (grade.graded) {
        gradedQuestions += 1;
        if (grade.isCorrect) correctCount += 1;
      }

      questionResults.push({
        questionId: question._id,
        title: question.title,
        type: question.type,
        graded: grade.graded,
        isCorrect: grade.isCorrect,
        userAnswer: grade.userAnswer,
        ...(quiz.showCorrectAnswers && grade.graded
          ? { correctAnswer: grade.correctAnswer }
          : {}),
      });

      if (answer) {
        recordedAnswers.push({
          questionId: question._id,
          choiceId: answer.choiceId || null,
          writtenText: answer.writtenText || null,
        });
      }
    }
  }

  const percentage =
    gradedQuestions > 0
      ? Math.round((correctCount / gradedQuestions) * 100)
      : 0;

  let countedForParticipants = false;
  let completedAt = null;

  if (req.user) {
    completedAt = new Date();

    try {
      await QuizAttempt.create({
        quiz: quiz._id,
        user: req.user._id,
        answers: recordedAnswers,
        score: correctCount,
        totalQuestions,
        gradedQuestions,
        percentage,
        completedAt,
      });
    } catch (error) {
      return next(new AppError("Unable to record this quiz attempt", 500));
    }

    const completionResult = await User.findOneAndUpdate(
      {
        _id: req.user._id,
        completedQuizzes: { $ne: quiz._id },
      },
      { $addToSet: { completedQuizzes: quiz._id } },
      { new: true },
    );
    countedForParticipants = Boolean(completionResult);

    if (countedForParticipants) {
      // Atomic counter update so concurrent submissions cannot double count.
      await Quiz.updateOne(
        { _id: quiz._id },
        { $inc: { peopleTookCount: 1 } },
      );
    }
  }

  const peopleTookCount = await getUniqueParticipantCount(quiz._id);

  return res.status(200).json({
    status: "success",
    data: {
      score: correctCount,
      totalQuestions,
      gradedQuestions,
      percentage,
      allowRetakes: Boolean(quiz.allowRetakes),
      showCorrectAnswers: Boolean(quiz.showCorrectAnswers),
      countedForParticipants,
      completedAt,
      peopleTookCount,
      results: questionResults,
    },
  });
});

// The likes array is the source of truth. If a legacy document has drifted,
// repair the denormalized counter without overwriting a newer concurrent update.
const resolveLikeCount = async (quiz) => {
  const likes = quiz.likes || [];
  const likeCount = likes.length;

  if ((quiz.likeCount || 0) !== likeCount) {
    await Quiz.updateOne(
      { _id: quiz._id, likes: { $size: likeCount } },
      { $set: { likeCount } },
    );
  }

  return likeCount;
};

export const likeQuiz = catchAsync(async (req, res, next) => {
  if (!ensureQuizId(req, next)) return undefined;

  const quiz = await Quiz.findOneAndUpdate(
    {
      _id: req.params.id,
      status: "published",
      likes: { $ne: req.user._id },
    },
    {
      $addToSet: { likes: req.user._id },
      $inc: { likeCount: 1 },
    },
    { new: true, select: "likes likeCount" },
  );

  if (quiz) {
    return res.status(200).json({
      status: "success",
      data: { likeCount: await resolveLikeCount(quiz), liked: true },
    });
  }

  const existing = await Quiz.findById(req.params.id).select(
    "status likes likeCount",
  );

  if (!existing) {
    return next(new AppError("No quiz found with that ID", 404));
  }

  if (existing.status !== "published") {
    return next(new AppError("Only published quizzes can be liked", 403));
  }

  // The user already liked this quiz; liking is idempotent.
  return res.status(200).json({
    status: "success",
    data: { likeCount: await resolveLikeCount(existing), liked: true },
  });
});

export const unlikeQuiz = catchAsync(async (req, res, next) => {
  if (!ensureQuizId(req, next)) return undefined;

  const quiz = await Quiz.findOneAndUpdate(
    {
      _id: req.params.id,
      likes: { $eq: req.user._id },
    },
    {
      $pull: { likes: req.user._id },
      $inc: { likeCount: -1 },
    },
    { new: true, select: "likes likeCount" },
  );

  if (quiz) {
    return res.status(200).json({
      status: "success",
      data: { likeCount: await resolveLikeCount(quiz), liked: false },
    });
  }

  const existing = await Quiz.findById(req.params.id).select(
    "likes likeCount",
  );

  if (!existing) {
    return next(new AppError("No quiz found with that ID", 404));
  }

  // The user had not liked this quiz; unliking is idempotent.
  return res.status(200).json({
    status: "success",
    data: { likeCount: await resolveLikeCount(existing), liked: false },
  });
});
