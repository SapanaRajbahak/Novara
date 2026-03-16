const SETTINGS_STORAGE_KEY = "novelread.user.settings";

const formMap = {
  accountForm: {
    errorId: "accountError",
    fields: ["displayName", "email", "bio"]
  },
  appearanceForm: {
    errorId: "appearanceError",
    fields: ["appTheme", "appDensity"]
  },
  readerForm: {
    errorId: "readerError",
    fields: ["defaultFontSize", "defaultReaderTheme", "defaultReadingMode"]
  },
  audioForm: {
    errorId: "audioError",
    fields: ["defaultAudioSpeed", "voiceProfile", "autoPlayNext"]
  },
  notificationsForm: {
    errorId: "notificationsError",
    fields: ["notifyRecommendations", "notifyReleases", "notifyStreaks", "notifyPromotions"]
  },
  privacyForm: {
    errorId: "privacyError",
    fields: ["profileVisibility", "dataSharing"]
  }
};

const defaultSettings = {
  displayName: "Ariana Rivers",
  email: "ariana.rivers@novelread.app",
  bio: "I read mysteries at dawn and fantasy at night.",
  appTheme: "system",
  appDensity: "comfortable",
  defaultFontSize: 19,
  defaultReaderTheme: "sepia",
  defaultReadingMode: "scroll",
  defaultAudioSpeed: "1",
  voiceProfile: "default",
  autoPlayNext: true,
  notifyRecommendations: true,
  notifyReleases: true,
  notifyStreaks: true,
  notifyPromotions: false,
  profileVisibility: "private",
  dataSharing: "limited"
};

const globalMessage = document.getElementById("globalMessage");

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) {
      return { ...defaultSettings };
    }
    const parsed = JSON.parse(raw);
    return { ...defaultSettings, ...parsed };
  } catch (error) {
    return { ...defaultSettings };
  }
}

function saveSettings(settings) {
  localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
}

function setGlobalMessage(text, isError = false) {
  globalMessage.textContent = text;
  globalMessage.classList.toggle("ok", !isError && !!text);
  globalMessage.classList.toggle("error", isError && !!text);
}

function populateFormValues(settings) {
  Object.keys(defaultSettings).forEach((key) => {
    const field = document.getElementById(key);
    if (!field) {
      return;
    }

    if (field.type === "checkbox") {
      field.checked = Boolean(settings[key]);
      return;
    }

    field.value = String(settings[key] ?? "");
  });
}

function collectSettingsFromDom() {
  const result = { ...defaultSettings };
  Object.keys(defaultSettings).forEach((key) => {
    const field = document.getElementById(key);
    if (!field) {
      return;
    }

    if (field.type === "checkbox") {
      result[key] = field.checked;
      return;
    }

    if (key === "defaultFontSize") {
      result[key] = Number(field.value);
      return;
    }

    result[key] = field.value;
  });
  return result;
}

function validateAccount(settings) {
  if (!settings.displayName.trim()) {
    return "Display name is required.";
  }

  if (settings.displayName.trim().length < 2) {
    return "Display name must be at least 2 characters.";
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(settings.email)) {
    return "Please enter a valid email address.";
  }

  if (settings.bio.length > 220) {
    return "Bio must be 220 characters or less.";
  }

  return "";
}

function validateReader(settings) {
  if (!Number.isFinite(settings.defaultFontSize)) {
    return "Default font size must be a number.";
  }

  if (settings.defaultFontSize < 14 || settings.defaultFontSize > 30) {
    return "Default font size must be between 14 and 30.";
  }

  if (!["light", "dark", "sepia"].includes(settings.defaultReaderTheme)) {
    return "Invalid reader theme selected.";
  }

  if (!["scroll", "paginated"].includes(settings.defaultReadingMode)) {
    return "Invalid reading mode selected.";
  }

  return "";
}

function validateAudio(settings) {
  const validSpeeds = ["0.75", "1", "1.25", "1.5", "1.75", "2"];
  if (!validSpeeds.includes(String(settings.defaultAudioSpeed))) {
    return "Invalid audio speed selected.";
  }

  if (!["default", "warm", "clear", "expressive"].includes(settings.voiceProfile)) {
    return "Invalid voice profile selected.";
  }

  return "";
}

function clearErrors() {
  Object.values(formMap).forEach(({ errorId }) => {
    const errorEl = document.getElementById(errorId);
    if (errorEl) {
      errorEl.textContent = "";
    }
  });
}

function setSectionError(formId, message) {
  const meta = formMap[formId];
  if (!meta) {
    return;
  }
  const errorEl = document.getElementById(meta.errorId);
  if (errorEl) {
    errorEl.textContent = message;
  }
}

function validateSection(formId, settings) {
  if (formId === "accountForm") {
    return validateAccount(settings);
  }

  if (formId === "readerForm") {
    return validateReader(settings);
  }

  if (formId === "audioForm") {
    return validateAudio(settings);
  }

  return "";
}

function bindFormSubmit(formId) {
  const form = document.getElementById(formId);
  if (!form) {
    return;
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    clearErrors();

    const settings = collectSettingsFromDom();
    const error = validateSection(formId, settings);

    if (error) {
      setSectionError(formId, error);
      setGlobalMessage("Please fix validation errors before saving.", true);
      return;
    }

    saveSettings(settings);
    setGlobalMessage("Settings saved successfully.");
  });
}

function bootstrap() {
  const settings = loadSettings();
  populateFormValues(settings);

  Object.keys(formMap).forEach((formId) => {
    bindFormSubmit(formId);
  });
}

bootstrap();
