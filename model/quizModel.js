import mongoose from "mongoose";

import {
  QUIZ_CODE_MAX_ATTEMPTS,
  generateQuizCode,
  isDuplicateShareCodeError,
  isValidQuizCode,
} from "../utils/quizCode.js";
import {
  MAX_PAGES,
  MAX_QUESTIONS_PER_PAGE,
  MAX_TOTAL_QUESTIONS,
} from "../utils/quizValidation.js";

const { Schema } = mongoose;

const SHARE_CODE_INDEX = { shareCode: 1 };
const SHARE_CODE_INDEX_NAME = "shareCode_1";
const SHARE_CODE_PARTIAL_FILTER = { shareCode: { $type: "string" } };

const choiceSchema = new Schema(
  {
    text: {
      type: String,
      required: [true, "Choice text is required"],
      trim: true,
      maxlength: [500, "Choice text cannot exceed 500 characters"],
    },
  },
  { _id: true },
);

const questionSchema = new Schema(
  {
    type: {
      type: String,
      required: [true, "A question type is required"],
      enum: ["multipleChoice", "writtenAnswer", "trueFalse"],
    },
    title: {
      type: String,
      required: [true, "Question text is required"],
      trim: true,
      maxlength: [2000, "Question text cannot exceed 2000 characters"],
    },
    choices: {
      type: [choiceSchema],
      default: undefined,
    },
    correctChoiceId: {
      type: Schema.Types.ObjectId,
      default: null,
      select: false,
    },
    correctText: {
      type: String,
      trim: true,
      maxlength: [2000, "Expected text cannot exceed 2000 characters"],
      default: null,
      select: false,
    },
    acceptedAnswers: {
      type: [String],
      default: undefined,
      select: false,
    },
    required: {
      type: Boolean,
      default: true,
    },
  },
  { _id: true },
);

const pageSchema = new Schema(
  {
    title: {
      type: String,
      trim: true,
      maxlength: [200, "A page title cannot exceed 200 characters"],
    },
    questions: {
      type: [questionSchema],
      default: [],
      validate: {
        validator: (questions) =>
          questions.length <= MAX_QUESTIONS_PER_PAGE,
        message: `A page cannot contain more than ${MAX_QUESTIONS_PER_PAGE} questions`,
      },
    },
  },
  { _id: true },
);

const quizSchema = new Schema(
  {
    title: {
      type: String,
      required: [true, "A quiz title is required"],
      trim: true,
      maxlength: [150, "A quiz title cannot exceed 150 characters"],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [1000, "A description cannot exceed 1000 characters"],
      default: "",
    },
    shareCode: {
      type: String,
      trim: true,
      uppercase: true,
      required: [true, "A quiz share code is required"],
      validate: {
        validator: (value) => value == null || isValidQuizCode(value),
        message: "A quiz share code must be 8 uppercase letters or numbers",
      },
    },
    owner: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: [true, "A quiz owner is required"],
      index: true,
    },
    status: {
      type: String,
      enum: ["draft", "published"],
      default: "draft",
    },
    pages: {
      type: [pageSchema],
      default: [],
      validate: [
        {
          validator: (pages) => pages.length <= MAX_PAGES,
          message: `A quiz cannot contain more than ${MAX_PAGES} pages`,
        },
        {
          validator: (pages) =>
            pages.reduce(
              (total, page) => total + (page.questions || []).length,
              0,
            ) <= MAX_TOTAL_QUESTIONS,
          message: `A quiz cannot contain more than ${MAX_TOTAL_QUESTIONS} questions`,
        },
      ],
    },
    likes: {
      type: [{ type: Schema.Types.ObjectId, ref: "User" }],
      default: [],
    },
    likeCount: {
      type: Number,
      min: 0,
      default: 0,
    },
    peopleTookCount: {
      type: Number,
      min: 0,
      default: 0,
    },
    allowRetakes: {
      type: Boolean,
      default: false,
    },
    showCorrectAnswers: {
      type: Boolean,
      default: false,
    },
    publishedAt: Date,
  },
  { timestamps: true },
);

quizSchema.index({ status: 1, publishedAt: -1 });
quizSchema.index({ likes: 1, updatedAt: -1 });
quizSchema.index(SHARE_CODE_INDEX, {
  unique: true,
  partialFilterExpression: SHARE_CODE_PARTIAL_FILTER,
  _autoIndex: false,
});

quizSchema.pre("validate", function assignQuizShareCode(next) {
  if (!this.shareCode) {
    this.shareCode = generateQuizCode();
  }
  next();
});

quizSchema.pre("validate", function validateQuiz(next) {
  for (const page of this.pages) {
    for (const question of page.questions) {
      const choices = question.choices || [];
      const hasCorrectChoice = question.correctChoiceId != null;

      if (question.type === "multipleChoice") {
        if (choices.length < 2 || choices.length > 6) {
          question.invalidate(
            "choices",
            "Multiple-choice questions need 2 to 6 choices",
          );
        }
      } else if (question.type === "trueFalse") {
        const labels = choices.map((choice) => choice.text);
        if (labels.length !== 2 || labels[0] !== "True" || labels[1] !== "False") {
          question.invalidate(
            "choices",
            "True/false choices must be fixed as True and False",
          );
        }
      } else if (choices.length > 0 || hasCorrectChoice) {
        question.invalidate(
          "choices",
          "Written-answer questions cannot use choices",
        );
      }

      if (
        hasCorrectChoice &&
        !choices.some((choice) => choice._id.equals(question.correctChoiceId))
      ) {
        question.invalidate(
          "correctChoiceId",
          "The correct choice must belong to this question",
        );
      }

      if (question.type !== "writtenAnswer" && question.correctText) {
        question.invalidate(
          "correctText",
          "Expected text is only valid for written-answer questions",
        );
      }

      if (
        question.type !== "writtenAnswer" &&
        Array.isArray(question.acceptedAnswers) &&
        question.acceptedAnswers.length > 0
      ) {
        question.invalidate(
          "acceptedAnswers",
          "Accepted answers are only valid for written-answer questions",
        );
      }

      if (question.type === "writtenAnswer" && question.acceptedAnswers) {
        const hasEmptyAnswer = question.acceptedAnswers.some(
          (answer) => typeof answer !== "string" || !answer.trim(),
        );
        if (hasEmptyAnswer) {
          question.invalidate(
            "acceptedAnswers",
            "Accepted answers cannot be empty",
          );
        }
      }
    }
  }

  next();
});

const isShareCodeIndex = (index) =>
  Object.keys(index.key || {}).length === 1 && index.key.shareCode === 1;

const isCurrentShareCodeIndex = (index) =>
  index.unique === true &&
  JSON.stringify(index.partialFilterExpression) ===
    JSON.stringify(SHARE_CODE_PARTIAL_FILTER);

quizSchema.statics.ensureShareCodeIndex =
  async function ensureShareCodeIndex() {
    let indexes;

    try {
      indexes = await this.collection.indexes();
    } catch (error) {
      if (error?.code !== 26 && error?.codeName !== "NamespaceNotFound") {
        throw error;
      }
      indexes = [];
    }

    const shareCodeIndexes = indexes.filter(isShareCodeIndex);
    if (shareCodeIndexes.some(isCurrentShareCodeIndex)) {
      return;
    }

    for (const index of shareCodeIndexes) {
      try {
        await this.collection.dropIndex(index.name);
      } catch (error) {
        if (error?.code !== 27 && error?.codeName !== "IndexNotFound") {
          throw error;
        }
      }
    }

    await this.collection.createIndex(SHARE_CODE_INDEX, {
      name: SHARE_CODE_INDEX_NAME,
      unique: true,
      partialFilterExpression: SHARE_CODE_PARTIAL_FILTER,
      background: true,
    });
  };

quizSchema.statics.backfillMissingShareCodes = async function backfillMissingShareCodes({
  maxAttempts = QUIZ_CODE_MAX_ATTEMPTS,
  generateCode = generateQuizCode,
} = {}) {
  const missingFilter = {
    $or: [
      { shareCode: { $exists: false } },
      { shareCode: null },
      { shareCode: "" },
    ],
  };

  const quizzes = await this.find(missingFilter).select("_id").lean();
  let updated = 0;

  for (const quiz of quizzes) {
    let saved = false;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const shareCode = generateCode();

      try {
        const result = await this.collection.updateOne(
          { _id: quiz._id, ...missingFilter },
          { $set: { shareCode } },
        );
        if (result.modifiedCount || result.nModified) {
          updated += 1;
        }
        saved = true;
        break;
      } catch (error) {
        if (!isDuplicateShareCodeError(error)) {
          throw error;
        }
      }
    }

    if (!saved) {
      throw new Error("Unable to generate a unique quiz share code");
    }
  }

  return updated;
};

const Quiz = mongoose.model("Quiz", quizSchema);

const initializeQuizModel = Quiz.init.bind(Quiz);

Quiz.init = function init(callback) {
  const ready = Quiz.ensureShareCodeIndex().then(() => initializeQuizModel());

  if (typeof callback === "function") {
    ready.then(
      () => callback(),
      (error) => callback(error),
    );
    return null;
  }

  return ready;
};

export default Quiz;
