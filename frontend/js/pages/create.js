/**
 * create.js — Interactive Quiz Creation & Question Builder
 */

const STORAGE_KEY = "quizite-quiz-draft";
const THEME_KEY = "quizite-theme";
const MAX_QUESTIONS_PER_PAGE = 10;
const MAX_TOTAL_QUESTIONS = 80;
const MAX_PAGES = 8;
const MAX_ACCEPTED_ANSWERS = 20;
const MAX_QUIZ_TITLE_LENGTH = 150;
const MAX_QUIZ_DESCRIPTION_LENGTH = 1000;
const MAX_QUESTION_TITLE_LENGTH = 2000;
const MAX_CHOICE_TEXT_LENGTH = 500;
const MAX_ICON_FILE_BYTES = 2 * 1024 * 1024;
const QUIZ_ICON_EMOJIS = ["✨", "🚀", "💡", "🎨", "🍿", "🎉", "🌟", "🎈", "🧠", "🎯"];
const DEFAULT_QUIZ_ICON = "✨";
const ICON_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

const editMatch = window.location.pathname.match(/^\/quiz\/([^/]+)\/edit\/?$/);
const editQuizId = editMatch ? editMatch[1] : null;
const isEditMode = Boolean(editQuizId);

// Internal state
const quizState = {
  title: "",
  description: "",
  icon: null,
  status: "published",
  allowRetakes: false,
  showCorrectAnswers: false,
  questions: [],
};

let currentQuestionType = "multipleChoice";
let mcqChoices = ["", ""];
let mcqCorrectIndex = 0;
let writtenAcceptedAnswers = [""];
let toastTimer;

// DOM Elements
const quizTitleInput = document.querySelector("#quiz-title");
const quizDescInput = document.querySelector("#quiz-description");
const quizStatusSelect = document.querySelector("#quiz-status-select");

const questionTitleInput = document.querySelector("#question-title");
const mcqContainer = document.querySelector("#mcq-options-container");
const tfContainer = document.querySelector("#tf-options-container");
const writtenContainer = document.querySelector("#written-options-container");
const choicesList = document.querySelector("#choices-list");
const addChoiceBtn = document.querySelector("#add-choice-btn");
const acceptedAnswersList = document.querySelector("#accepted-answers-list");
const addAcceptedAnswerBtn = document.querySelector("#add-accepted-answer-btn");

const allowRetakesInput = document.querySelector("#allow-retakes");
const showCorrectAnswersInput = document.querySelector("#show-correct-answers");
const iconGrid = document.querySelector("#quiz-icon-grid");
const iconPreview = document.querySelector("#quiz-icon-preview");
const iconUploadBtn = document.querySelector("#quiz-icon-upload-btn");
const iconUploadInput = document.querySelector("#quiz-icon-upload");
const iconResetBtn = document.querySelector("#quiz-icon-reset");
const iconError = document.querySelector("#quiz-icon-error");
const iconStatus = document.querySelector("#quiz-icon-status");
const editModeBanner = document.querySelector("#edit-mode-banner");
const topbarBreadcrumb = document.querySelector("#topbar-breadcrumb");

const addQuestionBtn = document.querySelector("#add-question-btn");
const savedQuestionsList = document.querySelector("#saved-questions-list");
const emptyQuestionsPrompt = document.querySelector("#empty-questions-prompt");
const savedBadge = document.querySelector("#saved-badge");
const questionCountNum = document.querySelector("#question-count-num");
const questionLimitPill = document.querySelector("#question-limit-pill");

const draftNotice = document.querySelector("#draft-notice");
const clearDraftBtn = document.querySelector("#clear-draft-btn");
const errorBanner = document.querySelector("#error-banner");
const errorBannerTitle = document.querySelector("#error-banner-title");
const errorBannerMessage = document.querySelector("#error-banner-message");
const errorBannerList = document.querySelector("#error-banner-list");
const toast = document.querySelector("#toast");

let validationScope = null;
let lastQuizTargetStatus = null;

const saveDraftBtn = document.querySelector("#save-draft-btn");
const publishQuizBtn = document.querySelector("#publish-quiz-btn");

const successModal = document.querySelector("#success-modal");
const shareLinkInput = document.querySelector("#share-link-input");
const copyModalLinkBtn = document.querySelector("#copy-modal-link-btn");
const shareCodeInput = document.querySelector("#share-code-input");
const copyModalCodeBtn = document.querySelector("#copy-modal-code-btn");
const modalTakeLink = document.querySelector("#modal-take-link");

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
   Toast & Error helpers
   -------------------------------------------------------------------------- */

const showToast = (message) => {
  window.clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add("is-visible");
  toastTimer = window.setTimeout(() => {
    toast.classList.remove("is-visible");
  }, 3200);
};

const clearValidationUI = () => {
  errorBanner.hidden = true;
  errorBannerMessage.textContent = "";
  errorBannerMessage.hidden = true;
  errorBannerList.innerHTML = "";
  errorBannerList.hidden = true;

  document
    .querySelectorAll(".create-main .is-invalid")
    .forEach((element) => {
      element.classList.remove("is-invalid");
      element.removeAttribute("aria-invalid");
    });

  document
    .querySelectorAll(".create-main [data-field-error]")
    .forEach((element) => {
      element.textContent = "";
      element.hidden = true;
    });

  savedQuestionsList
    .querySelectorAll(".question-card-item__validation")
    .forEach((element) => element.remove());
  savedQuestionsList.querySelectorAll(".question-card-item").forEach((card) => {
    card.classList.remove("is-invalid");
    card.removeAttribute("aria-invalid");
    card.removeAttribute("aria-describedby");
  });
};

const focusValidationTarget = (target) => {
  if (!target) return;
  target.focus?.({ preventScroll: true });
  target.scrollIntoView?.({ behavior: "smooth", block: "center" });
};

const applyValidationStyles = (errors) => {
  const cardErrors = new Map();

  errors.forEach((error) => {
    (error.controls || []).filter(Boolean).forEach((control) => {
      control.classList.add("is-invalid");
      control.setAttribute("aria-invalid", "true");
    });

    if (error.errorElement) {
      error.errorElement.textContent = error.message;
      error.errorElement.hidden = false;
    }

    if (error.card) {
      const messages = cardErrors.get(error.card) || [];
      messages.push(error.message);
      cardErrors.set(error.card, messages);
    }
  });

  cardErrors.forEach((messages, card) => {
    if (!card) return;
    const questionIndex = card.dataset.questionIndex;
    const validationId = `question-card-error-${questionIndex}`;
    const validation = document.createElement("div");
    validation.className = "question-card-item__validation";
    validation.id = validationId;

    const heading = document.createElement("p");
    heading.className = "question-card-item__validation-title";
    heading.textContent = "This question needs attention:";
    validation.appendChild(heading);

    const list = document.createElement("ul");
    messages.forEach((message) => {
      const item = document.createElement("li");
      item.textContent = message;
      list.appendChild(item);
    });
    validation.appendChild(list);

    card.classList.add("is-invalid");
    card.setAttribute("aria-invalid", "true");
    card.setAttribute("aria-describedby", validationId);
    card.appendChild(validation);
  });
};

const showValidationErrors = (
  errors,
  { title = "Please fix the following", focusFirst = false } = {},
) => {
  clearValidationUI();

  if (errors.length === 0) {
    validationScope = null;
    return;
  }

  applyValidationStyles(errors);

  errorBannerTitle.textContent = title;
  errorBannerMessage.hidden = true;
  errorBannerList.innerHTML = "";

  errors.forEach((error) => {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "create-validation-alert__link";
    button.textContent = error.message;
    button.addEventListener("click", () => {
      focusValidationTarget(error.focusTarget || error.controls?.[0]);
    });
    item.appendChild(button);
    errorBannerList.appendChild(item);
  });

  errorBannerList.hidden = false;
  errorBanner.hidden = false;

  if (focusFirst) {
    focusValidationTarget(errors[0].focusTarget || errors[0].controls?.[0]);
  }
};

const showError = (
  message,
  { title = "Unable to complete that action" } = {},
) => {
  clearValidationUI();
  validationScope = null;

  errorBannerTitle.textContent = title;
  errorBannerMessage.textContent = message;
  errorBannerMessage.hidden = false;
  errorBanner.hidden = false;
  window.scrollTo({ top: 0, behavior: "smooth" });
};

const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const getSelectedEmojiIcon = () => {
  if (
    typeof quizState.icon === "string" &&
    quizState.icon.startsWith("emoji:")
  ) {
    const emoji = quizState.icon.slice("emoji:".length);
    if (QUIZ_ICON_EMOJIS.includes(emoji)) return emoji;
  }
  if (quizState.icon === null) return DEFAULT_QUIZ_ICON;
  return null;
};

const getUploadedIconUrl = () => {
  if (
    typeof quizState.icon === "string" &&
    quizState.icon.startsWith("upload:")
  ) {
    const filename = quizState.icon.slice("upload:".length);
    return /^[a-f0-9]{24}-[a-f0-9]{32}\.webp$/.test(filename)
      ? `/uploads/quiz-icons/${filename}`
      : null;
  }
  return null;
};

const renderIconPreview = (overrideUrl = null) => {
  if (!iconPreview) return;
  iconPreview.innerHTML = "";
  const uploadUrl = overrideUrl || getUploadedIconUrl();

  if (uploadUrl) {
    const image = document.createElement("img");
    image.src = uploadUrl;
    image.alt = "";
    image.addEventListener(
      "error",
      () => {
        iconPreview.textContent = DEFAULT_QUIZ_ICON;
      },
      { once: true },
    );
    iconPreview.appendChild(image);
    return;
  }

  iconPreview.textContent = getSelectedEmojiIcon() || DEFAULT_QUIZ_ICON;
};

const setIconError = (message) => {
  if (!iconError) return;
  iconError.textContent = message;
  iconError.hidden = false;
};

const setIconStatus = (message) => {
  if (!iconStatus) return;
  iconStatus.textContent = message;
  iconStatus.hidden = false;
};

const clearIconFeedback = () => {
  if (iconError) {
    iconError.textContent = "";
    iconError.hidden = true;
  }
  if (iconStatus) {
    iconStatus.textContent = "";
    iconStatus.hidden = true;
  }
};

const renderIconGrid = () => {
  if (!iconGrid) return;
  const selected = getSelectedEmojiIcon();

  iconGrid.innerHTML = QUIZ_ICON_EMOJIS.map(
    (emoji) => `
      <button
        class="quiz-icon-option${emoji === selected ? " is-selected" : ""}"
        type="button"
        role="radio"
        aria-checked="${emoji === selected}"
        aria-label="Use ${emoji} icon"
        data-icon-emoji="${emoji}"
        tabindex="${emoji === selected ? "0" : "-1"}"
      >${emoji}</button>`,
  ).join("");
};

const renderIconPicker = (options = {}) => {
  renderIconGrid();
  renderIconPreview(options.previewUrl || null);
};

const syncIconGridSelection = () => {
  if (!iconGrid) return;
  const selected = getSelectedEmojiIcon();

  iconGrid.querySelectorAll("[data-icon-emoji]").forEach((button) => {
    const isSelected = button.dataset.iconEmoji === selected;
    button.classList.toggle("is-selected", isSelected);
    button.setAttribute("aria-checked", String(isSelected));
    button.tabIndex = isSelected ? 0 : -1;
  });
};

const selectEmojiIcon = (emoji) => {
  if (!QUIZ_ICON_EMOJIS.includes(emoji)) return;
  quizState.icon = `emoji:${emoji}`;
  clearIconFeedback();
  syncIconGridSelection();
  renderIconPreview();
  saveDraftToStorage();
};

const uploadIconFile = async (file) => {
  clearIconFeedback();
  if (!file) return;

  if (!ICON_MIME_TYPES.has(file.type)) {
    setIconError("Choose a PNG, JPEG, or WebP image.");
    return;
  }

  if (file.size > MAX_ICON_FILE_BYTES) {
    setIconError("Icon images must be 2 MB or smaller.");
    return;
  }

  const localPreviewUrl = URL.createObjectURL(file);
  renderIconPreview(localPreviewUrl);
  if (iconUploadBtn) iconUploadBtn.disabled = true;
  if (iconUploadInput) iconUploadInput.disabled = true;
  setIconStatus("Uploading icon…");

  const formData = new FormData();
  formData.append("image", file);

  try {
    const response = await fetch("/api/quizzes/icon", {
      method: "POST",
      credentials: "include",
      body: formData,
    });
    const data = await response.json().catch(() => null);

    if (response.status === 401) {
      setIconError("Please log in to upload an icon.");
      window.setTimeout(() => {
        window.location.href = "/login";
      }, 1200);
      return;
    }

    if (!response.ok || !data?.data?.reference) {
      throw new Error(data?.message || "Could not upload that image.");
    }

    quizState.icon = data.data.reference;
    renderIconPicker();
    saveDraftToStorage();
    setIconStatus("Custom icon uploaded.");
  } catch (error) {
    renderIconPreview();
    setIconError(
      error.message || "Could not upload that image. Please try again.",
    );
  } finally {
    URL.revokeObjectURL(localPreviewUrl);
    if (iconUploadBtn) iconUploadBtn.disabled = false;
    if (iconUploadInput) {
      iconUploadInput.disabled = false;
      iconUploadInput.value = "";
    }
  }
};

iconGrid?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-icon-emoji]");
  if (!button) return;
  selectEmojiIcon(button.dataset.iconEmoji);
});

iconGrid?.addEventListener("keydown", (event) => {
  if (
    !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(
      event.key,
    )
  ) {
    return;
  }

  const buttons = Array.from(iconGrid.querySelectorAll("[data-icon-emoji]"));
  if (buttons.length === 0) return;

  const currentIndex = buttons.indexOf(document.activeElement);
  let nextIndex = currentIndex;

  if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
    nextIndex = currentIndex <= 0 ? buttons.length - 1 : currentIndex - 1;
  } else if (event.key === "ArrowRight" || event.key === "ArrowDown") {
    nextIndex = currentIndex >= buttons.length - 1 ? 0 : currentIndex + 1;
  } else if (event.key === "Home") {
    nextIndex = 0;
  } else if (event.key === "End") {
    nextIndex = buttons.length - 1;
  }

  event.preventDefault();
  const emoji = buttons[nextIndex].dataset.iconEmoji;
  selectEmojiIcon(emoji);
  iconGrid.querySelector(`[data-icon-emoji="${emoji}"]`)?.focus();
});

iconResetBtn?.addEventListener("click", () => {
  quizState.icon = null;
  clearIconFeedback();
  renderIconPicker();
  saveDraftToStorage();
  setIconStatus("Default icon restored.");
});

iconUploadBtn?.addEventListener("click", () => {
  iconUploadInput?.click();
});

iconUploadInput?.addEventListener("change", () => {
  uploadIconFile(iconUploadInput.files?.[0]);
});

const getMcqSelectedIndex = () => {
  const selected = choicesList.querySelector(
    'input[name="mcq-correct-choice"]:checked',
  );
  return selected ? Number(selected.value) : -1;
};

const validateQuestionDraft = () => {
  const errors = [];
  const title = questionTitleInput.value.trim();
  const titleError = document.querySelector("#question-title-error");

  if (!title) {
    errors.push({
      message: "Enter the question text.",
      controls: [questionTitleInput],
      errorElement: titleError,
      focusTarget: questionTitleInput,
    });
  } else if (title.length > MAX_QUESTION_TITLE_LENGTH) {
    errors.push({
      message: `Question text cannot exceed ${MAX_QUESTION_TITLE_LENGTH} characters.`,
      controls: [questionTitleInput],
      errorElement: titleError,
      focusTarget: questionTitleInput,
    });
  }

  if (currentQuestionType === "multipleChoice") {
    const correctError = document.querySelector("#mcq-answer-error");
    const choiceRadios = Array.from(
      choicesList.querySelectorAll('input[name="mcq-correct-choice"]'),
    );

    if (mcqChoices.length < 2) {
      errors.push({
        message: "Add at least 2 answer choices.",
        controls: choiceRadios,
        errorElement: correctError,
        focusTarget: addChoiceBtn,
      });
    } else if (mcqChoices.length > 6) {
      errors.push({
        message: "Use no more than 6 answer choices.",
        controls: choiceRadios,
        errorElement: correctError,
        focusTarget: choicesList,
      });
    }

    const nonEmptyChoiceCount = mcqChoices.filter((choice) =>
      choice.trim(),
    ).length;
    const needsMoreChoices = nonEmptyChoiceCount < 2;

    mcqChoices.forEach((choiceText, index) => {
      const input = choicesList.querySelector(
        `[data-choice-input="${index}"]`,
      );
      const errorElement = choicesList.querySelector(
        `[data-choice-error="${index}"]`,
      );
      const trimmed = choiceText.trim();

      if (!trimmed && needsMoreChoices) {
        errors.push({
          message: `Choice ${index + 1} needs text.`,
          controls: [input],
          errorElement,
          focusTarget: input,
        });
      } else if (trimmed.length > MAX_CHOICE_TEXT_LENGTH) {
        errors.push({
          message: `Choice ${index + 1} cannot exceed ${MAX_CHOICE_TEXT_LENGTH} characters.`,
          controls: [input],
          errorElement,
          focusTarget: input,
        });
      }
    });

    const selectedIndex = getMcqSelectedIndex();
    if (selectedIndex < 0 || selectedIndex >= mcqChoices.length) {
      errors.push({
        message: "Select the correct answer.",
        controls: choiceRadios,
        errorElement: correctError,
        focusTarget: choiceRadios[0],
      });
    } else if (!mcqChoices[selectedIndex].trim() && !needsMoreChoices) {
      const selectedInput = choicesList.querySelector(
        `[data-choice-input="${selectedIndex}"]`,
      );
      errors.push({
        message: "The selected correct choice needs text.",
        controls: [selectedInput],
        errorElement: choicesList.querySelector(
          `[data-choice-error="${selectedIndex}"]`,
        ),
        focusTarget: selectedInput,
      });
    }
  } else if (currentQuestionType === "trueFalse") {
    const correct = document.querySelector(
      'input[name="tf-correct"]:checked',
    );
    if (!correct) {
      errors.push({
        message: "Select True or False as the correct answer.",
        controls: Array.from(
          document.querySelectorAll('input[name="tf-correct"]'),
        ),
        errorElement: document.querySelector("#tf-answer-error"),
        focusTarget: document.querySelector('input[name="tf-correct"]'),
      });
    }
  } else if (currentQuestionType === "writtenAnswer") {
    const groupError = document.querySelector("#accepted-answers-error");

    if (writtenAcceptedAnswers.length > MAX_ACCEPTED_ANSWERS) {
      errors.push({
        message: `Use no more than ${MAX_ACCEPTED_ANSWERS} accepted answers.`,
        errorElement: groupError,
        focusTarget: addAcceptedAnswerBtn,
      });
    }

    writtenAcceptedAnswers.forEach((answer, index) => {
      const trimmed = answer.trim();
      if (!trimmed) return;
      if (trimmed.length > MAX_QUESTION_TITLE_LENGTH) {
        const input = acceptedAnswersList.querySelector(
          `[data-answer-input="${index}"]`,
        );
        errors.push({
          message: `Accepted answer ${index + 1} cannot exceed ${MAX_QUESTION_TITLE_LENGTH} characters.`,
          controls: [input],
          errorElement: acceptedAnswersList.querySelector(
            `[data-answer-error="${index}"]`,
          ),
          focusTarget: input,
        });
      }
    });
  }

  return errors;
};

const validateSavedQuestion = (question, index) => {
  const prefix = `Question ${index + 1}:`;
  const messages = [];

  if (!question || typeof question !== "object") {
    return [`${prefix} the question data is invalid.`];
  }

  const title =
    typeof question.title === "string" ? question.title.trim() : "";
  if (!title) {
    messages.push(`${prefix} question text is required.`);
  } else if (title.length > MAX_QUESTION_TITLE_LENGTH) {
    messages.push(
      `${prefix} question text cannot exceed ${MAX_QUESTION_TITLE_LENGTH} characters.`,
    );
  }

  if (
    !["multipleChoice", "trueFalse", "writtenAnswer"].includes(question.type)
  ) {
    messages.push(`${prefix} the question type is invalid.`);
    return messages;
  }

  if (question.required !== undefined && typeof question.required !== "boolean") {
    messages.push(`${prefix} the required setting is invalid.`);
  }

  const choices = Array.isArray(question.choices) ? question.choices : [];
  const correctIndex = Number(question.correctChoiceIndex);

  if (question.type === "multipleChoice") {
    if (choices.length < 2 || choices.length > 6) {
      messages.push(`${prefix} multiple-choice questions need 2 to 6 choices.`);
    }

    choices.forEach((choice, choiceIndex) => {
      const text =
        typeof choice === "string" ? choice.trim() : choice?.text?.trim();
      if (!text) {
        messages.push(`${prefix} choice ${choiceIndex + 1} needs text.`);
      } else if (text.length > MAX_CHOICE_TEXT_LENGTH) {
        messages.push(
          `${prefix} choice ${choiceIndex + 1} cannot exceed ${MAX_CHOICE_TEXT_LENGTH} characters.`,
        );
      }
    });

    if (
      !Number.isInteger(correctIndex) ||
      correctIndex < 0 ||
      correctIndex >= choices.length
    ) {
      messages.push(`${prefix} select the correct choice.`);
    }
  } else if (question.type === "trueFalse") {
    const choiceTexts = choices.map((choice) =>
      typeof choice === "string" ? choice : choice?.text,
    );
    if (
      choiceTexts.length !== 2 ||
      choiceTexts[0] !== "True" ||
      choiceTexts[1] !== "False"
    ) {
      messages.push(`${prefix} true/false choices must be True and False.`);
    }
    if (
      !Number.isInteger(correctIndex) ||
      (correctIndex !== 0 && correctIndex !== 1)
    ) {
      messages.push(`${prefix} select the correct choice.`);
    }
  } else {
    if (choices.length > 0) {
      messages.push(`${prefix} written-answer questions cannot use choices.`);
    }

    if (
      question.acceptedAnswers !== undefined &&
      !Array.isArray(question.acceptedAnswers)
    ) {
      messages.push(`${prefix} accepted answers must be a list.`);
    }
    const acceptedAnswers = Array.isArray(question.acceptedAnswers)
      ? question.acceptedAnswers
      : [];
    if (acceptedAnswers.length > MAX_ACCEPTED_ANSWERS) {
      messages.push(
        `${prefix} use no more than ${MAX_ACCEPTED_ANSWERS} accepted answers.`,
      );
    }
    acceptedAnswers.forEach((answer, answerIndex) => {
      if (typeof answer !== "string" || !answer.trim()) {
        messages.push(
          `${prefix} accepted answer ${answerIndex + 1} cannot be empty.`,
        );
      } else if (answer.trim().length > MAX_QUESTION_TITLE_LENGTH) {
        messages.push(
          `${prefix} accepted answer ${answerIndex + 1} cannot exceed ${MAX_QUESTION_TITLE_LENGTH} characters.`,
        );
      }
    });
  }

  return messages;
};

const validateQuizForSave = (targetStatus) => {
  const errors = [];
  const title = quizTitleInput.value.trim();
  const description = quizDescInput.value.trim();
  const titleError = document.querySelector("#quiz-title-error");
  const descriptionError = document.querySelector("#quiz-description-error");

  if (!title) {
    errors.push({
      message: "Enter a quiz title.",
      controls: [quizTitleInput],
      errorElement: titleError,
      focusTarget: quizTitleInput,
    });
  } else if (title.length > MAX_QUIZ_TITLE_LENGTH) {
    errors.push({
      message: `Quiz title cannot exceed ${MAX_QUIZ_TITLE_LENGTH} characters.`,
      controls: [quizTitleInput],
      errorElement: titleError,
      focusTarget: quizTitleInput,
    });
  }

  if (description.length > MAX_QUIZ_DESCRIPTION_LENGTH) {
    errors.push({
      message: `Description cannot exceed ${MAX_QUIZ_DESCRIPTION_LENGTH} characters.`,
      controls: [quizDescInput],
      errorElement: descriptionError,
      focusTarget: quizDescInput,
    });
  }

  if (targetStatus === "published" && quizState.questions.length === 0) {
    errors.push({
      message: "Add at least one question before publishing.",
      focusTarget: addQuestionBtn,
    });
  }

  if (quizState.questions.length > MAX_TOTAL_QUESTIONS) {
    errors.push({
      message: `A quiz cannot contain more than ${MAX_TOTAL_QUESTIONS} questions.`,
      focusTarget: addQuestionBtn,
    });
  }

  quizState.questions.forEach((question, index) => {
    const card = savedQuestionsList.querySelector(
      `[data-question-index="${index}"]`,
    );
    validateSavedQuestion(question, index).forEach((message) => {
      errors.push({
        message,
        card,
        focusTarget: card,
      });
    });
  });

  return errors;
};

const refreshQuestionValidation = () => {
  if (validationScope !== "question") return;
  showValidationErrors(validateQuestionDraft());
};

const refreshQuizValidation = () => {
  if (validationScope !== "quiz" || !lastQuizTargetStatus) return;
  showValidationErrors(validateQuizForSave(lastQuizTargetStatus));
};

/* --------------------------------------------------------------------------
   Local storage draft persistence
   -------------------------------------------------------------------------- */

const syncSettingsFromInputs = () => {
  quizState.title = quizTitleInput.value;
  quizState.description = quizDescInput.value;
  quizState.status = quizStatusSelect.value;
  quizState.allowRetakes = Boolean(allowRetakesInput?.checked);
  quizState.showCorrectAnswers = Boolean(showCorrectAnswersInput?.checked);
};

const saveDraftToStorage = () => {
  if (isEditMode) return;
  syncSettingsFromInputs();
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(quizState));
  } catch {
    // Local storage full or unavailable
  }
};

const restoreDraftFromStorage = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (
      data &&
      (data.title ||
        (data.questions && data.questions.length > 0) ||
        typeof data.icon === "string")
    ) {
      quizState.title = data.title || "";
      quizState.description = data.description || "";
      quizState.status = data.status || "published";
      quizState.allowRetakes = Boolean(data.allowRetakes);
      quizState.showCorrectAnswers = Boolean(data.showCorrectAnswers);
      quizState.icon = typeof data.icon === "string" ? data.icon : null;
      quizState.questions = (Array.isArray(data.questions)
        ? data.questions
        : []
      ).map((question) => {
        if (
          question.type === "writtenAnswer" &&
          !Array.isArray(question.acceptedAnswers) &&
          question.correctText
        ) {
          return { ...question, acceptedAnswers: [question.correctText] };
        }
        return question;
      });

      quizTitleInput.value = quizState.title;
      quizDescInput.value = quizState.description;
      quizStatusSelect.value = quizState.status;
      if (allowRetakesInput) {
        allowRetakesInput.checked = quizState.allowRetakes;
      }
      if (showCorrectAnswersInput) {
        showCorrectAnswersInput.checked = quizState.showCorrectAnswers;
      }

      draftNotice.hidden = false;
      renderSavedQuestions();
      renderIconPicker();
    }
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
};

clearDraftBtn?.addEventListener("click", () => {
  localStorage.removeItem(STORAGE_KEY);
  quizState.title = "";
  quizState.description = "";
  quizState.status = "published";
  quizState.allowRetakes = false;
  quizState.showCorrectAnswers = false;
  quizState.icon = null;
  quizState.questions = [];

  quizTitleInput.value = "";
  quizDescInput.value = "";
  quizStatusSelect.value = "published";
  if (allowRetakesInput) allowRetakesInput.checked = false;
  if (showCorrectAnswersInput) showCorrectAnswersInput.checked = false;
  draftNotice.hidden = true;
  clearValidationUI();
  validationScope = null;
  clearIconFeedback();
  renderSavedQuestions();
  renderIconPicker();
  showToast("Draft discarded.");
});

/* --------------------------------------------------------------------------
   Question Type Switching
   -------------------------------------------------------------------------- */

const typeTabs = document.querySelectorAll(".type-tab");
typeTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    typeTabs.forEach((t) => {
      t.classList.remove("type-tab--active");
      t.setAttribute("aria-selected", "false");
    });
    tab.classList.add("type-tab--active");
    tab.setAttribute("aria-selected", "true");

    currentQuestionType = tab.dataset.type;
    mcqContainer.hidden = currentQuestionType !== "multipleChoice";
    tfContainer.hidden = currentQuestionType !== "trueFalse";
    writtenContainer.hidden = currentQuestionType !== "writtenAnswer";
    if (validationScope === "question") {
      clearValidationUI();
      validationScope = null;
    }
  });
});

/* --------------------------------------------------------------------------
   Multiple Choice Choices Manager
   -------------------------------------------------------------------------- */

const renderMcqChoices = () => {
  choicesList.innerHTML = mcqChoices
    .map(
      (choiceText, index) => `
    <div class="choice-item-row" data-index="${index}">
      <label class="choice-radio-wrap" title="Mark as correct choice">
        <input
          type="radio"
          name="mcq-correct-choice"
          value="${index}"
          ${index === mcqCorrectIndex ? "checked" : ""}
          aria-label="Choice ${index + 1} is correct"
        />
      </label>
      <div class="choice-field">
        <input
          class="choice-text-input"
          type="text"
          placeholder="Choice ${index + 1} text..."
          value="${escapeHtml(choiceText)}"
          data-choice-input="${index}"
          maxlength="${MAX_CHOICE_TEXT_LENGTH}"
          aria-describedby="choice-error-${index}"
        />
        <span
          class="field-error"
          id="choice-error-${index}"
          data-choice-error="${index}"
          data-field-error
          hidden
        ></span>
      </div>
      <button
        class="btn-remove-choice"
        type="button"
        data-remove-choice="${index}"
        aria-label="Remove choice ${index + 1}"
        ${mcqChoices.length <= 2 ? "disabled" : ""}
      >
        ✕
      </button>
    </div>`,
    )
    .join("");

  addChoiceBtn.disabled = mcqChoices.length >= 6;
};

choicesList.addEventListener("input", (e) => {
  const input = e.target.closest("[data-choice-input]");
  if (input) {
    const idx = Number(input.dataset.choiceInput);
    mcqChoices[idx] = input.value;
    refreshQuestionValidation();
  }
});

choicesList.addEventListener("change", (e) => {
  if (e.target.name === "mcq-correct-choice") {
    mcqCorrectIndex = Number(e.target.value);
    refreshQuestionValidation();
  }
});

choicesList.addEventListener("click", (e) => {
  const removeBtn = e.target.closest("[data-remove-choice]");
  if (removeBtn && mcqChoices.length > 2) {
    const idx = Number(removeBtn.dataset.removeChoice);
    mcqChoices.splice(idx, 1);
    if (mcqCorrectIndex >= mcqChoices.length) {
      mcqCorrectIndex = Math.max(0, mcqChoices.length - 1);
    }
    renderMcqChoices();
    refreshQuestionValidation();
  }
});

addChoiceBtn.addEventListener("click", () => {
  if (mcqChoices.length < 6) {
    mcqChoices.push("");
    renderMcqChoices();
    // Focus the new choice input
    const inputs = choicesList.querySelectorAll(".choice-text-input");
    inputs[inputs.length - 1]?.focus();
    refreshQuestionValidation();
  }
});

/* --------------------------------------------------------------------------
   Accepted Answers Manager (written response questions)
   -------------------------------------------------------------------------- */

const renderAcceptedAnswers = () => {
  if (!acceptedAnswersList) return;

  acceptedAnswersList.innerHTML = writtenAcceptedAnswers
    .map(
      (answer, index) => `
    <div class="choice-item-row" data-answer-index="${index}">
      <div class="choice-field">
        <input
          class="choice-text-input"
          type="text"
          placeholder="Accepted answer ${index + 1}..."
          value="${escapeHtml(answer)}"
          data-answer-input="${index}"
          maxlength="${MAX_QUESTION_TITLE_LENGTH}"
          aria-describedby="accepted-answer-error-${index}"
        />
        <span
          class="field-error"
          id="accepted-answer-error-${index}"
          data-answer-error="${index}"
          data-field-error
          hidden
        ></span>
      </div>
      <button
        class="btn-remove-choice"
        type="button"
        data-remove-answer="${index}"
        aria-label="Remove accepted answer ${index + 1}"
        ${writtenAcceptedAnswers.length <= 1 ? "disabled" : ""}
      >
        ✕
      </button>
    </div>`,
    )
    .join("");

  if (addAcceptedAnswerBtn) {
    addAcceptedAnswerBtn.disabled =
      writtenAcceptedAnswers.length >= MAX_ACCEPTED_ANSWERS;
  }
};

acceptedAnswersList?.addEventListener("input", (e) => {
  const input = e.target.closest("[data-answer-input]");
  if (input) {
    const idx = Number(input.dataset.answerInput);
    writtenAcceptedAnswers[idx] = input.value;
    refreshQuestionValidation();
  }
});

acceptedAnswersList?.addEventListener("click", (e) => {
  const removeBtn = e.target.closest("[data-remove-answer]");
  if (removeBtn && writtenAcceptedAnswers.length > 1) {
    const idx = Number(removeBtn.dataset.removeAnswer);
    writtenAcceptedAnswers.splice(idx, 1);
    renderAcceptedAnswers();
    refreshQuestionValidation();
  }
});

addAcceptedAnswerBtn?.addEventListener("click", () => {
  if (writtenAcceptedAnswers.length < MAX_ACCEPTED_ANSWERS) {
    writtenAcceptedAnswers.push("");
    renderAcceptedAnswers();
    const inputs =
      acceptedAnswersList.querySelectorAll(".choice-text-input");
    inputs[inputs.length - 1]?.focus();
    refreshQuestionValidation();
  }
});

/* --------------------------------------------------------------------------
   Saved Questions List Rendering
   -------------------------------------------------------------------------- */

const renderQuestionCard = (q, idx) => {
  let typeLabel = "Multiple Choice";
  if (q.type === "trueFalse") typeLabel = "True / False";
  if (q.type === "writtenAnswer") typeLabel = "Written Answer";

  let detailsHtml = "";
  if (q.type === "multipleChoice" || q.type === "trueFalse") {
    detailsHtml = `
      <div class="question-card-item__choices">
        ${(q.choices || [])
          .map((c, cIdx) => {
            const isCorrect =
              cIdx === q.correctChoiceIndex || c.text === q.correctAnswer;
            return `
            <div class="choice-preview-item ${isCorrect ? "is-correct" : ""}">
              <span>${isCorrect ? "●" : "○"}</span>
              <span>${escapeHtml(c.text || c)}</span>
              ${isCorrect ? `<span class="correct-indicator">(Correct)</span>` : ""}
            </div>`;
          })
          .join("")}
      </div>`;
  } else if (q.type === "writtenAnswer") {
    const accepted = (
      Array.isArray(q.acceptedAnswers)
        ? q.acceptedAnswers
        : q.correctText
          ? [q.correctText]
          : []
    ).filter((answer) => String(answer).trim().length > 0);

    detailsHtml = `
      <div class="question-card-item__choices">
        <span class="field-hint">
          ${
            accepted.length
              ? `Accepted answers: <strong>${accepted.map((a) => escapeHtml(a)).join(", ")}</strong>`
              : "Open response (answers will not be auto-graded)"
          }
        </span>
      </div>`;
  }

  return `
  <article class="question-card-item" data-question-index="${idx}" tabindex="-1">
    <div class="question-card-item__top">
      <div class="question-card-item__meta">
        <span class="question-num">Q${idx + 1}</span>
        <span class="badge-pill">${typeLabel}</span>
      </div>
      <button
        class="btn-remove-choice"
        type="button"
        data-delete-question="${idx}"
        title="Delete this question"
        aria-label="Delete question ${idx + 1}"
      >
        🗑
      </button>
    </div>
    <p class="question-card-item__text">${escapeHtml(q.title)}</p>
    ${detailsHtml}
  </article>`;
};

const renderSavedQuestions = () => {
  const count = quizState.questions.length;
  savedBadge.textContent = String(count);
  questionCountNum.textContent = String(count);

  if (count >= MAX_TOTAL_QUESTIONS) {
    questionLimitPill.classList.add("limit-pill--full");
    addQuestionBtn.disabled = true;
    addQuestionBtn.textContent = `Maximum ${MAX_TOTAL_QUESTIONS} questions reached`;
  } else {
    questionLimitPill.classList.remove("limit-pill--full");
    addQuestionBtn.disabled = false;
    addQuestionBtn.textContent = "✦ Add and Save Question";
  }

  if (count === 0) {
    emptyQuestionsPrompt.hidden = false;
    savedQuestionsList.innerHTML = "";
    return;
  }

  emptyQuestionsPrompt.hidden = true;

  const pageCount = Math.ceil(count / MAX_QUESTIONS_PER_PAGE);
  const groups = [];

  for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
    const startIndex = pageIndex * MAX_QUESTIONS_PER_PAGE;
    const pageQuestions = quizState.questions.slice(
      startIndex,
      startIndex + MAX_QUESTIONS_PER_PAGE,
    );
    const startNumber = startIndex + 1;
    const endNumber = startIndex + pageQuestions.length;
    const rangeLabel =
      startNumber === endNumber
        ? `Question ${startNumber}`
        : `Questions ${startNumber}–${endNumber}`;

    groups.push(`
      <section class="builder-page-group" aria-labelledby="builder-page-${pageIndex + 1}">
        <div class="builder-page-group__header">
          <h3 class="builder-page-group__title" id="builder-page-${pageIndex + 1}">
            Page ${pageIndex + 1}
          </h3>
          <span class="builder-page-group__range">${rangeLabel}</span>
        </div>
        <div class="builder-page-group__questions">
          ${pageQuestions
            .map((question, offset) =>
              renderQuestionCard(question, startIndex + offset),
            )
            .join("")}
        </div>
      </section>`);
  }

  savedQuestionsList.innerHTML = groups.join("");
};

savedQuestionsList.addEventListener("click", (e) => {
  const deleteBtn = e.target.closest("[data-delete-question]");
  if (deleteBtn) {
    const idx = Number(deleteBtn.dataset.deleteQuestion);
    quizState.questions.splice(idx, 1);
    renderSavedQuestions();
    saveDraftToStorage();
    refreshQuizValidation();
    showToast("Question removed.");
  }
});

/* --------------------------------------------------------------------------
   Add Question Handler
   -------------------------------------------------------------------------- */

addQuestionBtn.addEventListener("click", () => {
  clearValidationUI();
  validationScope = null;

  if (quizState.questions.length >= MAX_TOTAL_QUESTIONS) {
    showError(
      `A quiz cannot contain more than ${MAX_TOTAL_QUESTIONS} questions across ${MAX_PAGES} pages.`,
      { title: "Question limit reached" },
    );
    return;
  }

  const errors = validateQuestionDraft();
  if (errors.length > 0) {
    validationScope = "question";
    showValidationErrors(errors, {
      title: "Please fix this question",
      focusFirst: true,
    });
    return;
  }

  const title = questionTitleInput.value.trim();
  let newQuestion = null;

  if (currentQuestionType === "multipleChoice") {
    const validChoices = mcqChoices
      .map((choice, index) => ({ text: choice.trim(), index }))
      .filter((choice) => choice.text.length > 0);
    const selectedIndex = getMcqSelectedIndex();
    const correctChoiceIndex = validChoices.findIndex(
      (choice) => choice.index === selectedIndex,
    );

    newQuestion = {
      type: "multipleChoice",
      title,
      choices: validChoices.map((choice) => ({ text: choice.text })),
      correctChoiceIndex: correctChoiceIndex >= 0 ? correctChoiceIndex : 0,
      required: true,
    };
  } else if (currentQuestionType === "trueFalse") {
    const tfCorrectVal =
      document.querySelector('input[name="tf-correct"]:checked')?.value ||
      "True";

    newQuestion = {
      type: "trueFalse",
      title,
      choices: [{ text: "True" }, { text: "False" }],
      correctChoiceIndex: tfCorrectVal === "True" ? 0 : 1,
      correctAnswer: tfCorrectVal,
      required: true,
    };
  } else if (currentQuestionType === "writtenAnswer") {
    const acceptedAnswers = writtenAcceptedAnswers
      .map((answer) => answer.trim())
      .filter((answer) => answer.length > 0);

    newQuestion = {
      type: "writtenAnswer",
      title,
      acceptedAnswers,
      required: true,
    };
  }

  if (newQuestion) {
    const assignedPage =
      Math.floor(quizState.questions.length / MAX_QUESTIONS_PER_PAGE) + 1;
    quizState.questions.push(newQuestion);
    validationScope = null;
    clearValidationUI();
    renderSavedQuestions();
    saveDraftToStorage();

    // Reset question inputs for next question
    questionTitleInput.value = "";
    writtenAcceptedAnswers = [""];
    renderAcceptedAnswers();
    mcqChoices = ["", ""];
    mcqCorrectIndex = 0;
    renderMcqChoices();
    showToast(`Question saved to Page ${assignedPage}.`);
    questionTitleInput.focus();
  }
});

/* --------------------------------------------------------------------------
   Save & Publish to Backend
   -------------------------------------------------------------------------- */

const submitQuizToServer = async (targetStatus) => {
  clearValidationUI();
  validationScope = null;
  lastQuizTargetStatus = targetStatus;

  const errors = validateQuizForSave(targetStatus);
  if (errors.length > 0) {
    validationScope = "quiz";
    showValidationErrors(errors, {
      title:
        targetStatus === "published"
          ? "Please fix these issues before publishing"
          : "Please fix these issues before saving",
      focusFirst: true,
    });
    return;
  }

  const title = quizTitleInput.value.trim();
  const payload = {
    title,
    description: quizDescInput.value.trim(),
    icon: quizState.icon,
    status: targetStatus,
    allowRetakes: Boolean(allowRetakesInput?.checked),
    showCorrectAnswers: Boolean(showCorrectAnswersInput?.checked),
    questions: quizState.questions,
  };

  const submitBtn =
    targetStatus === "published" ? publishQuizBtn : saveDraftBtn;
  const originalText = submitBtn.textContent;
  submitBtn.disabled = true;
  submitBtn.textContent =
    targetStatus === "published" ? "Publishing…" : "Saving…";

  try {
    const endpoint = isEditMode
      ? `/api/quizzes/${editQuizId}`
      : "/api/quizzes";
    const method = isEditMode ? "PATCH" : "POST";

    const response = await fetch(endpoint, {
      method,
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (response.status === 401) {
      showToast("Please log in to save your quiz.");
      window.setTimeout(() => {
        window.location.href = "/login";
      }, 1200);
      return;
    }

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || "Failed to save quiz");
    }

    // Success! Clear local draft (only relevant outside edit mode)
    if (!isEditMode) {
      localStorage.removeItem(STORAGE_KEY);
    }

    clearValidationUI();
    validationScope = null;
    lastQuizTargetStatus = null;

    const quizData = data.data.quiz;
    const fullShareUrl = `${window.location.origin}${quizData.shareUrl}`;

    shareLinkInput.value = fullShareUrl;
    shareCodeInput.value = quizData.shareCode || "";
    modalTakeLink.href = quizData.shareUrl;

    const modalTitle = document.querySelector("#modal-title");
    if (isEditMode) {
      modalTitle.textContent =
        targetStatus === "draft" ? "Draft Changes Saved!" : "Quiz Updated!";
    } else if (targetStatus === "draft") {
      modalTitle.textContent = "Draft Saved!";
    } else {
      modalTitle.textContent = "Quiz Published Successfully!";
    }

    successModal.hidden = false;
  } catch (err) {
    showError(err.message || "An unexpected error occurred while saving.");
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = originalText;
  }
};

publishQuizBtn.addEventListener("click", () => submitQuizToServer("published"));
saveDraftBtn.addEventListener("click", () => submitQuizToServer("draft"));

/* --------------------------------------------------------------------------
   Modal Actions
   -------------------------------------------------------------------------- */

copyModalLinkBtn.addEventListener("click", () => {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(shareLinkInput.value).then(() => {
      copyModalLinkBtn.textContent = "Copied!";
      window.setTimeout(() => {
        copyModalLinkBtn.textContent = "Copy link";
      }, 2000);
    });
  } else {
    shareLinkInput.select();
    document.execCommand("copy");
    copyModalLinkBtn.textContent = "Copied!";
  }
});

copyModalCodeBtn.addEventListener("click", () => {
  if (!shareCodeInput.value) return;

  if (navigator.clipboard) {
    navigator.clipboard.writeText(shareCodeInput.value).then(() => {
      copyModalCodeBtn.textContent = "Copied!";
      window.setTimeout(() => {
        copyModalCodeBtn.textContent = "Copy code";
      }, 2000);
    });
  } else {
    shareCodeInput.select();
    document.execCommand("copy");
    copyModalCodeBtn.textContent = "Copied!";
  }
});

/* --------------------------------------------------------------------------
   Edit Mode
   -------------------------------------------------------------------------- */

const applyQuizToBuilder = (quiz) => {
  quizState.title = quiz.title || "";
  quizState.description = quiz.description || "";
  quizState.icon = quiz.icon?.reference || null;
  quizState.status = quiz.status || "draft";
  quizState.allowRetakes = Boolean(quiz.allowRetakes);
  quizState.showCorrectAnswers = Boolean(quiz.showCorrectAnswers);

  quizTitleInput.value = quizState.title;
  quizDescInput.value = quizState.description;
  quizStatusSelect.value = quizState.status;
  if (allowRetakesInput) allowRetakesInput.checked = quizState.allowRetakes;
  if (showCorrectAnswersInput) {
    showCorrectAnswersInput.checked = quizState.showCorrectAnswers;
  }

  const questions = [];
  (quiz.pages || []).forEach((page) => {
    (page.questions || []).forEach((question) => {
      if (question.type === "writtenAnswer") {
        questions.push({
          _id: question.id,
          type: "writtenAnswer",
          title: question.title,
          acceptedAnswers: Array.isArray(question.acceptedAnswers)
            ? question.acceptedAnswers
            : [],
          required: question.required !== false,
        });
        return;
      }

      const choices = (question.choices || []).map((choice) => ({
        _id: choice.id,
        text: choice.text,
      }));
      let correctChoiceIndex = choices.findIndex(
        (choice) => choice._id === question.correctChoiceId,
      );
      if (correctChoiceIndex < 0) correctChoiceIndex = 0;

      questions.push({
        _id: question.id,
        type: question.type,
        title: question.title,
        choices,
        correctChoiceIndex,
        required: question.required !== false,
      });
    });
  });

  quizState.questions = questions;
  renderSavedQuestions();
  renderIconPicker();
};

const setupEditMode = async () => {
  if (topbarBreadcrumb) topbarBreadcrumb.textContent = "Edit a quiz";
  if (editModeBanner) editModeBanner.hidden = false;
  document.title = "Quizite — Edit quiz";

  try {
    const response = await fetch(`/api/quizzes/${editQuizId}`, {
      credentials: "include",
    });
    const payload = await response.json().catch(() => null);

    if (response.status === 401) {
      showError("Please log in to edit this quiz.");
      window.setTimeout(() => {
        window.location.href = "/login";
      }, 1200);
      return;
    }

    if (!response.ok) {
      showError(payload?.message || "Could not load this quiz for editing.");
      return;
    }

    if (!payload?.data?.isOwner) {
      showError("You do not have permission to edit this quiz.");
      return;
    }

    applyQuizToBuilder(payload.data.quiz);
  } catch {
    showError("Could not load this quiz for editing.");
  }
};

// Auto-save title/description on typing
quizTitleInput.addEventListener("input", saveDraftToStorage);
quizDescInput.addEventListener("input", saveDraftToStorage);
quizStatusSelect.addEventListener("change", saveDraftToStorage);
allowRetakesInput?.addEventListener("change", saveDraftToStorage);
showCorrectAnswersInput?.addEventListener("change", saveDraftToStorage);

quizTitleInput.addEventListener("input", refreshQuizValidation);
quizDescInput.addEventListener("input", refreshQuizValidation);
questionTitleInput.addEventListener("input", refreshQuestionValidation);
tfContainer.addEventListener("change", refreshQuestionValidation);

const ensureAuthenticated = async () => {
  try {
    const res = await fetch("/api/overview?limit=1", { credentials: "include" });
    if (res.status === 401) {
      window.location.replace("/login");
      return false;
    }
    return true;
  } catch {
    return true;
  }
};

// Initialize
(async () => {
  const isAuth = await ensureAuthenticated();
  if (!isAuth) return;

  renderMcqChoices();
  renderAcceptedAnswers();
  renderIconPicker();
  if (isEditMode) {
    setupEditMode();
  } else {
    restoreDraftFromStorage();
  }
})();
