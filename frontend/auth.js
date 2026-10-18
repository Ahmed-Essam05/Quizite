/**
 * auth.js — shared logic for login.html and signup.html
 *
 * Reads document.body.dataset.page ("login" or "signup") to decide
 * which form to handle.
 *
 * API contract:
 *   POST /api/auth/login    { username, password }        -> 200 + sets jwt cookie
 *   POST /api/auth/signup   { username, email, password } -> 201 + sets jwt cookie
 *
 * On success the user is redirected to / (the overview page).
 * On failure the server's error message is shown in the error banner.
 */

const THEME_KEY = "quizite-theme";
const page = document.body.dataset.page; // "login" | "signup"

/* --------------------------------------------------------------------------
   Theme management (shares localStorage key with overview.js)
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
   Toast notification
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

/* --------------------------------------------------------------------------
   Error banner
   -------------------------------------------------------------------------- */

const errorBanner = document.querySelector("#error-banner");

const showError = (message) => {
  if (!errorBanner) return;
  errorBanner.textContent = message;
  errorBanner.hidden = false;
};

const clearError = () => {
  if (!errorBanner) return;
  errorBanner.textContent = "";
  errorBanner.hidden = true;
};

/* --------------------------------------------------------------------------
   Field-level validation helpers
   -------------------------------------------------------------------------- */

const setFieldError = (inputId, errorId, message) => {
  const input = document.querySelector(`#${inputId}`);
  const errorEl = document.querySelector(`#${errorId}`);
  if (input) input.classList.add("is-invalid");
  if (errorEl) {
    errorEl.textContent = message;
    errorEl.hidden = false;
  }
};

const clearFieldError = (inputId, errorId) => {
  const input = document.querySelector(`#${inputId}`);
  const errorEl = document.querySelector(`#${errorId}`);
  if (input) input.classList.remove("is-invalid");
  if (errorEl) {
    errorEl.textContent = "";
    errorEl.hidden = true;
  }
};

const clearAllFieldErrors = () => {
  document.querySelectorAll(".field-input").forEach((el) => {
    el.classList.remove("is-invalid");
  });
  document.querySelectorAll(".field-error").forEach((el) => {
    el.textContent = "";
    el.hidden = true;
  });
};

/* --------------------------------------------------------------------------
   Client-side validation rules
   -------------------------------------------------------------------------- */

const USERNAME_RE = /^[a-zA-Z0-9_]+$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const validateLogin = ({ username, password }) => {
  const errors = {};
  if (!username || !username.trim()) {
    errors.username = "Username is required.";
  }
  if (!password) {
    errors.password = "Password is required.";
  }
  return errors;
};

const validateSignup = ({ username, email, password }) => {
  const errors = {};
  const trimmedUser = (username || "").trim();
  const trimmedEmail = (email || "").trim();

  if (!trimmedUser) {
    errors.username = "Username is required.";
  } else if (trimmedUser.length < 3 || trimmedUser.length > 30) {
    errors.username = "Username must be between 3 and 30 characters.";
  } else if (!USERNAME_RE.test(trimmedUser)) {
    errors.username =
      "Username may only contain letters, numbers, and underscores.";
  }

  if (!trimmedEmail) {
    errors.email = "Email address is required.";
  } else if (!EMAIL_RE.test(trimmedEmail)) {
    errors.email = "Please enter a valid email address.";
  }

  if (!password) {
    errors.password = "Password is required.";
  } else if (password.length < 8) {
    errors.password = "Password must be at least 8 characters.";
  } else if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    errors.password =
      "Password must include at least one letter and one number.";
  }

  return errors;
};

/* --------------------------------------------------------------------------
   Submit state management
   -------------------------------------------------------------------------- */

const setSubmitting = (isSubmitting) => {
  const btn = document.querySelector("#submit-btn");
  const label = btn?.querySelector(".submit-label");
  const spinner = btn?.querySelector(".submit-spinner");
  if (!btn) return;

  btn.disabled = isSubmitting;
  if (spinner) spinner.hidden = !isSubmitting;
  if (label) {
    if (isSubmitting) {
      label.dataset.orig = label.textContent;
      label.textContent =
        page === "login" ? "Signing in…" : "Creating account…";
    } else {
      label.textContent = label.dataset.orig || label.textContent;
    }
  }
};

/* --------------------------------------------------------------------------
   Password visibility toggle
   -------------------------------------------------------------------------- */

document.querySelectorAll("[data-toggle-password]").forEach((btn) => {
  const wrap = btn.closest(".field-input-wrap");
  const input = wrap?.querySelector(".field-input");
  if (!input) return;

  btn.addEventListener("click", () => {
    const isHidden = input.type === "password";
    input.type = isHidden ? "text" : "password";
    btn.setAttribute(
      "aria-label",
      isHidden ? "Hide password" : "Show password",
    );
  });
});

/* --------------------------------------------------------------------------
   Live clearing of errors on input
   -------------------------------------------------------------------------- */

document.querySelectorAll(".field-input").forEach((input) => {
  input.addEventListener("input", () => {
    if (input.classList.contains("is-invalid")) {
      const errorId = input
        .getAttribute("aria-describedby")
        ?.split(" ")
        .find((id) => id.endsWith("-error"));
      if (errorId) clearFieldError(input.id, errorId);
    }
    clearError();
  });
});

/* --------------------------------------------------------------------------
   Form submission
   -------------------------------------------------------------------------- */

const form = document.querySelector(
  page === "login" ? "#login-form" : "#signup-form",
);

if (form) {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearAllFieldErrors();
    clearError();

    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());

    // Client-side validation
    const errors =
      page === "login" ? validateLogin(data) : validateSignup(data);

    if (Object.keys(errors).length > 0) {
      for (const [field, message] of Object.entries(errors)) {
        setFieldError(field, `${field}-error`, message);
      }
      const firstInvalid = form.querySelector(".is-invalid");
      firstInvalid?.focus();
      return;
    }

    setSubmitting(true);

    try {
      const endpoint =
        page === "login" ? "/api/auth/login" : "/api/auth/signup";

      const body =
        page === "login"
          ? {
              username: data.username.trim(),
              password: data.password,
            }
          : {
              username: data.username.trim(),
              email: data.email.trim().toLowerCase(),
              password: data.password,
            };

      const res = await fetch(endpoint, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const payload = await res.json().catch(() => null);

      if (!res.ok) {
        const message =
          payload?.message ||
          (page === "login"
            ? "Incorrect username or password."
            : "Unable to create account. Please try again.");
        showError(message);
        setSubmitting(false);
        return;
      }

      // Save jwt and user cookies on client as well to guarantee immediate availability
      if (payload?.token) {
        document.cookie = `jwt=${encodeURIComponent(payload.token)}; Path=/; Max-Age=2592000; SameSite=Lax`;
      }
      if (payload?.data?.user) {
        document.cookie = `quizite_user=${encodeURIComponent(JSON.stringify(payload.data.user))}; Path=/; Max-Age=2592000; SameSite=Lax`;
      }

      // Success — redirect to overview page
      window.location.replace("/");
    } catch {
      showError(
        "A network error occurred. Please check your connection and try again.",
      );
      setSubmitting(false);
    }
  });
}
