import mongoose from "mongoose";

import QuizAttempt from "../model/quizAttemptModel.js";

const toObjectId = (value) => {
  if (value instanceof mongoose.Types.ObjectId) return value;
  const stringValue = String(value ?? "");
  if (!mongoose.Types.ObjectId.isValid(stringValue)) return null;
  return new mongoose.Types.ObjectId(stringValue);
};

export const getUniqueParticipantCounts = async (quizIds = []) => {
  const ids = [
    ...new Set(
      quizIds
        .map(toObjectId)
        .filter(Boolean)
        .map((id) => String(id)),
    ),
  ].map((id) => new mongoose.Types.ObjectId(id));

  const counts = new Map();
  if (ids.length === 0) return counts;

  const rows = await QuizAttempt.aggregate([
    {
      $match: {
        quiz: { $in: ids },
        user: { $ne: null },
        completedAt: { $ne: null },
      },
    },
    { $group: { _id: { quiz: "$quiz", user: "$user" } } },
    { $group: { _id: "$_id.quiz", count: { $sum: 1 } } },
  ]);

  for (const row of rows) {
    counts.set(String(row._id), row.count);
  }

  return counts;
};

export const getUniqueParticipantCount = async (quizId) => {
  const counts = await getUniqueParticipantCounts([quizId]);
  return counts.get(String(quizId)) || 0;
};
