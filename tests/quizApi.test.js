import request from "supertest";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";

import app from "../app.js";
import QuizAttempt from "../model/quizAttemptModel.js";
import User from "../model/userModel.js";
import { clearTestDB, connectTestDB, disconnectTestDB } from "./helpers/db.js";
import {
  buildMcqQuestion,
  buildTrueFalseQuestion,
  buildWrittenQuestion,
  createQuizViaApi,
  registerAgent,
} from "./helpers/factories.js";

const fetchQuizData = async (agent, quizId) => {
  const response = await agent.get(`/api/quizzes/${quizId}`);
  return response.body.data;
};

const fetchQuiz = async (agent, quizId) => {
  const data = await fetchQuizData(agent, quizId);
  return data?.quiz;
};

const buildAnswers = (quiz, overrides = {}) => {
  const answers = [];

  for (const page of quiz.pages || []) {
    for (const question of page.questions || []) {
      if (question.type === "writtenAnswer") {
        answers.push({
          questionId: question.id,
          writtenText: question.acceptedAnswers?.[0] ?? "",
        });
      } else {
        const correct =
          question.choices.find(
            (choice) => choice.id === question.correctChoiceId,
          ) || question.choices[0];
        answers.push({ questionId: question.id, choiceId: correct.id });
      }
    }
  }

  return { ...overrides, answers };
};

describe("Quiz API", () => {
  let server;
  let alice;
  let bob;

  beforeAll(async () => {
    await connectTestDB();
    server = app.listen(0);
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
    await disconnectTestDB();
  });

  beforeEach(async () => {
    await clearTestDB();
    alice = (
      await registerAgent(
        { username: "alice", email: "alice@example.com" },
        server,
      )
    ).agent;
    bob = (
      await registerAgent({ username: "bob", email: "bob@example.com" }, server)
    ).agent;
  });

  describe("create validation", () => {
    it("requires authentication", async () => {
      const response = await request(server)
        .post("/api/quizzes")
        .send({ title: "Quiz", questions: [buildMcqQuestion()] });

      expect(response.status).toBe(401);
    });

    it("creates a valid published quiz", async () => {
      const response = await createQuizViaApi(alice);

      expect(response.status).toBe(201);
      expect(response.body.data.quiz.questionCount).toBe(1);
      expect(response.body.data.quiz.shareUrl).toContain("/quiz/");
    });

    it("rejects a missing title", async () => {
      const response = await alice
        .post("/api/quizzes")
        .send({ questions: [buildMcqQuestion()] });

      expect(response.status).toBe(400);
    });

    it("rejects a non-array questions payload", async () => {
      const response = await alice
        .post("/api/quizzes")
        .send({ title: "Quiz", questions: "nope" });

      expect(response.status).toBe(400);
    });

    it("rejects pages with more than 10 questions", async () => {
      const questions = Array.from({ length: 11 }, (_, index) =>
        buildMcqQuestion({ title: `Question ${index}` }),
      );

      const response = await alice
        .post("/api/quizzes")
        .send({ title: "Quiz", questions });

      expect(response.status).toBe(400);
    });

    it("rejects multiple-choice questions with invalid choice counts", async () => {
      const response = await alice.post("/api/quizzes").send({
        title: "Quiz",
        questions: [buildMcqQuestion({ choices: [{ text: "Only one" }] })],
      });

      expect(response.status).toBe(400);
    });

    it("rejects true/false questions without the fixed choices", async () => {
      const response = await alice.post("/api/quizzes").send({
        title: "Quiz",
        questions: [
          buildTrueFalseQuestion({
            choices: [{ text: "Yes" }, { text: "No" }],
          }),
        ],
      });

      expect(response.status).toBe(400);
    });

    it("rejects written-answer questions with choices", async () => {
      const response = await alice.post("/api/quizzes").send({
        title: "Quiz",
        questions: [
          buildWrittenQuestion({ choices: [{ text: "A" }, { text: "B" }] }),
        ],
      });

      expect(response.status).toBe(400);
    });

    it("rejects unsupported question types", async () => {
      const response = await alice.post("/api/quizzes").send({
        title: "Quiz",
        questions: [{ type: "essay", title: "Write an essay" }],
      });

      expect(response.status).toBe(400);
    });

    it("rejects a correct choice index that is out of range", async () => {
      const response = await alice.post("/api/quizzes").send({
        title: "Quiz",
        questions: [buildMcqQuestion({ correctChoiceIndex: 7 })],
      });

      expect(response.status).toBe(400);
    });

    it("rejects a correct choice that belongs to another question", async () => {
      const response = await alice.post("/api/quizzes").send({
        title: "Quiz",
        questions: [
          buildMcqQuestion({
            correctChoiceId: "0123456789abcdef01234567",
          }),
        ],
      });

      expect(response.status).toBe(400);
    });

    it("rejects multiple-choice questions without a correct choice", async () => {
      const response = await alice.post("/api/quizzes").send({
        title: "Quiz",
        questions: [
          buildMcqQuestion({ correctChoiceIndex: undefined, correctChoiceId: undefined }),
        ],
      });

      expect(response.status).toBe(400);
    });

    it("rejects client attempts to set protected fields", async () => {
      const response = await alice.post("/api/quizzes").send({
        title: "Quiz",
        questions: [buildMcqQuestion()],
        owner: "0123456789abcdef01234567",
        likeCount: 999,
        peopleTookCount: 999,
      });

      expect(response.status).toBe(400);
    });

    it("rejects a non-boolean allowRetakes value", async () => {
      const response = await alice.post("/api/quizzes").send({
        title: "Quiz",
        questions: [buildMcqQuestion()],
        allowRetakes: "yes",
      });

      expect(response.status).toBe(400);
    });

    it("rejects publishing an empty quiz but allows an empty draft", async () => {
      const published = await alice
        .post("/api/quizzes")
        .send({ title: "Empty", status: "published", questions: [] });
      expect(published.status).toBe(400);

      const draft = await alice
        .post("/api/quizzes")
        .send({ title: "Empty", status: "draft", questions: [] });
      expect(draft.status).toBe(201);
    });
  });

  describe("draft privacy and answer-key protection", () => {
    it("hides drafts from anonymous and other users", async () => {
      const created = await createQuizViaApi(alice, { status: "draft" });
      const quizId = created.body.data.quiz.id;

      const anonymous = await request(server).get(`/api/quizzes/${quizId}`);
      expect(anonymous.status).toBe(403);

      const other = await bob.get(`/api/quizzes/${quizId}`);
      expect(other.status).toBe(403);
    });

    it("shows drafts to their owner", async () => {
      const created = await createQuizViaApi(alice, { status: "draft" });
      const quizId = created.body.data.quiz.id;

      const response = await alice.get(`/api/quizzes/${quizId}`);
      expect(response.status).toBe(200);
      expect(response.body.data.isOwner).toBe(true);
    });

    it("never exposes answer keys to takers", async () => {
      const created = await createQuizViaApi(alice, {
        questions: [
          buildMcqQuestion(),
          buildWrittenQuestion(),
        ],
      });
      const quizId = created.body.data.quiz.id;

      const response = await request(server).get(`/api/quizzes/${quizId}`);
      const serialized = JSON.stringify(response.body);

      expect(response.status).toBe(200);
      expect(serialized).not.toContain("correctChoiceId");
      expect(serialized).not.toContain("acceptedAnswers");
      expect(serialized).not.toContain("correctText");
    });

    it("provides the answer key to the owner for editing", async () => {
      const created = await createQuizViaApi(alice, {
        questions: [buildMcqQuestion(), buildWrittenQuestion()],
      });
      const quizId = created.body.data.quiz.id;

      const quiz = await fetchQuiz(alice, quizId);
      const [mcq, written] = quiz.pages[0].questions;

      expect(mcq.correctChoiceId).toBeTruthy();
      expect(written.acceptedAnswers).toEqual(["JavaScript"]);
    });

    it("returns 400 for malformed identifiers", async () => {
      const response = await alice.get("/api/quizzes/not-an-id");
      expect(response.status).toBe(400);
    });
  });

  describe("update", () => {
    it("requires ownership", async () => {
      const created = await createQuizViaApi(alice);
      const quizId = created.body.data.quiz.id;

      const anonymous = await request(server)
        .patch(`/api/quizzes/${quizId}`)
        .send({ title: "Hijacked" });
      expect(anonymous.status).toBe(401);

      const other = await bob
        .patch(`/api/quizzes/${quizId}`)
        .send({ title: "Hijacked" });
      expect(other.status).toBe(403);
    });

    it("updates allowed fields for the owner", async () => {
      const created = await createQuizViaApi(alice, { status: "draft" });
      const quizId = created.body.data.quiz.id;

      const response = await alice.patch(`/api/quizzes/${quizId}`).send({
        title: "Updated title",
        description: "Updated description",
        status: "published",
        pages: [{ title: "Round 1", questions: [buildMcqQuestion()] }],
        allowRetakes: true,
        showCorrectAnswers: true,
      });

      expect(response.status).toBe(200);
      expect(response.body.data.quiz.title).toBe("Updated title");
      expect(response.body.data.quiz.allowRetakes).toBe(true);
      expect(response.body.data.quiz.showCorrectAnswers).toBe(true);
    });

    it("rejects malformed pages without wiping existing content", async () => {
      const created = await createQuizViaApi(alice);
      const quizId = created.body.data.quiz.id;

      const response = await alice
        .patch(`/api/quizzes/${quizId}`)
        .send({ pages: "not-an-array" });

      expect(response.status).toBe(400);

      const quiz = await fetchQuiz(alice, quizId);
      expect(quiz.questionCount).toBe(1);
    });

    it("rejects malformed questions without wiping existing content", async () => {
      const created = await createQuizViaApi(alice);
      const quizId = created.body.data.quiz.id;

      const response = await alice.patch(`/api/quizzes/${quizId}`).send({
        questions: [{ type: "multipleChoice", title: "Broken" }],
      });

      expect(response.status).toBe(400);

      const quiz = await fetchQuiz(alice, quizId);
      expect(quiz.questionCount).toBe(1);
    });

    it("rejects an empty update payload", async () => {
      const created = await createQuizViaApi(alice);
      const quizId = created.body.data.quiz.id;

      const response = await alice.patch(`/api/quizzes/${quizId}`).send({});
      expect(response.status).toBe(400);
    });

    it("rejects protected fields on update", async () => {
      const created = await createQuizViaApi(alice);
      const quizId = created.body.data.quiz.id;

      const response = await alice
        .patch(`/api/quizzes/${quizId}`)
        .send({ likeCount: 5000 });
      expect(response.status).toBe(400);
    });

    it("refuses to publish a quiz with no questions", async () => {
      const created = await createQuizViaApi(alice, {
        status: "draft",
        questions: [],
      });
      const quizId = created.body.data.quiz.id;

      const response = await alice
        .patch(`/api/quizzes/${quizId}`)
        .send({ status: "published" });

      expect(response.status).toBe(400);
    });
  });

  describe("delete", () => {
    it("deletes only for the owner and cleans related records", async () => {
      const created = await createQuizViaApi(alice);
      const quizId = created.body.data.quiz.id;

      await alice.post(`/api/quizzes/${quizId}/submit`).send(buildAnswers(await fetchQuiz(alice, quizId)));

      const other = await bob.delete(`/api/quizzes/${quizId}`);
      expect(other.status).toBe(403);

      const owner = await alice.delete(`/api/quizzes/${quizId}`);
      expect(owner.status).toBe(204);

      const gone = await alice.get(`/api/quizzes/${quizId}`);
      expect(gone.status).toBe(404);
      expect(await QuizAttempt.countDocuments({ quiz: quizId })).toBe(0);

      const completed = await alice.get("/api/users/me/completed");
      expect(completed.body.data.quizzes).toHaveLength(0);

      const user = await User.findById((await User.findOne({ username: "alice" }))._id);
      expect(user.completedQuizzes).toHaveLength(0);
    });
  });

  describe("submission and grading", () => {
    const createGradingQuiz = async (agent, extra = {}) =>
      createQuizViaApi(agent, {
        questions: [
          buildMcqQuestion(),
          buildTrueFalseQuestion(),
          buildWrittenQuestion({
            acceptedAnswers: ["JavaScript", "JS"],
          }),
        ],
        ...extra,
      });

    it("grades multiple-choice, true/false, and written answers on the server", async () => {
      const created = await createGradingQuiz(alice);
      const quizId = created.body.data.quiz.id;
      const quiz = await fetchQuiz(alice, quizId);

      const answers = buildAnswers(quiz);
      answers.answers[2].writtenText = "  javascript  ";

      const response = await request(server)
        .post(`/api/quizzes/${quizId}/submit`)
        .send(answers);

      expect(response.status).toBe(200);
      expect(response.body.data.score).toBe(3);
      expect(response.body.data.percentage).toBe(100);
    });

    it("does not trust client-submitted correctness flags", async () => {
      const created = await createGradingQuiz(alice);
      const quizId = created.body.data.quiz.id;
      const quiz = await fetchQuiz(alice, quizId);
      const answers = buildAnswers(quiz);

      answers.answers[0].choiceId = quiz.pages[0].questions[0].choices[0].id;
      answers.answers[0].isCorrect = true;
      answers.score = 999;

      const response = await request(server)
        .post(`/api/quizzes/${quizId}/submit`)
        .send(answers);

      expect(response.body.data.score).toBeLessThan(3);
      expect(response.body.data.results[0].isCorrect).toBe(false);
    });

    it("matches written answers case-insensitively after trimming", async () => {
      const created = await createQuizViaApi(alice, {
        questions: [buildWrittenQuestion({ acceptedAnswers: ["JavaScript", "JS"] })],
      });
      const quizId = created.body.data.quiz.id;
      const quiz = await fetchQuiz(alice, quizId);

      const response = await request(server)
        .post(`/api/quizzes/${quizId}/submit`)
        .send({
          answers: [
            { questionId: quiz.pages[0].questions[0].id, writtenText: " JAVASCRIPT " },
          ],
        });

      expect(response.body.data.score).toBe(1);
    });

    it("treats written questions with no accepted answers as ungraded", async () => {
      const created = await createQuizViaApi(alice, {
        questions: [
          buildWrittenQuestion({ acceptedAnswers: [] }),
          buildMcqQuestion(),
        ],
      });
      const quizId = created.body.data.quiz.id;
      const quiz = await fetchQuiz(alice, quizId);

      const answers = buildAnswers(quiz);
      answers.answers[0].writtenText = "Anything at all";

      const response = await request(server)
        .post(`/api/quizzes/${quizId}/submit`)
        .send(answers);

      expect(response.status).toBe(200);
      expect(response.body.data.totalQuestions).toBe(2);
      expect(response.body.data.gradedQuestions).toBe(1);
      expect(response.body.data.score).toBe(1);
      expect(response.body.data.results[0].graded).toBe(false);
      expect(response.body.data.results[0].isCorrect).toBe(false);
    });

    it("hides correct answers unless showCorrectAnswers is enabled", async () => {
      const created = await createGradingQuiz(alice);
      const quizId = created.body.data.quiz.id;
      const quiz = await fetchQuiz(alice, quizId);

      const hidden = await request(server)
        .post(`/api/quizzes/${quizId}/submit`)
        .send(buildAnswers(quiz));

      expect(hidden.body.data.results[0].correctAnswer).toBeUndefined();
      expect(hidden.body.data.results[2].acceptedAnswers).toBeUndefined();

      await alice
        .patch(`/api/quizzes/${quizId}`)
        .send({ showCorrectAnswers: true });

      const shown = await request(server)
        .post(`/api/quizzes/${quizId}/submit`)
        .send(buildAnswers(quiz));

      expect(shown.body.data.results[0].correctAnswer).toBeDefined();
      expect(shown.body.data.results[2].acceptedAnswers).toEqual([
        "JavaScript",
        "JS",
      ]);
    });

    it("rejects malformed answer payloads", async () => {
      const created = await createGradingQuiz(alice);
      const quizId = created.body.data.quiz.id;

      const notArray = await request(server)
        .post(`/api/quizzes/${quizId}/submit`)
        .send({ answers: "nope" });
      expect(notArray.status).toBe(400);

      const badEntry = await request(server)
        .post(`/api/quizzes/${quizId}/submit`)
        .send({ answers: [{ nope: true }] });
      expect(badEntry.status).toBe(400);
    });

    it("blocks draft submissions from anonymous takers", async () => {
      const created = await createQuizViaApi(alice, { status: "draft" });
      const quizId = created.body.data.quiz.id;

      const response = await request(server)
        .post(`/api/quizzes/${quizId}/submit`)
        .send({ answers: [] });

      expect(response.status).toBe(403);
    });
  });

  describe("retakes and unique participants", () => {
    const submitOnce = async (agent, quizId) => {
      const quiz = await fetchQuiz(agent, quizId);
      return agent
        .post(`/api/quizzes/${quizId}/submit`)
        .send(buildAnswers(quiz));
    };

    it("blocks retakes when allowRetakes is false", async () => {
      const created = await createQuizViaApi(alice);
      const quizId = created.body.data.quiz.id;

      const first = await submitOnce(alice, quizId);
      expect(first.status).toBe(200);
      expect(first.body.data.countedForParticipants).toBe(true);

      const second = await submitOnce(alice, quizId);
      expect(second.status).toBe(403);

      const quiz = await fetchQuiz(alice, quizId);
      expect(quiz.peopleTookCount).toBe(1);
      expect(await QuizAttempt.countDocuments({ quiz: quizId })).toBe(1);
    });

    it("allows retakes when enabled without double-counting the participant", async () => {
      const created = await createQuizViaApi(alice, { allowRetakes: true });
      const quizId = created.body.data.quiz.id;

      const first = await submitOnce(alice, quizId);
      const second = await submitOnce(alice, quizId);

      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      expect(second.body.data.countedForParticipants).toBe(false);

      const quiz = await fetchQuiz(alice, quizId);
      expect(quiz.peopleTookCount).toBe(1);
      expect(await QuizAttempt.countDocuments({ quiz: quizId })).toBe(2);
    });

    it("counts unique participants across different users", async () => {
      const created = await createQuizViaApi(alice);
      const quizId = created.body.data.quiz.id;

      await submitOnce(alice, quizId);
      await submitOnce(bob, quizId);

      const quiz = await fetchQuiz(alice, quizId);
      expect(quiz.peopleTookCount).toBe(2);
    });

    it("does not count anonymous submissions", async () => {
      const created = await createQuizViaApi(alice);
      const quizId = created.body.data.quiz.id;
      const quiz = await fetchQuiz(alice, quizId);

      const response = await request(server)
        .post(`/api/quizzes/${quizId}/submit`)
        .send(buildAnswers(quiz));

      expect(response.body.data.countedForParticipants).toBe(false);
      expect(response.body.data.peopleTookCount).toBe(0);
    });

    it("records completed quiz history without duplicates", async () => {
      const created = await createQuizViaApi(alice, { allowRetakes: true });
      const quizId = created.body.data.quiz.id;

      await submitOnce(alice, quizId);
      await submitOnce(alice, quizId);

      const completed = await alice.get("/api/users/me/completed");
      expect(completed.body.data.quizzes).toHaveLength(1);
      expect(completed.body.data.quizzes[0].attempts).toBe(2);
    });
  });

  describe("likes", () => {
    it("requires authentication", async () => {
      const created = await createQuizViaApi(alice);
      const quizId = created.body.data.quiz.id;

      const response = await request(server).post(`/api/quizzes/${quizId}/like`);
      expect(response.status).toBe(401);
    });

    it("likes idempotently and unlikes idempotently", async () => {
      const created = await createQuizViaApi(alice);
      const quizId = created.body.data.quiz.id;

      const first = await bob.post(`/api/quizzes/${quizId}/like`);
      expect(first.status).toBe(200);
      expect(first.body.data).toEqual({ likeCount: 1, liked: true });

      const duplicate = await bob.post(`/api/quizzes/${quizId}/like`);
      expect(duplicate.body.data.likeCount).toBe(1);

      const data = await fetchQuizData(bob, quizId);
      expect(data.quiz.likeCount).toBe(1);
      expect(data.likedByMe).toBe(true);

      const unlike = await bob.delete(`/api/quizzes/${quizId}/like`);
      expect(unlike.body.data).toEqual({ likeCount: 0, liked: false });

      const again = await bob.delete(`/api/quizzes/${quizId}/like`);
      expect(again.body.data.likeCount).toBe(0);
    });

    it("refuses to like unpublished quizzes and unknown quizzes", async () => {
      const draft = await createQuizViaApi(alice, { status: "draft" });
      const draftId = draft.body.data.quiz.id;

      const draftLike = await alice.post(`/api/quizzes/${draftId}/like`);
      expect(draftLike.status).toBe(403);

      const missing = await alice.post(
        "/api/quizzes/0123456789abcdef01234567/like",
      );
      expect(missing.status).toBe(404);
    });
  });

  describe("overview pagination", () => {
    const createMany = async (agent, count) => {
      for (let index = 0; index < count; index += 1) {
        await createQuizViaApi(agent, { title: `Quiz ${index}` });
      }
    };

    it("paginates the user's quizzes safely", async () => {
      await createMany(alice, 3);

      const firstPage = await alice.get("/api/overview?page=1&limit=2");
      expect(firstPage.status).toBe(200);
      expect(firstPage.body.data.quizzes).toHaveLength(2);
      expect(firstPage.body.meta.total).toBe(3);
      expect(firstPage.body.meta.totalPages).toBe(2);
      expect(firstPage.body.meta.hasNextPage).toBe(true);

      const secondPage = await alice.get("/api/overview?page=2&limit=2");
      expect(secondPage.body.data.quizzes).toHaveLength(1);
      expect(secondPage.body.meta.hasPrevPage).toBe(true);
      expect(secondPage.body.meta.hasNextPage).toBe(false);
    });

    it("clamps excessive limits and invalid pages", async () => {
      await createMany(alice, 3);

      const response = await alice.get("/api/overview?page=abc&limit=5000");
      expect(response.status).toBe(200);
      expect(response.body.meta.page).toBe(1);
      expect(response.body.meta.limit).toBe(50);
    });
  });
});
