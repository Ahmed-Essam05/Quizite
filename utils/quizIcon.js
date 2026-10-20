import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";

import __dirname from "../dirname.js";
import AppError from "./appError.js";

export const QUIZ_ICON_EMOJIS = [
  "✨",
  "🚀",
  "💡",
  "🎨",
  "🍿",
  "🎉",
  "🌟",
  "🎈",
  "🧠",
  "🎯",
];

export const DEFAULT_QUIZ_ICON = "✨";
export const MAX_QUIZ_ICON_BYTES = 2 * 1024 * 1024;
export const QUIZ_ICON_PIXELS = 256;

const EMOJI_PREFIX = "emoji:";
const UPLOAD_PREFIX = "upload:";
const UPLOADED_FILE_PATTERN = /^([a-f0-9]{24})-([a-f0-9]{32})\.webp$/;
const ALLOWED_IMAGE_FORMATS = new Set(["jpeg", "png", "webp"]);

export const QUIZ_ICONS_DIR = path.join(__dirname, "uploads", "quiz-icons");

const isAllowedEmoji = (value) => QUIZ_ICON_EMOJIS.includes(value);

const parseUploadedFilename = (value) => {
  if (typeof value !== "string" || !value.startsWith(UPLOAD_PREFIX)) {
    return null;
  }
  const filename = value.slice(UPLOAD_PREFIX.length);
  return UPLOADED_FILE_PATTERN.test(filename) ? filename : null;
};

export const isUploadIconReference = (value) =>
  parseUploadedFilename(value) !== null;

export const isValidQuizIconValue = (value) => {
  if (value === null || value === undefined) return true;
  if (typeof value !== "string") return false;

  if (value.startsWith(EMOJI_PREFIX)) {
    return isAllowedEmoji(value.slice(EMOJI_PREFIX.length));
  }

  return isUploadIconReference(value);
};

export const parseQuizIcon = (value, { userId } = {}) => {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;

  if (typeof value !== "string") {
    throw new AppError("Quiz icon must be text", 400);
  }

  const trimmed = value.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith(EMOJI_PREFIX)) {
    const emoji = trimmed.slice(EMOJI_PREFIX.length);
    if (!isAllowedEmoji(emoji)) {
      throw new AppError("Choose a supported quiz icon", 400);
    }
    return `${EMOJI_PREFIX}${emoji}`;
  }

  if (isAllowedEmoji(trimmed)) {
    return `${EMOJI_PREFIX}${trimmed}`;
  }

  const filename = parseUploadedFilename(trimmed);
  if (filename) {
    const [ownerId] = filename.split("-");
    if (userId && ownerId !== String(userId)) {
      throw new AppError("The uploaded quiz icon is invalid", 400);
    }
    return `${UPLOAD_PREFIX}${filename}`;
  }

  throw new AppError("Choose a supported quiz icon", 400);
};

export const serializeQuizIcon = (value) => {
  const filename = parseUploadedFilename(value);
  if (filename) {
    return {
      type: "upload",
      value: `/uploads/quiz-icons/${filename}`,
      reference: value,
    };
  }

  const hasEmojiValue =
    typeof value === "string" && value.startsWith(EMOJI_PREFIX);
  const emoji = hasEmojiValue
    ? value.slice(EMOJI_PREFIX.length)
    : DEFAULT_QUIZ_ICON;
  const isStoredEmoji = hasEmojiValue && isAllowedEmoji(emoji);

  return {
    type: "emoji",
    value: isStoredEmoji ? emoji : DEFAULT_QUIZ_ICON,
    reference: isStoredEmoji ? `${EMOJI_PREFIX}${emoji}` : null,
  };
};

export const getQuizIconFilePath = (filename) =>
  path.join(QUIZ_ICONS_DIR, filename);

export const quizIconFileExists = async (value) => {
  const filename = parseUploadedFilename(value);
  if (!filename) return false;

  try {
    await fs.access(getQuizIconFilePath(filename));
    return true;
  } catch {
    return false;
  }
};

export const saveQuizIconImage = async (buffer, userId) => {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new AppError("Please choose an image to upload", 400);
  }

  let metadata;
  try {
    metadata = await sharp(buffer, {
      limitInputPixels: 40_000_000,
    }).metadata();
  } catch {
    throw new AppError("Please upload a valid PNG, JPEG, or WebP image", 400);
  }

  if (!ALLOWED_IMAGE_FORMATS.has(metadata.format)) {
    throw new AppError("Please upload a PNG, JPEG, or WebP image", 400);
  }

  const filename = `${String(userId)}-${crypto
    .randomBytes(16)
    .toString("hex")}.webp`;

  await fs.mkdir(QUIZ_ICONS_DIR, { recursive: true });

  try {
    await sharp(buffer, { limitInputPixels: 40_000_000 })
      .rotate()
      .resize(QUIZ_ICON_PIXELS, QUIZ_ICON_PIXELS, {
        fit: "cover",
        position: "center",
      })
      .webp({ quality: 82 })
      .toFile(getQuizIconFilePath(filename));
  } catch {
    throw new AppError(
      "That image could not be processed. Please try another file.",
      400,
    );
  }

  return `${UPLOAD_PREFIX}${filename}`;
};

export const deleteQuizIconFile = async (value) => {
  const filename = parseUploadedFilename(value);
  if (!filename) return;

  try {
    await fs.unlink(getQuizIconFilePath(filename));
  } catch (error) {
    if (error?.code !== "ENOENT") {
      return;
    }
  }
};
