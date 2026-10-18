import mongoose from "mongoose";

const { Schema } = mongoose;

const attemptAnswerSchema = new Schema(
  {
    questionId: {
      type: Schema.Types.ObjectId,
      required: true,
    },
    choiceId: {
      type: Schema.Types.ObjectId,
      default: null,
    },
    writtenText: {
      type: String,
      trim: true,
      maxlength: [2000, "Written answers cannot exceed 2000 characters"],
      default: null,
    },
  },
  { _id: false },
);

const quizAttemptSchema = new Schema(
  {
    quiz: {
      type: Schema.Types.ObjectId,
      ref: "Quiz",
      required: [true, "A quiz reference is required"],
      index: true,
    },
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: [true, "A user reference is required"],
      index: true,
    },
    answers: {
      type: [attemptAnswerSchema],
      default: [],
    },
    score: {
      type: Number,
      min: 0,
      default: 0,
    },
    totalQuestions: {
      type: Number,
      min: 0,
      default: 0,
    },
    gradedQuestions: {
      type: Number,
      min: 0,
      default: 0,
    },
    percentage: {
      type: Number,
      min: 0,
      max: 100,
      default: 0,
    },
    completedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true },
);

quizAttemptSchema.index({ quiz: 1, user: 1, completedAt: -1 });

const QuizAttempt = mongoose.model("QuizAttempt", quizAttemptSchema);

export default QuizAttempt;
