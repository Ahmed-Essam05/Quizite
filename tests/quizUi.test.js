import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { JSDOM } from "jsdom";
import request from "supertest";
import { describe, expect, it } from "vitest";

import app from "../app.js";

const frontendDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "../frontend",
);
const readFrontend = (file) => readFileSync(join(frontendDir, file), "utf8");

const QUIZ_ID = "64b000000000000000000001";
const RESULT_KEY = `quizite:quiz-result:${QUIZ_ID}`;

const flush = async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
};

const buildQuiz = () => ({
  id: QUIZ_ID,
  title: "Sample quiz",
  description: "A quiz used for frontend tests.",
  status: "published",
  questionCount: 1,
  peopleTookCount: 0,
  likeCount: 0,
  allowRetakes: false,
  showCorrectAnswers: false,
  icon: { type: "emoji", value: "🚀", reference: "emoji:🚀" },
  owner: { username: "alice" },
  pages: [
    {
      id: "page-1",
      title: "Page 1",
      questions: [
        {
          id: "question-1",
          type: "multipleChoice",
          title: "What is 2 + 2?",
          choices: [
            { id: "choice-1", text: "3" },
            { id: "choice-2", text: "4" },
          ],
        },
      ],
    },
  ],
});

const jsonResponse = (body, { ok = true, status = 200 } = {}) => ({
  ok,
  status,
  json: async () => body,
});

const buildQuestion = (number, type = "multipleChoice") => {
  const id = `question-${number}`;
  if (type === "trueFalse") {
    return {
      id,
      type,
      title: `True or false ${number}?`,
      choices: [
        { id: `choice-${number}-1`, text: "True" },
        { id: `choice-${number}-2`, text: "False" },
      ],
    };
  }
  if (type === "writtenAnswer") {
    return {
      id,
      type,
      title: `Write an answer for ${number}.`,
    };
  }
  return {
    id,
    type,
    title: `Question ${number}?`,
    choices: [
      { id: `choice-${number}-1`, text: `Choice ${number}A` },
      { id: `choice-${number}-2`, text: `Choice ${number}B` },
    ],
  };
};

const buildQuizWithQuestions = (questions) => {
  const pages = [];
  for (let index = 0; index < questions.length; index += 10) {
    const pageQuestions = questions.slice(index, index + 10);
    pages.push({
      id: `page-${pages.length + 1}`,
      title: `Page ${pages.length + 1}`,
      questions: pageQuestions,
    });
  }
  return {
    ...buildQuiz(),
    questionCount: questions.length,
    pages,
  };
};

const quizDataResponse = (quiz) =>
  jsonResponse({
    data: {
      quiz,
      likedByMe: false,
      canRetake: true,
      isOwner: false,
    },
  });

const quizSuccessResponse = (quiz = buildQuiz()) => quizDataResponse(quiz);

const submitTakeForm = (window) => {
  window.document
    .querySelector("#quiz-take-form")
    .dispatchEvent(
      new window.Event("submit", { bubbles: true, cancelable: true }),
    );
};

const answerQuestion = (window, questionNumber) => {
  const card = window.document.querySelector(
    `.take-question-card[data-q-id="question-${questionNumber}"]`,
  );
  const radio = card?.querySelector('input[type="radio"]');
  if (radio) {
    radio.checked = true;
    radio.dispatchEvent(new window.Event("change", { bubbles: true }));
  }
};

const createQuizPage = (fetchImpl) => {
  const dom = new JSDOM(readFrontend("quiz.html"), {
    url: `http://localhost/quiz/${QUIZ_ID}`,
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });
  const { window } = dom;
  const navigations = [];
  const style = window.document.createElement("style");
  style.textContent = readFrontend("quiz.css");
  window.document.head.appendChild(style);

  window.matchMedia = () => ({
    matches: false,
    addListener() {},
    removeListener() {},
  });
  window.scrollTo = () => {};
  window.Element.prototype.scrollIntoView = () => {};
  Object.defineProperty(window, "location", {
    configurable: true,
    value: {
      pathname: `/quiz/${QUIZ_ID}`,
      href: `http://localhost/quiz/${QUIZ_ID}`,
      origin: "http://localhost",
      assign: (target) => navigations.push(target),
    },
  });
  window.fetch = fetchImpl;

  window.eval(readFrontend("quizResultStore.js"));
  window.eval(readFrontend("quiz.js"));

  return { dom, window, navigations };
};

const seedResult = (window, result, savedAt = Date.now()) => {
  window.sessionStorage.setItem(
    RESULT_KEY,
    JSON.stringify({ quizId: QUIZ_ID, savedAt, result }),
  );
};

const baseResult = () => ({
  quizTitle: "Sample quiz",
  score: 1,
  totalQuestions: 3,
  gradedQuestions: 2,
  percentage: 50,
  allowRetakes: true,
  showCorrectAnswers: true,
  results: [
    {
      title: "Wrong MCQ",
      graded: true,
      isCorrect: false,
      userAnswer: "3",
      correctAnswer: "4",
    },
    {
      title: "Correct MCQ",
      graded: true,
      isCorrect: true,
      userAnswer: "True",
    },
    {
      title: "Written response",
      graded: false,
      isCorrect: false,
      userAnswer: "My written answer",
    },
  ],
});

const createResultsPage = ({
  quizId = QUIZ_ID,
  result = null,
  savedAt,
  storedValue = null,
} = {}) => {
  const dom = new JSDOM(readFrontend("results.html"), {
    url: `http://localhost/quiz/${quizId}/results`,
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });
  const { window } = dom;

  window.matchMedia = () => ({
    matches: false,
    addListener() {},
    removeListener() {},
  });
  window.scrollTo = () => {};
  window.QuiziteResultStore = undefined;

  if (storedValue) {
    window.sessionStorage.setItem(RESULT_KEY, storedValue);
  } else if (result) {
    seedResult(window, result, savedAt);
  }

  window.eval(readFrontend("quizResultStore.js"));
  window.eval(readFrontend("results.js"));

  return { dom, window };
};

describe("quiz taking page", () => {
  it("shows loading only until the initial quiz request succeeds", async () => {
    let resolveFetch;
    const pendingFetch = () =>
      new Promise((resolve) => {
        resolveFetch = resolve;
      });
    const { window } = createQuizPage(pendingFetch);
    const loading = window.document.querySelector("#quiz-loading");
    const container = window.document.querySelector("#quiz-container");
    const error = window.document.querySelector("#quiz-error");

    expect(loading.hidden).toBe(false);
    expect(container.hidden).toBe(true);
    expect(error.hidden).toBe(true);

    resolveFetch(quizSuccessResponse());
    await flush();

    expect(loading.hidden).toBe(true);
    expect(window.getComputedStyle(loading).display).toBe("none");
    expect(container.hidden).toBe(false);
    expect(error.hidden).toBe(true);
  });

  it("renders the quiz icon returned by the API", async () => {
    const { window } = createQuizPage(async () => quizSuccessResponse());
    await flush();

    const icon = window.document.querySelector("#quiz-icon");
    expect(icon.hidden).toBe(false);
    expect(icon.textContent.trim()).toBe("🚀");
  });

  it("renders an uploaded quiz icon as an image", async () => {
    const quiz = buildQuiz();
    quiz.icon = {
      type: "upload",
      value:
        "/uploads/quiz-icons/64b000000000000000000001-abcdef0123456789abcdef0123456789.webp",
      reference:
        "upload:64b000000000000000000001-abcdef0123456789abcdef0123456789.webp",
    };

    const { window } = createQuizPage(async () => quizSuccessResponse(quiz));
    await flush();

    const image = window.document.querySelector("#quiz-icon img");
    expect(image?.getAttribute("src")).toBe(quiz.icon.value);
  });

  it("hides loading and shows the error state when loading fails", async () => {
    const { window } = createQuizPage(async () =>
      jsonResponse({ message: "Quiz not found" }, { ok: false, status: 404 }),
    );

    await flush();

    expect(window.document.querySelector("#quiz-loading").hidden).toBe(true);
    expect(window.document.querySelector("#quiz-container").hidden).toBe(true);
    expect(window.document.querySelector("#quiz-error").hidden).toBe(false);
    expect(window.document.querySelector("#quiz-error-msg").textContent).toBe(
      "Quiz not found",
    );
  });

  it("hides loading when the request throws unexpectedly", async () => {
    const { window } = createQuizPage(async () => {
      throw new Error("offline");
    });

    await flush();

    expect(window.document.querySelector("#quiz-loading").hidden).toBe(true);
    expect(window.document.querySelector("#quiz-error").hidden).toBe(false);
    expect(
      window.document.querySelector("#quiz-error-msg").textContent,
    ).toContain("Unable to connect");
  });

  it("does not initialize twice when the script runs again", async () => {
    let fetchCount = 0;
    const { window } = createQuizPage(async () => {
      fetchCount += 1;
      return quizSuccessResponse();
    });

    await flush();
    window.eval(readFrontend("quiz.js"));
    await flush();

    expect(fetchCount).toBe(1);
  });

  it("refreshes quiz state when restored from the back-forward cache", async () => {
    let fetchCount = 0;
    const { window } = createQuizPage(async () => {
      fetchCount += 1;
      return quizSuccessResponse();
    });

    await flush();

    const submitBtn = window.document.querySelector("#submit-quiz-btn");
    submitBtn.disabled = true;
    submitBtn.textContent = "Submitting answers…";

    const pageshow = new window.Event("pageshow");
    Object.defineProperty(pageshow, "persisted", { value: true });
    window.dispatchEvent(pageshow);

    expect(fetchCount).toBe(2);
    expect(window.document.querySelector("#quiz-loading").hidden).toBe(false);
    expect(submitBtn.disabled).toBe(false);
    expect(submitBtn.textContent.trim()).toBe("Submit Answers");

    await flush();

    expect(window.document.querySelector("#quiz-loading").hidden).toBe(true);
    expect(window.document.querySelector("#quiz-container").hidden).toBe(false);
  });

  it("submits answers, stores the result, and navigates to results", async () => {
    const requests = [];
    const { window, navigations } = createQuizPage(async (url, options) => {
      requests.push({ url, options });
      if (options?.method === "POST") {
        return jsonResponse({
          data: {
            score: 1,
            totalQuestions: 1,
            gradedQuestions: 1,
            percentage: 100,
            allowRetakes: false,
            showCorrectAnswers: false,
            countedForParticipants: true,
            peopleTookCount: 1,
            results: [
              {
                title: "What is 2 + 2?",
                graded: true,
                isCorrect: true,
                userAnswer: "4",
              },
            ],
          },
        });
      }
      return quizSuccessResponse();
    });

    await flush();
    answerQuestion(window, 1);
    submitTakeForm(window);
    await flush();

    expect(window.document.querySelector("#unanswered-modal").hidden).toBe(
      true,
    );
    const submitRequest = requests.find(
      (entry) => entry.options?.method === "POST",
    );
    expect(submitRequest.url).toBe(`/api/quizzes/${QUIZ_ID}/submit`);
    expect(navigations).toEqual([`/quiz/${QUIZ_ID}/results`]);
    expect(window.document.querySelector("#quiz-loading").hidden).toBe(true);

    const stored = JSON.parse(window.sessionStorage.getItem(RESULT_KEY));
    expect(stored.quizId).toBe(QUIZ_ID);
    expect(stored.result.score).toBe(1);
    expect(stored.result.quizTitle).toBe("Sample quiz");
    expect(stored.result.quizIcon).toEqual({
      type: "emoji",
      value: "🚀",
      reference: "emoji:🚀",
    });
  });

  it("keeps the quiz visible and resets submit state when submission fails", async () => {
    const { window, navigations } = createQuizPage(async (url, options) => {
      if (options?.method === "POST") {
        return jsonResponse(
          { message: "Retakes are not allowed" },
          { ok: false, status: 403 },
        );
      }
      return quizSuccessResponse();
    });

    await flush();
    answerQuestion(window, 1);
    submitTakeForm(window);
    await flush();

    const submitBtn = window.document.querySelector("#submit-quiz-btn");
    expect(navigations).toEqual([]);
    expect(
      window.document.querySelector(
        '.take-question-card[data-q-id="question-1"] input[type="radio"]',
      ).checked,
    ).toBe(true);
    expect(window.sessionStorage.getItem(RESULT_KEY)).toBeNull();
    expect(submitBtn.disabled).toBe(false);
    expect(submitBtn.textContent.trim()).toBe("Submit Answers");
    expect(window.document.querySelector("#toast").textContent).toBe(
      "Retakes are not allowed",
    );
    expect(window.document.querySelector("#quiz-container").hidden).toBe(false);
    expect(window.document.querySelector("#quiz-loading").hidden).toBe(true);
  });

  it("resets submit state after an unexpected submission error", async () => {
    const { window, navigations } = createQuizPage(async (url, options) => {
      if (options?.method === "POST") {
        throw new Error("network down");
      }
      return quizSuccessResponse();
    });

    await flush();
    answerQuestion(window, 1);
    submitTakeForm(window);
    await flush();

    expect(navigations).toEqual([]);
    expect(window.document.querySelector("#submit-quiz-btn").disabled).toBe(
      false,
    );
    expect(
      window.document.querySelector(
        '.take-question-card[data-q-id="question-1"] input[type="radio"]',
      ).checked,
    ).toBe(true);
    expect(window.document.querySelector("#toast").textContent).toContain(
      "network error",
    );
  });

  it("warns about one unanswered question and supports Escape dismissal", async () => {
    const requests = [];
    const { window } = createQuizPage(async (url, options) => {
      requests.push({ url, options });
      return quizSuccessResponse();
    });

    await flush();
    const submitBtn = window.document.querySelector("#submit-quiz-btn");
    submitBtn.focus();
    submitTakeForm(window);

    const modal = window.document.querySelector("#unanswered-modal");
    const reviewButton = window.document.querySelector(
      "#review-unanswered-btn",
    );
    expect(modal.hidden).toBe(false);
    expect(window.document.body.classList.contains("delete-modal-open")).toBe(
      true,
    );
    expect(
      window.document
        .querySelector("#unanswered-modal-title")
        .textContent.trim(),
    ).toBe("You have unanswered questions");
    expect(
      window.document.querySelector("#unanswered-modal-message").textContent,
    ).toBe(
      "You haven't answered Question 1. Are you sure you want to submit your quiz?",
    );
    expect(window.document.activeElement).toBe(reviewButton);
    expect(requests.some((entry) => entry.options?.method === "POST")).toBe(
      false,
    );

    reviewButton.dispatchEvent(
      new window.KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
        cancelable: true,
      }),
    );

    expect(modal.hidden).toBe(true);
    expect(window.document.body.classList.contains("delete-modal-open")).toBe(
      false,
    );
    expect(window.document.activeElement).toBe(submitBtn);
  });

  it("formats two unanswered questions and covers all question types", async () => {
    const quiz = buildQuizWithQuestions([
      buildQuestion(1),
      buildQuestion(2, "trueFalse"),
      buildQuestion(3, "writtenAnswer"),
    ]);
    const requests = [];
    const { window } = createQuizPage(async (url, options) => {
      requests.push({ url, options });
      return quizDataResponse(quiz);
    });

    await flush();
    answerQuestion(window, 1);
    submitTakeForm(window);

    expect(
      window.document.querySelector("#unanswered-modal-message").textContent,
    ).toBe(
      "You haven't answered Questions 2 and 3. Are you sure you want to submit your quiz?",
    );
    expect(
      window.document.querySelectorAll(".take-question-card.is-unanswered"),
    ).toHaveLength(2);
    expect(requests.some((entry) => entry.options?.method === "POST")).toBe(
      false,
    );
  });

  it("lists unanswered question numbers across all quiz pages", async () => {
    const questions = Array.from({ length: 12 }, (_, index) =>
      buildQuestion(index + 1),
    );
    const quiz = buildQuizWithQuestions(questions);
    const requests = [];
    const { window } = createQuizPage(async (url, options) => {
      requests.push({ url, options });
      return quizDataResponse(quiz);
    });

    await flush();
    [2, 3, 5, 6, 7, 8, 9, 10, 11].forEach((number) => {
      answerQuestion(window, number);
    });
    submitTakeForm(window);

    expect(
      window.document.querySelector("#unanswered-modal-message").textContent,
    ).toBe(
      "You haven't answered Questions 1, 4, and 12. Are you sure you want to submit your quiz?",
    );
    expect(
      window.document.querySelectorAll(".take-question-card.is-unanswered"),
    ).toHaveLength(3);
    expect(requests.some((entry) => entry.options?.method === "POST")).toBe(
      false,
    );
  });

  it("reviews the first unanswered question on its page without losing answers", async () => {
    const questions = Array.from({ length: 11 }, (_, index) =>
      buildQuestion(index + 1),
    );
    const quiz = buildQuizWithQuestions(questions);
    const { window } = createQuizPage(async () => quizDataResponse(quiz));

    await flush();
    for (let number = 1; number <= 10; number += 1) {
      answerQuestion(window, number);
    }
    const firstAnswer = window.document.querySelector(
      '.take-question-card[data-q-id="question-1"] input[type="radio"]',
    );
    expect(firstAnswer.checked).toBe(true);

    submitTakeForm(window);
    window.document.querySelector("#review-unanswered-btn").click();

    const pageSections = window.document.querySelectorAll(".take-page-section");
    expect(pageSections[0].hidden).toBe(true);
    expect(pageSections[1].hidden).toBe(false);
    expect(
      window.document.querySelector("#quiz-page-indicator").textContent,
    ).toBe("Page 2 of 2");
    expect(
      window.document.querySelector(
        '.take-question-card[data-q-id="question-11"] input[type="radio"]',
      ),
    ).toBe(window.document.activeElement);
    expect(firstAnswer.checked).toBe(true);
    expect(window.document.querySelector("#unanswered-modal").hidden).toBe(
      true,
    );
    expect(
      window.document
        .querySelector('.take-question-card[data-q-id="question-11"]')
        .classList.contains("is-unanswered"),
    ).toBe(true);
  });

  it("submits anyway once and navigates while omitting unanswered answers", async () => {
    const quiz = buildQuizWithQuestions([buildQuestion(1), buildQuestion(2)]);
    const requests = [];
    const { window, navigations } = createQuizPage(async (url, options) => {
      requests.push({ url, options });
      if (options?.method === "POST") {
        return jsonResponse({
          data: {
            score: 1,
            totalQuestions: 2,
            gradedQuestions: 2,
            percentage: 50,
            allowRetakes: true,
            showCorrectAnswers: false,
            results: [
              {
                title: "Question 1?",
                graded: true,
                isCorrect: true,
                userAnswer: "Choice 1A",
              },
              {
                title: "Question 2?",
                graded: true,
                isCorrect: false,
                userAnswer: "No answer",
              },
            ],
          },
        });
      }
      return quizDataResponse(quiz);
    });

    await flush();
    answerQuestion(window, 1);
    submitTakeForm(window);

    const submitAnyway = window.document.querySelector("#submit-anyway-btn");
    submitAnyway.click();
    submitAnyway.click();
    await flush();

    const submitRequests = requests.filter(
      (entry) => entry.options?.method === "POST",
    );
    expect(submitRequests).toHaveLength(1);
    expect(JSON.parse(submitRequests[0].options.body).answers).toEqual([
      { questionId: "question-1", choiceId: "choice-1-1" },
    ]);
    expect(navigations).toEqual([`/quiz/${QUIZ_ID}/results`]);
    expect(window.document.querySelector("#unanswered-modal").hidden).toBe(
      true,
    );
  });

  it("keeps answers when submit-anyway fails and allows retrying", async () => {
    const quiz = buildQuizWithQuestions([buildQuestion(1), buildQuestion(2)]);
    const { window, navigations } = createQuizPage(async (url, options) => {
      if (options?.method === "POST") {
        return jsonResponse(
          { message: "Unable to submit right now" },
          { ok: false, status: 500 },
        );
      }
      return quizDataResponse(quiz);
    });

    await flush();
    answerQuestion(window, 1);
    submitTakeForm(window);
    window.document.querySelector("#submit-anyway-btn").click();
    await flush();

    expect(navigations).toEqual([]);
    expect(window.document.querySelector("#toast").textContent).toBe(
      "Unable to submit right now",
    );
    expect(
      window.document.querySelector(
        '.take-question-card[data-q-id="question-1"] input[type="radio"]',
      ).checked,
    ).toBe(true);
    expect(window.document.querySelector("#submit-quiz-btn").disabled).toBe(
      false,
    );
  });
});

describe("quiz results page", () => {
  it("renders score, breakdown, and actions from stored results", () => {
    const { window } = createResultsPage({ result: baseResult() });

    expect(window.document.querySelector("#results-error").hidden).toBe(true);
    expect(window.document.querySelector("#results-container").hidden).toBe(
      false,
    );
    expect(
      window.document.querySelector("#results-quiz-title").textContent,
    ).toBe("Sample quiz");
    expect(
      window.document.querySelector("#results-score-count").textContent,
    ).toBe("1");
    expect(
      window.document.querySelector("#results-total-count").textContent,
    ).toBe("2");
    expect(
      window.document.querySelector("#results-percentage").textContent,
    ).toBe("50%");

    const text = window.document.querySelector(
      "#results-breakdown-list",
    ).textContent;
    expect(text).toContain("Wrong MCQ");
    expect(text).toContain("Correct answer: 4");
    expect(text).not.toContain("Accepted answers");
    expect(text).toContain("Not graded");
    expect(text).toContain("My written answer");
    expect(
      window.document.querySelector("#return-to-quiz-link").textContent.trim(),
    ).toBe("Retake quiz");
    expect(window.sessionStorage.getItem(RESULT_KEY)).not.toBeNull();
  });

  it("shows only the first accepted answer for an incorrect written response", () => {
    const result = baseResult();
    result.results.push({
      title: "Wrong written response",
      graded: true,
      isCorrect: false,
      userAnswer: "Python",
      correctAnswer: "JavaScript",
      acceptedAnswers: ["JavaScript", "JS"],
    });

    const { window } = createResultsPage({ result });
    const text = window.document.querySelector(
      "#results-breakdown-list",
    ).textContent;

    expect(text).toContain("Correct answer: JavaScript");
    expect(text).not.toContain("JS");
    expect(text).not.toContain("Accepted answers");
  });

  it("keeps results available after refreshing the same tab", () => {
    const first = createResultsPage({ result: baseResult() });
    const storedValue = first.window.sessionStorage.getItem(RESULT_KEY);

    const refreshed = createResultsPage({ storedValue });

    expect(
      refreshed.window.document.querySelector("#results-container").hidden,
    ).toBe(false);
    expect(
      refreshed.window.document.querySelector("#results-score-count")
        .textContent,
    ).toBe("1");
    expect(
      refreshed.window.document.querySelector("#results-breakdown-list")
        .textContent,
    ).toContain("Correct answer: 4");
  });

  it("never reveals answer keys when showCorrectAnswers is disabled", () => {
    const result = baseResult();
    result.showCorrectAnswers = false;

    const { window } = createResultsPage({ result });
    const text = window.document.querySelector(
      "#results-breakdown-list",
    ).textContent;

    expect(text).not.toContain("Correct answer");
    expect(text).not.toContain("Sample answer");
    expect(text).toContain("Your answer: 3");
  });

  it("shows a clear error when result data is missing or expired", () => {
    const missing = createResultsPage();
    expect(
      missing.window.document.querySelector("#results-container").hidden,
    ).toBe(true);
    expect(missing.window.document.querySelector("#results-error").hidden).toBe(
      false,
    );
    expect(
      missing.window.document.querySelector("#results-error-msg").textContent,
    ).toContain("no longer available");

    const expired = createResultsPage({
      result: baseResult(),
      savedAt: Date.now() - 60 * 60 * 1000 - 1,
    });
    expect(expired.window.document.querySelector("#results-error").hidden).toBe(
      false,
    );
    expect(expired.window.sessionStorage.getItem(RESULT_KEY)).toBeNull();
  });

  it("rejects invalid quiz IDs instead of rendering stale results", () => {
    const { window } = createResultsPage({ quizId: "not-an-object-id" });

    expect(window.document.querySelector("#results-container").hidden).toBe(
      true,
    );
    expect(
      window.document.querySelector("#results-error-msg").textContent,
    ).toContain("invalid");
  });
});

describe("results page route", () => {
  it("serves the dedicated results document", async () => {
    const response = await request(app).get(`/quiz/${QUIZ_ID}/results`);

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toContain("text/html");
    expect(response.text).toContain('id="results-container"');
  });
});
