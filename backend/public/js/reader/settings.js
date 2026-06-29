const API_BASE_URL = (window.NovaraSession && window.NovaraSession.API_BASE_URL) || "https://novara-6s67.onrender.com";

async function apiFetch(path, options = {}) {
  const url = `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
  const response = await fetch(url, { credentials: "include", ...options });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || data.message || "Request failed");
  }
  return data;
}

function accountSettingsKey() {
  if (window.NovaraSession && typeof window.NovaraSession.readerDataKey === "function") {
    return window.NovaraSession.readerDataKey("accountSettings");
  }
  const uid = localStorage.getItem("novara.userId") || "guest";
  return `novara.reader.u.${uid}.accountSettings`;
}

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
  displayName: "",
  email: "",
  bio: "",
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

async function loadSettings() {
  try {
    const response = await apiFetch("/api/settings");
    if (response.success && response.data) {
      return response.data;
    }
  } catch (error) {
    console.warn("Failed to load settings from backend, using localStorage fallback:", error);
  }

  // Fallback to localStorage
  try {
    const raw = localStorage.getItem(accountSettingsKey());
    if (!raw) {
      return { ...defaultSettings };
    }
    const parsed = JSON.parse(raw);
    return { ...defaultSettings, ...parsed };
  } catch (error) {
    return { ...defaultSettings };
  }
}

async function saveSettings(settings) {
  try {
    await apiFetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    });
  } catch (error) {
    console.warn("Failed to save settings to backend, using localStorage fallback:", error);
    localStorage.setItem(accountSettingsKey(), JSON.stringify(settings));
  }
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

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearErrors();

    const settings = collectSettingsFromDom();
    const error = validateSection(formId, settings);

    if (error) {
      setSectionError(formId, error);
      setGlobalMessage("Please fix validation errors before saving.", true);
      return;
    }

    await saveSettings(settings);
    setGlobalMessage("Settings saved successfully.");
  });
}

async function bootstrap() {
  let settings = await loadSettings();
  if (window.NovaraSession && typeof window.NovaraSession.fetchCurrentUser === "function") {
    const user = await window.NovaraSession.fetchCurrentUser();
    if (user) {
      settings = {
        ...settings,
        displayName: settings.displayName || user.name || "",
        email: settings.email || user.email || "",
      };
    }
  }
  populateFormValues(settings);

  Object.keys(formMap).forEach((formId) => {
    bindFormSubmit(formId);
  });
}

bootstrap();
