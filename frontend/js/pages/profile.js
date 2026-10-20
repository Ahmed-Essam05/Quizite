/**
 * profile.js — Profile page logic
 *
 * API contract:
 *   GET   /api/users/me            -> profile info + stats
 *   PATCH /api/users/me/password   -> change password (re-issues session)
 */

const THEME_KEY = "quizite-theme";

/* --------------------------------------------------------------------------
   Theme management (shares localStorage key with other pages)
   -------------------------------------------------------------------------- */

const applyTheme = (theme) => {
  document.documentElement.dataset.theme = theme;
  const btn = document.querySelector("[data-theme-toggle]");
  if (btn) {
    const isDark = theme === "dark";
    btn.setAttribute(
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
  const next =
    document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  localStorage.setItem(THEME_KEY, next);
  applyTheme(next);
});

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

let toastTimer;

const showToast = (message) => {
  const toast = document.querySelector("#toast");
  if (!toast) return;
  window.clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add("is-visible");
  toastTimer = window.setTimeout(() => {
    toast.classList.remove("is-visible");
  }, 3200);
};

const pageError = document.querySelector("#page-error");
const passwordError = document.querySelector("#password-error");

const showPageError = (message) => {
  pageError.textContent = message;
  pageError.hidden = false;
};

const showPasswordError = (message) => {
  passwordError.textContent = message;
  passwordError.hidden = false;
};

const clearPasswordError = () => {
  passwordError.textContent = "";
  passwordError.hidden = true;
};

const loadingState = document.querySelector("#loading-state");
const profileContent = document.querySelector("#profile-content");

/* --------------------------------------------------------------------------
   Profile rendering
   -------------------------------------------------------------------------- */

const formatMemberSince = (dateString) => {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "";
  return `Member since ${date.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  })}`;
};

const renderProfile = ({ user, stats }) => {
  const avatar = document.querySelector("#profile-avatar");
  const username = document.querySelector("#profile-title");
  const email = document.querySelector("#profile-email");
  const role = document.querySelector("#profile-role");
  const memberSince = document.querySelector("#profile-membersince");

  avatar.textContent = (user.username || "Q").charAt(0).toUpperCase();
  username.textContent = user.username;
  email.textContent = user.email || "";

  if (user.role === "admin") {
    role.textContent = "Admin";
    role.hidden = false;
  } else {
    role.hidden = true;
  }

  const sinceText = formatMemberSince(user.memberSince);
  memberSince.textContent = sinceText;

  document.querySelector("#stat-quizzes").textContent = String(
    stats.quizCount ?? 0,
  );
  document.querySelector("#stat-published").textContent = String(
    stats.publishedCount ?? 0,
  );
  document.querySelector("#stat-taken").textContent = String(
    stats.takenCount ?? 0,
  );
  document.querySelector("#stat-attempts").textContent = String(
    stats.attemptCount ?? 0,
  );
  document.querySelector("#stat-liked").textContent = String(
    stats.likedCount ?? 0,
  );

  loadingState.hidden = true;
  profileContent.hidden = false;
};

const loadProfile = async () => {
  try {
    const response = await fetch("/api/users/me", { credentials: "include" });

    if (response.status === 401) {
      window.location.href = "/login";
      return;
    }

    const payload = await response.json().catch(() => null);

    if (!response.ok || !payload?.data?.user) {
      throw new Error(payload?.message || "Could not load your profile.");
    }

    renderProfile(payload.data);
  } catch (error) {
    loadingState.hidden = true;
    showPageError(
      error.message || "Could not load your profile. Please try again.",
    );
  }
};

/* --------------------------------------------------------------------------
   Password change
   -------------------------------------------------------------------------- */

const passwordForm = document.querySelector("#password-form");
const passwordSubmit = document.querySelector("#password-submit");

passwordForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearPasswordError();

  const currentPassword = document.querySelector("#current-password").value;
  const newPassword = document.querySelector("#new-password").value;
  const confirmPassword = document.querySelector("#confirm-password").value;

  if (!currentPassword) {
    showPasswordError("Please enter your current password.");
    return;
  }

  if (newPassword.length < 8 || !/[A-Za-z]/.test(newPassword) || !/\d/.test(newPassword)) {
    showPasswordError(
      "The new password must be at least 8 characters long and include a letter and a number.",
    );
    return;
  }

  if (newPassword !== confirmPassword) {
    showPasswordError("The new passwords do not match.");
    return;
  }

  if (newPassword === currentPassword) {
    showPasswordError("Your new password must be different from your current one.");
    return;
  }

  const originalLabel = passwordSubmit.querySelector(".submit-label");
  passwordSubmit.disabled = true;
  originalLabel.textContent = "Updating…";

  try {
    const response = await fetch("/api/users/me/password", {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword }),
    });

    const payload = await response.json().catch(() => null);

    if (response.status === 401 && payload?.message !== "Your current password is incorrect") {
      window.location.href = "/login";
      return;
    }

    if (!response.ok) {
      throw new Error(payload?.message || "Could not update your password.");
    }

    passwordForm.reset();
    showToast("Password updated. You are still signed in on this device.");
  } catch (error) {
    showPasswordError(error.message || "Could not update your password.");
  } finally {
    passwordSubmit.disabled = false;
    originalLabel.textContent = "Update password";
  }
});

/* --------------------------------------------------------------------------
   Init
   -------------------------------------------------------------------------- */

loadProfile();
