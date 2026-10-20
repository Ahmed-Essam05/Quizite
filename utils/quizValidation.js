import mongoose from "mongoose";

import AppError from "./appError.js";
import { parseQuizIcon } from "./quizIcon.js";

export const MAX_QUESTIONS_PER_PAGE = 10;
export const MAX_TOTAL_QUESTIONS = 80;
export const MAX_PAGES = 8;
export const MIN_CHOICES_PER_QUESTION = 2;
export const MAX_CHOICES_PER_QUESTION = 6;
export const MAX_ACCEPTED_ANSWERS = 20;

const SUPPORTED_TYPES = new Set([
  "multipleChoice",
  "trueFalse",
  "writtenAnswer",
]);

const PROTECTED_FIELDS = [
  "owner",
  "shareCode",
  "likes",
  "likeCount",
  "peopleTookCount",
  "publishedAt",
  "_id",
  "id",
  "createdAt",
  "updatedAt",
  "__v",
];

const fail = (message) => {
  throw new AppError(message, 400);
};

const isPlainObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

export const normalizeQuestionType = (type) => {
  if (type === "mcq" || type === "multipleChoice") return "multipleChoice";
  if (type === "written" || type === "writtenAnswer") return "writtenAnswer";
  if (type === "true_false" || type === "trueFalse") return "trueFalse";
  return type;
};

const parseObjectId = (value) => {
  if (value instanceof mongoose.Types.ObjectId) return value;
  if (typeof value !== "string") return null;
  if (!mongoose.Types.ObjectId.isValid(value)) return null;
  try {
    const objectId = new mongoose.Types.ObjectId(value);
    if (String(objectId) !== value.toLowerCase()) return null;
    return objectId;
  } catch {
    return null;
  }
};

const parseIdField = (value, context, { generated = true } = {}) => {
  if (value === undefined || value === null) {
    return generated ? new mongoose.Types.ObjectId() : null;
  }
  const objectId = parseObjectId(value);
  if (!objectId) {
    fail(`${context}: "${value}" is not a valid identifier`);
  }
  return objectId;
};

const parseChoice = (rawChoice, context, seenChoiceIds) => {
  let text;
  let rawId;

  if (typeof rawChoice === "string") {
    text = rawChoice;
  } else if (isPlainObject(rawChoice)) {
    text = rawChoice.text;
    rawId = rawChoice._id;
  } else {
    fail(`${context}: each choice must be a text value or an object`);
  }

  if (typeof text !== "string" || !text.trim()) {
    fail(`${context}: choice text is required`);
  }

  const trimmed = text.trim();
  if (trimmed.length > 500) {
    fail(`${context}: choice text cannot exceed 500 characters`);
  }

  const choiceId = parseIdField(rawId, `${context} choice`);
  if (
    seenChoiceIds.has(String(choiceId)) &&
    seenChoiceIds.get(String(choiceId)) !== context
  ) {
    fail(`${context}: duplicate choice identifier`);
  }
  seenChoiceIds.set(String(choiceId), context);

  return { _id: choiceId, text: trimmed };
};

const resolveCorrectChoice = (
  raw,
  choices,
  context,
  { allowIndexText = true } = {},
) => {
  if (raw.correctChoiceId !== undefined && raw.correctChoiceId !== null) {
    const correctId = parseObjectId(raw.correctChoiceId);
    if (!correctId) {
      fail(`${context}: the correct choice identifier is invalid`);
    }
    if (!choices.some((choice) => choice._id.equals(correctId))) {
      fail(`${context}: the correct choice must belong to this question`);
    }
    return correctId;
  }

  if (raw.correctChoiceIndex !== undefined && raw.correctChoiceIndex !== null) {
    const index = raw.correctChoiceIndex;
    const numericIndex =
      typeof index === "number" && Number.isInteger(index)
        ? index
        : typeof index === "string" && /^\d+$/.test(index)
          ? Number(index)
          : NaN;
    if (
      Number.isNaN(numericIndex) ||
      numericIndex < 0 ||
      numericIndex >= choices.length
    ) {
      fail(`${context}: correct choice index is out of range`);
    }
    return choices[numericIndex]._id;
  }

  if (allowIndexText && typeof raw.correctAnswer === "string") {
    const label = raw.correctAnswer.trim().toLowerCase();
    const matched = choices.find(
      (choice) => choice.text.trim().toLowerCase() === label,
    );
    if (matched) return matched._id;
  }

  return null;
};

const parseAcceptedAnswers = (raw, context) => {
  let answers;

  if (raw.acceptedAnswers !== undefined) {
    if (!Array.isArray(raw.acceptedAnswers)) {
      fail(`${context}: acceptedAnswers must be an array of strings`);
    }
    answers = raw.acceptedAnswers;
  } else if (raw.correctText !== undefined && raw.correctText !== null) {
    if (typeof raw.correctText !== "string") {
      fail(`${context}: expected answer must be text`);
    }
    answers = [raw.correctText];
  } else {
    return [];
  }

  if (answers.length > MAX_ACCEPTED_ANSWERS) {
    fail(
      `${context}: a question cannot have more than ${MAX_ACCEPTED_ANSWERS} accepted answers`,
    );
  }

  const normalized = [];
  const seen = new Set();

  for (const answer of answers) {
    if (typeof answer !== "string" || !answer.trim()) {
      fail(`${context}: accepted answers cannot be empty`);
    }
    const trimmed = answer.trim();
    if (trimmed.length > 2000) {
      fail(`${context}: an accepted answer cannot exceed 2000 characters`);
    }
    const dedupeKey = trimmed.toLowerCase();
    if (!seen.has(dedupeKey)) {
      seen.add(dedupeKey);
      normalized.push(trimmed);
    }
  }

  return normalized;
};

const parseQuestion = (rawQuestion, context, seenIds) => {
  if (!isPlainObject(rawQuestion)) {
    fail(`${context}: each question must be an object`);
  }

  const type = normalizeQuestionType(rawQuestion.type);
  if (!SUPPORTED_TYPES.has(type)) {
    fail(`${context}: unsupported question type "${rawQuestion.type}"`);
  }

  if (
    typeof rawQuestion.title !== "string" ||
    !rawQuestion.title.trim()
  ) {
    fail(`${context}: question text is required`);
  }
  const title = rawQuestion.title.trim();
  if (title.length > 2000) {
    fail(`${context}: question text cannot exceed 2000 characters`);
  }

  if (
    rawQuestion.required !== undefined &&
    typeof rawQuestion.required !== "boolean"
  ) {
    fail(`${context}: required must be a boolean`);
  }
  const required = rawQuestion.required !== false;

  const questionId = parseIdField(rawQuestion._id, context);
  const questionKey = String(questionId);
  if (seenIds.has(questionKey)) {
    fail(`${context}: duplicate question identifier`);
  }
  seenIds.add(questionKey);

  if (type === "multipleChoice") {
    if (!Array.isArray(rawQuestion.choices)) {
      fail(`${context}: multiple-choice questions need a choices array`);
    }
    if (
      rawQuestion.choices.length < MIN_CHOICES_PER_QUESTION ||
      rawQuestion.choices.length > MAX_CHOICES_PER_QUESTION
    ) {
      fail(
        `${context}: multiple-choice questions need ${MIN_CHOICES_PER_QUESTION} to ${MAX_CHOICES_PER_QUESTION} choices`,
      );
    }

    const seenChoiceIds = new Map();
    const choices = rawQuestion.choices.map((choice, index) =>
      parseChoice(choice, `${context} choice ${index + 1}`, seenChoiceIds),
    );

    const correctChoiceId = resolveCorrectChoice(rawQuestion, choices, context);
    if (!correctChoiceId) {
      fail(`${context}: select the correct choice for this question`);
    }

    return {
      _id: questionId,
      type,
      title,
      choices,
      correctChoiceId,
      required,
    };
  }

  if (type === "trueFalse") {
    let choices;

    if (rawQuestion.choices !== undefined) {
      if (
        !Array.isArray(rawQuestion.choices) ||
        rawQuestion.choices.length !== 2
      ) {
        fail(`${context}: true/false questions must have exactly two choices`);
      }
      const seenChoiceIds = new Map();
      choices = rawQuestion.choices.map((choice, index) =>
        parseChoice(
          choice,
          `${context} choice ${index + 1}`,
          seenChoiceIds,
        ),
      );
      if (choices[0].text !== "True" || choices[1].text !== "False") {
        fail(
          `${context}: true/false choices must be fixed as True and False`,
        );
      }
    } else {
      choices = [
        { _id: new mongoose.Types.ObjectId(), text: "True" },
        { _id: new mongoose.Types.ObjectId(), text: "False" },
      ];
    }

    const correctChoiceId = resolveCorrectChoice(rawQuestion, choices, context);
    if (!correctChoiceId) {
      fail(`${context}: select the correct choice for this question`);
    }

    return {
      _id: questionId,
      type,
      title,
      choices,
      correctChoiceId,
      required,
    };
  }

  // writtenAnswer
  if (
    Array.isArray(rawQuestion.choices) &&
    rawQuestion.choices.length > 0
  ) {
    fail(`${context}: written-answer questions cannot use choices`);
  }
  if (
    rawQuestion.correctChoiceId !== undefined &&
    rawQuestion.correctChoiceId !== null
  ) {
    fail(`${context}: written-answer questions cannot have a correct choice`);
  }

  return {
    _id: questionId,
    type,
    title,
    choices: undefined,
    correctChoiceId: null,
    acceptedAnswers: parseAcceptedAnswers(rawQuestion, context),
    required,
  };
};

const parsePage = (rawPage, pageIndex, seenIds) => {
  const context = `Page ${pageIndex + 1}`;

  if (!isPlainObject(rawPage)) {
    fail(`${context}: each page must be an object`);
  }

  if (
    rawPage.title !== undefined &&
    rawPage.title !== null &&
    typeof rawPage.title !== "string"
  ) {
    fail(`${context}: page title must be text`);
  }
  const title =
    typeof rawPage.title === "string" && rawPage.title.trim()
      ? rawPage.title.trim()
      : `Page ${pageIndex + 1}`;
  if (title.length > 200) {
    fail(`${context}: a page title cannot exceed 200 characters`);
  }

  if (rawPage.questions !== undefined && !Array.isArray(rawPage.questions)) {
    fail(`${context}: questions must be an array`);
  }
  const rawQuestions = rawPage.questions || [];

  if (rawQuestions.length > MAX_QUESTIONS_PER_PAGE) {
    fail(
      `${context}: a page cannot contain more than ${MAX_QUESTIONS_PER_PAGE} questions`,
    );
  }

  const questions = rawQuestions.map((question, questionIndex) =>
    parseQuestion(question, `${context}, question ${questionIndex + 1}`, seenIds),
  );

  return {
    _id: parseIdField(rawPage._id, context),
    title,
    questions,
  };
};

export const parsePages = (rawPages, rawQuestions) => {
  const seenIds = new Set();

  if (rawPages !== undefined) {
    if (!Array.isArray(rawPages)) {
      fail("pages must be an array");
    }
    if (rawPages.length > MAX_PAGES) {
      fail(`A quiz cannot contain more than ${MAX_PAGES} pages`);
    }

    const pages = rawPages.map((page, index) =>
      parsePage(page, index, seenIds),
    );

    if (countQuestions(pages) > MAX_TOTAL_QUESTIONS) {
      fail(`A quiz cannot contain more than ${MAX_TOTAL_QUESTIONS} questions`);
    }

    return pages;
  }

  if (rawQuestions !== undefined) {
    if (!Array.isArray(rawQuestions)) {
      fail("questions must be an array");
    }
    if (rawQuestions.length > MAX_TOTAL_QUESTIONS) {
      fail(`A quiz cannot contain more than ${MAX_TOTAL_QUESTIONS} questions`);
    }

    const pages = [];
    for (
      let index = 0;
      index < rawQuestions.length;
      index += MAX_QUESTIONS_PER_PAGE
    ) {
      pages.push(
        parsePage(
          {
            title: `Page ${pages.length + 1}`,
            questions: rawQuestions.slice(
              index,
              index + MAX_QUESTIONS_PER_PAGE,
            ),
          },
          pages.length,
          seenIds,
        ),
      );
    }

    return pages;
  }

  return [];
};

export const countQuestions = (pages = []) =>
  pages.reduce((total, page) => total + (page.questions || []).length, 0);

export const parseQuizPayload = (
  body,
  { requireTitle = false, userId } = {},
) => {
  if (!isPlainObject(body)) {
    fail("Quiz payload must be a JSON object");
  }

  for (const field of PROTECTED_FIELDS) {
    if (body[field] !== undefined) {
      fail(`The ${field} field cannot be set by clients`);
    }
  }

  const result = {};

  if (requireTitle || body.title !== undefined) {
    if (typeof body.title !== "string" || !body.title.trim()) {
      fail("A quiz title is required");
    }
    const title = body.title.trim();
    if (title.length > 150) {
      fail("A quiz title cannot exceed 150 characters");
    }
    result.title = title;
  }

  if (body.description !== undefined) {
    if (body.description !== null && typeof body.description !== "string") {
      fail("A quiz description must be text");
    }
    const description = (body.description || "").trim();
    if (description.length > 1000) {
      fail("A description cannot exceed 1000 characters");
    }
    result.description = description;
  }

  if (body.status !== undefined) {
    if (body.status !== "draft" && body.status !== "published") {
      fail('Quiz status must be either "draft" or "published"');
    }
    result.status = body.status;
  }

  for (const field of ["allowRetakes", "showCorrectAnswers"]) {
    if (body[field] !== undefined) {
      if (typeof body[field] !== "boolean") {
        fail(`${field} must be a boolean`);
      }
      result[field] = body[field];
    }
  }

  if (body.icon !== undefined) {
    result.icon = parseQuizIcon(body.icon, { userId });
  }

  if (body.pages !== undefined || body.questions !== undefined) {
    result.pages = parsePages(body.pages, body.questions);
  }

  return result;
};
