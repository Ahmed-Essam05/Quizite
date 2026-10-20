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

const flush = async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
};

const jsonResponse = (body, { ok = true, status = 200 } = {}) => ({
  ok,
  status,
  json: async () => body,
});

const createProfilePage = (
  response,
  { user = null, likesResponse = null } = {},
) => {
  const dom = new JSDOM(readFrontend("public-profile.html"), {
    url: "http://localhost/users/alice",
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });
  const { window } = dom;
  const requests = [];

  window.matchMedia = () => ({
    matches: false,
    addListener() {},
    removeListener() {},
  });
  if (user) {
    window.document.cookie = `quizite_user=${encodeURIComponent(
      JSON.stringify(user),
    )}; Path=/`;
  }
  window.fetch = async (url, options = {}) => {
    const requestUrl = String(url);
    requests.push({ url: requestUrl, options });

    if (requestUrl.endsWith("/likes") && likesResponse) {
      return likesResponse;
    }

    return response;
  };

  window.eval(readFrontend("likesModal.js"));
  window.eval(readFrontend("public-profile.js"));

  return { dom, window, requests };
};

const profileResponse = (overrides = {}) => {
  const owner = { id: "alice-id", username: "alice" };
  return jsonResponse({
    data: {
      user: {
        id: "alice-id",
        username: "alice",
        memberSince: "2025-01-15T12:00:00.000Z",
      },
      stats: { totalLikesReceived: 13 },
      topLikedQuizzes: [
        {
          id: "64b000000000000000000011",
          title: "Biology",
          icon: { type: "emoji", value: "🧬", reference: "emoji:🧬" },
          likeCount: 10,
          peopleTookCount: 20,
          shareUrl: "/quiz/64b000000000000000000011",
          owner,
        },
        {
          id: "64b000000000000000000012",
          title: "Chemistry",
          icon: { type: "emoji", value: "🧪", reference: "emoji:🧪" },
          likeCount: 10,
          peopleTookCount: 15,
          shareUrl: "/quiz/64b000000000000000000012",
          owner,
        },
        {
          id: "64b000000000000000000013",
          title: "History",
          icon: { type: "emoji", value: "🏛️", reference: "emoji:🏛️" },
          likeCount: 10,
          peopleTookCount: 15,
          shareUrl: "/quiz/64b000000000000000000013",
          owner,
        },
      ],
      ...overrides,
    },
  });
};

describe("public profile page route", () => {
  it("serves the public profile document", async () => {
    const response = await request(app).get("/users/alice");

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toContain("text/html");
    expect(response.text).toContain('data-page="public-profile"');
    expect(response.text).toContain('id="stat-likes-received"');
    expect(response.text).toContain('id="top-liked-quizzes"');
    expect(response.text).toContain('id="likes-modal"');
  });
});

describe("public profile page", () => {
  it("renders the top three quizzes with likes and participant counts", async () => {
    const { window, requests } = createProfilePage(profileResponse());

    await flush();

    expect(requests[0].url).toBe("/api/users/alice/profile");
    expect(requests[0].options.credentials).toBe("include");
    expect(window.document.querySelector("#loading-state").hidden).toBe(true);
    expect(window.document.querySelector("#profile-content").hidden).toBe(
      false,
    );
    expect(window.document.querySelector("#profile-title").textContent).toBe(
      "alice",
    );
    expect(
      window.document.querySelector("#profile-membersince").textContent,
    ).toBe("Member since January 2025");
    expect(
      window.document.querySelector("#stat-likes-received").textContent,
    ).toBe("13");

    const cards = Array.from(
      window.document.querySelectorAll(".most-liked-card"),
    );
    expect(cards).toHaveLength(3);
    expect(
      cards.map(
        (card) => card.querySelector(".most-liked-card__title").textContent,
      ),
    ).toEqual(["Biology", "Chemistry", "History"]);
    expect(cards[0].querySelector(".quiz-sticker").textContent).toBe("🧬");
    expect(
      cards[0].querySelector(".most-liked-card__title").getAttribute("href"),
    ).toBe("/quiz/64b000000000000000000011");
    expect(
      cards.map((card) =>
        card.querySelector(".most-liked-card__likes").textContent.trim(),
      ),
    ).toEqual(["10 likes", "10 likes", "10 likes"]);
    expect(
      cards.map((card) =>
        card.querySelector(".most-liked-card__participants").textContent.trim(),
      ),
    ).toEqual(["20 people tried", "15 people tried", "15 people tried"]);
    expect(window.document.querySelector("#top-liked-empty").hidden).toBe(true);
    expect(window.document.querySelector("[data-action='likes']")).toBeNull();
    expect(window.document.title).toBe("alice — Profile — Quizite");
  });

  it("shows an empty state when the creator has no published quizzes", async () => {
    const { window } = createProfilePage(
      profileResponse({
        user: {
          id: "bob-id",
          username: "bob",
          memberSince: "2025-03-01T12:00:00.000Z",
        },
        stats: { totalLikesReceived: 0 },
        topLikedQuizzes: [],
      }),
    );

    await flush();

    expect(
      window.document.querySelector("#stat-likes-received").textContent,
    ).toBe("0");
    expect(window.document.querySelector("#top-liked-empty").hidden).toBe(
      false,
    );
    expect(window.document.querySelector("#top-liked-quizzes").innerHTML).toBe(
      "",
    );
  });

  it("lets the profile owner open the likers modal from a quiz count", async () => {
    const { window, requests } = createProfilePage(profileResponse(), {
      user: { id: "alice-id", username: "alice" },
      likesResponse: jsonResponse({
        data: {
          quiz: { id: "64b000000000000000000011", title: "Biology" },
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
    });

    await flush();

    const triggers = window.document.querySelectorAll("[data-action='likes']");
    expect(triggers).toHaveLength(3);
    expect(triggers[0].tagName).toBe("BUTTON");
    expect(triggers[0].textContent.trim()).toBe("10 likes");

    const modal = window.document.querySelector("#likes-modal");
    triggers[0].focus();
    triggers[0].click();
    await flush();

    const likesRequest = requests.find((item) => item.url.endsWith("/likes"));
    expect(likesRequest.url).toBe(
      "/api/quizzes/64b000000000000000000011/likes",
    );
    expect(likesRequest.options.credentials).toBe("include");
    expect(modal.hidden).toBe(false);
    expect(
      window.document.querySelector("#likes-modal-title").textContent,
    ).toBe("Liked by 2 people");
    expect(
      window.document.querySelector("#likes-modal-quiz-title").textContent,
    ).toBe("Biology");
    expect(
      Array.from(
        window.document.querySelectorAll("#likes-list .likes-name"),
      ).map((link) => ({
        text: link.textContent,
        href: link.getAttribute("href"),
      })),
    ).toEqual([
      { text: "bob", href: "/users/bob" },
      { text: "carol", href: "/users/carol" },
    ]);

    window.document.querySelector("#likes-modal-close").click();

    expect(modal.hidden).toBe(true);
    expect(window.document.activeElement).toBe(triggers[0]);
  });

  it("does not expose likers to non-owners viewing the profile", async () => {
    const { window, requests } = createProfilePage(profileResponse(), {
      user: { id: "bob-id", username: "bob" },
    });

    await flush();

    expect(window.document.querySelector("[data-action='likes']")).toBeNull();
    const counts = Array.from(
      window.document.querySelectorAll(".most-liked-card__likes"),
    );
    expect(counts.every((count) => count.tagName === "SPAN")).toBe(true);

    counts[0].click();
    await flush();

    expect(requests.some((item) => item.url.endsWith("/likes"))).toBe(false);
    expect(window.document.querySelector("#likes-modal").hidden).toBe(true);
  });

  it("renders uploaded quiz images and singular like labels", async () => {
    const { window } = createProfilePage(
      profileResponse({
        stats: { totalLikesReceived: 1 },
        topLikedQuizzes: [
          {
            id: "64b000000000000000000012",
            title: "Photo quiz",
            icon: {
              type: "upload",
              value: "/uploads/quiz-icons/photo.webp",
              reference: "upload:photo.webp",
            },
            likeCount: 1,
            peopleTookCount: 1,
            shareUrl: "/quiz/64b000000000000000000012",
            owner: { id: "alice-id", username: "alice" },
          },
        ],
      }),
    );

    await flush();

    expect(
      window.document
        .querySelector(".quiz-sticker--image img")
        .getAttribute("src"),
    ).toBe("/uploads/quiz-icons/photo.webp");
    expect(
      window.document.querySelector(".most-liked-card__likes").textContent,
    ).toContain("1 like");
    expect(
      window.document.querySelector(".most-liked-card__likes").textContent,
    ).not.toContain("1 likes");
    expect(
      window.document.querySelector(".most-liked-card__participants")
        .textContent,
    ).toContain("1 person tried");
  });

  it("shows a friendly error when the profile cannot be loaded", async () => {
    const { window } = createProfilePage(
      jsonResponse(
        { message: "Profile not found." },
        { ok: false, status: 404 },
      ),
    );

    await flush();

    expect(window.document.querySelector("#loading-state").hidden).toBe(true);
    expect(window.document.querySelector("#profile-content").hidden).toBe(true);
    expect(window.document.querySelector("#page-error").hidden).toBe(false);
    expect(window.document.querySelector("#page-error").textContent).toBe(
      "Profile not found.",
    );
  });
});
