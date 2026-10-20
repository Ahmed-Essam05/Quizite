import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import Quiz from "../model/quizModel.js";
import {
  QUIZ_CODE_PATTERN,
  generateQuizCode,
  saveWithUniqueShareCode,
} from "../utils/quizCode.js";
import { clearTestDB, connectTestDB, disconnectTestDB } from "./helpers/db.js";

const ownerId = new mongoose.Types.ObjectId();

const buildQuiz = (overrides = {}) =>
  new Quiz({
    title: "Code test quiz",
    owner: ownerId,
    ...overrides,
  });

describe("quiz share codes", () => {
  beforeAll(async () => {
    await connectTestDB();
    await Quiz.init();
  });

  afterAll(async () => {
    await disconnectTestDB();
  });

  beforeEach(async () => {
    await clearTestDB();
  });

  it("generates secure 8-character uppercase alphanumeric codes", () => {
    const codes = Array.from({ length: 500 }, () => generateQuizCode());

    for (const code of codes) {
      expect(code).toMatch(QUIZ_CODE_PATTERN);
      expect(code).toHaveLength(8);
      expect(code).toBe(code.toUpperCase());
    }
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("assigns a persistent code that is not regenerated on later saves", async () => {
    const quiz = await buildQuiz().save();
    const originalCode = quiz.shareCode;

    expect(originalCode).toMatch(QUIZ_CODE_PATTERN);
    expect(originalCode).not.toBe(String(quiz._id));

    quiz.title = "Updated title";
    await quiz.save();

    const stored = await Quiz.findById(quiz._id).lean();
    expect(stored.shareCode).toBe(originalCode);
  });

  it("enforces unique share codes at the database level", async () => {
    const first = await buildQuiz({ shareCode: "AAAA1111" }).save();
    expect(first.shareCode).toBe("AAAA1111");

    const duplicate = buildQuiz({ shareCode: "AAAA1111" });
    await expect(duplicate.save()).rejects.toMatchObject({ code: 11000 });
  });

  it("retries with a new code when a generated code collides", async () => {
    await buildQuiz({ shareCode: "AAAA1111" }).save();
    const generated = ["AAAA1111", "BBBB2222"];

    const quiz = await saveWithUniqueShareCode(buildQuiz(), {
      generateCode: () => generated.shift(),
    });

    expect(quiz.shareCode).toBe("BBBB2222");
    expect(await Quiz.countDocuments({ shareCode: "BBBB2222" })).toBe(1);
  });

  it("backfills missing codes without changing IDs or quiz data", async () => {
    const legacyIds = [
      new mongoose.Types.ObjectId(),
      new mongoose.Types.ObjectId(),
    ];
    const now = new Date();
    await Quiz.collection.insertMany([
      {
        _id: legacyIds[0],
        title: "Legacy one",
        description: "First legacy quiz",
        owner: ownerId,
        status: "published",
        pages: [],
        createdAt: now,
        updatedAt: now,
      },
      {
        _id: legacyIds[1],
        title: "Legacy two",
        owner: ownerId,
        status: "draft",
        pages: [],
        createdAt: now,
        updatedAt: now,
      },
    ]);

    expect(await Quiz.countDocuments({ shareCode: { $exists: false } })).toBe(
      2,
    );

    const updated = await Quiz.backfillMissingShareCodes();
    expect(updated).toBe(2);

    const quizzes = await Quiz.find({ _id: { $in: legacyIds } }).lean();
    expect(quizzes).toHaveLength(2);

    for (const quiz of quizzes) {
      expect(quiz.shareCode).toMatch(QUIZ_CODE_PATTERN);
    }
    expect(new Set(quizzes.map((quiz) => quiz.shareCode)).size).toBe(2);

    const first = quizzes.find((quiz) => quiz._id.equals(legacyIds[0]));
    expect(first.title).toBe("Legacy one");
    expect(first.description).toBe("First legacy quiz");
    expect(first.status).toBe("published");
    expect(first.updatedAt.getTime()).toBe(now.getTime());

    expect(await Quiz.backfillMissingShareCodes()).toBe(0);
    const stored = await Quiz.find({ _id: { $in: legacyIds } }).lean();
    expect(stored.map((quiz) => quiz.shareCode).sort()).toEqual(
      quizzes.map((quiz) => quiz.shareCode).sort(),
    );
  });

  it("retries backfill collisions against existing codes", async () => {
    await buildQuiz({ shareCode: "CCCC3333" }).save();
    const legacyId = new mongoose.Types.ObjectId();
    await Quiz.collection.insertOne({
      _id: legacyId,
      title: "Legacy collision",
      owner: ownerId,
      status: "published",
      pages: [],
    });

    const generated = ["CCCC3333", "DDDD4444"];
    const updated = await Quiz.backfillMissingShareCodes({
      generateCode: () => generated.shift(),
    });

    expect(updated).toBe(1);
    const stored = await Quiz.findById(legacyId).lean();
    expect(stored.shareCode).toBe("DDDD4444");
  });

  it("upgrades a legacy sparse share-code index without losing quizzes", async () => {
    await Quiz.collection.dropIndex("shareCode_1").catch(() => {});
    const codedId = new mongoose.Types.ObjectId();
    const missingId = new mongoose.Types.ObjectId();
    const now = new Date();

    await Quiz.collection.insertMany([
      {
        _id: codedId,
        title: "Legacy coded quiz",
        owner: ownerId,
        status: "published",
        pages: [],
        shareCode: "LEGACY01",
        createdAt: now,
        updatedAt: now,
      },
      {
        _id: missingId,
        title: "Legacy missing-code quiz",
        owner: ownerId,
        status: "draft",
        pages: [],
        createdAt: now,
        updatedAt: now,
      },
    ]);
    await Quiz.collection.createIndex(
      { shareCode: 1 },
      { name: "shareCode_1", unique: true, sparse: true },
    );

    await expect(Quiz.init()).resolves.toBeTruthy();

    const shareCodeIndex = (await Quiz.collection.indexes()).find(
      (index) => index.name === "shareCode_1",
    );
    expect(shareCodeIndex.unique).toBe(true);
    expect(shareCodeIndex.sparse).toBeUndefined();
    expect(shareCodeIndex.partialFilterExpression).toEqual({
      shareCode: { $type: "string" },
    });

    const codedQuiz = await Quiz.findById(codedId).lean();
    expect(codedQuiz.title).toBe("Legacy coded quiz");
    expect(codedQuiz.shareCode).toBe("LEGACY01");

    expect(await Quiz.backfillMissingShareCodes()).toBe(1);
    const missingQuiz = await Quiz.findById(missingId).lean();
    expect(missingQuiz.shareCode).toMatch(QUIZ_CODE_PATTERN);
  });
});
