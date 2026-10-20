/**
 * results.js — Dedicated quiz results page.
 */

(() => {
  if (window.__quiziteResultsPageInitialized) return;
  window.__quiziteResultsPageInitialized = true;

  const THEME_KEY = "quizite-theme";

  const errorEl = document.querySelector("#results-error");
  const errorMsgEl = document.querySelector("#results-error-msg");
  const errorQuizLink = document.querySelector("#error-quiz-link");
  const containerEl = document.querySelector("#results-container");
  const quizTitleEl = document.querySelector("#results-quiz-title");
  const quizIconEl = document.querySelector("#results-quiz-icon");
  const badgeEl = document.querySelector("#results-badge");
  const titleEl = document.querySelector("#results-title");
  const scoreEl = document.querySelector("#results-score-count");
  const totalEl = document.querySelector("#results-total-count");
  const percentageEl = document.querySelector("#results-percentage");
  const totalQuestionsEl = document.querySelector("#results-total-questions");
  const ungradedNoteEl = document.querySelector("#results-ungraded-note");
  const breakdownList = document.querySelector("#results-breakdown-list");
  const returnToQuizLink = document.querySelector("#return-to-quiz-link");

  const escapeHtml = (value) =>
    String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");

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
  const preferredTheme = window.matchMedia("(prefers-color-scheme: dark)")
    .matches
    ? "dark"
    : "light";
  applyTheme(savedTheme || preferredTheme);

  document
    .querySelector("[data-theme-toggle]")
    ?.addEventListener("click", () => {
      const nextTheme =
        document.documentElement.dataset.theme === "dark" ? "light" : "dark";
      localStorage.setItem(THEME_KEY, nextTheme);
      applyTheme(nextTheme);
    });

  const getQuizIdFromUrl = () => {
    const match = window.location.pathname.match(
      /^\/quiz\/([^/]+)\/results\/?$/,
    );
    return match ? match[1] : null;
  };

  const isValidQuizId = (quizId) =>
    typeof quizId === "string" && /^[a-f0-9]{24}$/i.test(quizId);

  const showError = (message, quizId) => {
    containerEl.hidden = true;
    errorEl.hidden = false;
    errorMsgEl.textContent = message;
    if (isValidQuizId(quizId)) {
      errorQuizLink.href = `/quiz/${encodeURIComponent(quizId)}`;
    }
  };

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

  const renderScoreTitle = (percentage) => {
    if (percentage >= 80) {
      badgeEl.className = "results-score-badge";
      titleEl.textContent = "Excellent Job! 🎉";
    } else if (percentage >= 50) {
      badgeEl.className = "results-score-badge is-mid";
      titleEl.textContent = "Good Effort! 👍";
    } else {
      badgeEl.className = "results-score-badge is-low";
      titleEl.textContent = "Keep Practicing! 💪";
    }
  };

  const renderResults = (result, quizId) => {
    const totalQuestions = Number(result.totalQuestions) || 0;
    const gradedQuestions =
      typeof result.gradedQuestions === "number"
        ? result.gradedQuestions
        : totalQuestions;
    const percentage = Number(result.percentage) || 0;
    const revealAnswers = result.showCorrectAnswers === true;
    const quizTitle = result.quizTitle || "Quiz results";

    document.title = `${quizTitle} — Results — Quizite`;
    quizTitleEl.textContent = quizTitle;
    renderQuizIcon(result.quizIcon);

    badgeEl.textContent = `${percentage}%`;
    percentageEl.textContent = `${percentage}%`;
    scoreEl.textContent = String(result.score);
    totalEl.textContent = String(gradedQuestions);
    renderScoreTitle(percentage);

    const ungradedCount = Math.max(totalQuestions - gradedQuestions, 0);
    totalQuestionsEl.textContent =
      ungradedCount > 0
        ? `${totalQuestions} total questions · ${ungradedCount} not auto-graded`
        : `${totalQuestions} total ${totalQuestions === 1 ? "question" : "questions"}`;

    const hasUngraded = (result.results || []).some(
      (question) => question.graded === false,
    );
    ungradedNoteEl.hidden = !hasUngraded;

    breakdownList.innerHTML = (result.results || [])
      .map((question, index) => {
        const isUngraded = question.graded === false;
        const stateClass = isUngraded
          ? "is-ungraded"
          : question.isCorrect
            ? "is-correct"
            : "is-incorrect";
        const statusLabel = isUngraded
          ? "• Not graded"
          : question.isCorrect
            ? "✓ Correct"
            : "✕ Incorrect";

        const correctAnswer =
          revealAnswers &&
          !isUngraded &&
          !question.isCorrect &&
          question.correctAnswer
            ? `<span class="review-answer-line">Correct answer: <strong class="review-correct-text">${escapeHtml(question.correctAnswer)}</strong></span>`
            : "";

        return `
          <div class="review-item ${stateClass}">
            <div class="review-item__top">
              <h4 class="review-item__title">Q${index + 1}: ${escapeHtml(question.title)}</h4>
              <span class="review-status-tag ${stateClass}">
                ${statusLabel}
              </span>
            </div>
            <div class="review-item__details">
              <span class="review-answer-line">
                Your answer: <strong>${escapeHtml(question.userAnswer || "No answer")}</strong>
              </span>
              ${correctAnswer}
            </div>
          </div>`;
      })
      .join("");

    returnToQuizLink.href = `/quiz/${encodeURIComponent(quizId)}`;
    returnToQuizLink.textContent = result.allowRetakes
      ? "Retake quiz"
      : "Back to quiz";

    errorEl.hidden = true;
    containerEl.hidden = false;
  };

  const initialize = () => {
    const quizId = getQuizIdFromUrl();

    if (!isValidQuizId(quizId)) {
      showError("This results link is invalid.", quizId);
      return;
    }

    const result = window.QuiziteResultStore?.load(quizId);

    if (
      !result ||
      !Array.isArray(result.results) ||
      !Number.isFinite(Number(result.score)) ||
      !Number.isFinite(Number(result.percentage))
    ) {
      showError(
        "These results are no longer available. Please return to the quiz and submit your answers again.",
        quizId,
      );
      return;
    }

    renderResults(result, quizId);
  };

  initialize();
})();
