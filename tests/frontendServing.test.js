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
const pageFiles = [
  "create.html",
  "login.html",
  "overview.html",
  "profile.html",
  "public-profile.html",
  "quiz.html",
  "results.html",
  "signup.html",
];
const readPage = (file) =>
  readFileSync(join(frontendDir, "pages", file), "utf8");

describe("frontend static serving", () => {
  it.each(pageFiles)(
    "serves every local asset referenced by %s",
    async (file) => {
      const dom = new JSDOM(readPage(file));
      const references = [
        ...Array.from(
          dom.window.document.querySelectorAll(
            "link[rel='stylesheet'][href^='/']",
          ),
        ).map((link) => link.getAttribute("href")),
        ...Array.from(
          dom.window.document.querySelectorAll("script[src^='/']"),
        ).map((script) => script.getAttribute("src")),
      ];

      expect(references.length).toBeGreaterThan(0);

      for (const reference of new Set(references)) {
        const response = await request(app).get(reference);
        expect(response.status, `${file} references ${reference}`).toBe(200);
        expect(response.headers["content-type"]).not.toContain("text/html");
      }
    },
  );

  it("serves public page shells from the relocated pages directory", async () => {
    const routes = [
      ["/", "Quizite — All your quizzes"],
      ["/login", 'data-page="login"'],
      ["/signup", 'data-page="signup"'],
      ["/users/alice", 'data-page="public-profile"'],
      ["/quiz/abc/results", 'id="results-container"'],
    ];

    for (const [route, marker] of routes) {
      const response = await request(app).get(route);
      expect(response.status, route).toBe(200);
      expect(response.headers["content-type"]).toContain("text/html");
      expect(response.text, route).toContain(marker);
    }
  });

  it("redirects legacy root HTML URLs to their canonical pages", async () => {
    const redirects = {
      "overview.html": "/",
      "login.html": "/login",
      "signup.html": "/signup",
      "create.html": "/create",
      "profile.html": "/profile",
      "quiz.html": "/",
      "results.html": "/",
      "public-profile.html": "/",
    };

    for (const [file, destination] of Object.entries(redirects)) {
      const response = await request(app).get(`/${file}`);
      expect(response.status, file).toBe(301);
      expect(response.headers.location, file).toBe(destination);
    }
  });
});
