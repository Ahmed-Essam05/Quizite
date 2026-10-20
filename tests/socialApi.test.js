import mongoose from "mongoose";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import app from "../app.js";
import Quiz from "../model/quizModel.js";
import QuizAttempt from "../model/quizAttemptModel.js";
import { clearTestDB, connectTestDB, disconnectTestDB } from "./helpers/db.js";
import { createQuizViaApi, registerAgent } from "./helpers/factories.js";

const fetchQuiz = async (agent, quizId) => {
  const response = await agent.get(`/api/quizzes/${quizId}`);
  return response.body.data.quiz;
};

const buildAnswers = (quiz) => {
  const answers = [];

  for (const page of quiz.pages || []) {
    for (const question of page.questions || []) {
      if (question.type === "writtenAnswer") {
        answers.push({
          questionId: question.id,
          writtenText: question.acceptedAnswers?.[0] ?? "",
        });
      } else {
        answers.push({
          questionId: question.id,
          choiceId: question.choices[0].id,
        });
      }
    }
  }

  return { answers };
};

const submitOnce = async (agent, quizId) => {
  const quiz = await fetchQuiz(agent, quizId);
  return agent.post(`/api/quizzes/${quizId}/submit`).send(buildAnswers(quiz));
};

const setQuizLikes = (quizId, likes) =>
  Quiz.updateOne(
    { _id: quizId },
    { $set: { likes, likeCount: new Set(likes.map(String)).size } },
  );

const setQuizParticipants = async (quizId, count) => {
  if (count < 1) return;

  await QuizAttempt.insertMany(
    Array.from({ length: count }, () => ({
      quiz: quizId,
      user: new mongoose.Types.ObjectId(),
      completedAt: new Date(),
    })),
  );
};

const fakeLikes = (count) =>
  Array.from({ length: count }, () => new mongoose.Types.ObjectId());

describe("social API", () => {
  let server;
  let alice;
  let bob;
  let carol;

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
    alice = await registerAgent(
      { username: "alice", email: "alice@example.com" },
      server,
    );
    bob = await registerAgent(
      { username: "bob", email: "bob@example.com" },
      server,
    );
    carol = await registerAgent(
      { username: "carol", email: "carol@example.com" },
      server,
    );
  });

  describe("GET /api/quizzes/:id/likes", () => {
    it("returns public liker identities to the quiz owner only", async () => {
      const created = await createQuizViaApi(alice.agent, {
        title: "Liked quiz",
      });
      const quizId = created.body.data.quiz.id;

      await bob.agent.post(`/api/quizzes/${quizId}/like`);
      await carol.agent.post(`/api/quizzes/${quizId}/like`);
      await bob.agent.post(`/api/quizzes/${quizId}/like`);

      const response = await alice.agent.get(`/api/quizzes/${quizId}/likes`);

      expect(response.status).toBe(200);
      expect(response.body.data.quiz.title).toBe("Liked quiz");
      expect(response.body.data.likeCount).toBe(2);
      expect(response.body.data.likers.map((liker) => liker.username)).toEqual([
        "bob",
        "carol",
      ]);
      expect(response.body.data.likers[0].profileUrl).toBe("/users/bob");

      const serialized = JSON.stringify(response.body);
      expect(serialized).not.toContain("@example.com");
      expect(serialized).not.toContain("passwordHash");
      expect(serialized).not.toContain("passwordResetTokenHash");
      expect(serialized).not.toContain("isActive");
    });

    it("rejects non-owners and anonymous requests", async () => {
      const created = await createQuizViaApi(alice.agent);
      const quizId = created.body.data.quiz.id;
      await bob.agent.post(`/api/quizzes/${quizId}/like`);

      const nonOwner = await bob.agent.get(`/api/quizzes/${quizId}/likes`);
      expect(nonOwner.status).toBe(403);

      const anonymous = await request(server).get(
        `/api/quizzes/${quizId}/likes`,
      );
      expect(anonymous.status).toBe(401);

      const missing = await alice.agent.get(
        "/api/quizzes/0123456789abcdef01234567/likes",
      );
      expect(missing.status).toBe(404);

      const invalid = await alice.agent.get("/api/quizzes/not-an-id/likes");
      expect(invalid.status).toBe(400);
    });

    it("returns an empty list when a quiz has no likes", async () => {
      const created = await createQuizViaApi(alice.agent);
      const quizId = created.body.data.quiz.id;

      const response = await alice.agent.get(`/api/quizzes/${quizId}/likes`);

      expect(response.status).toBe(200);
      expect(response.body.data.likeCount).toBe(0);
      expect(response.body.data.likers).toEqual([]);
    });
  });

  describe("public user profiles", () => {
    it("ranks the owner's published quizzes by likes, participants, then title", async () => {
      const biology = await createQuizViaApi(alice.agent, { title: "Biology" });
      const history = await createQuizViaApi(alice.agent, { title: "History" });
      const chemistry = await createQuizViaApi(alice.agent, {
        title: "Chemistry",
      });
      const geography = await createQuizViaApi(alice.agent, {
        title: "Geography",
      });
      const draft = await createQuizViaApi(alice.agent, {
        title: "Private draft",
        status: "draft",
      });
      await createQuizViaApi(bob.agent, { title: "Someone else's quiz" });

      const rankings = [
        [biology, 10, 20],
        [history, 10, 15],
        [chemistry, 10, 15],
        [geography, 8, 40],
        [draft, 50, 0],
      ];
      for (const [created, likes, participants] of rankings) {
        const quizId = created.body.data.quiz.id;
        await setQuizLikes(quizId, fakeLikes(likes));
        await setQuizParticipants(quizId, participants);
      }

      const response = await request(server).get("/api/users/alice/profile");

      expect(response.status).toBe(200);
      const top = response.body.data.topLikedQuizzes;
      expect(top.map((quiz) => quiz.title)).toEqual([
        "Biology",
        "Chemistry",
        "History",
      ]);
      expect(top.map((quiz) => quiz.likeCount)).toEqual([10, 10, 10]);
      expect(top.map((quiz) => quiz.peopleTookCount)).toEqual([20, 15, 15]);
      expect(top.every((quiz) => quiz.owner.username === "alice")).toBe(true);
      expect(
        top.every((quiz) => quiz.owner.id === response.body.data.user.id),
      ).toBe(true);
      expect(response.body.data.stats.totalLikesReceived).toBe(88);
      expect(response.body.data.mostLikedQuiz).toBeUndefined();

      const serialized = JSON.stringify(response.body);
      expect(serialized).not.toContain("Private draft");
      expect(serialized).not.toContain("Someone else's quiz");
      expect(serialized).not.toContain("alice@example.com");
      expect(serialized).not.toContain("passwordHash");
      expect(serialized).not.toContain("isActive");
    });

    it("resolves equal likes and participants by title case-insensitively", async () => {
      const zebra = await createQuizViaApi(alice.agent, { title: "Zebra" });
      const apple = await createQuizViaApi(alice.agent, { title: "apple" });
      const history = await createQuizViaApi(alice.agent, {
        title: "History",
      });
      const chemistry = await createQuizViaApi(alice.agent, {
        title: "chemistry",
      });

      for (const created of [zebra, apple, history, chemistry]) {
        const quizId = created.body.data.quiz.id;
        await setQuizLikes(quizId, fakeLikes(2));
        await setQuizParticipants(quizId, 1);
      }

      const response = await request(server).get("/api/users/alice/profile");

      expect(
        response.body.data.topLikedQuizzes.map((quiz) => quiz.title),
      ).toEqual(["apple", "chemistry", "History"]);
    });

    it("updates likes received and keeps zero-like published quizzes", async () => {
      const created = await createQuizViaApi(alice.agent, {
        title: "Changing likes",
      });
      const quizId = created.body.data.quiz.id;

      await bob.agent.post(`/api/quizzes/${quizId}/like`);
      let profile = await request(server).get("/api/users/alice/profile");
      expect(profile.body.data.stats.totalLikesReceived).toBe(1);
      expect(profile.body.data.topLikedQuizzes[0]).toMatchObject({
        title: "Changing likes",
        likeCount: 1,
      });

      await bob.agent.delete(`/api/quizzes/${quizId}/like`);
      profile = await request(server).get("/api/users/alice/profile");
      expect(profile.body.data.stats.totalLikesReceived).toBe(0);
      expect(profile.body.data.topLikedQuizzes).toHaveLength(1);
      expect(profile.body.data.topLikedQuizzes[0]).toMatchObject({
        title: "Changing likes",
        likeCount: 0,
      });
    });

    it("returns however many published quizzes qualify", async () => {
      let profile = await request(server).get("/api/users/alice/profile");
      expect(profile.body.data.topLikedQuizzes).toEqual([]);

      await createQuizViaApi(alice.agent, { title: "Only quiz" });
      profile = await request(server).get("/api/users/alice/profile");
      expect(profile.body.data.topLikedQuizzes).toHaveLength(1);

      await createQuizViaApi(alice.agent, { title: "Second quiz" });
      profile = await request(server).get("/api/users/alice/profile");
      expect(profile.body.data.topLikedQuizzes).toHaveLength(2);

      await createQuizViaApi(alice.agent, { title: "Third quiz" });
      profile = await request(server).get("/api/users/alice/profile");
      expect(profile.body.data.topLikedQuizzes).toHaveLength(3);

      await createQuizViaApi(alice.agent, { title: "Fourth quiz" });
      profile = await request(server).get("/api/users/alice/profile");
      expect(profile.body.data.topLikedQuizzes).toHaveLength(3);
    });

    it("does not expose draft quiz details and handles empty profiles", async () => {
      const draft = await createQuizViaApi(alice.agent, {
        title: "Private draft",
        status: "draft",
      });
      await setQuizLikes(draft.body.data.quiz.id, fakeLikes(3));

      const withDraft = await request(server).get("/api/users/alice/profile");
      expect(withDraft.status).toBe(200);
      expect(withDraft.body.data.stats.totalLikesReceived).toBe(3);
      expect(withDraft.body.data.topLikedQuizzes).toEqual([]);
      expect(JSON.stringify(withDraft.body)).not.toContain("Private draft");

      const empty = await request(server).get("/api/users/bob/profile");
      expect(empty.status).toBe(200);
      expect(empty.body.data.stats.totalLikesReceived).toBe(0);
      expect(empty.body.data.topLikedQuizzes).toEqual([]);

      const missing = await request(server).get(
        "/api/users/does_not_exist/profile",
      );
      expect(missing.status).toBe(404);

      const invalid = await request(server).get("/api/users/a/profile");
      expect(invalid.status).toBe(404);
    });
  });

  describe("unique participants", () => {
    it("counts repeated attempts by one person once", async () => {
      const created = await createQuizViaApi(alice.agent, {
        title: "Retakes",
        allowRetakes: true,
      });
      const quizId = created.body.data.quiz.id;

      let response;
      for (let attempt = 0; attempt < 5; attempt += 1) {
        response = await submitOnce(bob.agent, quizId);
        expect(response.status).toBe(200);
      }

      expect(response.body.data.peopleTookCount).toBe(1);
      expect(await QuizAttempt.countDocuments({ quiz: quizId })).toBe(5);

      const quiz = await fetchQuiz(alice.agent, quizId);
      expect(quiz.peopleTookCount).toBe(1);

      const overview = await alice.agent.get("/api/overview");
      expect(overview.body.data.quizzes[0].peopleTookCount).toBe(1);
      expect(JSON.stringify(overview.body)).not.toContain("bob");
    });

    it("counts distinct authenticated participants separately", async () => {
      const created = await createQuizViaApi(alice.agent);
      const quizId = created.body.data.quiz.id;

      await submitOnce(bob.agent, quizId);
      await submitOnce(carol.agent, quizId);
      const guestQuiz = await fetchQuiz(alice.agent, quizId);
      const guest = await request(server)
        .post(`/api/quizzes/${quizId}/submit`)
        .send(buildAnswers(guestQuiz));

      expect(guest.status).toBe(401);
      expect(await QuizAttempt.countDocuments({ quiz: quizId })).toBe(2);

      const overview = await alice.agent.get("/api/overview");
      expect(overview.body.data.quizzes[0].peopleTookCount).toBe(2);
      expect(await QuizAttempt.countDocuments({ quiz: quizId })).toBe(2);
    });

    it("derives historical counts from attempts and ignores incomplete attempts", async () => {
      const created = await createQuizViaApi(alice.agent, {
        title: "Historical",
      });
      const quizId = created.body.data.quiz.id;
      await Quiz.updateOne({ _id: quizId }, { $set: { peopleTookCount: 99 } });

      await QuizAttempt.create([
        { quiz: quizId, user: bob.user.id, completedAt: new Date() },
        { quiz: quizId, user: bob.user.id, completedAt: new Date() },
        { quiz: quizId, user: carol.user.id, completedAt: new Date() },
      ]);
      await QuizAttempt.collection.insertOne({
        quiz: new mongoose.Types.ObjectId(quizId),
        user: new mongoose.Types.ObjectId(),
        answers: [],
        score: 0,
        totalQuestions: 0,
        gradedQuestions: 0,
        percentage: 0,
        completedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const quiz = await fetchQuiz(alice.agent, quizId);
      expect(quiz.peopleTookCount).toBe(2);

      const overview = await alice.agent.get("/api/overview");
      expect(overview.body.data.quizzes[0].peopleTookCount).toBe(2);
    });

    it("does not count anonymous submissions or create attempt records", async () => {
      const created = await createQuizViaApi(alice.agent);
      const quizId = created.body.data.quiz.id;
      const quiz = await fetchQuiz(alice.agent, quizId);

      const response = await request(server)
        .post(`/api/quizzes/${quizId}/submit`)
        .send(buildAnswers(quiz));

      expect(response.status).toBe(401);
      expect(await QuizAttempt.countDocuments({ quiz: quizId })).toBe(0);
    });
  });
});
