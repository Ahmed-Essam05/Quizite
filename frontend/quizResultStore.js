/**
 * quizResultStore.js — Short-lived per-tab handoff for graded quiz results.
 */

(() => {
  if (window.QuiziteResultStore) return;

  const KEY_PREFIX = "quizite:quiz-result:";
  const MAX_AGE_MS = 60 * 60 * 1000;

  const storageKey = (quizId) => `${KEY_PREFIX}${quizId}`;

  const remove = (quizId) => {
    try {
      sessionStorage.removeItem(storageKey(quizId));
    } catch {
      // Storage unavailable
    }
  };

  const save = (quizId, result) => {
    try {
      sessionStorage.setItem(
        storageKey(quizId),
        JSON.stringify({
          quizId,
          savedAt: Date.now(),
          result,
        }),
      );
      return true;
    } catch {
      return false;
    }
  };

  const load = (quizId) => {
    try {
      const raw = sessionStorage.getItem(storageKey(quizId));
      if (!raw) return null;

      const stored = JSON.parse(raw);
      const isCurrent =
        stored &&
        stored.quizId === quizId &&
        typeof stored.savedAt === "number" &&
        Date.now() - stored.savedAt <= MAX_AGE_MS;

      if (!isCurrent) {
        remove(quizId);
        return null;
      }

      return stored.result || null;
    } catch {
      remove(quizId);
      return null;
    }
  };

  window.QuiziteResultStore = {
    save,
    load,
    remove,
    MAX_AGE_MS,
  };
})();
