/**
 * public-profile.js — Public profile page logic
 *
 * API contract:
 *   GET /api/users/:username/profile -> public profile, like stats, top quizzes
 */

const THEME_KEY = "quizite-theme";
const DEFAULT_QUIZ_ICON = "✨";
const HEART_PATH =
  "M8 1.314C12.438-3.248 23.534 4.735 8 15-7.534 4.736 3.562-3.248 8 1.314Z";

const applyTheme = (theme) => {
  document.documentElement.dataset.theme = theme;
  const button = document.querySelector("[data-theme-toggle]");
  if (!button) return;
  button.setAttribute(
    "aria-label",
    theme === "dark" ? "Switch to light mode" : "Switch to dark mode",
  );
};

const savedTheme = localStorage.getItem(THEME_KEY);
const preferredTheme = window.matchMedia("(prefers-color-scheme: dark)").matches
  ? "dark"
  : "light";
applyTheme(savedTheme || preferredTheme);

document.querySelector("[data-theme-toggle]")?.addEventListener("click", () => {
  const next =
    document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  localStorage.setItem(THEME_KEY, next);
  applyTheme(next);
});

const loadingState = document.querySelector("#loading-state");
const pageError = document.querySelector("#page-error");
const profileContent = document.querySelector("#profile-content");
const profileAvatar = document.querySelector("#profile-avatar");
const profileTitle = document.querySelector("#profile-title");
const profileMemberSince = document.querySelector("#profile-membersince");
const likesReceivedEl = document.querySelector("#stat-likes-received");
const topLikedContainer = document.querySelector("#top-liked-quizzes");
const topLikedEmpty = document.querySelector("#top-liked-empty");

const likesModalController = window.QuiziteLikesModal?.create();

const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const getCookie = (name) => {
  const match = document.cookie.match(
    new RegExp("(?:^|;\\s*)" + name + "=([^;]*)"),
  );
  return match ? decodeURIComponent(match[1]) : null;
};

const getStoredUserFromCookie = () => {
  try {
    const raw = getCookie("quizite_user");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && (parsed.username || parsed.id)) return parsed;
    return null;
  } catch {
    return null;
  }
};

const currentUser = getStoredUserFromCookie();

const currentUserOwnsQuiz = (quiz) => {
  if (!currentUser || !quiz?.owner) return false;

  if (currentUser.id && quiz.owner.id) {
    return String(currentUser.id) === String(quiz.owner.id);
  }

  return Boolean(
    currentUser.username &&
    quiz.owner.username &&
    currentUser.username === quiz.owner.username,
  );
};

const formatMemberSince = (dateString) => {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "";
  return `Member since ${date.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  })}`;
};

const renderQuizIcon = (icon) => {
  if (icon?.type === "upload" && icon.value) {
    return `<span class="quiz-sticker quiz-sticker--image"><img src="${escapeHtml(icon.value)}" alt="" loading="lazy" /></span>`;
  }

  const emoji =
    icon?.type === "emoji" && typeof icon.value === "string"
      ? icon.value
      : DEFAULT_QUIZ_ICON;

  return `<span class="quiz-sticker" aria-hidden="true">${escapeHtml(emoji)}</span>`;
};

const renderLikeStat = (quiz, likeCount) => {
  const likeLabel = likeCount === 1 ? "like" : "likes";
  const heart = `
    <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true">
      <path d="${HEART_PATH}"></path>
    </svg>`;

  if (!currentUserOwnsQuiz(quiz)) {
    return `<span class="most-liked-card__likes">${heart}${likeCount} ${likeLabel}</span>`;
  }

  const title = escapeHtml(quiz.title || "this quiz");
  const noun = likeCount === 1 ? "person" : "people";
  return `
    <button
      class="most-liked-card__likes most-liked-card__likes--button"
      type="button"
      data-action="likes"
      data-quiz-id="${escapeHtml(quiz.id)}"
      data-quiz-title="${title}"
      aria-label="View ${likeCount} ${noun} who liked ${title}"
      aria-haspopup="dialog"
      title="View who liked this quiz"
    >${heart}${likeCount} ${likeLabel}</button>`;
};

const renderTopLikedQuizzes = (quizzes) => {
  const list = Array.isArray(quizzes) ? quizzes : [];
  topLikedContainer.innerHTML = "";
  topLikedEmpty.hidden = list.length > 0;
  if (list.length === 0) return;

  topLikedContainer.innerHTML = list
    .map((quiz) => {
      const likeCount = Number(quiz.likeCount) || 0;
      const peopleTookCount = Number(quiz.peopleTookCount) || 0;
      const participantsLabel = `${peopleTookCount} ${
        peopleTookCount === 1 ? "person" : "people"
      } tried`;
      const title = escapeHtml(quiz.title || "Untitled quiz");
      const titleHtml = quiz.shareUrl
        ? `<a class="most-liked-card__title" href="${escapeHtml(quiz.shareUrl)}">${title}</a>`
        : `<span class="most-liked-card__title">${title}</span>`;

      return `
        <article class="most-liked-card">
          ${renderQuizIcon(quiz.icon)}
          <div class="most-liked-card__body">
            ${titleHtml}
            <div class="most-liked-card__meta">
              ${renderLikeStat(quiz, likeCount)}
              <span class="most-liked-card__participants">${participantsLabel}</span>
            </div>
          </div>
        </article>`;
    })
    .join("");
};

topLikedContainer?.addEventListener("click", (event) => {
  const likeButton = event.target.closest("[data-action='likes']");
  if (!likeButton || !likesModalController) return;

  event.preventDefault();
  likesModalController.open({
    quizId: likeButton.dataset.quizId,
    quizTitle: likeButton.dataset.quizTitle || "this quiz",
    trigger: likeButton,
  });
});

const showError = (message) => {
  loadingState.hidden = true;
  profileContent.hidden = true;
  pageError.textContent = message;
  pageError.hidden = false;
};

const getUsernameFromPath = () => {
  const segments = window.location.pathname.split("/").filter(Boolean);
  const raw = segments[segments.length - 1] || "";
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
};

const loadProfile = async () => {
  const username = getUsernameFromPath();

  if (!username) {
    showError("This profile could not be found.");
    return;
  }

  try {
    const response = await fetch(
      `/api/users/${encodeURIComponent(username)}/profile`,
      { credentials: "include" },
    );
    const payload = await response.json().catch(() => null);

    if (!response.ok || !payload?.data?.user) {
      throw new Error(payload?.message || "Could not load this profile.");
    }

    const user = payload.data.user;
    const stats = payload.data.stats || {};

    document.title = `${user.username} — Profile — Quizite`;
    profileAvatar.textContent = (user.username || "Q").charAt(0).toUpperCase();
    profileTitle.textContent = user.username;
    profileMemberSince.textContent = formatMemberSince(user.memberSince);
    likesReceivedEl.textContent = String(stats.totalLikesReceived ?? 0);
    renderTopLikedQuizzes(payload.data.topLikedQuizzes || []);

    loadingState.hidden = true;
    profileContent.hidden = false;
  } catch (error) {
    showError(
      error.message || "Could not load this profile. Please try again.",
    );
  }
};

loadProfile();
