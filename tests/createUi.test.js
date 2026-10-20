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

const createPublishResponse = (payload) =>
  jsonResponse(
    {
      data: {
        quiz: {
          id: "64b000000000000000000001",
          title: payload.title,
          status: payload.status,
          shareUrl: "/quiz/64b000000000000000000001",
          shareCode: "A7K9P2XZ",
        },
      },
    },
    { status: 201 },
  );

const createBuilderPage = ({
  url = "http://localhost/create",
  iconUploadResponse = null,
  editQuiz = null,
} = {}) => {
  const dom = new JSDOM(readFrontend("create.html"), {
    url,
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });
  const { window } = dom;
  const requests = [];
  const style = window.document.createElement("style");
  style.textContent = `${readFrontend("overview.css")}\n${readFrontend(
    "create.css",
  )}`;
  window.document.head.appendChild(style);

  window.matchMedia = () => ({
    matches: false,
    addListener() {},
    removeListener() {},
  });
  window.scrollTo = () => {};
  window.Element.prototype.scrollIntoView = () => {};

  window.fetch = async (url, options = {}) => {
    requests.push({ url, options });

    if (String(url).startsWith("/api/overview")) {
      return jsonResponse({ data: {} });
    }

    if (String(url) === "/api/quizzes" && options.method === "POST") {
      return createPublishResponse(JSON.parse(options.body));
    }

    if (String(url) === "/api/quizzes/icon" && options.method === "POST") {
      return (
        iconUploadResponse ||
        jsonResponse(
          { message: "Could not upload that image." },
          { ok: false, status: 400 },
        )
      );
    }

    if (editQuiz && String(url) === `/api/quizzes/${editQuiz.id}`) {
      return jsonResponse({ data: { quiz: editQuiz, isOwner: true } });
    }

    return jsonResponse({ message: "Not found" }, { ok: false, status: 404 });
  };

  window.eval(readFrontend("create.js"));

  return { dom, window, requests };
};

const setInputValue = (window, input, value) => {
  input.value = value;
  input.dispatchEvent(new window.Event("input", { bubbles: true }));
};

const fillMinimalQuiz = (window, title = "Math quiz") => {
  setInputValue(window, window.document.querySelector("#quiz-title"), title);
  setInputValue(
    window,
    window.document.querySelector("#question-title"),
    "What is 2 + 2?",
  );
  setInputValue(
    window,
    window.document.querySelector('[data-choice-input="0"]'),
    "3",
  );
  setInputValue(
    window,
    window.document.querySelector('[data-choice-input="1"]'),
    "4",
  );
  window.document.querySelector("#add-question-btn").click();
};

const uploadIconFile = async (window, type = "image/png") => {
  const input = window.document.querySelector("#quiz-icon-upload");
  const file = new window.File(["fake-image"], "icon.png", { type });
  Object.defineProperty(input, "files", {
    configurable: true,
    value: [file],
  });
  input.dispatchEvent(new window.Event("change", { bubbles: true }));
  await flush();
};

const selectRadio = (window, radio) => {
  radio.checked = true;
  radio.dispatchEvent(new window.Event("change", { bubbles: true }));
};

const summaryMessages = (window) =>
  Array.from(window.document.querySelectorAll("#error-banner-list button")).map(
    (button) => button.textContent.trim(),
  );

describe("quiz builder validation", () => {
  it("shows field errors and a summary for multiple missing question fields", async () => {
    const { window } = createBuilderPage();
    await flush();

    window.document.querySelector("#add-question-btn").click();

    const banner = window.document.querySelector("#error-banner");
    expect(banner.hidden).toBe(false);
    expect(banner.getAttribute("role")).toBe("alert");
    expect(summaryMessages(window)).toEqual([
      "Enter the question text.",
      "Choice 1 needs text.",
      "Choice 2 needs text.",
    ]);

    const title = window.document.querySelector("#question-title");
    expect(title.classList.contains("is-invalid")).toBe(true);
    expect(title.getAttribute("aria-invalid")).toBe("true");
    expect(window.document.querySelector("#question-title-error").hidden).toBe(
      false,
    );

    const choice = window.document.querySelector('[data-choice-input="1"]');
    expect(choice.classList.contains("is-invalid")).toBe(true);
    expect(choice.getAttribute("aria-invalid")).toBe("true");
    expect(window.document.querySelector("#choice-error-1").textContent).toBe(
      "Choice 2 needs text.",
    );

    const choiceErrorButton = Array.from(
      window.document.querySelectorAll("#error-banner-list button"),
    ).find((button) => button.textContent === "Choice 2 needs text.");
    choiceErrorButton.click();
    expect(window.document.activeElement).toBe(choice);
  });

  it("clears field errors as they are corrected and saves the question", async () => {
    const { window } = createBuilderPage();
    await flush();

    const addButton = window.document.querySelector("#add-question-btn");
    const title = window.document.querySelector("#question-title");
    const choiceOne = window.document.querySelector('[data-choice-input="0"]');
    const choiceTwo = window.document.querySelector('[data-choice-input="1"]');
    const banner = window.document.querySelector("#error-banner");

    addButton.click();
    expect(banner.hidden).toBe(false);

    setInputValue(window, title, "What is 2 + 2?");
    expect(summaryMessages(window)).toEqual([
      "Choice 1 needs text.",
      "Choice 2 needs text.",
    ]);
    expect(title.classList.contains("is-invalid")).toBe(false);

    setInputValue(window, choiceOne, "3");
    expect(summaryMessages(window)).toEqual(["Choice 2 needs text."]);

    setInputValue(window, choiceTwo, "4");
    expect(banner.hidden).toBe(true);

    addButton.click();

    expect(banner.hidden).toBe(true);
    expect(
      window.document.querySelectorAll(".question-card-item"),
    ).toHaveLength(1);
    expect(title.value).toBe("");
  });

  it("requires a selected correct answer and clears the error when chosen", async () => {
    const { window } = createBuilderPage();
    await flush();

    const title = window.document.querySelector("#question-title");
    const radios = Array.from(
      window.document.querySelectorAll('input[name="mcq-correct-choice"]'),
    );
    setInputValue(
      window,
      window.document.querySelector('[data-choice-input="0"]'),
      "3",
    );
    setInputValue(
      window,
      window.document.querySelector('[data-choice-input="1"]'),
      "4",
    );
    setInputValue(window, title, "What is 2 + 2?");

    radios.forEach((radio) => {
      radio.checked = false;
    });
    window.document.querySelector("#add-question-btn").click();

    expect(summaryMessages(window)).toContain("Select the correct answer.");

    selectRadio(window, radios[1]);
    expect(window.document.querySelector("#error-banner").hidden).toBe(true);

    window.document.querySelector("#add-question-btn").click();
    expect(
      window.document.querySelectorAll(".question-card-item"),
    ).toHaveLength(1);
    expect(
      window.document.querySelector(".choice-preview-item.is-correct")
        .textContent,
    ).toContain("4");
  });

  it("validates quiz details, clears corrected errors, and publishes", async () => {
    const { window, requests } = createBuilderPage();
    await flush();

    window.document.querySelector("#publish-quiz-btn").click();
    expect(summaryMessages(window)).toEqual([
      "Enter a quiz title.",
      "Add at least one question before publishing.",
    ]);

    const quizTitle = window.document.querySelector("#quiz-title");
    expect(quizTitle.getAttribute("aria-invalid")).toBe("true");
    setInputValue(window, quizTitle, "Math quiz");
    expect(summaryMessages(window)).toEqual([
      "Add at least one question before publishing.",
    ]);

    setInputValue(
      window,
      window.document.querySelector("#question-title"),
      "What is 2 + 2?",
    );
    setInputValue(
      window,
      window.document.querySelector('[data-choice-input="0"]'),
      "3",
    );
    setInputValue(
      window,
      window.document.querySelector('[data-choice-input="1"]'),
      "4",
    );
    window.document.querySelector("#add-question-btn").click();
    expect(window.document.querySelector("#error-banner").hidden).toBe(true);

    window.document.querySelector("#publish-quiz-btn").click();
    await flush();

    const publishRequest = requests.find(
      (entry) => entry.options.method === "POST",
    );
    const payload = JSON.parse(publishRequest.options.body);
    expect(payload.title).toBe("Math quiz");
    expect(payload.questions).toHaveLength(1);
    expect(payload.questions[0].correctChoiceIndex).toBe(0);
    expect(window.document.querySelector("#success-modal").hidden).toBe(false);
    expect(window.document.querySelector("#share-code-input").value).toBe(
      "A7K9P2XZ",
    );
  });
});

describe("quiz builder icons", () => {
  it("selects a built-in icon and includes it in the saved payload", async () => {
    const { window, requests } = createBuilderPage();
    await flush();

    const preview = window.document.querySelector("#quiz-icon-preview");
    expect(preview.textContent.trim()).toBe("✨");
    expect(window.document.querySelectorAll(".quiz-icon-option")).toHaveLength(
      10,
    );
    expect(
      window.document
        .querySelector('[data-icon-emoji="✨"]')
        .getAttribute("aria-checked"),
    ).toBe("true");

    const rocket = window.document.querySelector('[data-icon-emoji="🚀"]');
    rocket.click();
    expect(preview.textContent.trim()).toBe("🚀");
    expect(rocket.getAttribute("aria-checked")).toBe("true");
    expect(rocket.classList.contains("is-selected")).toBe(true);

    fillMinimalQuiz(window);
    window.document.querySelector("#publish-quiz-btn").click();
    await flush();

    const publishRequest = requests.find(
      (entry) =>
        entry.url === "/api/quizzes" && entry.options.method === "POST",
    );
    expect(JSON.parse(publishRequest.options.body).icon).toBe("emoji:🚀");
  });

  it("previews and saves a custom icon upload", async () => {
    const reference =
      "upload:64b000000000000000000001-abcdef0123456789abcdef0123456789.webp";
    const value =
      "/uploads/quiz-icons/64b000000000000000000001-abcdef0123456789abcdef0123456789.webp";
    const { window, requests } = createBuilderPage({
      iconUploadResponse: jsonResponse(
        {
          data: {
            icon: { type: "upload", value, reference },
            reference,
          },
        },
        { status: 201 },
      ),
    });
    window.URL.createObjectURL = () => "blob:icon-preview";
    window.URL.revokeObjectURL = () => {};
    await flush();

    await uploadIconFile(window);

    expect(
      requests.find((entry) => entry.url === "/api/quizzes/icon"),
    ).toBeTruthy();
    expect(
      window.document
        .querySelector("#quiz-icon-preview img")
        ?.getAttribute("src"),
    ).toBe(value);
    expect(window.document.querySelector("#quiz-icon-status").hidden).toBe(
      false,
    );

    fillMinimalQuiz(window);
    window.document.querySelector("#publish-quiz-btn").click();
    await flush();

    const publishRequest = requests.find(
      (entry) =>
        entry.url === "/api/quizzes" && entry.options.method === "POST",
    );
    expect(JSON.parse(publishRequest.options.body).icon).toBe(reference);
  });

  it("keeps builder data when a custom icon upload fails", async () => {
    const { window } = createBuilderPage({
      iconUploadResponse: jsonResponse(
        { message: "Could not store that icon." },
        { ok: false, status: 400 },
      ),
    });
    window.URL.createObjectURL = () => "blob:icon-preview";
    window.URL.revokeObjectURL = () => {};
    await flush();

    setInputValue(
      window,
      window.document.querySelector("#quiz-title"),
      "Draft kept",
    );
    setInputValue(
      window,
      window.document.querySelector("#question-title"),
      "Question kept",
    );

    await uploadIconFile(window);

    expect(window.document.querySelector("#quiz-title").value).toBe(
      "Draft kept",
    );
    expect(window.document.querySelector("#question-title").value).toBe(
      "Question kept",
    );
    expect(window.document.querySelector("#quiz-icon-error").hidden).toBe(
      false,
    );
    expect(
      window.document.querySelector("#quiz-icon-error").textContent,
    ).toContain("Could not store that icon.");
    expect(
      window.document.querySelector("#quiz-icon-preview").textContent.trim(),
    ).toBe("✨");
  });

  it("loads the existing icon when editing a quiz", async () => {
    const editQuiz = {
      id: "64b000000000000000000042",
      title: "Existing quiz",
      description: "",
      status: "published",
      icon: { type: "emoji", value: "🎯", reference: "emoji:🎯" },
      pages: [],
      allowRetakes: false,
      showCorrectAnswers: false,
    };
    const { window } = createBuilderPage({
      url: "http://localhost/quiz/64b000000000000000000042/edit",
      editQuiz,
    });
    await flush();

    expect(
      window.document.querySelector("#quiz-icon-preview").textContent.trim(),
    ).toBe("🎯");
    expect(
      window.document
        .querySelector('[data-icon-emoji="🎯"]')
        .getAttribute("aria-checked"),
    ).toBe("true");
  });
});
