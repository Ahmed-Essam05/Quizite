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

const quizSuccessResponse = () =>
  jsonResponse({
    data: {
      quiz: buildQuiz(),
      likedByMe: false,
      canRetake: true,
      isOwner: false,
    },
  });

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
      acceptedAnswers: ["Sample answer"],
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
    window.document
      .querySelector("#quiz-take-form")
      .dispatchEvent(
        new window.Event("submit", { bubbles: true, cancelable: true }),
      );
    await flush();

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
    window.document
      .querySelector("#quiz-take-form")
      .dispatchEvent(
        new window.Event("submit", { bubbles: true, cancelable: true }),
      );
    await flush();

    const submitBtn = window.document.querySelector("#submit-quiz-btn");
    expect(navigations).toEqual([]);
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
    window.document
      .querySelector("#quiz-take-form")
      .dispatchEvent(
        new window.Event("submit", { bubbles: true, cancelable: true }),
      );
    await flush();

    expect(navigations).toEqual([]);
    expect(window.document.querySelector("#submit-quiz-btn").disabled).toBe(
      false,
    );
    expect(window.document.querySelector("#toast").textContent).toContain(
      "network error",
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
    expect(text).toContain("Accepted answers: Sample answer");
    expect(text).toContain("Not graded");
    expect(text).toContain("My written answer");
    expect(
      window.document.querySelector("#return-to-quiz-link").textContent.trim(),
    ).toBe("Retake quiz");
    expect(window.sessionStorage.getItem(RESULT_KEY)).not.toBeNull();
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
