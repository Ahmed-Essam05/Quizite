/**
 * likesModal.js — shared controller for the creator-only likers modal.
 *
 * Expects the page to contain the #likes-modal markup used by overview.html
 * and public-profile.html. The backend remains the source of truth and only
 * returns liker identities to the quiz owner.
 */
(() => {
  const escapeHtml = (value) =>
    String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");

  const create = ({ onOpen, onClose, onUnauthorized } = {}) => {
    const modal = document.querySelector("#likes-modal");
    const title = document.querySelector("#likes-modal-title");
    const quizTitle = document.querySelector("#likes-modal-quiz-title");
    const status = document.querySelector("#likes-modal-status");
    const error = document.querySelector("#likes-modal-error");
    const list = document.querySelector("#likes-list");
    const retry = document.querySelector("#likes-modal-retry");
    const closeButton = document.querySelector("#likes-modal-close");

    if (!modal || !title || !quizTitle || !status || !error || !list) {
      return null;
    }

    let target = null;
    let trigger = null;
    let requestId = 0;

    const setStatus = (message = "") => {
      status.textContent = message;
      status.hidden = !message;
    };

    const setError = (message = "") => {
      error.textContent = message;
      error.hidden = !message;
    };

    const renderLikers = (likers) => {
      if (!Array.isArray(likers) || likers.length === 0) {
        list.innerHTML =
          '<li class="likes-list__empty">No likes yet. When someone likes this quiz, they will appear here.</li>';
        return;
      }

      list.innerHTML = likers
        .filter((liker) => liker && liker.username)
        .map((liker) => {
          const username = escapeHtml(liker.username);
          const initial = username.charAt(0).toUpperCase() || "U";
          const profileUrl = escapeHtml(
            liker.profileUrl || `/users/${encodeURIComponent(liker.username)}`,
          );
          const avatar = liker.avatarUrl
            ? `<img src="${escapeHtml(liker.avatarUrl)}" alt="" loading="lazy" />`
            : initial;

          return `
            <li class="likes-list__item">
              <span class="likes-avatar" aria-hidden="true">${avatar}</span>
              <a class="likes-name" href="${profileUrl}">${username}</a>
            </li>`;
        })
        .join("");
    };

    const load = async () => {
      if (!target) return;

      const currentRequest = ++requestId;
      setError();
      setStatus("Loading likes…");
      if (retry) retry.hidden = true;
      list.innerHTML = "";
      modal.setAttribute("aria-busy", "true");

      try {
        const response = await window.fetch(
          `/api/quizzes/${target.quizId}/likes`,
          { credentials: "include" },
        );
        const payload = await response.json().catch(() => null);

        if (currentRequest !== requestId) return;

        if (response.status === 401 && typeof onUnauthorized === "function") {
          close({ restoreFocus: false });
          onUnauthorized();
          return;
        }

        if (!response.ok) {
          throw new Error(
            payload?.message || "Could not load likes. Please try again.",
          );
        }

        const likers = Array.isArray(payload?.data?.likers)
          ? payload.data.likers
          : [];
        const likeCount =
          Number(payload?.data?.likeCount ?? likers.length) || 0;

        setStatus();
        renderLikers(likers);
        title.textContent =
          likeCount === 0
            ? "No likes yet"
            : `Liked by ${likeCount} ${likeCount === 1 ? "person" : "people"}`;
      } catch (loadError) {
        if (currentRequest !== requestId) return;
        setStatus();
        setError(
          loadError.message || "A network error occurred while loading likes.",
        );
        if (retry) retry.hidden = false;
      } finally {
        if (currentRequest === requestId) {
          modal.removeAttribute("aria-busy");
        }
      }
    };

    const close = ({ restoreFocus = true } = {}) => {
      if (modal.hidden) return;

      const previousTrigger = trigger;
      requestId += 1;
      target = null;
      trigger = null;
      modal.hidden = true;
      document.body.classList.remove("delete-modal-open");
      modal.removeAttribute("aria-busy");
      setStatus();
      setError();
      if (retry) retry.hidden = true;
      list.innerHTML = "";

      if (typeof onClose === "function") onClose();

      if (restoreFocus) {
        if (previousTrigger?.isConnected) {
          previousTrigger.focus();
        } else {
          document.querySelector("#main-content")?.focus();
        }
      }
    };

    const open = ({ quizId, quizTitle: quizTitleText, trigger: triggerEl }) => {
      if (!quizId) return;

      target = { quizId };
      trigger =
        triggerEl instanceof window.HTMLElement
          ? triggerEl
          : document.activeElement;
      title.textContent = "Liked by";
      quizTitle.textContent = quizTitleText || "this quiz";

      if (typeof onOpen === "function") onOpen();

      modal.hidden = false;
      document.body.classList.add("delete-modal-open");
      closeButton?.focus();
      load();
    };

    closeButton?.addEventListener("click", () => close());
    retry?.addEventListener("click", load);

    modal.addEventListener("click", (event) => {
      if (event.target === modal) close();
    });

    modal.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        close();
        return;
      }

      if (event.key !== "Tab") return;

      const focusable = Array.from(
        modal.querySelectorAll(
          'button:not([disabled]):not([hidden]), [href]:not([hidden]), input:not([disabled]):not([hidden]), select:not([disabled]):not([hidden]), textarea:not([disabled]):not([hidden]), [tabindex]:not([tabindex="-1"]):not([hidden])',
        ),
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && (active === first || !modal.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (active === last || !modal.contains(active))
      ) {
        event.preventDefault();
        first.focus();
      }
    });

    return {
      open,
      close,
      isOpen: () => !modal.hidden,
    };
  };

  window.QuiziteLikesModal = { create };
})();
