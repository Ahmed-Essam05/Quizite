/**
 * quiz.js — Quiz Taking and Instant Results Evaluation
 */

const THEME_KEY = "quizite-theme";
const toast = document.querySelector("#toast");
let toastTimer;

// DOM Elements
const loadingEl = document.querySelector("#quiz-loading");
const errorEl = document.querySelector("#quiz-error");
const errorMsgEl = document.querySelector("#quiz-error-msg");
const containerEl = document.querySelector("#quiz-container");

const titleEl = document.querySelector("#quiz-title");
const descEl = document.querySelector("#quiz-desc");
const statusPill = document.querySelector("#quiz-status-pill");
const qCountEl = document.querySelector("#quiz-q-count");
const authorEl = document.querySelector("#quiz-author");
const authorWrap = document.querySelector("#quiz-author-wrap");
const tookCountEl = document.querySelector("#quiz-took-count");

const formEl = document.querySelector("#quiz-take-form");
const questionsArea = document.querySelector("#questions-render-area");
const submitBtn = document.querySelector("#submit-quiz-btn");
const shareQuizBtn = document.querySelector("#share-quiz-btn");
const likeBtn = document.querySelector("#like-btn");
const likeCountEl = document.querySelector("#like-count");
const statusNoteEl = document.querySelector("#quiz-status-note");

const resultsCard = document.querySelector("#results-card");
const resultsBadge = document.querySelector("#results-badge");
const resultsTitle = document.querySelector("#results-title");
const resultsScoreCount = document.querySelector("#results-score-count");
const resultsTotalCount = document.querySelector("#results-total-count");
const resultsPercentage = document.querySelector("#results-percentage");
const resultsBreakdownList = document.querySelector("#results-breakdown-list");
const resultsUngradedNote = document.querySelector("#results-ungraded-note");
const retakeBtn = document.querySelector("#retake-btn");
const shareResultBtn = document.querySelector("#share-result-btn");

let currentQuizData = null;
let likedByMe = false;
let canRetake = true;

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

/* --------------------------------------------------------------------------
   Load Quiz Data
   -------------------------------------------------------------------------- */

const getQuizIdFromUrl = () => {
  const segments = window.location.pathname.split("/").filter(Boolean);
  return segments[segments.length - 1];
};

const loadQuiz = async () => {
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
  errorEl.hidden = false;
  errorMsgEl.textContent = message;
};

/* --------------------------------------------------------------------------
   Render Quiz
   -------------------------------------------------------------------------- */

const renderQuiz = (quiz, isOwner) => {
  loadingEl.hidden = true;
  containerEl.hidden = false;

  document.title = `${quiz.title} — Quizite`;
  titleEl.textContent = quiz.title;

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

  if (!canRetake) {
    formEl.hidden = true;
    statusNoteEl.hidden = false;
    statusNoteEl.textContent =
      "You have already completed this quiz and the creator did not enable retakes.";
  }

  // Render question cards
  let questionNumber = 1;
  const questionsHtml = [];

  for (const page of quiz.pages || []) {
    for (const q of page.questions || []) {
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

      questionsHtml.push(`
        <article class="take-question-card" data-q-id="${q.id}">
          <div class="take-question-header">
            <span class="take-question-num">Question ${qNum}</span>
          </div>
          <h2 class="take-question-title">${escapeHtml(q.title)}</h2>
          ${inputHtml}
        </article>`);
    }
  }

  questionsArea.innerHTML = questionsHtml.join("");
};

/* --------------------------------------------------------------------------
   Submit Answers
   -------------------------------------------------------------------------- */

formEl.addEventListener("submit", async (e) => {
  e.preventDefault();

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

  submitBtn.disabled = true;
  submitBtn.textContent = "Grading answers…";

  try {
    const response = await fetch(`/api/quizzes/${quizId}/submit`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answers }),
    });

    const data = await response.json();

    if (!response.ok) {
      showToast(data.message || "Failed to submit answers");
      submitBtn.disabled = false;
      submitBtn.textContent = "Submit Answers";
      return;
    }

    renderResults(data.data);
  } catch (err) {
    showToast("A network error occurred while submitting.");
    submitBtn.disabled = false;
    submitBtn.textContent = "Submit Answers";
  }
});

/* --------------------------------------------------------------------------
   Render Results & Breakdown
   -------------------------------------------------------------------------- */

const renderResults = ({
  score,
  totalQuestions,
  gradedQuestions,
  percentage,
  results,
  peopleTookCount,
  countedForParticipants,
}) => {
  formEl.hidden = true;
  resultsCard.hidden = false;

  const gradedTotal =
    typeof gradedQuestions === "number" ? gradedQuestions : totalQuestions;

  resultsPercentage.textContent = `${percentage}%`;
  resultsBadge.textContent = `${percentage}%`;
  resultsScoreCount.textContent = String(score);
  resultsTotalCount.textContent = String(gradedTotal);

  if (percentage >= 80) {
    resultsBadge.className = "results-score-badge";
    resultsTitle.textContent = "Excellent Job! 🎉";
  } else if (percentage >= 50) {
    resultsBadge.className = "results-score-badge is-mid";
    resultsTitle.textContent = "Good Effort! 👍";
  } else {
    resultsBadge.className = "results-score-badge is-low";
    resultsTitle.textContent = "Keep Practicing! 💪";
  }

  if (resultsUngradedNote) {
    const hasUngraded = (results || []).some((r) => r.graded === false);
    resultsUngradedNote.hidden = !hasUngraded;
  }

  // Question review items
  resultsBreakdownList.innerHTML = (results || [])
    .map((r, idx) => {
      const isUngraded = r.graded === false;
      const stateClass = isUngraded
        ? "is-ungraded"
        : r.isCorrect
          ? "is-correct"
          : "is-incorrect";
      const statusLabel = isUngraded
        ? "• Not graded"
        : r.isCorrect
          ? "✓ Correct"
          : "✕ Incorrect";
      const acceptedAnswers =
        Array.isArray(r.acceptedAnswers) && r.acceptedAnswers.length > 0
          ? `<span class="review-answer-line">Accepted answers: <strong class="review-correct-text">${r.acceptedAnswers
              .map((answer) => escapeHtml(answer))
              .join(", ")}</strong></span>`
          : "";
      const correctAnswer =
        !isUngraded && !r.isCorrect && r.correctAnswer
          ? `<span class="review-answer-line">Correct answer: <strong class="review-correct-text">${escapeHtml(r.correctAnswer)}</strong></span>`
          : "";

      return `
    <div class="review-item ${stateClass}">
      <div class="review-item__top">
        <h4 class="review-item__title">Q${idx + 1}: ${escapeHtml(r.title)}</h4>
        <span class="review-status-tag ${stateClass}">
          ${statusLabel}
        </span>
      </div>
      <div class="review-item__details">
        <span class="review-answer-line">
          Your answer: <strong>${escapeHtml(r.userAnswer || "No answer")}</strong>
        </span>
        ${acceptedAnswers}
        ${correctAnswer}
      </div>
    </div>`;
    })
    .join("");

  // Update participant count from the server response
  if (typeof peopleTookCount === "number") {
    tookCountEl.textContent = String(peopleTookCount);
  } else if (countedForParticipants) {
    const currentCount = Number(tookCountEl.textContent) || 0;
    tookCountEl.textContent = String(currentCount + 1);
  }

  // Retakes may have been consumed by this submission
  if (!currentQuizData?.allowRetakes) {
    canRetake = false;
  }
  retakeBtn.hidden = !canRetake;

  resultsCard.scrollIntoView({ behavior: "smooth" });
};

/* --------------------------------------------------------------------------
   Retake & Share Actions
   -------------------------------------------------------------------------- */

retakeBtn?.addEventListener("click", () => {
  formEl.reset();
  formEl.hidden = false;
  resultsCard.hidden = true;
  submitBtn.disabled = false;
  submitBtn.textContent = "Submit Answers";
  formEl.scrollIntoView({ behavior: "smooth" });
});

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
shareResultBtn?.addEventListener("click", copyShareLink);

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

// Initialize
loadQuiz();
