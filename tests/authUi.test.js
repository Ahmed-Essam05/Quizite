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

const createLoginPage = (search = "") => {
  const dom = new JSDOM(readFrontend("login.html"), {
    url: `http://localhost/login${search}`,
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });
  const { window } = dom;
  const replacements = [];

  window.matchMedia = () => ({
    matches: false,
    addListener() {},
    removeListener() {},
  });
  Object.defineProperty(window, "location", {
    configurable: true,
    value: {
      origin: "http://localhost",
      pathname: "/login",
      search,
      href: `http://localhost/login${search}`,
      replace: (target) => replacements.push(target),
      assign: (target) => replacements.push(target),
    },
  });
  window.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      token: "test-token",
      data: { user: { username: "alice" } },
    }),
  });

  window.eval(readFrontend("auth.js"));

  return { dom, window, replacements };
};

const submitLogin = async (window) => {
  window.document.querySelector("#username").value = "alice";
  window.document.querySelector("#password").value = "password123";
  window.document
    .querySelector("#login-form")
    .dispatchEvent(
      new window.Event("submit", { bubbles: true, cancelable: true }),
    );
  await flush();
};

describe("login redirects", () => {
  it("returns to the requested quiz after a successful login", async () => {
    const target = "/quiz/64b000000000000000000001?from=share";
    const { window, replacements } = createLoginPage(
      `?next=${encodeURIComponent(target)}`,
    );

    await submitLogin(window);

    expect(replacements).toEqual([target]);
  });

  it("ignores unsafe or looping next destinations", async () => {
    const unsafe = createLoginPage("?next=%2F%2Fevil.example%2Fquiz");
    await submitLogin(unsafe.window);
    expect(unsafe.replacements).toEqual(["/"]);

    const dotSegments = createLoginPage("?next=%2F..%2F%2Fevil.example%2Fquiz");
    await submitLogin(dotSegments.window);
    expect(dotSegments.replacements).toEqual(["/"]);

    const looping = createLoginPage("?next=%2Flogin%3Fnext%3D%252Fquiz");
    await submitLogin(looping.window);
    expect(looping.replacements).toEqual(["/"]);

    const missing = createLoginPage();
    await submitLogin(missing.window);
    expect(missing.replacements).toEqual(["/"]);
  });
});
