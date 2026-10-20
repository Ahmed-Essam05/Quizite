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
    icon: { type: "emoji", value: "🚀", reference: "emoji:🚀" },
    status: "published",
    questionCount: 3,
    likeCount: 1,
    likedByMe: true,
    owner: { id: "user-alice", username: "alice" },
    allowRetakes: false,
    completedByMe: true,
    peopleTookCount: 3,
    attempts: 1,
    lastPercentage: 100,
    lastCompletedAt: now,
    updatedAt: now,
    shareUrl: "/quiz/64b000000000000000000011",
    shareCode: "A7K9P2XZ",
  },
  {
    id: "64b000000000000000000012",
    title: "Retakeable quiz",
    description: "Retakes are enabled.",
    icon: {
      type: "upload",
      value:
        "/uploads/quiz-icons/64b000000000000000000012-abcdef0123456789abcdef0123456789.webp",
      reference:
        "upload:64b000000000000000000012-abcdef0123456789abcdef0123456789.webp",
    },
    status: "published",
    questionCount: 4,
    likeCount: 1,
    likedByMe: true,
    owner: { id: "user-alice", username: "alice" },
    allowRetakes: true,
    completedByMe: true,
    peopleTookCount: 2,
    attempts: 2,
    lastPercentage: 75,
    lastCompletedAt: now,
    updatedAt: now,
    shareUrl: "/quiz/64b000000000000000000012",
    shareCode: "B8L0Q3WY",
  },
  {
    id: "64b000000000000000000013",
    title: "Uncompleted quiz",
    description: "Not taken yet.",
    status: "published",
    questionCount: 5,
    likeCount: 1,
    likedByMe: true,
    owner: { id: "user-alice", username: "alice" },
    allowRetakes: false,
    completedByMe: false,
    peopleTookCount: 1,
    attempts: 0,
    lastPercentage: null,
    lastCompletedAt: null,
    updatedAt: now,
    shareUrl: "/quiz/64b000000000000000000013",
    shareCode: "C9M1R4XZ",
  },
];

const createOverviewPage = ({
  deleteResponses = [],
  joinResponses = [],
  likesResponses = [],
  clipboardWrites = [],
  quizzes: initialQuizzes = dashboardQuizzes(),
} = {}) => {
  const dom = new JSDOM(readFrontend("overview.html"), {
    url: "http://localhost/",
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });
  const { window } = dom;
  let quizzes = initialQuizzes;
  const deletes = [];
  const joins = [];
  const likes = [];
  const navigations = [];
  const pendingDeleteResponses = [...deleteResponses];
  const pendingJoinResponses = [...joinResponses];
  const pendingLikesResponses = [...likesResponses];

  window.matchMedia = () => ({
    matches: false,
    addListener() {},
    removeListener() {},
  });
  window.scrollTo = () => {};
  window.confirm = () => {
    throw new Error("Native browser confirmation should not be used");
  };
  window.alert = () => {
    throw new Error("Native browser alerts should not be used");
  };
  window.prompt = () => {
    throw new Error("Native browser prompts should not be used");
  };
  Object.defineProperty(window, "location", {
    configurable: true,
    value: {
      origin: "http://localhost",
      pathname: "/",
      href: "http://localhost/",
      assign: (target) => navigations.push(target),
    },
  });
  Object.defineProperty(window.navigator, "clipboard", {
    configurable: true,
    value: {
      writeText: async (value) => {
        clipboardWrites.push(String(value));
      },
    },
  });
  window.document.cookie = `quizite_user=${encodeURIComponent(
    JSON.stringify({ id: "user-alice", username: "alice" }),
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

    if (requestUrl.startsWith("/api/quizzes/code/")) {
      const request = { url: requestUrl, options };
      joins.push(request);
      const nextResponse = pendingJoinResponses.shift();
      return (
        nextResponse ||
        jsonResponse(
          { message: "No quiz found with that code." },
          {
            ok: false,
            status: 404,
          },
        )
      );
    }

    if (/^\/api\/quizzes\/[^/]+\/likes$/.test(requestUrl)) {
      likes.push({ url: requestUrl, options });
      const nextResponse = pendingLikesResponses.shift();
      if (nextResponse) return nextResponse;
      return jsonResponse({
        data: {
          quiz: { id: requestUrl.split("/")[4], title: "Liked quiz" },
          likeCount: 0,
          likers: [],
        },
      });
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

  window.eval(readFrontend("likesModal.js"));
  window.eval(readFrontend("overview.js"));

  return {
    dom,
    window,
    deletes,
    joins,
    likes,
    navigations,
    clipboardWrites,
  };
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
    expect(ownedLocked.querySelector("[data-action='share']")).not.toBe(null);
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

describe("overview quiz icons", () => {
  it("renders built-in, uploaded, and default icons consistently", async () => {
    const { window } = createOverviewPage();
    await flush();

    const builtIn = getCard(window, "Quiz: Locked quiz").querySelector(
      ".quiz-sticker",
    );
    expect(builtIn.textContent.trim()).toBe("🚀");
    expect(builtIn.getAttribute("aria-hidden")).toBe("true");

    const uploaded = getCard(window, "Quiz: Retakeable quiz").querySelector(
      ".quiz-sticker--image img",
    );
    expect(uploaded?.getAttribute("src")).toBe(
      "/uploads/quiz-icons/64b000000000000000000012-abcdef0123456789abcdef0123456789.webp",
    );

    const fallback = getCard(window, "Quiz: Uncompleted quiz").querySelector(
      ".quiz-sticker",
    );
    expect(fallback.textContent.trim()).toBe("✨");

    await clickSection(window, "liked");
    const likedUploaded = getCard(
      window,
      "Liked quiz: Retakeable quiz",
    ).querySelector(".quiz-sticker--image img");
    expect(likedUploaded?.getAttribute("src")).toBe(
      uploaded?.getAttribute("src"),
    );
  });
});

describe("overview participant and likes stats", () => {
  it("shows the unique participant count on owned cards", async () => {
    const { window } = createOverviewPage();

    await flush();

    const locked = getCard(window, "Quiz: Locked quiz");
    const retakeable = getCard(window, "Quiz: Retakeable quiz");
    const uncompleted = getCard(window, "Quiz: Uncompleted quiz");

    expect(
      locked.querySelector(".quiz-meta-item--participants").textContent.trim(),
    ).toBe("3 people tried this");
    expect(
      retakeable
        .querySelector(".quiz-meta-item--participants")
        .textContent.trim(),
    ).toBe("2 people tried this");
    expect(
      uncompleted
        .querySelector(".quiz-meta-item--participants")
        .textContent.trim(),
    ).toBe("1 person tried this");
  });

  it("renders the creator's like count as a clickable button without a second heart count", async () => {
    const { window } = createOverviewPage();

    await flush();

    const card = getCard(window, "Quiz: Locked quiz");
    const count = card.querySelector("[data-like-count-for]");
    const likeButton = card.querySelector("[data-action='like']");

    expect(count.tagName).toBe("BUTTON");
    expect(count.classList.contains("like-count-button")).toBe(true);
    expect(count.getAttribute("data-action")).toBe("likes");
    expect(count.textContent.trim()).toBe("1");
    expect(count.getAttribute("aria-haspopup")).toBe("dialog");
    expect(likeButton.querySelector(".like-button__count")).toBeNull();
    expect(likeButton.textContent.trim()).toBe("");
  });

  it("shows non-creators a plain, non-clickable like count", async () => {
    const quizzes = dashboardQuizzes().map((quiz) => ({
      ...quiz,
      owner: { id: "user-someone-else", username: "someone_else" },
    }));
    const { window, likes } = createOverviewPage({ quizzes });

    await flush();
    await clickSection(window, "liked");

    const card = getCard(window, "Liked quiz: Locked quiz");
    const count = card.querySelector("[data-like-count-for]");

    expect(count.tagName).toBe("SPAN");
    expect(count.classList.contains("like-count-button")).toBe(false);
    expect(count.hasAttribute("data-action")).toBe(false);
    expect(count.hasAttribute("tabindex")).toBe(false);
    expect(count.textContent.trim()).toBe("1");
    expect(card.querySelector("[data-action='likes']")).toBeNull();

    count.click();
    await flush();

    expect(likes).toHaveLength(0);
    expect(window.document.querySelector("#likes-modal").hidden).toBe(true);
  });

  it("lets the creator open likers from the liked quizzes section", async () => {
    const { window, likes } = createOverviewPage();

    await flush();
    await clickSection(window, "liked");

    const card = getCard(window, "Liked quiz: Locked quiz");
    const trigger = card.querySelector("[data-action='likes']");
    expect(trigger).not.toBeNull();
    expect(trigger.tagName).toBe("BUTTON");

    trigger.click();
    await flush();

    expect(likes).toHaveLength(1);
    expect(likes[0].url).toBe("/api/quizzes/64b000000000000000000011/likes");
    expect(window.document.querySelector("#likes-modal").hidden).toBe(false);
  });

  it("lets the creator open likers from the taken quizzes section", async () => {
    const { window, likes } = createOverviewPage();

    await flush();
    await clickSection(window, "taken");

    const card = getCard(window, "Taken quiz: Locked quiz");
    const trigger = card.querySelector("[data-action='likes']");
    expect(trigger).not.toBeNull();
    expect(trigger.tagName).toBe("BUTTON");

    trigger.click();
    await flush();

    expect(likes).toHaveLength(1);
    expect(likes[0].url).toBe("/api/quizzes/64b000000000000000000011/likes");
    expect(window.document.querySelector("#likes-modal").hidden).toBe(false);
  });

  it("loads liker identities, renders profiles, and restores focus", async () => {
    let resolveLikes;
    const likesResponse = new Promise((resolve) => {
      resolveLikes = resolve;
    });
    const { window, likes } = createOverviewPage({
      likesResponses: [likesResponse],
    });

    await flush();

    const card = getCard(window, "Quiz: Locked quiz");
    const trigger = card.querySelector("[data-action='likes']");
    const modal = window.document.querySelector("#likes-modal");
    const dialog = modal.querySelector("[role='dialog']");
    const list = window.document.querySelector("#likes-list");
    const status = window.document.querySelector("#likes-modal-status");

    trigger.focus();
    trigger.click();
    await flush();

    expect(likes[0].url).toBe("/api/quizzes/64b000000000000000000011/likes");
    expect(likes[0].options.credentials).toBe("include");
    expect(modal.hidden).toBe(false);
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.getAttribute("aria-labelledby")).toBe("likes-modal-title");
    expect(window.document.activeElement).toBe(
      window.document.querySelector("#likes-modal-close"),
    );
    expect(status.textContent).toBe("Loading likes…");
    expect(status.hidden).toBe(false);

    resolveLikes(
      jsonResponse({
        data: {
          quiz: { id: "64b000000000000000000011", title: "Locked quiz" },
          likeCount: 2,
          likers: [
            {
              id: "64b000000000000000000021",
              username: "bob",
              profileUrl: "/users/bob",
            },
            {
              id: "64b000000000000000000022",
              username: "carol",
              profileUrl: "/users/carol",
            },
          ],
        },
      }),
    );
    await flush();

    expect(
      window.document.querySelector("#likes-modal-title").textContent,
    ).toBe("Liked by 2 people");
    expect(
      window.document.querySelector("#likes-modal-quiz-title").textContent,
    ).toBe("Locked quiz");
    expect(
      Array.from(list.querySelectorAll(".likes-name")).map((link) => ({
        text: link.textContent,
        href: link.getAttribute("href"),
      })),
    ).toEqual([
      { text: "bob", href: "/users/bob" },
      { text: "carol", href: "/users/carol" },
    ]);
    expect(status.hidden).toBe(true);

    dialog.dispatchEvent(
      new window.KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
        cancelable: true,
      }),
    );

    expect(modal.hidden).toBe(true);
    expect(window.document.activeElement).toBe(trigger);
  });

  it("shows an empty state when nobody has liked the quiz", async () => {
    const { window } = createOverviewPage();

    await flush();

    getCard(window, "Quiz: Locked quiz")
      .querySelector("[data-action='likes']")
      .click();
    await flush();

    expect(
      window.document.querySelector("#likes-modal-title").textContent,
    ).toBe("No likes yet");
    expect(window.document.querySelector("#likes-list").textContent).toContain(
      "No likes yet",
    );
  });

  it("surfaces errors and retries loading likers", async () => {
    const { window, likes } = createOverviewPage({
      likesResponses: [
        jsonResponse(
          { message: "Could not load likes right now." },
          { ok: false, status: 500 },
        ),
        jsonResponse({
          data: {
            quiz: { id: "64b000000000000000000011", title: "Locked quiz" },
            likeCount: 1,
            likers: [
              {
                id: "64b000000000000000000021",
                username: "bob",
                profileUrl: "/users/bob",
              },
            ],
          },
        }),
      ],
    });

    await flush();

    getCard(window, "Quiz: Locked quiz")
      .querySelector("[data-action='likes']")
      .click();
    await flush();

    const error = window.document.querySelector("#likes-modal-error");
    const retry = window.document.querySelector("#likes-modal-retry");

    expect(error.hidden).toBe(false);
    expect(error.textContent).toBe("Could not load likes right now.");
    expect(retry.hidden).toBe(false);

    retry.click();
    await flush();

    expect(likes).toHaveLength(2);
    expect(error.hidden).toBe(true);
    expect(retry.hidden).toBe(true);
    expect(
      Array.from(
        window.document.querySelectorAll("#likes-list .likes-name"),
      ).map((link) => link.textContent),
    ).toEqual(["bob"]);
  });

  it("closes other open dialogs before opening the likes dialog", async () => {
    const { window } = createOverviewPage();

    await flush();

    const shareTrigger = getCard(window, "Quiz: Locked quiz").querySelector(
      "[data-action='share']",
    );
    shareTrigger.click();

    expect(window.document.querySelector("#share-quiz-modal").hidden).toBe(
      false,
    );

    const likesTrigger = getCard(window, "Quiz: Locked quiz").querySelector(
      "[data-action='likes']",
    );
    likesTrigger.click();
    await flush();

    expect(window.document.querySelector("#share-quiz-modal").hidden).toBe(
      true,
    );
    expect(window.document.querySelector("#likes-modal").hidden).toBe(false);
  });
});

describe("overview sharing", () => {
  it("opens the share dialog with an origin-based link and copyable code", async () => {
    const clipboardWrites = [];
    const { window } = createOverviewPage({ clipboardWrites });

    await flush();

    const card = getCard(window, "Quiz: Locked quiz");
    const trigger = card.querySelector("[data-action='share']");
    const modal = window.document.querySelector("#share-quiz-modal");
    const dialog = modal.querySelector("[role='dialog']");
    const linkInput = window.document.querySelector("#share-link-input");
    const codeValue = window.document.querySelector("#share-code-value");
    const copyLink = window.document.querySelector("#copy-share-link-btn");
    const copyCode = window.document.querySelector("#copy-share-code-btn");

    trigger.focus();
    trigger.click();

    expect(modal.hidden).toBe(false);
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.getAttribute("aria-labelledby")).toBe("share-modal-title");
    expect(linkInput.value).toBe(
      "http://localhost/quiz/64b000000000000000000011",
    );
    expect(codeValue.textContent.trim()).toBe("A7K9P2XZ");
    expect(window.document.activeElement).toBe(copyLink);

    copyLink.click();
    await flush();
    expect(clipboardWrites[0]).toBe(
      "http://localhost/quiz/64b000000000000000000011",
    );
    expect(copyLink.textContent.trim()).toBe("Copied!");
    expect(window.document.querySelector("#toast").textContent).toBe(
      "Quiz link copied to clipboard!",
    );

    copyCode.click();
    await flush();
    expect(clipboardWrites[1]).toBe("A7K9P2XZ");
    expect(copyCode.textContent.trim()).toBe("Copied!");
    expect(window.document.querySelector("#toast").textContent).toBe(
      "Quiz code copied to clipboard!",
    );

    dialog.dispatchEvent(
      new window.KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
        cancelable: true,
      }),
    );

    expect(modal.hidden).toBe(true);
    expect(window.document.activeElement).toBe(trigger);
  });
});

const openJoinDialog = (window) => {
  const trigger = window.document.querySelector("[data-action='join-code']");
  const modal = window.document.querySelector("#join-quiz-modal");
  const dialog = modal.querySelector("[role='dialog']");
  const input = window.document.querySelector("#join-code-input");
  const form = window.document.querySelector("#join-quiz-form");
  const submit = window.document.querySelector("#join-modal-submit");
  const cancel = window.document.querySelector("#join-modal-cancel");
  const error = window.document.querySelector("#join-code-error");

  trigger.focus();
  trigger.click();

  return { trigger, modal, dialog, input, form, submit, cancel, error };
};

const setJoinCode = (window, input, value) => {
  input.value = value;
  input.dispatchEvent(new window.Event("input", { bubbles: true }));
};

const submitJoinForm = (window, form) => {
  form.dispatchEvent(
    new window.Event("submit", { bubbles: true, cancelable: true }),
  );
};

describe("overview join by code", () => {
  it("opens accessibly and normalizes input without submitting incomplete codes", async () => {
    const { window, joins } = createOverviewPage();

    await flush();

    const { trigger, modal, dialog, input, form, submit, error } =
      openJoinDialog(window);

    expect(modal.hidden).toBe(false);
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.getAttribute("aria-labelledby")).toBe("join-modal-title");
    expect(
      window.document.querySelector("#join-modal-title").textContent.trim(),
    ).toBe("Join a Quiz");
    expect(window.document.activeElement).toBe(input);
    expect(submit.disabled).toBe(true);

    setJoinCode(window, input, "ab-12 cd9!xyz");
    expect(input.value).toBe("AB12CD9X");
    expect(submit.disabled).toBe(false);

    setJoinCode(window, input, "abc");
    expect(input.value).toBe("ABC");
    expect(submit.disabled).toBe(true);

    submitJoinForm(window, form);
    await flush();

    expect(joins).toHaveLength(0);
    expect(error.hidden).toBe(false);
    expect(error.textContent).toBe("Enter the complete 8-character quiz code.");
    expect(input.getAttribute("aria-invalid")).toBe("true");

    setJoinCode(window, input, "a7k9p2xz");
    expect(error.hidden).toBe(true);

    dialog.dispatchEvent(
      new window.KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(modal.hidden).toBe(true);
    expect(window.document.activeElement).toBe(trigger);
  });

  it("submits once, shows loading feedback, and navigates on success", async () => {
    let resolveLookup;
    const pendingLookup = new Promise((resolve) => {
      resolveLookup = resolve;
    });
    const { window, joins, navigations } = createOverviewPage({
      joinResponses: [pendingLookup],
    });

    await flush();

    const { modal, input, form, submit } = openJoinDialog(window);
    const quizId = "64b000000000000000000042";

    setJoinCode(window, input, "a7k9p2xz");
    submitJoinForm(window, form);

    expect(joins).toHaveLength(1);
    expect(joins[0].url).toBe("/api/quizzes/code/A7K9P2XZ");
    expect(submit.disabled).toBe(true);
    expect(submit.textContent.trim()).toBe("Looking up…");
    expect(modal.getAttribute("aria-busy")).toBe("true");

    submitJoinForm(window, form);
    expect(joins).toHaveLength(1);

    resolveLookup(
      jsonResponse({
        data: { quiz: { id: quizId, shareUrl: `/quiz/${quizId}` } },
      }),
    );
    await flush();

    expect(navigations).toEqual([`/quiz/${quizId}`]);
  });

  it("shows lookup errors, allows retry, and ignores duplicate requests", async () => {
    const { window, joins } = createOverviewPage({
      joinResponses: [
        jsonResponse(
          { message: "No quiz found with that code." },
          { ok: false, status: 404 },
        ),
        jsonResponse(
          {
            message:
              "This quiz is currently a private draft and is not public yet.",
          },
          { ok: false, status: 403 },
        ),
      ],
    });

    await flush();

    const { modal, input, form, submit, error } = openJoinDialog(window);

    setJoinCode(window, input, "ZZZZ9999");
    submitJoinForm(window, form);
    await flush();

    expect(joins).toHaveLength(1);
    expect(modal.hidden).toBe(false);
    expect(error.hidden).toBe(false);
    expect(error.textContent).toBe("No quiz found with that code.");
    expect(submit.disabled).toBe(false);
    expect(submit.textContent.trim()).toBe("Find Quiz");
    expect(input.disabled).toBe(false);

    setJoinCode(window, input, "AAAA1111");
    expect(error.hidden).toBe(true);

    submitJoinForm(window, form);
    await flush();

    expect(joins).toHaveLength(2);
    expect(error.textContent).toBe(
      "This quiz is currently a private draft and is not public yet.",
    );
    expect(window.document.activeElement).toBe(input);
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
