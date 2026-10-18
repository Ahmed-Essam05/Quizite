import request from "supertest";

import app from "../../app.js";

export const registerUser = async ({
  username = "tester",
  email = "tester@example.com",
  password = "password123",
} = {}) => {
  const response = await request(app)
    .post("/api/auth/signup")
    .send({ username, email, password });

  return { response, user: response.body?.data?.user };
};

export const registerAgent = async (details = {}, target = app) => {
  const agent = request.agent(target);
  const { username, email, password } = {
    username: "tester",
    email: "tester@example.com",
    password: "password123",
    ...details,
  };

  const response = await agent
    .post("/api/auth/signup")
    .send({ username, email, password });

  return { agent, response, user: response.body?.data?.user };
};

export const buildMcqQuestion = (overrides = {}) => ({
  type: "multipleChoice",
  title: "What is 2 + 2?",
  choices: [{ text: "3" }, { text: "4" }, { text: "5" }],
  correctChoiceIndex: 1,
  ...overrides,
});

export const buildTrueFalseQuestion = (overrides = {}) => ({
  type: "trueFalse",
  title: "The sky is blue.",
  correctAnswer: "True",
  ...overrides,
});

export const buildWrittenQuestion = (overrides = {}) => ({
  type: "writtenAnswer",
  title: "Name a programming language.",
  acceptedAnswers: ["JavaScript"],
  ...overrides,
});

export const createQuizViaApi = async (
  agent,
  {
    title = "Sample quiz",
    status = "published",
    questions = [buildMcqQuestion()],
    ...rest
  } = {},
) => {
  const response = await agent
    .post("/api/quizzes")
    .send({ title, status, questions, ...rest });

  return response;
};
