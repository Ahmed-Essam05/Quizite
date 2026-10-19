import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

const frontendDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "../frontend",
);
const readFrontend = (file) => readFileSync(join(frontendDir, file), "utf8");

const flush = async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
};

const jsonResponse = (body, { ok = true, status = 200 } = {}) => ({
  ok,
  status,
  json: async () => body,
});

const now = new Date().toISOString();

const dashboardQuizzes = () => [
  {
    id: "64b000000000000000000011",
    title: "Locked quiz",
    description: "Retakes are disabled.",
    status: "published",
    questionCount: 3,
    likeCount: 1,
    likedByMe: true,
    allowRetakes: false,
    completedByMe: true,
    attempts: 1,
    lastPercentage: 100,
    lastCompletedAt: now,
    updatedAt: now,
  },
  {
    id: "64b000000000000000000012",
    title: "Retakeable quiz",
    description: "Retakes are enabled.",
    status: "published",
    questionCount: 4,
    likeCount: 1,
    likedByMe: true,
    allowRetakes: true,
    completedByMe: true,
    attempts: 2,
    lastPercentage: 75,
    lastCompletedAt: now,
    updatedAt: now,
  },
  {
    id: "64b000000000000000000013",
    title: "Uncompleted quiz",
    description: "Not taken yet.",
    status: "published",
    questionCount: 5,
    likeCount: 1,
    likedByMe: true,
    allowRetakes: false,
    completedByMe: false,
    attempts: 0,
    lastPercentage: null,
    lastCompletedAt: null,
    updatedAt: now,
  },
];

const createOverviewPage = () => {
  const dom = new JSDOM(readFrontend("overview.html"), {
    url: "http://localhost/",
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });
  const { window } = dom;
  const quizzes = dashboardQuizzes();

  window.matchMedia = () => ({
    matches: false,
    addListener() {},
    removeListener() {},
  });
  window.scrollTo = () => {};
  window.document.cookie = `quizite_user=${encodeURIComponent(
    JSON.stringify({ username: "alice" }),
  )}; Path=/`;
  window.document.cookie = "jwt=test-token; Path=/";

  window.fetch = async (url) => {
    const requestUrl = String(url);
    if (requestUrl.startsWith("/api/overview")) {
      return jsonResponse({
        data: {
          user: { username: "alice" },
          quizzes,
          likedQuizCount: quizzes.length,
        },
        meta: { page: 1, totalPages: 1 },
      });
    }
    if (requestUrl.startsWith("/api/users/me/liked")) {
      return jsonResponse({
        data: { quizzes },
        meta: { page: 1, totalPages: 1, total: quizzes.length },
      });
    }
    if (requestUrl.startsWith("/api/users/me/completed")) {
      return jsonResponse({
        data: {
          quizzes: quizzes.filter((quiz) => quiz.completedByMe),
        },
      });
    }
    return jsonResponse({ message: "Not found" }, { ok: false, status: 404 });
  };

  window.eval(readFrontend("overview.js"));

  return { dom, window };
};

const clickSection = async (window, section) => {
  window.document
    .querySelector(`[data-section="${section}"]`)
    .dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await flush();
};

const getCard = (window, label) =>
  window.document.querySelector(`[aria-label="${label}"]`);

const takeLabels = (card) =>
  Array.from(card.querySelectorAll("a.btn-subtle"))
    .map((link) => link.textContent.trim())
    .filter((label) => label === "Take quiz" || label === "Take again");

describe("overview take actions", () => {
  it("applies take, retake, and hidden actions consistently across sections", async () => {
    const { window } = createOverviewPage();

    await flush();

    const ownedLocked = getCard(window, "Quiz: Locked quiz");
    const ownedRetakeable = getCard(window, "Quiz: Retakeable quiz");
    const ownedUncompleted = getCard(window, "Quiz: Uncompleted quiz");

    expect(takeLabels(ownedLocked)).toEqual([]);
    expect(ownedLocked.querySelector("[data-action='copy-link']")).not.toBe(
      null,
    );
    expect(takeLabels(ownedRetakeable)).toEqual(["Take again"]);
    expect(takeLabels(ownedUncompleted)).toEqual(["Take quiz"]);

    await clickSection(window, "liked");

    const likedLocked = getCard(window, "Liked quiz: Locked quiz");
    const likedRetakeable = getCard(window, "Liked quiz: Retakeable quiz");
    const likedUncompleted = getCard(window, "Liked quiz: Uncompleted quiz");

    expect(takeLabels(likedLocked)).toEqual([]);
    expect(likedLocked.querySelector(".quiz-card-actions")).toBeNull();
    expect(takeLabels(likedRetakeable)).toEqual(["Take again"]);
    expect(takeLabels(likedUncompleted)).toEqual(["Take quiz"]);

    await clickSection(window, "taken");

    const takenLocked = getCard(window, "Taken quiz: Locked quiz");
    const takenRetakeable = getCard(window, "Taken quiz: Retakeable quiz");

    expect(takenLocked).toBeTruthy();
    expect(takeLabels(takenLocked)).toEqual([]);
    expect(takenLocked.querySelector(".quiz-card-actions")).toBeNull();
    expect(takeLabels(takenRetakeable)).toEqual(["Take again"]);
    expect(getCard(window, "Taken quiz: Uncompleted quiz")).toBeNull();

    expect(takenLocked.textContent).toContain("1 attempt");
    expect(takenLocked.textContent).toContain("Last score: 100%");
  });
});
