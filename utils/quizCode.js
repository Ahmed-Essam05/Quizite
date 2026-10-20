import { randomInt } from "node:crypto";

export const QUIZ_CODE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
export const QUIZ_CODE_LENGTH = 8;
export const QUIZ_CODE_PATTERN = /^[A-Z0-9]{8}$/;
export const QUIZ_CODE_MAX_ATTEMPTS = 10;

export const generateQuizCode = () => {
  let code = "";
  for (let index = 0; index < QUIZ_CODE_LENGTH; index += 1) {
    code += QUIZ_CODE_ALPHABET[randomInt(QUIZ_CODE_ALPHABET.length)];
  }
  return code;
};

export const normalizeQuizCode = (value) =>
  String(value ?? "")
    .trim()
    .toUpperCase();

export const isValidQuizCode = (value) =>
  typeof value === "string" && QUIZ_CODE_PATTERN.test(value);

export const isDuplicateShareCodeError = (error) =>
  error?.code === 11000 &&
  Boolean(error.keyPattern?.shareCode || error.keyValue?.shareCode);

export const saveWithUniqueShareCode = async (
  quiz,
  {
    maxAttempts = QUIZ_CODE_MAX_ATTEMPTS,
    generateCode = generateQuizCode,
  } = {},
) => {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (!quiz.shareCode) {
      quiz.shareCode = generateCode();
    }

    try {
      await quiz.save();
      return quiz;
    } catch (error) {
      if (!isDuplicateShareCodeError(error)) {
        throw error;
      }
      if (attempt === maxAttempts - 1) {
        throw error;
      }
      quiz.shareCode = generateCode();
    }
  }

  return quiz;
};
