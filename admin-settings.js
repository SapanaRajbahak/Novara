const ADMIN_AUTH_KEY = "novelread.admin.auth";
const ADMIN_SETTINGS_KEY = "novelread.admin.settings";

const elements = {
  logoutBtn: document.getElementById("logoutBtn"),
  platformForm: document.getElementById("platformForm"),
  aiForm: document.getElementById("aiForm"),
  storageForm: document.getElementById("storageForm"),
  publishingForm: document.getElementById("publishingForm"),
  moderationForm: document.getElementById("moderationForm"),
  platformNameInput: document.getElementById("platformNameInput"),
  defaultLanguageSelect: document.getElementById("defaultLanguageSelect"),
  maintenanceModeInput: document.getElementById("maintenanceModeInput"),
  defaultModelInput: document.getElementById("defaultModelInput"),
  temperatureInput: document.getElementById("temperatureInput"),
  maxTokensInput: document.getElementById("maxTokensInput"),
  storageProviderInput: document.getElementById("storageProviderInput"),
  retentionDaysInput: document.getElementById("retentionDaysInput"),
  defaultBookStatusSelect: document.getElementById("defaultBookStatusSelect"),
  defaultVisibilitySelect: document.getElementById("defaultVisibilitySelect"),
  autoPublishAudioInput: document.getElementById("autoPublishAudioInput"),
  flagThresholdInput: document.getElementById("flagThresholdInput"),
  blockedTermsInput: document.getElementById("blockedTermsInput"),
  autoModerationInput: document.getElementById("autoModerationInput"),
  message: document.getElementById("message")
};

function requireAuth() {
  const auth = localStorage.getItem(ADMIN_AUTH_KEY);
  if (auth !== "1") {
    const next = encodeURIComponent("admin-settings.html");
    window.location.href = `admin-login.html?next=${next}`;
    return false;
  }
  return true;
}

function showToast(message) {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  document.body.appendChild(toast);
  window.setTimeout(() => toast.remove(), 1400);
}

function setMessage(text) {
  elements.message.textContent = text;
}

function readSettings() {
  try {
    const raw = localStorage.getItem(ADMIN_SETTINGS_KEY);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw);
  } catch (error) {
    return null;
  }
}

function saveSettings(settings) {
  localStorage.setItem(ADMIN_SETTINGS_KEY, JSON.stringify(settings));
}

function getDefaultSettings() {
  return {
    platform: {
      platformName: "NovelRead",
      defaultLanguage: "en",
      maintenanceMode: false
    },
    ai: {
      defaultModel: "gpt-5.3-codex",
      temperature: 0.8,
      maxTokens: 2400
    },
    storage: {
      provider: "local-placeholder",
      retentionDays: 365
    },
    publishing: {
      defaultBookStatus: "draft",
      defaultVisibility: "internal",
      autoPublishAudio: false
    },
    moderation: {
      flagThreshold: 5,
      blockedTerms: "",
      autoModeration: true
    }
  };
}

function getCurrentSettings() {
  return {
    platform: {
      platformName: elements.platformNameInput.value.trim() || "NovelRead",
      defaultLanguage: elements.defaultLanguageSelect.value,
      maintenanceMode: elements.maintenanceModeInput.checked
    },
    ai: {
      defaultModel: elements.defaultModelInput.value.trim() || "gpt-5.3-codex",
      temperature: Number(elements.temperatureInput.value) || 0,
      maxTokens: Number(elements.maxTokensInput.value) || 0
    },
    storage: {
      provider: elements.storageProviderInput.value.trim() || "local-placeholder",
      retentionDays: Number(elements.retentionDaysInput.value) || 365
    },
    publishing: {
      defaultBookStatus: elements.defaultBookStatusSelect.value,
      defaultVisibility: elements.defaultVisibilitySelect.value,
      autoPublishAudio: elements.autoPublishAudioInput.checked
    },
    moderation: {
      flagThreshold: Number(elements.flagThresholdInput.value) || 5,
      blockedTerms: elements.blockedTermsInput.value.trim(),
      autoModeration: elements.autoModerationInput.checked
    }
  };
}

function applySettingsToForm(settings) {
  elements.platformNameInput.value = settings.platform.platformName;
  elements.defaultLanguageSelect.value = settings.platform.defaultLanguage;
  elements.maintenanceModeInput.checked = Boolean(settings.platform.maintenanceMode);

  elements.defaultModelInput.value = settings.ai.defaultModel;
  elements.temperatureInput.value = String(settings.ai.temperature);
  elements.maxTokensInput.value = String(settings.ai.maxTokens);

  elements.storageProviderInput.value = settings.storage.provider;
  elements.retentionDaysInput.value = String(settings.storage.retentionDays);

  elements.defaultBookStatusSelect.value = settings.publishing.defaultBookStatus;
  elements.defaultVisibilitySelect.value = settings.publishing.defaultVisibility;
  elements.autoPublishAudioInput.checked = Boolean(settings.publishing.autoPublishAudio);

  elements.flagThresholdInput.value = String(settings.moderation.flagThreshold);
  elements.blockedTermsInput.value = settings.moderation.blockedTerms;
  elements.autoModerationInput.checked = Boolean(settings.moderation.autoModeration);
}

function validateAiSettings(ai) {
  if (ai.temperature < 0 || ai.temperature > 2) {
    setMessage("Temperature must be between 0 and 2.");
    return false;
  }

  if (ai.maxTokens < 128 || ai.maxTokens > 16000) {
    setMessage("Max tokens must be between 128 and 16000.");
    return false;
  }

  return true;
}

function handleSave(sectionName) {
  const settings = getCurrentSettings();
  if (!validateAiSettings(settings.ai)) {
    return;
  }

  saveSettings(settings);
  setMessage(`${sectionName} saved.`);
  showToast(`${sectionName} updated`);
}

function bindEvents() {
  elements.logoutBtn.addEventListener("click", () => {
    localStorage.removeItem(ADMIN_AUTH_KEY);
    window.location.href = "admin-login.html";
  });

  elements.platformForm.addEventListener("submit", (event) => {
    event.preventDefault();
    handleSave("Platform settings");
  });

  elements.aiForm.addEventListener("submit", (event) => {
    event.preventDefault();
    handleSave("AI settings");
  });

  elements.storageForm.addEventListener("submit", (event) => {
    event.preventDefault();
    handleSave("Storage placeholder settings");
  });

  elements.publishingForm.addEventListener("submit", (event) => {
    event.preventDefault();
    handleSave("Publishing defaults");
  });

  elements.moderationForm.addEventListener("submit", (event) => {
    event.preventDefault();
    handleSave("Moderation placeholder settings");
  });
}

function bootstrap() {
  if (!requireAuth()) {
    return;
  }

  const saved = readSettings() || getDefaultSettings();
  applySettingsToForm(saved);
  bindEvents();
  setMessage("Settings ready.");
}

bootstrap();
