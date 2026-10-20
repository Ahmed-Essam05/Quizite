/**
 * quiz.js — Quiz Taking and Instant Results Evaluation
 */

(() => {
  if (window.__quiziteQuizPageInitialized) return;
  window.__quiziteQuizPageInitialized = true;

const THEME_KEY = "quizite-theme";
const toast = document.querySelector("#toast");
let toastTimer;

// DOM Elements
const loadingEl = document.querySelector("#quiz-loading");
const errorEl = document.querySelector("#quiz-error");
const errorMsgEl = document.querySelector("#quiz-error-msg");
const containerEl = document.querySelector("#quiz-container");

const titleEl = document.querySelector("#quiz-title");
const quizIconEl = document.querySelector("#quiz-icon");
const descEl = document.querySelector("#quiz-desc");
const statusPill = document.querySelector("#quiz-status-pill");
const qCountEl = document.querySelector("#quiz-q-count");
const authorEl = document.querySelector("#quiz-author");
const authorWrap = document.querySelector("#quiz-author-wrap");
const tookCountEl = document.querySelector("#quiz-took-count");

const formEl = document.querySelector("#quiz-take-form");
const questionsArea = document.querySelector("#questions-render-area");
const pageNav = document.querySelector("#quiz-page-nav");
const prevPageBtn = document.querySelector("#prev-page-btn");
const nextPageBtn = document.querySelector("#next-page-btn");
const pageIndicator = document.querySelector("#quiz-page-indicator");
const submitBtn = document.querySelector("#submit-quiz-btn");
const shareQuizBtn = document.querySelector("#share-quiz-btn");
const likeBtn = document.querySelector("#like-btn");
const likeCountEl = document.querySelector("#like-count");
const statusNoteEl = document.querySelector("#quiz-status-note");

const unansweredModal = document.querySelector("#unanswered-modal");
const unansweredModalMessage = document.querySelector(
  "#unanswered-modal-message",
);
const reviewUnansweredBtn = document.querySelector("#review-unanswered-btn");
const submitAnywayBtn = document.querySelector("#submit-anyway-btn");

let currentQuizData = null;
let likedByMe = false;
let canRetake = true;
let currentPageIndex = 0;
let isSubmitting = false;
let lastFocusedBeforeModal = null;

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
   Toast helpers
   -------------------------------------------------------------------------- */

const showToast = (message) => {
  window.clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add("is-visible");
  toastTimer = window.setTimeout(() => {
    toast.classList.remove("is-visible");
  }, 3200);
};

const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const renderQuizIcon = (icon) => {
  if (!quizIconEl) return;
  quizIconEl.innerHTML = "";

  if (icon?.type === "upload" && icon.value) {
    const image = document.createElement("img");
    image.src = icon.value;
    image.alt = "";
    quizIconEl.appendChild(image);
    quizIconEl.hidden = false;
    return;
  }

  quizIconEl.textContent =
    icon?.type === "emoji" && icon.value ? icon.value : "✨";
  quizIconEl.hidden = false;
};

/* --------------------------------------------------------------------------
   Load Quiz Data
   -------------------------------------------------------------------------- */

const getQuizIdFromUrl = () => {
  const segments = window.location.pathname.split("/").filter(Boolean);
  return segments[segments.length - 1];
};

const loadQuiz = async () => {
  resetSubmitState();
  loadingEl.hidden = false;
  errorEl.hidden = true;
  containerEl.hidden = true;

  const quizId = getQuizIdFromUrl();
  if (!quizId) {
    showQuizError("Invalid quiz link.");
    return;
  }

  try {
    const response = await fetch(`/api/quizzes/${quizId}`, {
      credentials: "include",
    });

    const data = await response.json();

    if (!response.ok) {
      showQuizError(data.message || "Failed to load quiz.");
      return;
    }

    currentQuizData = data.data.quiz;
    likedByMe = Boolean(data.data.likedByMe);
    canRetake = data.data.canRetake !== false;
    renderQuiz(currentQuizData, data.data.isOwner);
  } catch (err) {
    showQuizError(
      "Unable to connect to the server. Please check your network.",
    );
  }
};

const showQuizError = (message) => {
  loadingEl.hidden = true;
  containerEl.hidden = true;
  errorEl.hidden = false;
  errorMsgEl.textContent = message;
};

/* --------------------------------------------------------------------------
   Render Quiz
   -------------------------------------------------------------------------- */

const renderQuiz = (quiz, isOwner) => {
  loadingEl.hidden = true;
  errorEl.hidden = true;
  containerEl.hidden = false;

  document.title = `${quiz.title} — Quizite`;
  titleEl.textContent = quiz.title;
  renderQuizIcon(quiz.icon);

  if (quiz.description) {
    descEl.textContent = quiz.description;
    descEl.style.display = "block";
  } else {
    descEl.style.display = "none";
  }

  statusPill.textContent =
    quiz.status === "draft" ? "Private Draft" : "Public Quiz";
  statusPill.className = `quiz-pill quiz-pill--${quiz.status}`;

  const qCount = quiz.questionCount || 0;
  qCountEl.textContent = `${qCount} ${qCount === 1 ? "question" : "questions"}`;

  if (quiz.owner?.username) {
    authorEl.textContent = quiz.owner.username;
    authorWrap.hidden = false;
  } else {
    authorWrap.hidden = true;
  }

  tookCountEl.textContent = String(quiz.peopleTookCount || 0);

  // Like button state
  if (likeBtn) {
    likeBtn.hidden = false;
    likeBtn.classList.toggle("is-liked", likedByMe);
    likeBtn.setAttribute("aria-pressed", String(likedByMe));
    likeBtn.title = likedByMe ? "Remove your like" : "Like this quiz";
  }
  if (likeCountEl) {
    likeCountEl.textContent = String(quiz.likeCount || 0);
  }

  formEl.hidden = !canRetake;
  statusNoteEl.hidden = canRetake;
  if (!canRetake) {
    statusNoteEl.textContent =
      "You have already completed this quiz and the creator did not enable retakes.";
  }

  // Render question cards grouped by quiz page
  let questionNumber = 1;
  const questionsHtml = [];
  const quizPages = (quiz.pages || []).filter(
    (page) => (page.questions || []).length > 0,
  );

  quizPages.forEach((page, pageIndex) => {
    const pageStart = questionNumber;
    const pageQuestionsHtml = [];

    for (const q of page.questions) {
      const qNum = questionNumber++;
      let inputHtml = "";

      if (q.type === "multipleChoice" || q.type === "trueFalse") {
        inputHtml = `
          <div class="take-choices-list">
            ${(q.choices || [])
              .map(
                (choice) => `
              <label class="take-choice-label">
                <input
                  type="radio"
                  name="question-${q.id}"
                  value="${choice.id}"
                  data-question-id="${q.id}"
                  data-type="${q.type}"
                />
                <span class="take-choice-text">${escapeHtml(choice.text)}</span>
              </label>`,
              )
              .join("")}
          </div>`;
      } else if (q.type === "writtenAnswer") {
        inputHtml = `
          <textarea
            class="take-written-textarea"
            name="question-${q.id}"
            data-question-id="${q.id}"
            data-type="writtenAnswer"
            rows="3"
            placeholder="Type your answer here..."
          ></textarea>`;
      }

      pageQuestionsHtml.push(`
        <article class="take-question-card" data-q-id="${q.id}">
          <div class="take-question-header">
            <span class="take-question-num">Question ${qNum}</span>
          </div>
          <h2 class="take-question-title">${escapeHtml(q.title)}</h2>
          ${inputHtml}
        </article>`);
    }

    const pageEnd = questionNumber - 1;
    const rangeLabel =
      pageStart === pageEnd
        ? `Question ${pageStart}`
        : `Questions ${pageStart}–${pageEnd}`;

    questionsHtml.push(`
      <section class="take-page-section" data-page-index="${pageIndex}" ${
        pageIndex === 0 ? "" : "hidden"
      }>
        ${
          quizPages.length > 1
            ? `<div class="take-page-heading">
                <span class="take-page-title">Page ${pageIndex + 1}</span>
                <span class="take-page-range">${rangeLabel}</span>
              </div>`
            : ""
        }
        <div class="take-page-questions">
          ${pageQuestionsHtml.join("")}
        </div>
      </section>`);
  });

  questionsArea.innerHTML = questionsHtml.join("");
  showTakePage(0);
};

const showTakePage = (pageIndex, { scroll = false } = {}) => {
  const pageSections = Array.from(
    questionsArea.querySelectorAll(".take-page-section"),
  );

  if (pageSections.length === 0) {
    pageNav.hidden = true;
    submitBtn.hidden = false;
    return;
  }

  currentPageIndex = Math.max(
    0,
    Math.min(pageIndex, pageSections.length - 1),
  );

  pageSections.forEach((section, index) => {
    section.hidden = index !== currentPageIndex;
  });

  const hasMultiplePages = pageSections.length > 1;
  pageNav.hidden = !hasMultiplePages;
  prevPageBtn.hidden = !hasMultiplePages || currentPageIndex === 0;
  nextPageBtn.hidden =
    !hasMultiplePages || currentPageIndex === pageSections.length - 1;
  submitBtn.hidden = hasMultiplePages
    ? currentPageIndex !== pageSections.length - 1
    : false;

  pageIndicator.textContent = hasMultiplePages
    ? `Page ${currentPageIndex + 1} of ${pageSections.length}`
    : "";

  if (scroll) {
    questionsArea.scrollIntoView({ behavior: "smooth", block: "start" });
  }
};

prevPageBtn?.addEventListener("click", () => {
  showTakePage(currentPageIndex - 1, { scroll: true });
});

nextPageBtn?.addEventListener("click", () => {
  showTakePage(currentPageIndex + 1, { scroll: true });
});

/* --------------------------------------------------------------------------
   Unanswered Questions
   -------------------------------------------------------------------------- */

const getQuestionCards = () =>
  Array.from(questionsArea.querySelectorAll(".take-question-card"));

const getDisplayedQuestionNumber = (card, index) => {
  const label = card.querySelector(".take-question-num")?.textContent || "";
  const match = label.match(/\d+/);
  return match ? Number(match[0]) : index + 1;
};

const isQuestionAnswered = (card) => {
  const textarea = card.querySelector(
    'textarea[data-type="writtenAnswer"]',
  );
  if (textarea) {
    return textarea.value.trim().length > 0;
  }
  return Boolean(card.querySelector('input[type="radio"]:checked'));
};

const getUnansweredQuestions = () =>
  getQuestionCards()
    .map((card, index) => ({
      card,
      number: getDisplayedQuestionNumber(card, index),
      answered: isQuestionAnswered(card),
    }))
    .filter((question) => !question.answered);

const formatQuestionNumbers = (numbers) => {
  if (numbers.length === 1) {
    return `Question ${numbers[0]}`;
  }
  if (numbers.length === 2) {
    return `Questions ${numbers[0]} and ${numbers[1]}`;
  }
  const leading = numbers.slice(0, -1).join(", ");
  return `Questions ${leading}, and ${numbers[numbers.length - 1]}`;
};

const setQuestionUnansweredIndicator = (card, isUnanswered) => {
  if (!card) return;
  card.classList.toggle("is-unanswered", isUnanswered);

  let indicator = card.querySelector(".take-unanswered-flag");
  if (isUnanswered && !indicator) {
    indicator = document.createElement("span");
    indicator.className = "take-unanswered-flag";
    indicator.textContent = "Unanswered";
    card.querySelector(".take-question-header")?.appendChild(indicator);
  } else if (!isUnanswered && indicator) {
    indicator.remove();
  }
};

const updateUnansweredIndicators = (unanswered = getUnansweredQuestions()) => {
  const unansweredCards = new Set(
    unanswered.map((question) => question.card),
  );
  getQuestionCards().forEach((card) => {
    setQuestionUnansweredIndicator(card, unansweredCards.has(card));
  });
};

const closeUnansweredModal = ({ restoreFocus = true } = {}) => {
  if (!unansweredModal || unansweredModal.hidden) return;
  unansweredModal.hidden = true;
  document.body.classList.remove("delete-modal-open");

  if (restoreFocus && lastFocusedBeforeModal?.isConnected) {
    lastFocusedBeforeModal.focus();
  }
  lastFocusedBeforeModal = null;
};

const openUnansweredModal = (unanswered) => {
  if (!unansweredModal || unanswered.length === 0) return false;

  updateUnansweredIndicators(unanswered);
  unansweredModalMessage.textContent = `You haven't answered ${formatQuestionNumbers(
    unanswered.map((question) => question.number),
  )}. Are you sure you want to submit your quiz?`;

  lastFocusedBeforeModal =
    document.activeElement instanceof window.HTMLElement
      ? document.activeElement
      : submitBtn;
  unansweredModal.hidden = false;
  document.body.classList.add("delete-modal-open");
  reviewUnansweredBtn?.focus({ preventScroll: true });
  return true;
};

unansweredModal?.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    event.preventDefault();
    closeUnansweredModal();
    return;
  }

  if (event.key !== "Tab") return;

  const focusable = Array.from(
    unansweredModal.querySelectorAll(
      'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled])',
    ),
  );
  if (focusable.length === 0) return;

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const active = document.activeElement;

  if (event.shiftKey && (active === first || !unansweredModal.contains(active))) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
  }
});

unansweredModal?.addEventListener("click", (event) => {
  if (event.target === unansweredModal) {
    closeUnansweredModal();
  }
});

reviewUnansweredBtn?.addEventListener("click", () => {
  const unanswered = getUnansweredQuestions();
  if (unanswered.length === 0) {
    closeUnansweredModal();
    return;
  }

  const firstUnanswered = unanswered[0];
  const pageSection = firstUnanswered.card.closest(".take-page-section");
  const pageIndex = Number(pageSection?.dataset.pageIndex);

  closeUnansweredModal({ restoreFocus: false });
  if (Number.isInteger(pageIndex)) {
    showTakePage(pageIndex);
  }
  updateUnansweredIndicators(unanswered);

  const focusTarget = firstUnanswered.card.querySelector(
    'textarea, input[type="radio"]',
  );
  focusTarget?.focus({ preventScroll: true });
  firstUnanswered.card.scrollIntoView?.({
    behavior: "smooth",
    block: "center",
  });
});

questionsArea.addEventListener("input", (event) => {
  const card = event.target.closest(".take-question-card");
  if (card) {
    setQuestionUnansweredIndicator(card, !isQuestionAnswered(card));
  }
});

questionsArea.addEventListener("change", (event) => {
  const card = event.target.closest(".take-question-card");
  if (card) {
    setQuestionUnansweredIndicator(card, !isQuestionAnswered(card));
  }
});

/* --------------------------------------------------------------------------
   Submit Answers
   -------------------------------------------------------------------------- */

const resetSubmitState = () => {
  closeUnansweredModal({ restoreFocus: false });
  isSubmitting = false;
  submitBtn.disabled = false;
  submitBtn.textContent = "Submit Answers";
};

formEl.addEventListener("submit", (e) => {
  e.preventDefault();

  if (isSubmitting || (unansweredModal && !unansweredModal.hidden)) {
    return;
  }

  const unanswered = getUnansweredQuestions();
  if (unanswered.length > 0) {
    openUnansweredModal(unanswered);
    return;
  }

  submitAnswers();
});

const submitAnswers = async () => {
  if (isSubmitting) return;
  isSubmitting = true;

  const quizId = getQuizIdFromUrl();
  const answers = [];

  // Collect MCQ and True/False radio selections
  const checkedRadios = formEl.querySelectorAll('input[type="radio"]:checked');
  checkedRadios.forEach((radio) => {
    answers.push({
      questionId: radio.dataset.questionId,
      choiceId: radio.value,
    });
  });

  // Collect written text responses
  const writtenTextareas = formEl.querySelectorAll(
    'textarea[data-type="writtenAnswer"]',
  );
  writtenTextareas.forEach((ta) => {
    const text = ta.value.trim();
    if (text) {
      answers.push({
        questionId: ta.dataset.questionId,
        writtenText: text,
      });
    }
  });

  loadingEl.hidden = true;
  submitBtn.disabled = true;
  submitBtn.textContent = "Submitting answers…";

  try {
    const response = await fetch(`/api/quizzes/${quizId}/submit`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answers }),
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      showToast(data?.message || "Failed to submit answers");
      resetSubmitState();
      return;
    }

    if (!data?.data || !Array.isArray(data.data.results)) {
      showToast("The server returned an invalid result. Please try again.");
      resetSubmitState();
      return;
    }

    const saved = window.QuiziteResultStore?.save(quizId, {
      ...data.data,
      quizTitle: currentQuizData?.title || "Quiz results",
      quizIcon: currentQuizData?.icon || null,
    });

    if (!saved) {
      showToast("Your results could not be saved for display. Please retry.");
      resetSubmitState();
      return;
    }

    window.location.assign(`/quiz/${encodeURIComponent(quizId)}/results`);
  } catch (err) {
    showToast("A network error occurred while submitting.");
    resetSubmitState();
  }
};

submitAnywayBtn?.addEventListener("click", () => {
  if (isSubmitting) return;
  closeUnansweredModal();
  submitAnswers();
});

/* --------------------------------------------------------------------------
   Share Action
   -------------------------------------------------------------------------- */

const copyShareLink = () => {
  const url = window.location.href;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(url).then(
      () => showToast("Unique quiz link copied to clipboard!"),
      () => showToast(`Quiz link: ${url}`),
    );
  } else {
    showToast(`Quiz link: ${url}`);
  }
};

shareQuizBtn?.addEventListener("click", copyShareLink);

/* --------------------------------------------------------------------------
   Like / Unlike
   -------------------------------------------------------------------------- */

likeBtn?.addEventListener("click", async () => {
  const quizId = getQuizIdFromUrl();
  if (!quizId) return;

  likeBtn.disabled = true;

  try {
    const response = await fetch(`/api/quizzes/${quizId}/like`, {
      method: likedByMe ? "DELETE" : "POST",
      credentials: "include",
    });

    const data = await response.json().catch(() => null);

    if (response.status === 401) {
      showToast("Please log in to like quizzes.");
      window.setTimeout(() => {
        window.location.href = "/login";
      }, 900);
      return;
    }

    if (!response.ok) {
      showToast(data?.message || "Could not update your like. Try again.");
      return;
    }

    likedByMe = Boolean(data?.data?.liked);
    likeCountEl.textContent = String(data?.data?.likeCount ?? 0);
    likeBtn.classList.toggle("is-liked", likedByMe);
    likeBtn.setAttribute("aria-pressed", String(likedByMe));
    likeBtn.title = likedByMe ? "Remove your like" : "Like this quiz";
  } catch {
    showToast("A network error occurred while updating your like.");
  } finally {
    likeBtn.disabled = false;
  }
});

window.addEventListener("pageshow", (event) => {
  if (event.persisted) loadQuiz();
});

// Initialize
loadQuiz();
})();
