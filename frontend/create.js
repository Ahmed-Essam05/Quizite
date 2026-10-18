/**
 * create.js — Interactive Quiz Creation & Question Builder
 */

const STORAGE_KEY = "quizite-quiz-draft";
const THEME_KEY = "quizite-theme";
const MAX_QUESTIONS_PER_PAGE = 10;
const MAX_ACCEPTED_ANSWERS = 20;

const editMatch = window.location.pathname.match(/^\/quiz\/([^/]+)\/edit\/?$/);
const editQuizId = editMatch ? editMatch[1] : null;
const isEditMode = Boolean(editQuizId);

// Internal state
const quizState = {
  title: "",
  description: "",
  status: "published",
  allowRetakes: false,
  showCorrectAnswers: false,
  questions: [],
};

let currentQuestionType = "multipleChoice";
let mcqChoices = ["", ""];
let mcqCorrectIndex = 0;
let writtenAcceptedAnswers = [""];
let toastTimer;

// DOM Elements
const quizTitleInput = document.querySelector("#quiz-title");
const quizDescInput = document.querySelector("#quiz-description");
const quizStatusSelect = document.querySelector("#quiz-status-select");

const questionTitleInput = document.querySelector("#question-title");
const mcqContainer = document.querySelector("#mcq-options-container");
const tfContainer = document.querySelector("#tf-options-container");
const writtenContainer = document.querySelector("#written-options-container");
const choicesList = document.querySelector("#choices-list");
const addChoiceBtn = document.querySelector("#add-choice-btn");
const acceptedAnswersList = document.querySelector("#accepted-answers-list");
const addAcceptedAnswerBtn = document.querySelector("#add-accepted-answer-btn");

const allowRetakesInput = document.querySelector("#allow-retakes");
const showCorrectAnswersInput = document.querySelector("#show-correct-answers");
const editModeBanner = document.querySelector("#edit-mode-banner");
const topbarBreadcrumb = document.querySelector("#topbar-breadcrumb");

const addQuestionBtn = document.querySelector("#add-question-btn");
const savedQuestionsList = document.querySelector("#saved-questions-list");
const emptyQuestionsPrompt = document.querySelector("#empty-questions-prompt");
const savedBadge = document.querySelector("#saved-badge");
const questionCountNum = document.querySelector("#question-count-num");
const questionLimitPill = document.querySelector("#question-limit-pill");

const draftNotice = document.querySelector("#draft-notice");
const clearDraftBtn = document.querySelector("#clear-draft-btn");
const errorBanner = document.querySelector("#error-banner");
const toast = document.querySelector("#toast");

const saveDraftBtn = document.querySelector("#save-draft-btn");
const publishQuizBtn = document.querySelector("#publish-quiz-btn");

const successModal = document.querySelector("#success-modal");
const shareLinkInput = document.querySelector("#share-link-input");
const copyModalLinkBtn = document.querySelector("#copy-modal-link-btn");
const modalTakeLink = document.querySelector("#modal-take-link");

/* --------------------------------------------------------------------------
   Theme management
   -------------------------------------------------------------------------- */

const applyTheme = (theme) => {
  document.documentElement.dataset.theme = theme;
  const toggleBtn = document.querySelector("[data-theme-toggle]");
  if (toggleBtn) {
    const isDark = theme === "dark";
    toggleBtn.setAttribute(
      "aria-label",
      isDark ? "Switch to light mode" : "Switch to dark mode",
    );
  }
};

const savedTheme = localStorage.getItem(THEME_KEY);
const preferredTheme = window.matchMedia("(prefers-color-scheme: dark)").matches
  ? "dark"
  : "light";
applyTheme(savedTheme || preferredTheme);

document.querySelector("[data-theme-toggle]")?.addEventListener("click", () => {
  const nextTheme =
    document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  localStorage.setItem(THEME_KEY, nextTheme);
  applyTheme(nextTheme);
});

/* --------------------------------------------------------------------------
   Toast & Error helpers
   -------------------------------------------------------------------------- */

const showToast = (message) => {
  window.clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add("is-visible");
  toastTimer = window.setTimeout(() => {
    toast.classList.remove("is-visible");
  }, 3200);
};

const showError = (message) => {
  errorBanner.textContent = message;
  errorBanner.hidden = false;
  window.scrollTo({ top: 0, behavior: "smooth" });
};

const clearError = () => {
  errorBanner.textContent = "";
  errorBanner.hidden = true;
};

const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

/* --------------------------------------------------------------------------
   Local storage draft persistence
   -------------------------------------------------------------------------- */

const syncSettingsFromInputs = () => {
  quizState.title = quizTitleInput.value;
  quizState.description = quizDescInput.value;
  quizState.status = quizStatusSelect.value;
  quizState.allowRetakes = Boolean(allowRetakesInput?.checked);
  quizState.showCorrectAnswers = Boolean(showCorrectAnswersInput?.checked);
};

const saveDraftToStorage = () => {
  if (isEditMode) return;
  syncSettingsFromInputs();
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(quizState));
  } catch {
    // Local storage full or unavailable
  }
};

const restoreDraftFromStorage = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (data && (data.title || (data.questions && data.questions.length > 0))) {
      quizState.title = data.title || "";
      quizState.description = data.description || "";
      quizState.status = data.status || "published";
      quizState.allowRetakes = Boolean(data.allowRetakes);
      quizState.showCorrectAnswers = Boolean(data.showCorrectAnswers);
      quizState.questions = (Array.isArray(data.questions)
        ? data.questions
        : []
      ).map((question) => {
        if (
          question.type === "writtenAnswer" &&
          !Array.isArray(question.acceptedAnswers) &&
          question.correctText
        ) {
          return { ...question, acceptedAnswers: [question.correctText] };
        }
        return question;
      });

      quizTitleInput.value = quizState.title;
      quizDescInput.value = quizState.description;
      quizStatusSelect.value = quizState.status;
      if (allowRetakesInput) {
        allowRetakesInput.checked = quizState.allowRetakes;
      }
      if (showCorrectAnswersInput) {
        showCorrectAnswersInput.checked = quizState.showCorrectAnswers;
      }

      draftNotice.hidden = false;
      renderSavedQuestions();
    }
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
};

clearDraftBtn?.addEventListener("click", () => {
  localStorage.removeItem(STORAGE_KEY);
  quizState.title = "";
  quizState.description = "";
  quizState.status = "published";
  quizState.allowRetakes = false;
  quizState.showCorrectAnswers = false;
  quizState.questions = [];

  quizTitleInput.value = "";
  quizDescInput.value = "";
  quizStatusSelect.value = "published";
  if (allowRetakesInput) allowRetakesInput.checked = false;
  if (showCorrectAnswersInput) showCorrectAnswersInput.checked = false;
  draftNotice.hidden = true;
  renderSavedQuestions();
  showToast("Draft discarded.");
});

/* --------------------------------------------------------------------------
   Question Type Switching
   -------------------------------------------------------------------------- */

const typeTabs = document.querySelectorAll(".type-tab");
typeTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    typeTabs.forEach((t) => {
      t.classList.remove("type-tab--active");
      t.setAttribute("aria-selected", "false");
    });
    tab.classList.add("type-tab--active");
    tab.setAttribute("aria-selected", "true");

    currentQuestionType = tab.dataset.type;
    mcqContainer.hidden = currentQuestionType !== "multipleChoice";
    tfContainer.hidden = currentQuestionType !== "trueFalse";
    writtenContainer.hidden = currentQuestionType !== "writtenAnswer";
  });
});

/* --------------------------------------------------------------------------
   Multiple Choice Choices Manager
   -------------------------------------------------------------------------- */

const renderMcqChoices = () => {
  choicesList.innerHTML = mcqChoices
    .map(
      (choiceText, index) => `
    <div class="choice-item-row" data-index="${index}">
      <label class="choice-radio-wrap" title="Mark as correct choice">
        <input
          type="radio"
          name="mcq-correct-choice"
          value="${index}"
          ${index === mcqCorrectIndex ? "checked" : ""}
          aria-label="Choice ${index + 1} is correct"
        />
      </label>
      <input
        class="choice-text-input"
        type="text"
        placeholder="Choice ${index + 1} text..."
        value="${escapeHtml(choiceText)}"
        data-choice-input="${index}"
        maxlength="500"
      />
      <button
        class="btn-remove-choice"
        type="button"
        data-remove-choice="${index}"
        aria-label="Remove choice ${index + 1}"
        ${mcqChoices.length <= 2 ? "disabled" : ""}
      >
        ✕
      </button>
    </div>`,
    )
    .join("");

  addChoiceBtn.disabled = mcqChoices.length >= 6;
};

choicesList.addEventListener("input", (e) => {
  const input = e.target.closest("[data-choice-input]");
  if (input) {
    const idx = Number(input.dataset.choiceInput);
    mcqChoices[idx] = input.value;
  }
});

choicesList.addEventListener("change", (e) => {
  if (e.target.name === "mcq-correct-choice") {
    mcqCorrectIndex = Number(e.target.value);
  }
});

choicesList.addEventListener("click", (e) => {
  const removeBtn = e.target.closest("[data-remove-choice]");
  if (removeBtn && mcqChoices.length > 2) {
    const idx = Number(removeBtn.dataset.removeChoice);
    mcqChoices.splice(idx, 1);
    if (mcqCorrectIndex >= mcqChoices.length) {
      mcqCorrectIndex = Math.max(0, mcqChoices.length - 1);
    }
    renderMcqChoices();
  }
});

addChoiceBtn.addEventListener("click", () => {
  if (mcqChoices.length < 6) {
    mcqChoices.push("");
    renderMcqChoices();
    // Focus the new choice input
    const inputs = choicesList.querySelectorAll(".choice-text-input");
    inputs[inputs.length - 1]?.focus();
  }
});

/* --------------------------------------------------------------------------
   Accepted Answers Manager (written response questions)
   -------------------------------------------------------------------------- */

const renderAcceptedAnswers = () => {
  if (!acceptedAnswersList) return;

  acceptedAnswersList.innerHTML = writtenAcceptedAnswers
    .map(
      (answer, index) => `
    <div class="choice-item-row" data-answer-index="${index}">
      <input
        class="choice-text-input"
        type="text"
        placeholder="Accepted answer ${index + 1}..."
        value="${escapeHtml(answer)}"
        data-answer-input="${index}"
        maxlength="2000"
      />
      <button
        class="btn-remove-choice"
        type="button"
        data-remove-answer="${index}"
        aria-label="Remove accepted answer ${index + 1}"
        ${writtenAcceptedAnswers.length <= 1 ? "disabled" : ""}
      >
        ✕
      </button>
    </div>`,
    )
    .join("");

  if (addAcceptedAnswerBtn) {
    addAcceptedAnswerBtn.disabled =
      writtenAcceptedAnswers.length >= MAX_ACCEPTED_ANSWERS;
  }
};

acceptedAnswersList?.addEventListener("input", (e) => {
  const input = e.target.closest("[data-answer-input]");
  if (input) {
    const idx = Number(input.dataset.answerInput);
    writtenAcceptedAnswers[idx] = input.value;
  }
});

acceptedAnswersList?.addEventListener("click", (e) => {
  const removeBtn = e.target.closest("[data-remove-answer]");
  if (removeBtn && writtenAcceptedAnswers.length > 1) {
    const idx = Number(removeBtn.dataset.removeAnswer);
    writtenAcceptedAnswers.splice(idx, 1);
    renderAcceptedAnswers();
  }
});

addAcceptedAnswerBtn?.addEventListener("click", () => {
  if (writtenAcceptedAnswers.length < MAX_ACCEPTED_ANSWERS) {
    writtenAcceptedAnswers.push("");
    renderAcceptedAnswers();
    const inputs =
      acceptedAnswersList.querySelectorAll(".choice-text-input");
    inputs[inputs.length - 1]?.focus();
  }
});

/* --------------------------------------------------------------------------
   Saved Questions List Rendering
   -------------------------------------------------------------------------- */

const renderSavedQuestions = () => {
  const count = quizState.questions.length;
  savedBadge.textContent = String(count);
  questionCountNum.textContent = String(count);

  if (count >= MAX_QUESTIONS_PER_PAGE) {
    questionLimitPill.classList.add("limit-pill--full");
    addQuestionBtn.disabled = true;
    addQuestionBtn.textContent = "Maximum 10 questions reached";
  } else {
    questionLimitPill.classList.remove("limit-pill--full");
    addQuestionBtn.disabled = false;
    addQuestionBtn.textContent = "✦ Add and Save Question";
  }

  if (count === 0) {
    emptyQuestionsPrompt.hidden = false;
    savedQuestionsList.innerHTML = "";
    return;
  }

  emptyQuestionsPrompt.hidden = true;

  savedQuestionsList.innerHTML = quizState.questions
    .map((q, idx) => {
      let typeLabel = "Multiple Choice";
      if (q.type === "trueFalse") typeLabel = "True / False";
      if (q.type === "writtenAnswer") typeLabel = "Written Answer";

      let detailsHtml = "";
      if (q.type === "multipleChoice" || q.type === "trueFalse") {
        detailsHtml = `
          <div class="question-card-item__choices">
            ${(q.choices || [])
              .map((c, cIdx) => {
                const isCorrect =
                  cIdx === q.correctChoiceIndex || c.text === q.correctAnswer;
                return `
                <div class="choice-preview-item ${isCorrect ? "is-correct" : ""}">
                  <span>${isCorrect ? "●" : "○"}</span>
                  <span>${escapeHtml(c.text || c)}</span>
                  ${isCorrect ? `<span class="correct-indicator">(Correct)</span>` : ""}
                </div>`;
              })
              .join("")}
          </div>`;
      } else if (q.type === "writtenAnswer") {
        const accepted = (
          Array.isArray(q.acceptedAnswers)
            ? q.acceptedAnswers
            : q.correctText
              ? [q.correctText]
              : []
        ).filter((answer) => String(answer).trim().length > 0);

        detailsHtml = `
          <div class="question-card-item__choices">
            <span class="field-hint">
              ${
                accepted.length
                  ? `Accepted answers: <strong>${accepted.map((a) => escapeHtml(a)).join(", ")}</strong>`
                  : "Open response (answers will not be auto-graded)"
              }
            </span>
          </div>`;
      }

      return `
      <article class="question-card-item" data-question-index="${idx}">
        <div class="question-card-item__top">
          <div class="question-card-item__meta">
            <span class="question-num">Q${idx + 1}</span>
            <span class="badge-pill">${typeLabel}</span>
          </div>
          <button
            class="btn-remove-choice"
            type="button"
            data-delete-question="${idx}"
            title="Delete this question"
            aria-label="Delete question ${idx + 1}"
          >
            🗑
          </button>
        </div>
        <p class="question-card-item__text">${escapeHtml(q.title)}</p>
        ${detailsHtml}
      </article>`;
    })
    .join("");
};

savedQuestionsList.addEventListener("click", (e) => {
  const deleteBtn = e.target.closest("[data-delete-question]");
  if (deleteBtn) {
    const idx = Number(deleteBtn.dataset.deleteQuestion);
    quizState.questions.splice(idx, 1);
    renderSavedQuestions();
    saveDraftToStorage();
    showToast("Question removed.");
  }
});

/* --------------------------------------------------------------------------
   Add Question Handler
   -------------------------------------------------------------------------- */

addQuestionBtn.addEventListener("click", () => {
  clearError();

  if (quizState.questions.length >= MAX_QUESTIONS_PER_PAGE) {
    showError("A quiz page cannot contain more than 10 questions.");
    return;
  }

  const title = questionTitleInput.value.trim();
  if (!title) {
    showError("Please enter a question title.");
    questionTitleInput.focus();
    return;
  }

  let newQuestion = null;

  if (currentQuestionType === "multipleChoice") {
    const validChoices = mcqChoices
      .map((c) => c.trim())
      .filter((c) => c.length > 0);

    if (validChoices.length < 2) {
      showError(
        "Multiple choice questions require at least 2 non-empty choices.",
      );
      return;
    }

    if (validChoices.length > 6) {
      showError("Multiple choice questions allow at most 6 choices.");
      return;
    }

    newQuestion = {
      type: "multipleChoice",
      title,
      choices: validChoices.map((c) => ({ text: c })),
      correctChoiceIndex:
        mcqCorrectIndex < validChoices.length ? mcqCorrectIndex : 0,
      required: true,
    };
  } else if (currentQuestionType === "trueFalse") {
    const tfCorrectVal =
      document.querySelector('input[name="tf-correct"]:checked')?.value ||
      "True";

    newQuestion = {
      type: "trueFalse",
      title,
      choices: [{ text: "True" }, { text: "False" }],
      correctChoiceIndex: tfCorrectVal === "True" ? 0 : 1,
      correctAnswer: tfCorrectVal,
      required: true,
    };
  } else if (currentQuestionType === "writtenAnswer") {
    const acceptedAnswers = writtenAcceptedAnswers
      .map((answer) => answer.trim())
      .filter((answer) => answer.length > 0);

    newQuestion = {
      type: "writtenAnswer",
      title,
      acceptedAnswers,
      required: true,
    };
  }

  if (newQuestion) {
    quizState.questions.push(newQuestion);
    renderSavedQuestions();
    saveDraftToStorage();

    // Reset question inputs for next question
    questionTitleInput.value = "";
    writtenAcceptedAnswers = [""];
    renderAcceptedAnswers();
    mcqChoices = ["", ""];
    mcqCorrectIndex = 0;
    renderMcqChoices();
    showToast("Question saved to quiz.");
    questionTitleInput.focus();
  }
});

/* --------------------------------------------------------------------------
   Save & Publish to Backend
   -------------------------------------------------------------------------- */

const submitQuizToServer = async (targetStatus) => {
  clearError();

  const title = quizTitleInput.value.trim();
  if (!title) {
    showError("Please enter a title for your quiz.");
    quizTitleInput.focus();
    return;
  }

  if (targetStatus === "published" && quizState.questions.length === 0) {
    showError(
      "A published quiz must contain at least one question. Add a question or save as a draft.",
    );
    questionTitleInput.focus();
    return;
  }

  const payload = {
    title,
    description: quizDescInput.value.trim(),
    status: targetStatus,
    allowRetakes: Boolean(allowRetakesInput?.checked),
    showCorrectAnswers: Boolean(showCorrectAnswersInput?.checked),
    questions: quizState.questions,
  };

  const submitBtn =
    targetStatus === "published" ? publishQuizBtn : saveDraftBtn;
  const originalText = submitBtn.textContent;
  submitBtn.disabled = true;
  submitBtn.textContent =
    targetStatus === "published" ? "Publishing…" : "Saving…";

  try {
    const endpoint = isEditMode
      ? `/api/quizzes/${editQuizId}`
      : "/api/quizzes";
    const method = isEditMode ? "PATCH" : "POST";

    const response = await fetch(endpoint, {
      method,
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (response.status === 401) {
      showToast("Please log in to save your quiz.");
      window.setTimeout(() => {
        window.location.href = "/login";
      }, 1200);
      return;
    }

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || "Failed to save quiz");
    }

    // Success! Clear local draft (only relevant outside edit mode)
    if (!isEditMode) {
      localStorage.removeItem(STORAGE_KEY);
    }

    const quizData = data.data.quiz;
    const fullShareUrl = `${window.location.origin}${quizData.shareUrl}`;

    shareLinkInput.value = fullShareUrl;
    modalTakeLink.href = quizData.shareUrl;

    const modalTitle = document.querySelector("#modal-title");
    if (isEditMode) {
      modalTitle.textContent =
        targetStatus === "draft" ? "Draft Changes Saved!" : "Quiz Updated!";
    } else if (targetStatus === "draft") {
      modalTitle.textContent = "Draft Saved!";
    } else {
      modalTitle.textContent = "Quiz Published Successfully!";
    }

    successModal.hidden = false;
  } catch (err) {
    showError(err.message || "An unexpected error occurred while saving.");
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = originalText;
  }
};

publishQuizBtn.addEventListener("click", () => submitQuizToServer("published"));
saveDraftBtn.addEventListener("click", () => submitQuizToServer("draft"));

/* --------------------------------------------------------------------------
   Modal Actions
   -------------------------------------------------------------------------- */

copyModalLinkBtn.addEventListener("click", () => {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(shareLinkInput.value).then(() => {
      copyModalLinkBtn.textContent = "Copied!";
      window.setTimeout(() => {
        copyModalLinkBtn.textContent = "Copy link";
      }, 2000);
    });
  } else {
    shareLinkInput.select();
    document.execCommand("copy");
    copyModalLinkBtn.textContent = "Copied!";
  }
});

/* --------------------------------------------------------------------------
   Edit Mode
   -------------------------------------------------------------------------- */

const applyQuizToBuilder = (quiz) => {
  quizState.title = quiz.title || "";
  quizState.description = quiz.description || "";
  quizState.status = quiz.status || "draft";
  quizState.allowRetakes = Boolean(quiz.allowRetakes);
  quizState.showCorrectAnswers = Boolean(quiz.showCorrectAnswers);

  quizTitleInput.value = quizState.title;
  quizDescInput.value = quizState.description;
  quizStatusSelect.value = quizState.status;
  if (allowRetakesInput) allowRetakesInput.checked = quizState.allowRetakes;
  if (showCorrectAnswersInput) {
    showCorrectAnswersInput.checked = quizState.showCorrectAnswers;
  }

  const questions = [];
  (quiz.pages || []).forEach((page) => {
    (page.questions || []).forEach((question) => {
      if (question.type === "writtenAnswer") {
        questions.push({
          _id: question.id,
          type: "writtenAnswer",
          title: question.title,
          acceptedAnswers: Array.isArray(question.acceptedAnswers)
            ? question.acceptedAnswers
            : [],
          required: question.required !== false,
        });
        return;
      }

      const choices = (question.choices || []).map((choice) => ({
        _id: choice.id,
        text: choice.text,
      }));
      let correctChoiceIndex = choices.findIndex(
        (choice) => choice._id === question.correctChoiceId,
      );
      if (correctChoiceIndex < 0) correctChoiceIndex = 0;

      questions.push({
        _id: question.id,
        type: question.type,
        title: question.title,
        choices,
        correctChoiceIndex,
        required: question.required !== false,
      });
    });
  });

  quizState.questions = questions;
  renderSavedQuestions();
};

const setupEditMode = async () => {
  if (topbarBreadcrumb) topbarBreadcrumb.textContent = "Edit a quiz";
  if (editModeBanner) editModeBanner.hidden = false;
  document.title = "Quizite — Edit quiz";

  try {
    const response = await fetch(`/api/quizzes/${editQuizId}`, {
      credentials: "include",
    });
    const payload = await response.json().catch(() => null);

    if (response.status === 401) {
      showError("Please log in to edit this quiz.");
      window.setTimeout(() => {
        window.location.href = "/login";
      }, 1200);
      return;
    }

    if (!response.ok) {
      showError(payload?.message || "Could not load this quiz for editing.");
      return;
    }

    if (!payload?.data?.isOwner) {
      showError("You do not have permission to edit this quiz.");
      return;
    }

    applyQuizToBuilder(payload.data.quiz);
  } catch {
    showError("Could not load this quiz for editing.");
  }
};

// Auto-save title/description on typing
quizTitleInput.addEventListener("input", saveDraftToStorage);
quizDescInput.addEventListener("input", saveDraftToStorage);
quizStatusSelect.addEventListener("change", saveDraftToStorage);
allowRetakesInput?.addEventListener("change", saveDraftToStorage);
showCorrectAnswersInput?.addEventListener("change", saveDraftToStorage);

const ensureAuthenticated = async () => {
  try {
    const res = await fetch("/api/overview?limit=1", { credentials: "include" });
    if (res.status === 401) {
      window.location.replace("/login");
      return false;
    }
    return true;
  } catch {
    return true;
  }
};

// Initialize
(async () => {
  const isAuth = await ensureAuthenticated();
  if (!isAuth) return;

  renderMcqChoices();
  renderAcceptedAnswers();
  if (isEditMode) {
    setupEditMode();
  } else {
    restoreDraftFromStorage();
  }
})();
