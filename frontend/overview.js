const THEME_KEY = "quizite-theme";
const PAGE_SIZE = 10;
const previewMode = new URLSearchParams(window.location.search).get("demo");
const isDemoMode = previewMode === "1" || previewMode === "demo";

const getCookie = (name) => {
  const match = document.cookie.match(
    new RegExp("(?:^|;\\s*)" + name + "=([^;]*)"),
  );
  return match ? decodeURIComponent(match[1]) : null;
};

const getStoredUserFromCookie = () => {
  try {
    let raw = getCookie("quizite_user");
    if (!raw) return null;
    if (typeof raw === "string" && raw.startsWith("%")) {
      raw = decodeURIComponent(raw);
    }
    const parsed = JSON.parse(raw);
    if (parsed && (parsed.username || parsed.id)) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
};

const demoQuizzes = [
  {
    id: "demo-1",
    title: "Tiny geography adventure",
    description: "A breezy trip around maps, mountains, and famous places.",
    questionCount: 8,
    status: "published",
    likeCount: 12,
    likedByMe: true,
    owner: { username: "Maya" },
    updatedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "demo-2",
    title: "Movie night warm-up",
    description: "How well do you know your popcorn classics?",
    questionCount: 6,
    status: "draft",
    likeCount: 0,
    likedByMe: false,
    owner: { username: "Maya" },
    updatedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
  },
];

const demoState = {
  authenticated: true,
  user: { username: "Maya" },
  quizzes: demoQuizzes,
  meta: null,
  taken: null,
  takenLoading: false,
  liked: [demoQuizzes[0]],
  likedMeta: null,
  likedLoading: false,
  likedCount: 1,
  likedError: null,
  section: "owned",
  page: 1,
  error: null,
};

const guestState = {
  authenticated: false,
  user: null,
  quizzes: [],
  meta: null,
  taken: null,
  takenLoading: false,
  liked: null,
  likedMeta: null,
  likedLoading: false,
  likedCount: null,
  likedError: null,
  section: "owned",
  page: 1,
  error: null,
};

const readInitialState = () => {
  if (isDemoMode) return { ...demoState };
  if (previewMode === "empty") {
    return {
      ...demoState,
      section: "owned",
      quizzes: [],
      liked: [],
      likedCount: 0,
    };
  }
  if (previewMode === "guest") {
    return { ...guestState };
  }

  const user = getStoredUserFromCookie();
  const token = getCookie("jwt");

  if (user) {
    return {
      authenticated: true,
      user,
      quizzes: [],
      meta: null,
      taken: null,
      takenLoading: false,
      liked: null,
      likedMeta: null,
      likedLoading: false,
      likedCount: null,
      likedError: null,
      section: "owned",
      page: 1,
      error: null,
    };
  }

  if (token) {
    return {
      authenticated: true,
      user: { username: "Account" },
      quizzes: [],
      meta: null,
      taken: null,
      takenLoading: false,
      liked: null,
      likedMeta: null,
      likedLoading: false,
      likedCount: null,
      likedError: null,
      section: "owned",
      page: 1,
      error: null,
    };
  }

  return { ...guestState };
};

let state = readInitialState();
let toastTimer;
let deleteTarget = null;
let deleteTrigger = null;
let isDeleting = false;
const pendingLikes = new Set();

const accountArea = document.querySelector("#account-area");
const pageContent = document.querySelector("#page-content");
const toast = document.querySelector("#toast");
const sidebar = document.querySelector("#sidebar");
const sidebarScrim = document.querySelector(".sidebar-scrim");
const takenBadge = document.querySelector("#taken-badge");
const likedBadge = document.querySelector("#liked-badge");
const deleteModal = document.querySelector("#delete-quiz-modal");
const deleteModalTitle = document.querySelector("#delete-modal-quiz-title");
const deleteModalError = document.querySelector("#delete-modal-error");
const deleteModalCancel = document.querySelector("#delete-modal-cancel");
const deleteModalConfirm = document.querySelector("#delete-modal-confirm");

const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const formatRelativeDate = (dateString, verb = "Updated") => {
  if (!dateString) return "";
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "";

  const now = new Date();
  const diffMs = now - date;
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMinutes < 1) return `${verb} just now`;
  if (diffMinutes < 60) return `${verb} ${diffMinutes}m ago`;
  if (diffHours < 24) return `${verb} ${diffHours}h ago`;
  if (diffDays === 1) return `${verb} yesterday`;
  if (diffDays < 30) return `${verb} ${diffDays} days ago`;

  return `${verb} on ${date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })}`;
};

const showToast = (message) => {
  window.clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add("is-visible");
  toastTimer = window.setTimeout(() => {
    toast.classList.remove("is-visible");
  }, 3200);
};

const setSidebarOpen = (isOpen) => {
  sidebar.classList.toggle("is-open", isOpen);
  sidebarScrim.classList.toggle("is-visible", isOpen);
};

const renderAccount = () => {
  if (!state.authenticated || !state.user) {
    accountArea.innerHTML = `
      <div class="account-actions">
        <a class="btn" href="/login">Log in</a>
        <a class="btn btn--primary" href="/signup">Sign up</a>
      </div>`;
    return;
  }

  const username = escapeHtml(state.user.username);
  const initial = username.charAt(0).toUpperCase() || "U";

  accountArea.innerHTML = `
    <div class="account-menu">
      <button
        class="account-trigger"
        type="button"
        aria-expanded="false"
        aria-haspopup="true"
        aria-controls="account-dropdown"
        aria-label="User menu for ${username}"
      >
        <span class="account-avatar" aria-hidden="true">${initial}</span>
        <span class="account-trigger__name">${username}</span>
        <span class="account-trigger__chevron" aria-hidden="true">▼</span>
      </button>
      <div class="account-dropdown" id="account-dropdown" role="menu" hidden>
        <button class="account-dropdown-item" type="button" data-account-action="profile" role="menuitem">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M10.561 8.073a6.005 6.005 0 0 1 3.432 5.142.75.75 0 1 1-1.498.07 4.5 4.5 0 0 0-8.99 0 .75.75 0 0 1-1.498-.07 6.004 6.004 0 0 1 3.431-5.142 3.999 3.999 0 1 1 5.123 0ZM10.5 5a2.5 2.5 0 1 0-5 0 2.5 2.5 0 0 0 5 0Z"></path>
          </svg>
          Profile information
        </button>
        <div class="account-dropdown-divider" role="separator"></div>
        <button class="account-dropdown-item" type="button" data-account-action="logout" role="menuitem">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M2 2.75C2 1.784 2.784 1 3.75 1h2.5a.75.75 0 0 1 0 1.5h-2.5a.25.25 0 0 0-.25.25v10.5c0 .138.112.25.25.25h2.5a.75.75 0 0 1 0 1.5h-2.5A1.75 1.75 0 0 1 2 13.25Zm10.44 3.97a.75.75 0 0 1 1.06 0l2.25 2.25a.75.75 0 0 1 0 1.06l-2.25 2.25a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042l.97-.97H6.75a.75.75 0 0 1 0-1.5h6.66l-.97-.97a.75.75 0 0 1 0-1.06Z"></path>
          </svg>
          Log out
        </button>
      </div>
    </div>`;
};

const CARD_STICKERS = ["✨", "🚀", "💡", "🎨", "🍿", "🎉", "🌟", "🎈", "🧠", "🎯"];

const HEART_FILLED_PATH =
  "M8 1.314C12.438-3.248 23.534 4.735 8 15-7.534 4.736 3.562-3.248 8 1.314Z";
const HEART_OUTLINE_PATH =
  "M8 2.748-.717-.737C5.6.281 2.514.878 1.4 3.053c-.523 1.023-.641 2.5.314 4.385.92 1.815 2.834 3.989 6.286 6.357 3.452-2.368 5.365-4.542 6.286-6.357.955-1.886.838-3.362.314-4.385C13.486.878 10.4.28 8.717 2.01L8 2.748ZM8 15C-7.333 4.868 3.279-3.04 7.824 1.143c.06.055.119.112.176.171a3.12 3.12 0 0 1 .176-.17C12.72-3.042 23.333 4.867 8 15Z";

const getQuizId = (quiz) => String(quiz.id || quiz._id || "");

const renderTakeAction = (quiz) => {
  const quizId = getQuizId(quiz);

  if (!quiz.completedByMe) {
    return `<a class="btn-subtle" href="/quiz/${quizId}">Take quiz</a>`;
  }

  if (quiz.allowRetakes) {
    return `<a class="btn-subtle" href="/quiz/${quizId}">Take again</a>`;
  }

  return "";
};

const renderLikeButton = (quiz) => {
  if (!state.authenticated) return "";

  const liked = Boolean(quiz.likedByMe);
  if (quiz.status === "draft" && !liked) return "";

  const quizId = getQuizId(quiz);
  const likeCount = Number(quiz.likeCount) || 0;
  const title = escapeHtml(quiz.title);
  const label = liked
    ? `Unlike ${title} (${likeCount} likes)`
    : `Like ${title} (${likeCount} likes)`;

  return `
    <button
      class="like-button like-button--card${liked ? " is-liked" : ""}"
      type="button"
      data-action="like"
      data-quiz-id="${escapeHtml(quizId)}"
      data-quiz-title="${title}"
      aria-pressed="${liked}"
      aria-label="${label}"
      title="${liked ? "Remove your like" : "Like this quiz"}"
      ${pendingLikes.has(quizId) ? "disabled" : ""}
    >
      <svg viewBox="0 0 16 16" width="15" height="15" fill="currentColor" aria-hidden="true">
        <path d="${liked ? HEART_FILLED_PATH : HEART_OUTLINE_PATH}"></path>
      </svg>
      <span class="like-button__count">${likeCount}</span>
    </button>`;
};

const renderOwnedQuiz = (quiz, index = 0) => {
  const descriptionHtml =
    quiz.description && quiz.description.trim()
      ? `<p class="quiz-description">${escapeHtml(quiz.description.trim())}</p>`
      : "";

  const questionCount =
    typeof quiz.questionCount === "number"
      ? quiz.questionCount
      : quiz.questions || 0;
  const questionLabel = questionCount === 1 ? "question" : "questions";
  const updatedText = formatRelativeDate(quiz.updatedAt);

  const quizId = quiz.id || quiz._id;
  const status = quiz.status || "published";
  const statusLabel = status === "draft" ? "Draft" : "Published";
  const sticker = CARD_STICKERS[index % CARD_STICKERS.length];
  const ownerActions = isDemoMode
    ? ""
    : `
          <button class="btn-subtle" type="button" data-action="edit" data-quiz-id="${quizId}" title="Edit this quiz" aria-label="Edit ${escapeHtml(quiz.title)}">
            Edit
          </button>
          <button class="btn-subtle btn-subtle--danger" type="button" data-action="delete" data-quiz-id="${quizId}" data-quiz-title="${escapeHtml(quiz.title)}" title="Delete this quiz" aria-label="Delete ${escapeHtml(quiz.title)}">
            Delete
          </button>`;

  return `
    <article class="quiz-card" aria-label="Quiz: ${escapeHtml(quiz.title)}">
      <div class="quiz-card-header">
        <span class="quiz-sticker" aria-hidden="true">${sticker}</span>
        <a class="quiz-title" href="/quiz/${quizId}">${escapeHtml(quiz.title)}</a>
        <span class="quiz-pill quiz-pill--${status}">${statusLabel}</span>
        <div class="quiz-card-actions">
          <button class="btn-subtle" type="button" data-action="copy-link" data-quiz-id="${quizId}" title="Copy unique quiz link" aria-label="Copy unique link for ${escapeHtml(quiz.title)}">
            <svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor" aria-hidden="true">
              <path d="m7.775 3.275 1.25-1.25a3.5 3.5 0 1 1 4.95 4.95l-2.5 2.5a3.5 3.5 0 0 1-4.95 0 .751.751 0 0 1 .018-1.042.751.751 0 0 1 1.042-.018 1.998 1.998 0 0 0 2.83 0l2.5-2.5a2.002 2.002 0 0 0-2.83-2.83l-1.25 1.25a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042Zm-4.69 9.64a1.998 1.998 0 0 0 2.83 0l1.25-1.25a.751.751 0 0 1 1.042.018.751.751 0 0 1 .018 1.042l-1.25 1.25a3.5 3.5 0 1 1-4.95-4.95l2.5-2.5a3.5 3.5 0 0 1 4.95 0 .751.751 0 0 1-.018 1.042.751.751 0 0 1-1.042.018 1.998 1.998 0 0 0-2.83 0l-2.5 2.5a1.998 1.998 0 0 0 0 2.83Z"></path>
            </svg>
            <span>Copy link</span>
          </button>
          ${renderTakeAction(quiz)}
          ${ownerActions}
        </div>
      </div>
      ${descriptionHtml}
      <div class="quiz-card-meta">
        <span class="quiz-meta-item">
          <span class="meta-dot" aria-hidden="true"></span>
          <span>${questionCount} ${questionLabel}</span>
        </span>
        ${renderLikeButton(quiz)}
        ${updatedText ? `<span class="quiz-meta-item">${escapeHtml(updatedText)}</span>` : ""}
      </div>
    </article>`;
};

const renderTakenQuiz = (quiz, index = 0) => {
  const descriptionHtml =
    quiz.description && quiz.description.trim()
      ? `<p class="quiz-description">${escapeHtml(quiz.description.trim())}</p>`
      : "";

  const questionCount = quiz.questionCount || 0;
  const questionLabel = questionCount === 1 ? "question" : "questions";
  const completedText = formatRelativeDate(quiz.lastCompletedAt, "Completed");
  const sticker = CARD_STICKERS[index % CARD_STICKERS.length];
  const attemptsLabel = quiz.attempts === 1 ? "attempt" : "attempts";
  const scoreText =
    quiz.lastPercentage === null || quiz.lastPercentage === undefined
      ? ""
      : `<span class="quiz-meta-item">Last score: <strong>${quiz.lastPercentage}%</strong></span>`;
  const takeAction = renderTakeAction(quiz);
  const takeActionHtml = takeAction
    ? `<div class="quiz-card-actions">${takeAction}</div>`
    : "";

  return `
    <article class="quiz-card" aria-label="Taken quiz: ${escapeHtml(quiz.title)}">
      <div class="quiz-card-header">
        <span class="quiz-sticker" aria-hidden="true">${sticker}</span>
        <a class="quiz-title" href="/quiz/${quiz.id}">${escapeHtml(quiz.title)}</a>
        <span class="quiz-pill quiz-pill--${quiz.status === "draft" ? "draft" : "published"}">${quiz.status === "draft" ? "Draft" : "Published"}</span>
        ${takeActionHtml}
      </div>
      ${descriptionHtml}
      <div class="quiz-card-meta">
        <span class="quiz-meta-item">
          <span class="meta-dot" aria-hidden="true"></span>
          <span>${questionCount} ${questionLabel}</span>
        </span>
        <span class="quiz-meta-item">${quiz.attempts} ${attemptsLabel}</span>
        ${scoreText}
        ${renderLikeButton(quiz)}
        ${completedText ? `<span class="quiz-meta-item">${escapeHtml(completedText)}</span>` : ""}
      </div>
    </article>`;
};

const renderLikedQuiz = (quiz, index = 0) => {
  const descriptionHtml =
    quiz.description && quiz.description.trim()
      ? `<p class="quiz-description">${escapeHtml(quiz.description.trim())}</p>`
      : "";

  const questionCount = quiz.questionCount || 0;
  const questionLabel = questionCount === 1 ? "question" : "questions";
  const updatedText = formatRelativeDate(quiz.updatedAt);
  const ownerName = quiz.owner?.username
    ? `<span class="quiz-meta-item">by <strong>${escapeHtml(quiz.owner.username)}</strong></span>`
    : "";
  const sticker = CARD_STICKERS[index % CARD_STICKERS.length];
  const quizId = getQuizId(quiz);
  const takeAction = renderTakeAction(quiz);
  const takeActionHtml = takeAction
    ? `<div class="quiz-card-actions">${takeAction}</div>`
    : "";

  return `
    <article class="quiz-card" aria-label="Liked quiz: ${escapeHtml(quiz.title)}">
      <div class="quiz-card-header">
        <span class="quiz-sticker" aria-hidden="true">${sticker}</span>
        <a class="quiz-title" href="/quiz/${quizId}">${escapeHtml(quiz.title)}</a>
        <span class="quiz-pill quiz-pill--${quiz.status === "draft" ? "draft" : "published"}">${quiz.status === "draft" ? "Draft" : "Published"}</span>
        ${takeActionHtml}
      </div>
      ${descriptionHtml}
      <div class="quiz-card-meta">
        <span class="quiz-meta-item">
          <span class="meta-dot" aria-hidden="true"></span>
          <span>${questionCount} ${questionLabel}</span>
        </span>
        ${ownerName}
        ${renderLikeButton(quiz)}
        ${updatedText ? `<span class="quiz-meta-item">${escapeHtml(updatedText)}</span>` : ""}
      </div>
    </article>`;
};

const renderPagination = (meta, action = "page") => {
  if (!meta || meta.totalPages <= 1) return "";

  return `
    <nav class="pagination" aria-label="Quiz list pagination">
      <button class="btn" type="button" data-action="${action}" data-page="${meta.page - 1}" ${meta.hasPrevPage ? "" : "disabled"}>
        ← Previous
      </button>
      <span class="pagination__info">Page ${meta.page} of ${meta.totalPages}</span>
      <button class="btn" type="button" data-action="${action}" data-page="${meta.page + 1}" ${meta.hasNextPage ? "" : "disabled"}>
        Next →
      </button>
    </nav>`;
};

const renderOwnedPage = () => {
  const count = state.meta?.total ?? state.quizzes.length;
  const headerHtml = `
    <div class="content-header">
      <div class="content-header__info">
        <h1>All your quizzes</h1>
        <span class="counter-badge" aria-label="${count} quizzes">${count}</span>
      </div>
      <button class="btn btn--primary" type="button" data-action="create">
        <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true">
          <path d="M7.75 2a.75.75 0 0 1 .75.75V7h4.25a.75.75 0 0 1 0 1.5H8.5v4.25a.75.75 0 0 1-1.5 0V8.5H2.75a.75.75 0 0 1 0-1.5H7V2.75A.75.75 0 0 1 7.75 2Z"></path>
        </svg>
        <span>Create a quiz</span>
      </button>
    </div>`;

  if (count === 0) {
    pageContent.innerHTML = `
      ${headerHtml}
      <section class="empty-state" aria-labelledby="empty-title">
        <div class="empty-state-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
            <line x1="12" y1="8" x2="12" y2="16"></line>
            <line x1="8" y1="12" x2="16" y2="12"></line>
          </svg>
        </div>
        <h2 id="empty-title">No quizzes yet</h2>
        <p>You haven’t created any quizzes yet. Start crafting your first set of curious questions today.</p>
        <button class="btn btn--primary" type="button" data-action="create">Create your first quiz</button>
      </section>`;
    return;
  }

  pageContent.innerHTML = `
    ${headerHtml}
    <section aria-label="Your quizzes">
      <div class="quiz-list">
        ${state.quizzes.map((quiz, idx) => renderOwnedQuiz(quiz, idx)).join("")}
      </div>
      ${renderPagination(state.meta)}
    </section>`;
};

const renderTakenPage = () => {
  const headerHtml = `
    <div class="content-header">
      <div class="content-header__info">
        <h1>Quizzes you have taken</h1>
        ${
          Array.isArray(state.taken)
            ? `<span class="counter-badge" aria-label="${state.taken.length} quizzes">${state.taken.length}</span>`
            : ""
        }
      </div>
    </div>`;

  if (state.takenLoading || state.taken === null) {
    pageContent.innerHTML = `
      ${headerHtml}
      <section class="empty-state" aria-label="Loading taken quizzes">
        <p>Loading quizzes you have taken…</p>
      </section>`;
    return;
  }

  if (state.taken.length === 0) {
    pageContent.innerHTML = `
      ${headerHtml}
      <section class="empty-state" aria-labelledby="taken-empty-title">
        <h2 id="taken-empty-title">Nothing here yet</h2>
        <p>Quizzes you complete while logged in will appear in this list.</p>
        <button class="btn btn--primary" type="button" data-section="owned">Browse your quizzes</button>
      </section>`;
    return;
  }

  pageContent.innerHTML = `
    ${headerHtml}
    <section aria-label="Quizzes you have taken">
      <div class="quiz-list">
        ${state.taken.map((quiz, idx) => renderTakenQuiz(quiz, idx)).join("")}
      </div>
    </section>`;
};

const renderLikedPage = () => {
  const total = state.likedMeta?.total ?? state.liked?.length ?? 0;
  const headerHtml = `
    <div class="content-header">
      <div class="content-header__info">
        <h1>Liked quizzes</h1>
        ${
          Array.isArray(state.liked)
            ? `<span class="counter-badge" aria-label="${total} liked quizzes">${total}</span>`
            : ""
        }
      </div>
    </div>`;

  if (state.likedError) {
    pageContent.innerHTML = `
      ${headerHtml}
      <div class="retry-banner" role="alert">
        <span>${escapeHtml(state.likedError)}</span>
        <button class="btn btn--primary" type="button" data-action="retry-liked">Retry</button>
      </div>`;
    return;
  }

  if (state.likedLoading || state.liked === null) {
    pageContent.innerHTML = `
      ${headerHtml}
      <section class="empty-state" aria-label="Loading liked quizzes">
        <p>Loading quizzes you liked…</p>
      </section>`;
    return;
  }

  if (state.liked.length === 0) {
    pageContent.innerHTML = `
      ${headerHtml}
      <section class="empty-state" aria-labelledby="liked-empty-title">
        <div class="empty-state-icon" aria-hidden="true">
          <svg viewBox="0 0 16 16" width="28" height="28" fill="currentColor">
            <path d="${HEART_OUTLINE_PATH}"></path>
          </svg>
        </div>
        <h2 id="liked-empty-title">No liked quizzes yet</h2>
        <p>Tap the heart on a quiz you enjoy and it will appear here for easy access.</p>
        <button class="btn btn--primary" type="button" data-section="owned">Browse your quizzes</button>
      </section>`;
    return;
  }

  pageContent.innerHTML = `
    ${headerHtml}
    <section aria-label="Quizzes you have liked">
      <div class="quiz-list">
        ${state.liked.map((quiz, idx) => renderLikedQuiz(quiz, idx)).join("")}
      </div>
      ${renderPagination(state.likedMeta, "liked-page")}
    </section>`;
};

const renderNav = () => {
  document.querySelectorAll("[data-section]").forEach((button) => {
    const isActive = button.dataset.section === state.section;
    button.classList.toggle("nav-item--active", isActive);
    if (isActive) {
      button.setAttribute("aria-current", "page");
    } else {
      button.removeAttribute("aria-current");
    }
  });

  if (takenBadge) {
    if (Array.isArray(state.taken)) {
      takenBadge.hidden = false;
      takenBadge.textContent = String(state.taken.length);
    } else {
      takenBadge.hidden = true;
    }
  }

  if (likedBadge) {
    if (typeof state.likedCount === "number") {
      likedBadge.hidden = false;
      likedBadge.textContent = String(state.likedCount);
    } else {
      likedBadge.hidden = true;
    }
  }
};

const render = () => {
  renderAccount();
  renderNav();

  if (!state.authenticated) {
    const retryBannerHtml = state.error
      ? `
      <div class="retry-banner" role="alert">
        <span>${escapeHtml(state.error)}</span>
        <button class="btn btn--primary" type="button" data-action="retry">Retry</button>
      </div>`
      : "";

    pageContent.innerHTML = `
      ${retryBannerHtml}
      <section class="guest-state" aria-labelledby="guest-title">
        <div class="guest-state-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm0 14v-4m0-4h.01"></path>
          </svg>
        </div>
        <h2 id="guest-title">Welcome to Quizite</h2>
        <p>Your central place for creating, organizing, and tracking quizzes. Log in or create an account to view and manage your quizzes.</p>
        <div class="state-actions">
          <a class="btn btn--primary" href="/login">Log in</a>
          <a class="btn" href="/signup">Sign up</a>
        </div>
      </section>`;
    return;
  }

  if (state.section === "taken") {
    renderTakenPage();
  } else if (state.section === "liked") {
    renderLikedPage();
  } else {
    renderOwnedPage();
  }
};

const loadOverview = async (page = state.page) => {
  try {
    const response = await fetch(
      `/api/overview?page=${page}&limit=${PAGE_SIZE}`,
      { credentials: "include" },
    );

    if (response.status === 401) {
      document.cookie =
        "jwt=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT;";
      document.cookie =
        "quizite_user=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT;";
      state = { ...guestState, error: null };
      render();
      return;
    }

    if (!response.ok) {
      throw new Error(`Overview request failed (${response.status})`);
    }

    const payload = await response.json();
    const { user, quizzes, likedQuizCount } = payload.data || {};

    if (!user?.username || !Array.isArray(quizzes)) {
      throw new Error("Overview response was incomplete");
    }

    state.authenticated = true;
    state.user = user;
    state.quizzes = quizzes;
    state.meta = payload.meta || null;
    state.likedCount =
      typeof likedQuizCount === "number" ? likedQuizCount : null;
    state.page = payload.meta?.page || page;
    state.error = null;
    render();
  } catch (error) {
    state = {
      ...guestState,
      error: "We could not load your overview. Please try again shortly.",
    };
    render();
    showToast("We could not load your overview. Please try again shortly.");
  }
};

const loadTaken = async () => {
  if (state.takenLoading) return;
  state.takenLoading = true;
  render();

  try {
    const response = await fetch("/api/users/me/completed", {
      credentials: "include",
    });

    if (response.status === 401) {
      document.cookie =
        "jwt=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT;";
      document.cookie =
        "quizite_user=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT;";
      state = { ...guestState, error: null };
      render();
      return;
    }

    if (!response.ok) {
      throw new Error(`Taken request failed (${response.status})`);
    }

    const payload = await response.json();
    state.taken = Array.isArray(payload.data?.quizzes)
      ? payload.data.quizzes
      : [];
  } catch {
    state.taken = [];
    showToast("We could not load the quizzes you have taken.");
  } finally {
    state.takenLoading = false;
    render();
  }
};

const loadLiked = async (page = 1) => {
  if (state.likedLoading) return;
  state.likedLoading = true;
  state.likedError = null;
  render();

  try {
    const response = await fetch(
      `/api/users/me/liked?page=${page}&limit=${PAGE_SIZE}`,
      { credentials: "include" },
    );

    if (response.status === 401) {
      document.cookie =
        "jwt=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT;";
      document.cookie =
        "quizite_user=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT;";
      state = { ...guestState, error: null };
      render();
      return;
    }

    if (!response.ok) {
      throw new Error(`Liked quizzes request failed (${response.status})`);
    }

    const payload = await response.json();
    state.liked = Array.isArray(payload.data?.quizzes)
      ? payload.data.quizzes
      : [];
    state.likedMeta = payload.meta || null;
    if (typeof payload.meta?.total === "number") {
      state.likedCount = payload.meta.total;
    }
  } catch {
    state.liked = [];
    state.likedMeta = null;
    state.likedError =
      "We could not load the quizzes you liked. Please try again.";
    showToast("We could not load the quizzes you liked.");
  } finally {
    state.likedLoading = false;
    render();
  }
};

const syncLikeButtons = (quizId, liked, likeCount) => {
  document.querySelectorAll("[data-action='like']").forEach((button) => {
    if (button.dataset.quizId !== String(quizId)) return;

    button.classList.toggle("is-liked", liked);
    button.setAttribute("aria-pressed", String(liked));
    button.disabled = pendingLikes.has(String(quizId));

    const countEl = button.querySelector(".like-button__count");
    if (countEl) countEl.textContent = String(likeCount);

    const path = button.querySelector("path");
    if (path) {
      path.setAttribute(
        "d",
        liked ? HEART_FILLED_PATH : HEART_OUTLINE_PATH,
      );
    }

    const title = button.dataset.quizTitle || "this quiz";
    button.setAttribute(
      "aria-label",
      `${liked ? "Unlike" : "Like"} ${title} (${likeCount} likes)`,
    );
    button.title = liked ? "Remove your like" : "Like this quiz";
  });
};

const findQuiz = (quizId) => {
  const collections = [state.quizzes, state.taken, state.liked];
  for (const collection of collections) {
    if (!Array.isArray(collection)) continue;
    const quiz = collection.find((item) => getQuizId(item) === String(quizId));
    if (quiz) return quiz;
  }
  return null;
};

const applyLikeState = (quizId, liked, likeCount) => {
  const collections = [state.quizzes, state.taken, state.liked];
  for (const collection of collections) {
    if (!Array.isArray(collection)) continue;
    for (const quiz of collection) {
      if (getQuizId(quiz) !== String(quizId)) continue;
      quiz.likedByMe = liked;
      quiz.likeCount = likeCount;
    }
  }
};

const toggleQuizLike = async (button) => {
  if (!state.authenticated) {
    window.location.href = "/login";
    return;
  }

  const quizId = button.dataset.quizId;
  const quiz = findQuiz(quizId);
  if (!quiz || pendingLikes.has(quizId)) return;

  const previousLiked = Boolean(quiz.likedByMe);
  const previousCount = Number(quiz.likeCount) || 0;
  const nextLiked = !previousLiked;
  const nextCount = Math.max(previousCount + (nextLiked ? 1 : -1), 0);

  pendingLikes.add(quizId);
  quiz.likedByMe = nextLiked;
  quiz.likeCount = nextCount;
  syncLikeButtons(quizId, nextLiked, nextCount);

  // The ?demo=1 overview is a static preview without a backing quiz; keep its
  // heart toggle purely local so it never fires a doomed request.
  if (isDemoMode) {
    pendingLikes.delete(quizId);
    applyLikeState(quizId, nextLiked, nextCount);
    if (typeof state.likedCount === "number") {
      state.likedCount = Math.max(
        state.likedCount + (nextLiked ? 1 : -1),
        0,
      );
    }
    if (state.section === "liked" && !nextLiked) {
      state.liked = (state.liked || []).filter(
        (item) => getQuizId(item) !== String(quizId),
      );
      if (state.likedMeta) {
        state.likedMeta.total = Math.max((state.likedMeta.total || 1) - 1, 0);
      }
      state.likedCount = state.likedMeta?.total ?? state.liked.length;
      render();
      return;
    }
    if (!nextLiked) {
      state.liked = (state.liked || []).filter(
        (item) => getQuizId(item) !== String(quizId),
      );
    }
    syncLikeButtons(quizId, nextLiked, nextCount);
    renderNav();
    return;
  }

  try {
    const response = await fetch(`/api/quizzes/${quizId}/like`, {
      method: nextLiked ? "POST" : "DELETE",
      credentials: "include",
    });
    const payload = await response.json().catch(() => null);

    if (response.status === 401) {
      applyLikeState(quizId, previousLiked, previousCount);
      showToast("Please log in to like quizzes.");
      window.setTimeout(() => {
        window.location.href = "/login";
      }, 900);
      return;
    }

    if (!response.ok) {
      throw new Error(
        payload?.message || "Could not update your like. Please try again.",
      );
    }

    const liked = Boolean(payload?.data?.liked);
    const likeCount = Math.max(Number(payload?.data?.likeCount) || 0, 0);
    applyLikeState(quizId, liked, likeCount);

    if (previousLiked !== liked && typeof state.likedCount === "number") {
      state.likedCount = Math.max(
        state.likedCount + (liked ? 1 : -1),
        0,
      );
    }

    if (state.section === "liked" && !liked) {
      state.liked = (state.liked || []).filter(
        (item) => getQuizId(item) !== String(quizId),
      );
      if (state.likedMeta) {
        const total = Math.max((state.likedMeta.total || 1) - 1, 0);
        state.likedMeta.total = total;
        state.likedMeta.totalPages = Math.max(
          Math.ceil(total / state.likedMeta.limit),
          1,
        );
        state.likedCount = total;
      }
      if (
        state.liked.length === 0 &&
        state.likedMeta &&
        state.likedMeta.page > 1
      ) {
        loadLiked(state.likedMeta.page - 1);
        return;
      }
      render();
      return;
    }

    if (state.section !== "liked") {
      state.liked = null;
      state.likedMeta = null;
    }

    syncLikeButtons(quizId, liked, likeCount);
    renderNav();
  } catch (error) {
    applyLikeState(quizId, previousLiked, previousCount);
    syncLikeButtons(quizId, previousLiked, previousCount);
    showToast(
      error.message || "A network error occurred while updating your like.",
    );
  } finally {
    pendingLikes.delete(quizId);
    syncLikeButtons(
      quizId,
      Boolean(findQuiz(quizId)?.likedByMe),
      Number(findQuiz(quizId)?.likeCount) || 0,
    );
  }
};

const closeAccountMenu = () => {
  const trigger = document.querySelector(".account-trigger");
  const dropdown = document.querySelector(".account-dropdown");
  if (trigger && dropdown) {
    trigger.setAttribute("aria-expanded", "false");
    dropdown.hidden = true;
  }
};

const setDeleteError = (message = "") => {
  deleteModalError.textContent = message;
  deleteModalError.hidden = !message;
};

const setDeleteBusy = (busy) => {
  isDeleting = busy;
  deleteModalConfirm.disabled = busy;
  deleteModalConfirm.textContent = busy ? "Deleting…" : "Delete quiz";
  deleteModalCancel.disabled = busy;
  deleteModal.setAttribute("aria-busy", String(busy));
};

const openDeleteModal = (quizId, quizTitle, trigger) => {
  if (isDeleting) return;

  deleteTarget = { quizId, quizTitle };
  deleteTrigger = trigger;
  deleteModalTitle.textContent = quizTitle;
  setDeleteError();
  setDeleteBusy(false);
  deleteModal.hidden = false;
  document.body.classList.add("delete-modal-open");
  closeAccountMenu();
  setSidebarOpen(false);
  deleteModalCancel.focus();
};

const closeDeleteModal = () => {
  if (deleteModal.hidden) return;

  const trigger = deleteTrigger;
  deleteModal.hidden = true;
  document.body.classList.remove("delete-modal-open");
  setDeleteError();
  setDeleteBusy(false);
  deleteTarget = null;
  deleteTrigger = null;

  if (trigger?.isConnected) {
    trigger.focus();
  } else {
    document.querySelector("#main-content")?.focus();
  }
};

const deleteSelectedQuiz = async () => {
  if (isDeleting || !deleteTarget) return;

  const { quizId } = deleteTarget;
  setDeleteError();
  setDeleteBusy(true);

  try {
    const response = await fetch(`/api/quizzes/${quizId}`, {
      method: "DELETE",
      credentials: "include",
    });

    if (response.status === 204) {
      if (state.quizzes.length === 1 && state.page > 1) {
        await loadOverview(state.page - 1);
      } else {
        await loadOverview(state.page);
      }
      state.taken = null;
      closeDeleteModal();
      showToast("Quiz deleted.");
      return;
    }

    const payload = await response.json().catch(() => null);
    setDeleteError(
      payload?.message || "Could not delete this quiz. Please try again.",
    );
    setDeleteBusy(false);
  } catch {
    setDeleteError(
      "A network error occurred while deleting this quiz. Please try again.",
    );
    setDeleteBusy(false);
  }
};

deleteModalCancel.addEventListener("click", () => {
  if (!isDeleting) closeDeleteModal();
});

deleteModalConfirm.addEventListener("click", deleteSelectedQuiz);

deleteModal.addEventListener("click", (event) => {
  if (event.target === deleteModal && !isDeleting) {
    closeDeleteModal();
  }
});

deleteModal.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    if (!isDeleting) closeDeleteModal();
    return;
  }

  if (event.key !== "Tab") return;

  const focusable = Array.from(
    deleteModal.querySelectorAll(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  );
  if (focusable.length === 0) return;

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const active = document.activeElement;

  if (event.shiftKey && (active === first || !deleteModal.contains(active))) {
    event.preventDefault();
    last.focus();
  } else if (
    !event.shiftKey &&
    (active === last || !deleteModal.contains(active))
  ) {
    event.preventDefault();
    first.focus();
  }
});

// Global click delegation
document.addEventListener("click", async (event) => {
  // 1. Account trigger click
  const trigger = event.target.closest(".account-trigger");
  if (trigger) {
    const dropdown = document.querySelector(".account-dropdown");
    const isExpanded = trigger.getAttribute("aria-expanded") === "true";
    trigger.setAttribute("aria-expanded", String(!isExpanded));
    dropdown.hidden = isExpanded;
    return;
  }

  // Close account menu on click outside
  if (!event.target.closest(".account-menu")) {
    closeAccountMenu();
  }

  // 2. Mobile sidebar open/close
  if (event.target.closest("[data-sidebar-open]")) {
    setSidebarOpen(true);
  }
  if (event.target.closest("[data-sidebar-close]")) {
    setSidebarOpen(false);
  }

  // 3. Auth actions (Log in / Sign up)
  const authButton = event.target.closest("[data-auth-action]");
  if (authButton) {
    const action = authButton.dataset.authAction;
    window.location.href = action === "login" ? "/login" : "/signup";
  }

  // 4. Create quiz action
  const createButton = event.target.closest("[data-action='create']");
  if (createButton) {
    if (!state.authenticated) {
      window.location.href = "/login";
      return;
    }
    window.location.href = "/create";
    return;
  }

  // 5. Sidebar section switching
  const sectionButton = event.target.closest("[data-section]");
  if (sectionButton) {
    const section = sectionButton.dataset.section;
    if (section === "liked" && !state.authenticated) {
      window.location.href = "/login";
      return;
    }
    if (section === "taken" || section === "liked") {
      state.section = section;
    } else {
      state.section = "owned";
    }
    if (state.section === "taken" && state.taken === null) {
      loadTaken();
    } else if (state.section === "liked" && state.liked === null) {
      loadLiked(1);
    } else {
      render();
    }
    setSidebarOpen(false);
    return;
  }

  // 6. Like / unlike a quiz from a dashboard card
  const likeButton = event.target.closest("[data-action='like']");
  if (likeButton) {
    toggleQuizLike(likeButton);
    return;
  }

  // 7. Copy unique link action
  const copyLinkButton = event.target.closest("[data-action='copy-link']");
  if (copyLinkButton) {
    const quizId = copyLinkButton.dataset.quizId;
    const url = `${window.location.origin}/quiz/${quizId}`;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(
        () => showToast("Unique quiz link copied to clipboard!"),
        () => showToast(`Share link: ${url}`),
      );
    } else {
      showToast(`Share link: ${url}`);
    }
    return;
  }

  // 7. Edit quiz action
  const editButton = event.target.closest("[data-action='edit']");
  if (editButton) {
    window.location.href = `/quiz/${editButton.dataset.quizId}/edit`;
    return;
  }

  // 8. Delete quiz action
  const deleteButton = event.target.closest("[data-action='delete']");
  if (deleteButton) {
    openDeleteModal(
      deleteButton.dataset.quizId,
      deleteButton.dataset.quizTitle || "this quiz",
      deleteButton,
    );
    return;
  }

  // 9. Pagination actions
  const pageButton = event.target.closest("[data-action='page']");
  if (pageButton && !pageButton.disabled) {
    const page = Number(pageButton.dataset.page);
    if (Number.isFinite(page) && page >= 1) {
      loadOverview(page);
    }
    return;
  }

  const likedPageButton = event.target.closest("[data-action='liked-page']");
  if (likedPageButton && !likedPageButton.disabled) {
    const page = Number(likedPageButton.dataset.page);
    if (Number.isFinite(page) && page >= 1) {
      loadLiked(page);
    }
    return;
  }

  const retryButton = event.target.closest("[data-action='retry']");
  if (retryButton) {
    showToast("Retrying connection...");
    loadOverview(1);
    return;
  }

  const retryLikedButton = event.target.closest(
    "[data-action='retry-liked']",
  );
  if (retryLikedButton) {
    loadLiked(state.likedMeta?.page || 1);
    return;
  }

  // 10. Account dropdown actions
  const accountAction = event.target.closest("[data-account-action]");
  if (accountAction) {
    const action = accountAction.dataset.accountAction;
    closeAccountMenu();

    if (action === "profile") {
      window.location.href = "/profile";
    } else if (action === "logout") {
      try {
        await fetch("/api/auth/logout");
      } catch {
        // Fallback if offline
      }
      document.cookie =
        "jwt=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT;";
      document.cookie =
        "quizite_user=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT;";
      state = { ...guestState, error: null };
      render();
      showToast("You have been logged out.");
    }
  }
});

// Keyboard accessibility: Escape closes dropdown and mobile drawer
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeAccountMenu();
    setSidebarOpen(false);
  }
});

// Theme management
const applyTheme = (theme) => {
  document.documentElement.dataset.theme = theme;
  const isDark = theme === "dark";
  const toggleBtn = document.querySelector("[data-theme-toggle]");
  if (toggleBtn) {
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

const themeToggle = document.querySelector("[data-theme-toggle]");
if (themeToggle) {
  themeToggle.addEventListener("click", () => {
    const nextTheme =
      document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    localStorage.setItem(THEME_KEY, nextTheme);
    applyTheme(nextTheme);
  });
}

// Initial render
render();

// If not in forced demo mode, fetch real overview from server
if (!previewMode) {
  loadOverview(1);
}
