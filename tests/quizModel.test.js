import mongoose from "mongoose";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";

import Quiz from "../model/quizModel.js";
import { clearTestDB, connectTestDB, disconnectTestDB } from "./helpers/db.js";

const ownerId = new mongoose.Types.ObjectId();

const buildQuiz = (questions, overrides = {}) =>
  new Quiz({
    title: "Model quiz",
    owner: ownerId,
    pages: [{ title: "Page 1", questions }],
    ...overrides,
  });

const buildChoice = (text) => ({ text });

const mcqQuestion = (overrides = {}) => ({
  type: "multipleChoice",
  title: "Pick one",
  choices: [buildChoice("A"), buildChoice("B")],
  ...overrides,
});

describe("Quiz model validation", () => {
  beforeAll(async () => {
    await connectTestDB();
  });

  afterAll(async () => {
    await disconnectTestDB();
  });

  beforeEach(async () => {
    await clearTestDB();
  });

  it("accepts a valid quiz with all question types", async () => {
    const quiz = buildQuiz([
      (() => {
        const question = mcqQuestion();
        return question;
      })(),
      {
        type: "trueFalse",
        title: "True or false",
        choices: [buildChoice("True"), buildChoice("False")],
      },
      {
        type: "writtenAnswer",
        title: "Write something",
        acceptedAnswers: ["Answer", "answer two"],
      },
    ]);

    await expect(quiz.validate()).resolves.toBeUndefined();
  });

  it("rejects multiple-choice questions with fewer than 2 choices", async () => {
    const quiz = buildQuiz([mcqQuestion({ choices: [buildChoice("A")] })]);
    await expect(quiz.validate()).rejects.toThrow(/2 to 6 choices/);
  });

  it("rejects multiple-choice questions with more than 6 choices", async () => {
    const quiz = buildQuiz([
      mcqQuestion({
        choices: Array.from({ length: 7 }, (_, index) =>
          buildChoice(`Choice ${index}`),
        ),
      }),
    ]);
    await expect(quiz.validate()).rejects.toThrow(/2 to 6 choices/);
  });

  it("rejects a correct choice that does not belong to the question", async () => {
    const question = mcqQuestion();
    question.correctChoiceId = new mongoose.Types.ObjectId();
    const quiz = buildQuiz([question]);
    await expect(quiz.validate()).rejects.toThrow(/correct choice must belong/);
  });

  it("accepts a correct choice that belongs to the question", async () => {
    const quiz = buildQuiz([]);
    const question = quiz.pages[0].questions.create(mcqQuestion());
    question.correctChoiceId = question.choices[0]._id;
    quiz.pages[0].questions.push(question);
    await expect(quiz.validate()).resolves.toBeUndefined();
  });

  it("rejects true/false questions that do not use the fixed labels", async () => {
    const quiz = buildQuiz([
      {
        type: "trueFalse",
        title: "True or false",
        choices: [buildChoice("Yes"), buildChoice("No")],
      },
    ]);
    await expect(quiz.validate()).rejects.toThrow(/fixed as True and False/);
  });

  it("rejects written-answer questions with choices", async () => {
    const quiz = buildQuiz([
      {
        type: "writtenAnswer",
        title: "Write something",
        choices: [buildChoice("A")],
      },
    ]);
    await expect(quiz.validate()).rejects.toThrow(
      /Written-answer questions cannot use choices/,
    );
  });

  it("rejects accepted answers on non-written questions", async () => {
    const quiz = buildQuiz([
      mcqQuestion({ acceptedAnswers: ["A"] }),
    ]);
    await expect(quiz.validate()).rejects.toThrow(
      /Accepted answers are only valid/,
    );
  });

  it("rejects empty accepted answers for written questions", async () => {
    const quiz = buildQuiz([
      {
        type: "writtenAnswer",
        title: "Write something",
        acceptedAnswers: ["   "],
      },
    ]);
    await expect(quiz.validate()).rejects.toThrow(/cannot be empty/);
  });

  it("rejects pages with more than 10 questions", async () => {
    const quiz = buildQuiz(
      Array.from({ length: 11 }, (_, index) =>
        mcqQuestion({ title: `Question ${index}` }),
      ),
    );
    await expect(quiz.validate()).rejects.toThrow(/more than 10 questions/);
  });

  it("rejects an empty title", async () => {
    const quiz = new Quiz({ title: "   ", owner: ownerId });
    await expect(quiz.validate()).rejects.toThrow(/title is required/);
  });
});
