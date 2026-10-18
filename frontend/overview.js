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

const demoState = {
  authenticated: true,
  user: { username: "Maya" },
  quizzes: [
    {
      id: "demo-1",
      title: "Tiny geography adventure",
      description: "A breezy trip around maps, mountains, and famous places.",
      questionCount: 8,
      status: "published",
      updatedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: "demo-2",
      title: "Movie night warm-up",
      description: "How well do you know your popcorn classics?",
      questionCount: 6,
      status: "draft",
      updatedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    },
  ],
  meta: null,
  taken: null,
  takenLoading: false,
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
      section: "owned",
      page: 1,
      error: null,
    };
  }

  return { ...guestState };
};

let state = readInitialState();
let toastTimer;

const accountArea = document.querySelector("#account-area");
const pageContent = document.querySelector("#page-content");
const toast = document.querySelector("#toast");
const sidebar = document.querySelector("#sidebar");
const sidebarScrim = document.querySelector(".sidebar-scrim");
const takenBadge = document.querySelector("#taken-badge");

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
          <a class="btn-subtle" href="/quiz/${quizId}">Take quiz</a>
          ${ownerActions}
        </div>
      </div>
      ${descriptionHtml}
      <div class="quiz-card-meta">
        <span class="quiz-meta-item">
          <span class="meta-dot" aria-hidden="true"></span>
          <span>${questionCount} ${questionLabel}</span>
        </span>
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

  return `
    <article class="quiz-card" aria-label="Taken quiz: ${escapeHtml(quiz.title)}">
      <div class="quiz-card-header">
        <span class="quiz-sticker" aria-hidden="true">${sticker}</span>
        <a class="quiz-title" href="/quiz/${quiz.id}">${escapeHtml(quiz.title)}</a>
        <span class="quiz-pill quiz-pill--${quiz.status === "draft" ? "draft" : "published"}">${quiz.status === "draft" ? "Draft" : "Published"}</span>
        <div class="quiz-card-actions">
          <a class="btn-subtle" href="/quiz/${quiz.id}">Take again</a>
        </div>
      </div>
      ${descriptionHtml}
      <div class="quiz-card-meta">
        <span class="quiz-meta-item">
          <span class="meta-dot" aria-hidden="true"></span>
          <span>${questionCount} ${questionLabel}</span>
        </span>
        <span class="quiz-meta-item">${quiz.attempts} ${attemptsLabel}</span>
        ${scoreText}
        ${completedText ? `<span class="quiz-meta-item">${escapeHtml(completedText)}</span>` : ""}
      </div>
    </article>`;
};

const renderPagination = () => {
  const meta = state.meta;
  if (!meta || meta.totalPages <= 1) return "";

  return `
    <nav class="pagination" aria-label="Quiz list pagination">
      <button class="btn" type="button" data-action="page" data-page="${meta.page - 1}" ${meta.hasPrevPage ? "" : "disabled"}>
        ← Previous
      </button>
      <span class="pagination__info">Page ${meta.page} of ${meta.totalPages}</span>
      <button class="btn" type="button" data-action="page" data-page="${meta.page + 1}" ${meta.hasNextPage ? "" : "disabled"}>
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
      ${renderPagination()}
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
    const { user, quizzes } = payload.data || {};

    if (!user?.username || !Array.isArray(quizzes)) {
      throw new Error("Overview response was incomplete");
    }

    state.authenticated = true;
    state.user = user;
    state.quizzes = quizzes;
    state.meta = payload.meta || null;
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

const closeAccountMenu = () => {
  const trigger = document.querySelector(".account-trigger");
  const dropdown = document.querySelector(".account-dropdown");
  if (trigger && dropdown) {
    trigger.setAttribute("aria-expanded", "false");
    dropdown.hidden = true;
  }
};

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
    state.section = section === "taken" ? "taken" : "owned";
    if (state.section === "taken" && state.taken === null) {
      loadTaken();
    } else {
      render();
    }
    setSidebarOpen(false);
    return;
  }

  // 6. Copy unique link action
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
    const quizId = deleteButton.dataset.quizId;
    const quizTitle = deleteButton.dataset.quizTitle || "this quiz";
    const confirmed = window.confirm(
      `Delete "${quizTitle}"? This cannot be undone.`,
    );
    if (!confirmed) return;

    deleteButton.disabled = true;

    try {
      const response = await fetch(`/api/quizzes/${quizId}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (response.status === 204) {
        showToast("Quiz deleted.");
        if (state.quizzes.length === 1 && state.page > 1) {
          await loadOverview(state.page - 1);
        } else {
          await loadOverview(state.page);
        }
        state.taken = null;
      } else {
        const payload = await response.json().catch(() => null);
        showToast(payload?.message || "Could not delete this quiz.");
        deleteButton.disabled = false;
      }
    } catch {
      showToast("A network error occurred while deleting this quiz.");
      deleteButton.disabled = false;
    }
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

  const retryButton = event.target.closest("[data-action='retry']");
  if (retryButton) {
    showToast("Retrying connection...");
    loadOverview(1);
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
