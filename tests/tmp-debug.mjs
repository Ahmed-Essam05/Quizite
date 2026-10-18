import "./setup.js";
import request from "supertest";
import app from "../app.js";
import User from "../model/userModel.js";
import { connectTestDB, disconnectTestDB } from "./helpers/db.js";
import { registerAgent, createQuizViaApi } from "./helpers/factories.js";

await connectTestDB();

const { agent } = await registerAgent();
const created = await createQuizViaApi(agent, { allowRetakes: true });
const quizId = created.body.data.quiz.id;
const quiz = (await agent.get(`/api/quizzes/${quizId}`)).body.data.quiz;
const answers = quiz.pages[0].questions.map((q) => ({
  questionId: q.id,
  choiceId: q.choices.find((c) => c.id === q.correctChoiceId).id,
}));

const first = await agent.post(`/api/quizzes/${quizId}/submit`).send({ answers });
console.log("first", first.status, first.body.data.countedForParticipants);

const userAfterFirst = await User.findOne({ username: "tester" });
console.log("completed after first:", userAfterFirst.completedQuizzes);

const second = await agent.post(`/api/quizzes/${quizId}/submit`).send({ answers });
console.log("second", second.status, second.body.data.countedForParticipants, second.body.data.peopleTookCount);

const bad = await agent
  .post(`/api/quizzes/${quizId}/submit`)
  .send({ answers: [{ nope: true }] });
console.log("bad", bad.status, bad.body.message ?? bad.body);

await disconnectTestDB();
