import mongoose from "mongoose";

const { Schema } = mongoose;

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
        validator: (questions) => questions.length <= 10,
        message: "A page cannot contain more than 10 questions",
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

const Quiz = mongoose.model("Quiz", quizSchema);

export default Quiz;
