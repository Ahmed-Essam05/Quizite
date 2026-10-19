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

const createOverviewPage = ({ deleteResponses = [] } = {}) => {
  const dom = new JSDOM(readFrontend("overview.html"), {
    url: "http://localhost/",
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });
  const { window } = dom;
  let quizzes = dashboardQuizzes();
  const deletes = [];
  const pendingDeleteResponses = [...deleteResponses];

  window.matchMedia = () => ({
    matches: false,
    addListener() {},
    removeListener() {},
  });
  window.scrollTo = () => {};
  window.confirm = () => {
    throw new Error("Native browser confirmation should not be used");
  };
  window.document.cookie = `quizite_user=${encodeURIComponent(
    JSON.stringify({ username: "alice" }),
  )}; Path=/`;
  window.document.cookie = "jwt=test-token; Path=/";

  window.fetch = async (url, options = {}) => {
    const requestUrl = String(url);

    if (options.method === "DELETE") {
      deletes.push({ url: requestUrl, options });
      const nextResponse = pendingDeleteResponses.shift() || { status: 204 };

      if (nextResponse.status === 204) {
        const quizId = requestUrl.split("/").pop();
        quizzes = quizzes.filter((quiz) => quiz.id !== quizId);
        return { ok: true, status: 204, json: async () => null };
      }

      return jsonResponse(
        nextResponse.body || { message: "Could not delete this quiz." },
        { ok: false, status: nextResponse.status },
      );
    }

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

  return { dom, window, deletes };
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

const openDeleteDialog = (window) => {
  const card = getCard(window, "Quiz: Locked quiz");
  const trigger = card.querySelector("[data-action='delete']");
  const modal = window.document.querySelector("#delete-quiz-modal");
  const dialog = modal.querySelector("[role='dialog']");
  const cancel = window.document.querySelector("#delete-modal-cancel");
  const confirm = window.document.querySelector("#delete-modal-confirm");

  trigger.focus();
  trigger.click();

  return { card, trigger, modal, dialog, cancel, confirm };
};

describe("overview delete confirmation", () => {
  it("opens an accessible modal and closes from cancel, backdrop, and Escape", async () => {
    const { window, deletes } = createOverviewPage();

    await flush();

    const first = openDeleteDialog(window);
    const description = window.document.querySelector(
      "#delete-modal-description",
    );

    expect(first.modal.hidden).toBe(false);
    expect(first.dialog.getAttribute("aria-modal")).toBe("true");
    expect(first.dialog.getAttribute("aria-labelledby")).toBe(
      "delete-modal-title",
    );
    expect(first.dialog.getAttribute("aria-describedby")).toBe(
      "delete-modal-description",
    );
    expect(
      window.document.querySelector("#delete-modal-title").textContent.trim(),
    ).toBe("Delete this quiz?");
    expect(
      window.document.querySelector("#delete-modal-quiz-title").textContent,
    ).toBe("Locked quiz");
    expect(description.textContent).toContain("permanently deleted");
    expect(description.textContent).toContain("cannot be undone");
    expect(window.document.activeElement).toBe(first.cancel);

    first.confirm.focus();
    first.confirm.dispatchEvent(
      new window.KeyboardEvent("keydown", {
        key: "Tab",
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(window.document.activeElement).toBe(first.cancel);

    first.cancel.click();
    expect(first.modal.hidden).toBe(true);
    expect(window.document.activeElement).toBe(first.trigger);
    expect(deletes).toHaveLength(0);

    first.trigger.click();
    expect(first.modal.hidden).toBe(false);
    first.modal.dispatchEvent(
      new window.MouseEvent("click", { bubbles: true }),
    );
    expect(first.modal.hidden).toBe(true);
    expect(window.document.activeElement).toBe(first.trigger);

    first.trigger.click();
    expect(first.modal.hidden).toBe(false);
    first.dialog.dispatchEvent(
      new window.KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(first.modal.hidden).toBe(true);
    expect(window.document.activeElement).toBe(first.trigger);
    expect(deletes).toHaveLength(0);
  });

  it("deletes once, shows progress, removes the card, and shows success", async () => {
    const { window, deletes } = createOverviewPage();

    await flush();

    const { trigger, modal, confirm } = openDeleteDialog(window);
    confirm.click();

    expect(confirm.disabled).toBe(true);
    expect(confirm.textContent.trim()).toBe("Deleting…");
    expect(deletes).toHaveLength(1);

    confirm.click();
    expect(deletes).toHaveLength(1);

    await flush();

    expect(modal.hidden).toBe(true);
    expect(getCard(window, "Quiz: Locked quiz")).toBeNull();
    expect(deletes[0].url).toBe("/api/quizzes/64b000000000000000000011");
    expect(deletes[0].options.method).toBe("DELETE");
    expect(window.document.querySelector("#toast").textContent).toBe(
      "Quiz deleted.",
    );
    expect(window.document.activeElement.id).toBe("main-content");
    expect(trigger.isConnected).toBe(false);
  });

  it("keeps the card and modal open on failure, then allows retry", async () => {
    const { window, deletes } = createOverviewPage({
      deleteResponses: [
        { status: 500, body: { message: "Deletion failed" } },
        { status: 204 },
      ],
    });

    await flush();

    const { modal, confirm } = openDeleteDialog(window);
    confirm.click();
    await flush();

    const error = window.document.querySelector("#delete-modal-error");
    expect(modal.hidden).toBe(false);
    expect(error.hidden).toBe(false);
    expect(error.textContent).toBe("Deletion failed");
    expect(getCard(window, "Quiz: Locked quiz")).not.toBeNull();
    expect(confirm.disabled).toBe(false);
    expect(confirm.textContent.trim()).toBe("Delete quiz");
    expect(deletes).toHaveLength(1);

    confirm.click();
    await flush();

    expect(modal.hidden).toBe(true);
    expect(getCard(window, "Quiz: Locked quiz")).toBeNull();
    expect(deletes).toHaveLength(2);
  });
});
