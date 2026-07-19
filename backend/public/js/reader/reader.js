// --- Novara localStorage migration logic ---
function migrateNovaraLocalStorage() {
  const keyPairs = [
    ["novelread.bookmarks", "novara.bookmarks"],
    ["novelread.continueReading", "novara.continueReading"],
    ["novelread.reader.settings", "novara.reader.settings"],
    ["novelread.reader.progress", "novara.reader.progress"],
    ["novelread.reader.bookmarks", "novara.reader.bookmarks"],
    ["novelread.reader.notes", "novara.reader.notes"],
    ["novelread.reader.listenProgress", "novara.reader.listenProgress"],
    ["novelread.tts.voice", "novara.tts.voice"],
    ["novelread.postLoginRedirect", "novara.postLoginRedirect"],
    ["novelread.userId", "novara.userId"],
    ["novelread.savedBooks", "novara.savedBooks"],
    ["novelread.preferredDashboard", "novara.preferredDashboard"],
    ["novelread.admin.auth", "novara.admin.auth"],
    ["novelread.admin.uploadedBooks", "novara.admin.uploadedBooks"],
    ["novelread.admin.chapterDrafts", "novara.admin.chapterDrafts"],
    ["novelread.admin.aiDrafts", "novara.admin.aiDrafts"],
    ["novelread.admin.chapterEditorDrafts", "novara.admin.chapterEditorDrafts"],
    ["novelread.admin.settings", "novara.admin.settings"]
  ];
  keyPairs.forEach(([oldKey, newKey]) => {
    if (!localStorage.getItem(newKey) && localStorage.getItem(oldKey)) {
      localStorage.setItem(newKey, localStorage.getItem(oldKey));
    }
  });
}

migrateNovaraLocalStorage();

const API_BASE_URL = (window.NovaraSession && window.NovaraSession.API_BASE_URL) || "https://novara-6s67.onrender.com";
const POST_LOGIN_REDIRECT_KEY = "novara.postLoginRedirect";

function readerScoped(segment) {
  if (window.NovaraSession && typeof window.NovaraSession.readerDataKey === "function") {
    return window.NovaraSession.readerDataKey(segment);
  }
  const uid = localStorage.getItem("novara.userId") || "guest";
  return `novara.reader.u.${uid}.${segment}`;
}
// === Unified Data Persistence Utilities (imported from app.js if not present) ===

// Move state and elements declarations to the top to avoid ReferenceError
// ...existing code...

// ...existing code...
if (typeof getCurrentUserId !== 'function') {
  function getCurrentUserId() {
    return localStorage.getItem('novara.userId') || 'guest';
  }
}
// Unified continue reading persistence
function addContinueReading({ bookId, source, currentChapter, progress }) {
  const userId = getCurrentUserId();
  const key = readerScoped('continueReading');
  let entries = JSON.parse(localStorage.getItem(key) || '[]');
  // Remove any existing for this user/book
  entries = entries.filter(e => !(e.userId === userId && e.bookId === bookId));
  entries.unshift({
    userId,
    bookId,
    source,
    currentChapter,
    progress,
    updatedAt: new Date().toISOString()
  });
  // Limit to 30 most recent
  entries = entries.slice(0, 30);
  localStorage.setItem(key, JSON.stringify(entries));
}
if (typeof addBookmark !== 'function') {
  function addBookmark({ bookId, chapterId, note }) {
    const userId = getCurrentUserId();
    const key = readerScoped('bookmarks');
    let entries = JSON.parse(localStorage.getItem(key) || '[]');
    entries.unshift({ userId, bookId, chapterId, note });
    localStorage.setItem(key, JSON.stringify(entries));
  }
}

const state = {
  currentBook: null,
  currentUser: null,
  chapterCache: {},
  currentChapter: null,
  currentChapterIndex: 0,
  bookSource: 'api',
  progressApiEnabled: true,
  progressApiAuthMissingNotified: false,
  resumeApplied: false,
  showListen: true,
  settings: {
    fontSize: 18,
    fontFamily: "serif",
    lineHeight: 1.6,
    theme: "light",
    pageWidth: 700,
    readingMode: "scroll",
    contentFormat: "structured",
    preferredLanguage: "en",
    autoTranslate: false,
    saveTranslations: false
  },
  translationCache: {},
  listen: {
    audioElement: null,
    isPlaying: false,
    speed: 1,
    ttsSentences: [],
    ttsSentenceNodes: [],
    ttsWordBoundaries: [],
    currentSentenceIndex: 0,
    activeSentenceNode: null,
    activeWordNode: null,
    currentUtterance: null,
    suppressTtsEnd: false,
    isTtsPaused: false,
    audioSaveTimer: null,
    listeningApiEnabled: true,
    listeningApiAuthMissingNotified: false,
    lastListeningSyncMs: 0,
    ttsVoices: [],
    ttsSelectedLang: "",
    ttsSelectedVoiceName: ""
  }
};


// Improved DOMContentLoaded handler for robust event binding and overlays
document.addEventListener('DOMContentLoaded', () => {
  // Remove overlays or modals that could block pointer events
  if (elements.settingsModal && elements.settingsModal.classList.contains('show')) {
    elements.settingsModal.classList.remove('show');
    elements.settingsModal.setAttribute('aria-hidden', 'true');
  }
  if (elements.selectionTools) {
    elements.selectionTools.style.display = 'none';
  }
  // Always bind events after DOM and elements are ready
  bindEvents();
  updateReaderMainLayout();
});

const elements = {
  root: document.documentElement,
  app: document.getElementById("readerApp"),
  readerCenter: document.getElementById("readerCenter"),
  toolbar: document.getElementById("readerToolbar"),
  bottom: document.getElementById("readerBottom"),
  panelFullscreenBtn: document.getElementById("panelFullscreenBtn"),
  backButton: document.getElementById("backButton"),
  drawerToggleBtn: document.getElementById("drawerToggleBtn"),
  notesToggleBtn: document.getElementById("notesToggleBtn"),
  settingsBtn: document.getElementById("settingsBtn"),
  searchInput: document.getElementById("searchInput"),
  translationLanguageSelect: document.getElementById("translationLanguageSelect"),
  translateChapterBtn: document.getElementById("translateChapterBtn"),
  listenBtn: document.getElementById("listenBtn"),
  listenModeLabel: document.getElementById("listenModeLabel"),
  toolbarBookTitle: document.getElementById("toolbarBookTitle"),
  toolbarChapterTitle: document.getElementById("toolbarChapterTitle"),
  chapterDrawer: document.getElementById("chapterDrawer"),
  chapterList: document.getElementById("chapterList"),
  trackSection: document.getElementById("trackSection"),
  trackList: document.getElementById("trackList"),
  notesPanel: document.getElementById("notesPanel"),
  noteList: document.getElementById("noteList"),
  readingViewport: document.getElementById("readingViewport"),
  readerContent: document.getElementById("readerContent"),
  prevBtn: document.getElementById("prevBtn"),
  nextBtn: document.getElementById("nextBtn"),
  progressSlider: document.getElementById("progressSlider"),
  progressText: document.getElementById("progressText"),
  translationStatus: document.getElementById("translationStatus"),
  saveTranslationBtn: document.getElementById("saveTranslationBtn"),
  listenMiniPlayer: document.getElementById("listenMiniPlayer"),
  listenSettingsPanel: document.getElementById("listenSettingsPanel"),
  miniPlaybackTitle: document.getElementById("miniPlaybackTitle"),
  miniPlaybackMode: document.getElementById("miniPlaybackMode"),
  miniBackBtn: document.getElementById("miniBackBtn"),
  miniPlayPauseBtn: document.getElementById("miniPlayPauseBtn"),
  miniForwardBtn: document.getElementById("miniForwardBtn"),
  miniStopBtn: document.getElementById("miniStopBtn"),
  miniSpeedSelect: document.getElementById("miniSpeedSelect"),
  miniPulse: document.getElementById("miniPulse"),
  ttsVoiceRow: document.getElementById("ttsVoiceRow"),
  ttsAccentSelect: document.getElementById("ttsAccentSelect"),
  ttsVoiceSelect: document.getElementById("ttsVoiceSelect"),
  settingsModal: document.getElementById("settingsModal"),
  closeSettingsBtn: document.getElementById("closeSettingsBtn"),
  fontSizeInput: document.getElementById("fontSizeInput"),
  fontFamilySelect: document.getElementById("fontFamilySelect"),
  lineHeightInput: document.getElementById("lineHeightInput"),
  themeSelect: document.getElementById("themeSelect"),
  pageWidthInput: document.getElementById("pageWidthInput"),
  modeSelect: document.getElementById("modeSelect"),
  formatSelect: document.getElementById("formatSelect"),
  preferredLanguageSelect: document.getElementById("preferredLanguageSelect"),
  autoTranslateInput: document.getElementById("autoTranslateInput"),
  saveTranslationsInput: document.getElementById("saveTranslationsInput"),
  filePicker: document.getElementById("filePicker"),
  selectionTools: document.getElementById("selectionTools"),
  highlightBtn: document.getElementById("highlightBtn"),
  addNoteBtn: document.getElementById("addNoteBtn"),
  leftTapZone: document.getElementById("leftTapZone"),
  centerTapZone: document.getElementById("centerTapZone"),
  rightTapZone: document.getElementById("rightTapZone")
};

function updateReaderMainLayout() {
  const readerMain = document.querySelector(".reader-main");
  if (!readerMain) {
    return;
  }

  const viewportWidth = window.innerWidth || 0;
  if (viewportWidth <= 900) {
    readerMain.style.gridTemplateColumns = "1fr";
    return;
  }

  const drawerHidden = elements.chapterDrawer ? elements.chapterDrawer.classList.contains("hidden") : true;
  const notesHidden = elements.notesPanel ? elements.notesPanel.classList.contains("hidden") : true;

  if (viewportWidth <= 1200) {
    readerMain.style.gridTemplateColumns = drawerHidden ? "1fr" : "250px 1fr";
    return;
  }

  if (drawerHidden && notesHidden) {
    readerMain.style.gridTemplateColumns = "1fr";
  } else if (drawerHidden) {
    readerMain.style.gridTemplateColumns = "1fr 300px";
  } else if (notesHidden) {
    readerMain.style.gridTemplateColumns = "280px 1fr";
  } else {
    readerMain.style.gridTemplateColumns = "280px 1fr 300px";
  }
}

function showToast(message) {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  document.body.appendChild(toast);
  window.setTimeout(() => toast.remove(), 1600);
}

function updateFullscreenButtonLabel() {
  if (!elements.panelFullscreenBtn) {
    return;
  }

  const inReaderFullscreen = document.fullscreenElement === elements.readerCenter;
  elements.panelFullscreenBtn.textContent = inReaderFullscreen ? "↙ Back" : "↗ Full";
  elements.panelFullscreenBtn.setAttribute(
    "aria-label",
    inReaderFullscreen ? "Exit fullscreen" : "Expand reading panel"
  );
  elements.panelFullscreenBtn.setAttribute(
    "title",
    inReaderFullscreen ? "Back to normal" : "Expand reading panel"
  );
}

async function toggleFullscreen() {
  try {
    if (!elements.readerCenter) {
      showToast("Reader area not available");
      return;
    }

    if (document.fullscreenElement === elements.readerCenter) {
      await document.exitFullscreen();
    } else if (!document.fullscreenElement) {
      await elements.readerCenter.requestFullscreen();
    } else {
      await document.exitFullscreen();
      await elements.readerCenter.requestFullscreen();
    }

    updateFullscreenButtonLabel();
  } catch (error) {
    showToast("Fullscreen is not available");
  }
}

function getParams() {
  const params = new URLSearchParams(window.location.search);

  const chapterFromQuery = Number(params.get("chapter") || 1);

  return {
    bookId: params.get("bookId") || params.get("book") || "",
    chapterId: params.get("chapterId") || "",
    chapter: Number.isFinite(chapterFromQuery) ? chapterFromQuery : 1,
    mode: params.get("mode") || "read",
    source: params.get("source") || ""
  };
}

function buildReaderUrl(bookId, chapterId, mode) {
  const params = new URLSearchParams();
  params.set("bookId", bookId);
  if (chapterId) {
    params.set("chapterId", chapterId);
  }
  if (mode) {
    params.set("mode", mode);
  }
  return `/reader/reader.html?${params.toString()}`;
}

function buildLandingAuthUrl(nextUrl) {
  const params = new URLSearchParams();
  params.set("auth", "signup");
  params.set("next", nextUrl);
  return `/index.html?${params.toString()}`;
}

function savePostLoginRedirect(url) {
  try {
    localStorage.setItem(POST_LOGIN_REDIRECT_KEY, url);
  } catch (error) {
    // Ignore storage write errors.
  }
}

function isChapterLockedForGuest(chapterMeta) {
  if (!chapterMeta) {
    return false;
  }
  if (state.currentUser) {
    return false;
  }
  return Boolean(chapterMeta.isLockedForGuest) || Number(chapterMeta.number) > 1;
}

function requestLoginForChapterAccess(chapterMeta) {
  if (!state.currentBook || !chapterMeta) {
    return;
  }

  const params = getParams();
  const intendedUrl = buildReaderUrl(state.currentBook.id, chapterMeta.id, params.mode === "audio" ? "audio" : "");
  savePostLoginRedirect(intendedUrl);
  showToast("Login required to read Chapter 2 and above");
  window.setTimeout(() => {
    window.location.href = buildLandingAuthUrl(intendedUrl);
  }, 180);
}

function buildMonetizationPageUrl(chapterMeta) {
  const params = getParams();
  const intendedUrl = buildReaderUrl(
    state.currentBook?.id || "",
    chapterMeta?.id || "",
    params.mode === "audio" ? "audio" : ""
  );
  const query = new URLSearchParams();
  query.set("from", "chapter-lock");
  query.set("next", intendedUrl);
  if (state.currentBook?.id) {
    query.set("bookId", state.currentBook.id);
  }
  if (chapterMeta?.id) {
    query.set("chapterId", chapterMeta.id);
  }
  return `/reader/reader-monetization.html?${query.toString()}`;
}

async function requestPaymentForChapterAccess(chapterMeta) {
  if (!chapterMeta) {
    return;
  }

  if (!state.currentUser) {
    requestLoginForChapterAccess(chapterMeta);
    return;
  }

  const params = getParams();
  const intendedUrl = buildReaderUrl(
    state.currentBook?.id || "",
    chapterMeta.id,
    params.mode === "audio" ? "audio" : ""
  );
  savePostLoginRedirect(intendedUrl);
  showToast("This chapter is locked. Opening unlock options...");
  window.location.href = buildMonetizationPageUrl(chapterMeta);
}

function loadJsonStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) {
      return fallback;
    }
    return JSON.parse(raw);
  } catch (error) {
    return fallback;
  }
}

function saveJsonStorage(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function getBookStorageKey(bookId) {
  return `book:${bookId}`;
}

function pruneStaleReaderBookState(bookId) {
  if (!bookId) {
    return;
  }

  try {
    const continueReadingKey = readerScoped('continueReading');
    const savedBooksKey = readerScoped('savedBooks');
    const bookmarksKey = readerScoped('bookmarks');
    const progressKey = readerScoped('progress');
    const notesKey = readerScoped('notes');
    const listenProgressKey = readerScoped('listenProgress');
    const bookStorageKey = getBookStorageKey(bookId);

    const continueReading = JSON.parse(localStorage.getItem(continueReadingKey) || '[]');
    if (Array.isArray(continueReading)) {
      const nextContinueReading = continueReading.filter((entry) => (entry?.bookId || entry?.id) != bookId);
      localStorage.setItem(continueReadingKey, JSON.stringify(nextContinueReading));
    }

    const savedBooksRaw = JSON.parse(localStorage.getItem(savedBooksKey) || '[]');
    if (Array.isArray(savedBooksRaw)) {
      const nextSavedBooks = savedBooksRaw.filter((entry) => {
        if (typeof entry === 'string') {
          return entry != bookId;
        }
        return (entry?.bookId || entry?.id) != bookId;
      });
      localStorage.setItem(savedBooksKey, JSON.stringify(nextSavedBooks));
    }

    const bookmarks = JSON.parse(localStorage.getItem(bookmarksKey) || '[]');
    if (Array.isArray(bookmarks)) {
      const nextBookmarks = bookmarks.filter((entry) => (entry?.bookId || entry?.id) != bookId);
      localStorage.setItem(bookmarksKey, JSON.stringify(nextBookmarks));
    }

    const progress = loadJsonStorage(progressKey, {});
    if (progress && typeof progress === 'object' && !Array.isArray(progress) && progress[bookStorageKey]) {
      delete progress[bookStorageKey];
      saveJsonStorage(progressKey, progress);
    }

    const notesMap = loadJsonStorage(notesKey, {});
    if (notesMap && typeof notesMap === 'object' && !Array.isArray(notesMap) && notesMap[bookStorageKey]) {
      delete notesMap[bookStorageKey];
      saveJsonStorage(notesKey, notesMap);
    }

    const listenProgressMap = loadJsonStorage(listenProgressKey, {});
    if (listenProgressMap && typeof listenProgressMap === 'object' && !Array.isArray(listenProgressMap) && listenProgressMap[bookStorageKey]) {
      delete listenProgressMap[bookStorageKey];
      saveJsonStorage(listenProgressKey, listenProgressMap);
    }
  } catch (error) {
    console.warn('[reader] Failed to prune stale book state', error);
  }
}

function loadSettings() {
  const saved = loadJsonStorage(readerScoped('settings'), null);
  if (saved && typeof saved === "object") {
    state.settings = { ...state.settings, ...saved };
  }
}

function applySettings() {
  elements.root.setAttribute("data-theme", state.settings.theme);
  elements.root.style.setProperty("--font-size", `${state.settings.fontSize}px`);
  elements.root.style.setProperty("--font-family", state.settings.fontFamily);
  elements.root.style.setProperty("--line-height", String(state.settings.lineHeight));
  elements.root.style.setProperty("--reader-width", `${state.settings.pageWidth}px`);

  elements.fontSizeInput.value = String(state.settings.fontSize);
  elements.fontFamilySelect.value = state.settings.fontFamily;
  elements.lineHeightInput.value = String(state.settings.lineHeight);
  elements.themeSelect.value = state.settings.theme;
  elements.pageWidthInput.value = String(state.settings.pageWidth);
  elements.modeSelect.value = state.settings.readingMode;
  elements.formatSelect.value = state.settings.contentFormat;
  if (elements.translationLanguageSelect) {
    elements.translationLanguageSelect.value = state.settings.preferredLanguage;
  }
  if (elements.preferredLanguageSelect) {
    elements.preferredLanguageSelect.value = state.settings.preferredLanguage;
  }
  if (elements.autoTranslateInput) {
    elements.autoTranslateInput.checked = Boolean(state.settings.autoTranslate);
  }
  if (elements.saveTranslationsInput) {
    elements.saveTranslationsInput.checked = Boolean(state.settings.saveTranslations);
  }

  if (state.settings.readingMode === "paginated") {
    elements.readingViewport.style.scrollSnapType = "y mandatory";
  } else {
    elements.readingViewport.style.scrollSnapType = "none";
  }
}

function persistSettings() {
  saveJsonStorage(readerScoped('settings'), state.settings);
}

async function fetchBookMetadata(bookId) {
  const response = await fetch(`${API_BASE_URL}/api/books/${encodeURIComponent(bookId)}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch book metadata (HTTP ${response.status})`);
  }

  const payload = await response.json();
  if (!payload.success || !payload.data) {
    throw new Error("Book metadata response is invalid");
  }

  const book = payload.data;
  return {
    id: book.id,
    title: book.title,
    hasAudiobook: Boolean(book.isAudiobookAvailable),
    audiobookTracks: [],
  };
}

async function fetchChapterList(bookId) {
  const response = await fetch(`${API_BASE_URL}/api/books/${encodeURIComponent(bookId)}/chapters`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch chapter list (HTTP ${response.status})`);
  }

  const payload = await response.json();
  if (!payload.success || !Array.isArray(payload.data)) {
    throw new Error("Chapter list response is invalid");
  }

  return payload.data.map((chapter) => ({
    id: chapter.id,
    number: chapter.chapterNumber,
    title: chapter.title,
    isLockedForGuest: Boolean(chapter.isLockedForGuest),
  }));
}

async function fetchCurrentUser() {
  if (window.NovaraSession && typeof window.NovaraSession.fetchCurrentUser === "function") {
    const user = await window.NovaraSession.fetchCurrentUser();
    state.currentUser = user;
    return user;
  }
  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
      cache: "no-store",
      credentials: "include",
    });

    if (!response.ok) {
      state.currentUser = null;
      return null;
    }

    const payload = await response.json();
    state.currentUser = payload && payload.success ? payload.user || null : null;
    return state.currentUser;
  } catch (error) {
    state.currentUser = null;
    return null;
  }
}

async function fetchBookAudioTracks(bookId) {
  const response = await fetch(`${API_BASE_URL}/api/books/${encodeURIComponent(bookId)}/audio`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch audio tracks (HTTP ${response.status})`);
  }

  const payload = await response.json();
  if (!payload.success || !Array.isArray(payload.data)) {
    throw new Error("Audio tracks response is invalid");
  }

  return payload.data;
}

async function fetchChapterById(chapterId) {
  if (state.chapterCache[chapterId]) {
    return state.chapterCache[chapterId];
  }

  const response = await fetch(`${API_BASE_URL}/api/chapters/${encodeURIComponent(chapterId)}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    let payload = null;
    try {
      payload = await response.json();
    } catch (error) {
      payload = null;
    }

    const requestError = new Error(payload?.error || `Failed to fetch chapter content (HTTP ${response.status})`);
    requestError.status = response.status;
    requestError.code = payload?.code || "";
    requestError.loginRequired = Boolean(payload?.loginRequired);
    throw requestError;
  }

  const payload = await response.json();
  if (!payload.success || !payload.data) {
    throw new Error("Chapter response is invalid");
  }

  state.chapterCache[chapterId] = payload.data;
  return payload.data;
}

function getLanguageLabel(code) {
  const labels = {
    en: "English",
    es: "Spanish",
    fr: "French",
    de: "German",
    hi: "Hindi",
    ja: "Japanese",
  };
  return labels[String(code || "").toLowerCase()] || String(code || "").toUpperCase();
}

function getCachedTranslation(chapterId, language) {
  const chapterMap = state.translationCache[String(chapterId || "")];
  if (!chapterMap) {
    return "";
  }
  return chapterMap[String(language || "").toLowerCase()] || "";
}

function setCachedTranslation(chapterId, language, content) {
  const key = String(chapterId || "");
  const lang = String(language || "").toLowerCase();
  if (!state.translationCache[key]) {
    state.translationCache[key] = {};
  }
  state.translationCache[key][lang] = String(content || "");
}

function updateTranslationStatus(message, options = {}) {
  if (!elements.translationStatus) {
    return;
  }
  elements.translationStatus.textContent = message || "";
  elements.translationStatus.classList.toggle("hidden", !message);

  if (elements.saveTranslationBtn) {
    elements.saveTranslationBtn.classList.toggle("hidden", !options.showSave);
  }
}

async function saveCurrentLanguageToLibrary() {
  if (!state.currentBook || !state.currentUser) {
    showToast("Sign in to save translated books");
    return;
  }

  const language = String(state.settings.preferredLanguage || "en").toLowerCase();
  if (!language || language === "en") {
    showToast("Select a translated language first");
    return;
  }

  const response = await fetch(`${API_BASE_URL}/api/books/${encodeURIComponent(state.currentBook.id)}/translations/save`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ language }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.success) {
    throw new Error(payload.error || "Unable to save translation");
  }

  showToast(`${getLanguageLabel(language)} saved to your library preferences`);
}

async function translateCurrentChapter(languageOverride) {
  if (!state.currentChapter || !state.currentBook) {
    return;
  }

  const language = String(languageOverride || state.settings.preferredLanguage || "en").toLowerCase();
  state.settings.preferredLanguage = language;
  if (elements.translationLanguageSelect) {
    elements.translationLanguageSelect.value = language;
  }
  if (elements.preferredLanguageSelect) {
    elements.preferredLanguageSelect.value = language;
  }
  persistSettings();

  if (language === "en") {
    updateTranslationStatus("Showing original English chapter", { showSave: false });
    renderCurrentChapter();
    return;
  }

  const cached = getCachedTranslation(state.currentChapter.id, language);
  if (cached) {
    state.currentChapter.translatedContent = cached;
    state.currentChapter.translatedLanguage = language;
    updateTranslationStatus(`${getLanguageLabel(language)} translation loaded from cache`, { showSave: true });
    renderCurrentChapter();
    return;
  }

  updateTranslationStatus(`Translating to ${getLanguageLabel(language)}...`, { showSave: false });

  const response = await fetch(`${API_BASE_URL}/api/chapters/${encodeURIComponent(state.currentChapter.id)}/translate`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ language }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.success) {
    throw new Error(payload.error || "Unable to translate chapter");
  }

  const translatedText = payload?.data?.content || "";
  setCachedTranslation(state.currentChapter.id, language, translatedText);
  state.currentChapter.translatedContent = translatedText;
  state.currentChapter.translatedLanguage = language;

  if (state.settings.saveTranslations && state.currentUser) {
    try {
      await saveCurrentLanguageToLibrary();
    } catch (error) {
      // Non-blocking save preference failure.
    }
  }

  const sourceLabel = payload?.data?.cached ? "from community cache" : "created";
  updateTranslationStatus(`${getLanguageLabel(language)} version ${sourceLabel} ✓`, { showSave: true });
  renderCurrentChapter();
}

function getProgressMap() {
  return loadJsonStorage(readerScoped('progress'), {});
}

function getCurrentChapterMeta() {
  if (!state.currentBook) {
    return null;
  }

  return state.currentBook.chapters[state.currentChapterIndex] || null;
}

function buildLastLocation(scrollTop, chapterProgress) {
  return JSON.stringify({
    scrollTop: Math.max(0, Math.round(scrollTop)),
    chapterProgress: Number(chapterProgress.toFixed(4)),
  });
}

function parseLastLocation(lastLocation) {
  if (!lastLocation) {
    return null;
  }

  try {
    const parsed = JSON.parse(lastLocation);
    if (typeof parsed !== "object" || parsed === null) {
      return null;
    }

    return {
      scrollTop: Math.max(0, Number(parsed.scrollTop) || 0),
      chapterProgress: Number(parsed.chapterProgress) || 0,
    };
  } catch (error) {
    return null;
  }
}

function initListenSystem() {
  const audio = new Audio();
  audio.preload = "metadata";
  state.listen.audioElement = audio;

  audio.addEventListener("timeupdate", () => {
    if (state.listen.mode !== "audiobook") {
      return;
    }

    scheduleAudiobookProgressSave();
    updateMiniPlayerUi();
  });

  audio.addEventListener("ended", () => {
    saveListenProgress();
    syncListeningProgressToApi({ force: true });
    autoAdvanceToNextChapter("audiobook");
  });

  // Voices may load synchronously (Chrome cached) or async (Firefox/Safari).
  onTtsVoicesLoaded();
  if (window.speechSynthesis) {
    window.speechSynthesis.addEventListener("voiceschanged", onTtsVoicesLoaded);
  }
}

function getListenProgressMap() {
  return loadJsonStorage(readerScoped('listenProgress'), {});
}

function getListenBookKey() {
  if (!state.currentBook) {
    return "";
  }
  return getBookStorageKey(state.currentBook.id);
}

function saveListenProgress() {
  if (!state.currentBook || !state.currentChapter) {
    return;
  }

  const map = getListenProgressMap();
  const bookKey = getListenBookKey();
  if (!map[bookKey]) {
    map[bookKey] = {};
  }

  const chapterProgress = map[bookKey][state.currentChapter.id] || {};

  if (state.listen.mode === "audiobook" && state.listen.audioElement) {
    chapterProgress.audiobook = {
      currentTimeSeconds: Math.max(0, Math.floor(state.listen.audioElement.currentTime || 0)),
    };
  }

  if (state.listen.mode === "tts") {
    chapterProgress.tts = {
      sentenceIndex: Math.max(0, Number(state.listen.currentSentenceIndex || 0)),
    };
  }

  map[bookKey][state.currentChapter.id] = chapterProgress;
  saveJsonStorage(readerScoped('listenProgress'), map);
}

function getChapterListenProgress(chapterId) {
  if (!state.currentBook || !chapterId) {
    return null;
  }

  const map = getListenProgressMap();
  const bookKey = getListenBookKey();
  if (!map[bookKey]) {
    return null;
  }

  return map[bookKey][chapterId] || null;
}

function clearActiveSentence() {
  if (state.listen.activeSentenceNode) {
    state.listen.activeSentenceNode.classList.remove("active-sentence");
    state.listen.activeSentenceNode = null;
  }
}

function clearActiveWord() {
  if (state.listen.activeWordNode) {
    state.listen.activeWordNode.classList.remove("active-word");
    state.listen.activeWordNode = null;
  }
}

function setActiveSentence(index) {
  clearActiveWord();
  clearActiveSentence();

  const sentenceNode = state.listen.ttsSentenceNodes[index] || null;
  if (!sentenceNode) {
    return;
  }

  sentenceNode.classList.add("active-sentence");
  sentenceNode.scrollIntoView({ block: "center", behavior: "smooth" });
  state.listen.activeSentenceNode = sentenceNode;
}

function getWordBoundaries(sentence) {
  const source = String(sentence || "");
  const matches = [...source.matchAll(/\S+/g)];
  return matches.map((match, index) => ({
    index,
    start: match.index || 0,
    end: (match.index || 0) + match[0].length,
  }));
}

function getWordIndexForCharIndex(sentenceIndex, charIndex) {
  const boundaries = state.listen.ttsWordBoundaries[sentenceIndex] || [];
  if (!boundaries.length) {
    return -1;
  }

  const safeCharIndex = Math.max(0, Number(charIndex) || 0);
  const found = boundaries.find((boundary) => safeCharIndex >= boundary.start && safeCharIndex < boundary.end);
  if (found) {
    return found.index;
  }

  const previous = [...boundaries].reverse().find((boundary) => safeCharIndex >= boundary.start);
  return previous ? previous.index : 0;
}

function keepWordInView(wordNode) {
  if (!wordNode || !elements.readingViewport) {
    return;
  }

  const viewportRect = elements.readingViewport.getBoundingClientRect();
  const wordRect = wordNode.getBoundingClientRect();
  const topSafeZone = viewportRect.top + viewportRect.height * 0.28;
  const bottomSafeZone = viewportRect.bottom - viewportRect.height * 0.28;
  const isOutsideSafeZone = wordRect.top < topSafeZone || wordRect.bottom > bottomSafeZone;

  if (isOutsideSafeZone) {
    wordNode.scrollIntoView({ block: "center", inline: "nearest", behavior: "auto" });
  }
}

function setActiveWord(sentenceIndex, wordIndex) {
  clearActiveWord();

  const sentenceNode = state.listen.ttsSentenceNodes[sentenceIndex] || null;
  if (!sentenceNode) {
    return;
  }

  const wordNode = sentenceNode.querySelector(`.tts-word[data-word-index="${wordIndex}"]`);
  if (!wordNode) {
    return;
  }

  wordNode.classList.add("active-word");
  state.listen.activeWordNode = wordNode;
  keepWordInView(wordNode);
}

function splitIntoSentences(text) {
  const normalized = String(text || "").replace(/\s+/g, " ").trim();
  if (!normalized) {
    return [];
  }

  const matches = normalized.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [];
  return matches.map((item) => item.trim()).filter(Boolean);
}

function updateMiniPlayerUi() {
  const mode = state.listen.mode;
  const active = mode === "audiobook" || mode === "tts";
  elements.listenMiniPlayer.classList.toggle("hidden", !active);
  if (elements.listenSettingsPanel) {
    elements.listenSettingsPanel.classList.toggle("hidden", mode !== "tts");
  }

  let label = "Idle";
  if (mode === "audiobook") {
    label = "Audiobook";
  } else if (mode === "tts") {
    label = "AI Narration";
  }

  elements.listenModeLabel.textContent = label;
  elements.miniPlaybackMode.textContent = label;

  if (!active) {
    elements.miniPlaybackTitle.textContent = "Playback idle";
    elements.miniPlayPauseBtn.textContent = "Play";
    return;
  }

  const chapterNumber = state.currentChapter ? state.currentChapter.number : "-";
  elements.miniPlaybackTitle.textContent = `Chapter ${chapterNumber}`;
  elements.miniPlayPauseBtn.textContent = state.listen.isPlaying ? "Pause" : "Play";

  if (elements.miniPulse) {
    elements.miniPulse.classList.toggle("pulsing", state.listen.isPlaying);
  }

  if (elements.ttsVoiceRow) {
    elements.ttsVoiceRow.classList.toggle("hidden", mode !== "tts");
  }
}

function scheduleAudiobookProgressSave() {
  if (state.listen.audioSaveTimer) {
    clearTimeout(state.listen.audioSaveTimer);
  }

  state.listen.audioSaveTimer = window.setTimeout(() => {
    saveListenProgress();
    syncListeningProgressToApi();
  }, 250);
}

async function autoAdvanceToNextChapter(playbackMode) {
  if (!state.currentBook) {
    return false;
  }

  const nextIndex = state.currentChapterIndex + 1;
  const chapterCount = state.currentBook.chapters.length || 0;
  if (nextIndex >= chapterCount) {
    state.listen.mode = "idle";
    state.listen.isPlaying = false;
    updateMiniPlayerUi();
    showToast("Reached end of book");
    return false;
  }

  if (state._chapterLoading) {
    return false;
  }

  const nextChapterMeta = state.currentBook.chapters[nextIndex];
  if (isChapterLockedForGuest(nextChapterMeta)) {
    state.listen.mode = "idle";
    state.listen.isPlaying = false;
    updateMiniPlayerUi();
    requestLoginForChapterAccess(nextChapterMeta);
    return false;
  }

  state._chapterLoading = true;
  try {
    state.currentChapterIndex = nextIndex;
    await loadAndRenderChapterByIndex(nextIndex);
    saveProgress();

    if (playbackMode === "audiobook") {
      const audioUrl = getCurrentChapterAudioUrl();
      if (audioUrl) {
        startAudiobook(audioUrl, { resume: false });
      } else {
        startTTS(state.currentChapter?.content || "", { resume: false });
      }
    } else {
      startTTS(state.currentChapter?.content || "", { resume: false });
    }

    updateChapterNavUi();
    return true;
  } catch (error) {
    console.error("Failed to auto-advance chapter:", error);
    state.listen.mode = "idle";
    state.listen.isPlaying = false;
    updateMiniPlayerUi();
    if (error && (error.code === "CHAPTER_LOCKED" || error.status === 403 || error.loginRequired)) {
      if (state.currentUser && !error.loginRequired) {
        await requestPaymentForChapterAccess(nextChapterMeta);
      } else {
        requestLoginForChapterAccess(nextChapterMeta);
      }
      return false;
    }
    showToast("Unable to open next chapter");
    return false;
  } finally {
    state._chapterLoading = false;
  }
}

// ─── SEO Schema Generation ───────────────────────────────────────

function updateStorySchema() {
  if (!state.currentBook) return;
  
  const schema = {
    "@context": "https://schema.org",
    "@type": "CreativeWork",
    "name": state.currentBook.title || "Unknown Story",
    "description": state.currentBook.description || state.currentBook.title || "",
    "author": {
      "@type": "Person",
      "name": state.currentBook.author || state.currentBook.authorName || "Unknown Author"
    },
    "publisher": {
      "@type": "Organization",
      "name": "Novara"
    },
    "url": window.location.href.split('?')[0] + '?bookId=' + encodeURIComponent(state.currentBook.id),
    "inLanguage": "en",
    "genre": state.currentBook.genre || "Fiction"
  };
  
  injectSchema('story-schema', schema);
}

function updateChapterSchema() {
  if (!state.currentBook || !state.currentChapter) return;
  
  const schema = {
    "@context": "https://schema.org",
    "@type": "Chapter",
    "name": `Chapter ${state.currentChapter.number}: ${state.currentChapter.title}`,
    "position": state.currentChapter.number || state.currentChapterIndex + 1,
    "isPartOf": {
      "@type": "CreativeWork",
      "name": state.currentBook.title || "Unknown Story",
      "url": window.location.href.split('?')[0] + '?bookId=' + encodeURIComponent(state.currentBook.id)
    },
    "author": {
      "@type": "Person",
      "name": state.currentBook.author || state.currentBook.authorName || "Unknown Author"
    }
  };
  
  injectSchema('chapter-schema', schema);
}

function injectSchema(id, schemaData) {
  // Remove existing schema with this ID
  const existing = document.getElementById(id);
  if (existing) existing.remove();
  
  // Create new script tag
  const script = document.createElement('script');
  script.id = id;
  script.type = 'application/ld+json';
  script.textContent = JSON.stringify(schemaData, null, 2);
  document.head.appendChild(script);
}

function resetTtsState() {
  state.listen.currentUtterance = null;
  state.listen.isTtsPaused = false;
  clearActiveWord();
  clearActiveSentence();
}

function stopPlayback() {
  if (state.listen.audioElement) {
    state.listen.audioElement.pause();
    state.listen.audioElement.removeAttribute("src");
    state.listen.audioElement.load();
  }

  if (window.speechSynthesis) {
    state.listen.suppressTtsEnd = true;
    window.speechSynthesis.cancel();
  }

  resetTtsState();
  state.listen.mode = "idle";
  state.listen.isPlaying = false;
  updateMiniPlayerUi();
}

function pausePlayback() {
  if (state.listen.mode === "audiobook" && state.listen.audioElement) {
    state.listen.audioElement.pause();
    state.listen.isPlaying = false;
    saveListenProgress();
    updateMiniPlayerUi();
    return;
  }

  if (state.listen.mode === "tts" && window.speechSynthesis && state.listen.isPlaying) {
    window.speechSynthesis.pause();
    state.listen.isTtsPaused = true;
    state.listen.isPlaying = false;
    saveListenProgress();
    updateMiniPlayerUi();
  }
}

function resumePlayback() {
  if (state.listen.mode === "audiobook" && state.listen.audioElement) {
    const playPromise = state.listen.audioElement.play();
    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch(() => {
        state.listen.isPlaying = false;
        updateMiniPlayerUi();
      });
    }
    state.listen.isPlaying = true;
    updateMiniPlayerUi();
    return;
  }

  if (state.listen.mode === "tts" && window.speechSynthesis) {
    if (state.listen.isTtsPaused) {
      window.speechSynthesis.resume();
      state.listen.isTtsPaused = false;
      state.listen.isPlaying = true;
      updateMiniPlayerUi();
      return;
    }

    speakTtsFromIndex(state.listen.currentSentenceIndex);
  }
}

function speakTtsFromIndex(index) {
  if (!window.speechSynthesis) {
    showToast("This browser does not support speech synthesis");
    return;
  }

  if (!state.listen.ttsSentences.length || index >= state.listen.ttsSentences.length) {
    state.listen.isPlaying = false;
    updateMiniPlayerUi();
    return;
  }

  const safeIndex = Math.max(0, index);
  state.listen.currentSentenceIndex = safeIndex;

  const utterance = new SpeechSynthesisUtterance(state.listen.ttsSentences[safeIndex]);
  utterance.rate = state.listen.speed;

  const selectedVoice = getSelectedTtsVoice();
  if (selectedVoice) {
    utterance.voice = selectedVoice;
    utterance.lang = selectedVoice.lang;
  }

  utterance.onstart = () => {
    state.listen.isPlaying = true;
    state.listen.currentSentenceIndex = safeIndex;
    setActiveSentence(safeIndex);
    setActiveWord(safeIndex, 0);
    updateMiniPlayerUi();
    saveListenProgress();
  };

  utterance.onboundary = (event) => {
    if (!event || event.name !== "word") {
      return;
    }

    const wordIndex = getWordIndexForCharIndex(safeIndex, event.charIndex);
    if (wordIndex >= 0) {
      setActiveWord(safeIndex, wordIndex);
    }
  };

  utterance.onend = () => {
    if (state.listen.suppressTtsEnd) {
      state.listen.suppressTtsEnd = false;
      return;
    }

    const nextIndex = safeIndex + 1;
    if (nextIndex >= state.listen.ttsSentences.length) {
      saveListenProgress();
      autoAdvanceToNextChapter("tts");
      return;
    }

    state.listen.currentSentenceIndex = nextIndex;
    saveListenProgress();
    speakTtsFromIndex(nextIndex);
  };

  utterance.onerror = () => {
    state.listen.isPlaying = false;
    updateMiniPlayerUi();
  };

  state.listen.currentUtterance = utterance;
  state.listen.suppressTtsEnd = false;
  window.speechSynthesis.speak(utterance);
}

function getCurrentChapterAudioUrl() {
  if (!state.currentChapter) {
    return "";
  }

  const chapterAudio = state.listen.audioByChapterId[state.currentChapter.id];
  return chapterAudio ? chapterAudio.audioUrl : "";
}

function startAudiobook(audioUrl, options = {}) {
  if (!state.currentChapter || !state.listen.audioElement) {
    return;
  }

  if (!audioUrl) {
    showToast("Audiobook file is not available for this chapter");
    return;
  }

  stopPlayback();
  state.listen.mode = "audiobook";

  const chapterProgress = getChapterListenProgress(state.currentChapter.id);
  const shouldResume = options.resume !== false;
  const resumeSeconds = shouldResume
    ? Number(chapterProgress?.audiobook?.currentTimeSeconds || 0)
    : 0;

  const resolvedAudioUrl = /^(https?:\/\/|data:)/.test(audioUrl)
    ? audioUrl
    : `${API_BASE_URL}${audioUrl.startsWith("/") ? "" : "/"}${audioUrl}`;

  state.listen.audioElement.src = resolvedAudioUrl;
  state.listen.audioElement.currentTime = 0;
  state.listen.audioElement.playbackRate = state.listen.speed;
  state.listen.audioElement.load();

  state.listen.audioElement.addEventListener(
    "loadedmetadata",
    () => {
      if (resumeSeconds > 0 && Number.isFinite(state.listen.audioElement.duration)) {
        state.listen.audioElement.currentTime = Math.min(resumeSeconds, state.listen.audioElement.duration);
      }
    },
    { once: true }
  );

  const playPromise = state.listen.audioElement.play();
  if (playPromise && typeof playPromise.catch === "function") {
    playPromise.catch(() => {
      state.listen.isPlaying = false;
      updateMiniPlayerUi();
    });
  }

  state.listen.isPlaying = true;
  updateMiniPlayerUi();
}

function startTTS(text, options = {}) {
  if (!state.currentChapter) {
    return;
  }

  if (!window.speechSynthesis || typeof SpeechSynthesisUtterance === "undefined") {
    showToast("Text to speech is not supported in this browser");
    return;
  }

  const sentences = splitIntoSentences(text);
  if (!sentences.length) {
    showToast("No text available for narration");
    return;
  }

  stopPlayback();
  state.listen.mode = "tts";
  state.listen.ttsSentences = sentences;

  const chapterProgress = getChapterListenProgress(state.currentChapter.id);
  const shouldResume = options.resume !== false;
  const resumeSentence = shouldResume
    ? Number(chapterProgress?.tts?.sentenceIndex || 0)
    : 0;
  state.listen.currentSentenceIndex = Math.min(sentences.length - 1, Math.max(0, resumeSentence));

  speakTtsFromIndex(state.listen.currentSentenceIndex);
  updateMiniPlayerUi();
}

function handleListen() {
  if (!state.currentChapter) {
    return;
  }

  if (state.listen.isPlaying) {
    pausePlayback();
    return;
  }

  if (state.listen.mode === "audiobook" || state.listen.mode === "tts") {
    resumePlayback();
    return;
  }

  const audioUrl = getCurrentChapterAudioUrl();
  if (audioUrl) {
    startAudiobook(audioUrl);
    return;
  }

  startTTS(state.currentChapter.content || "");
}

function restartTtsFromIndex(index) {
  if (!state.currentChapter) {
    return;
  }

  // Always tear down any active source before starting TTS to avoid overlap.
  stopPlayback();

  const sentences = splitIntoSentences(state.currentChapter.content || "");
  if (!sentences.length) {
    return;
  }

  state.listen.mode = "tts";
  state.listen.ttsSentences = sentences;
  state.listen.currentSentenceIndex = Math.max(0, Math.min(index, sentences.length - 1));
  speakTtsFromIndex(state.listen.currentSentenceIndex);
}

function skipBackward() {
  if (state.listen.mode === "audiobook" && state.listen.audioElement) {
    state.listen.audioElement.currentTime = Math.max(0, state.listen.audioElement.currentTime - 10);
    saveListenProgress();
    return;
  }

  if (state.listen.mode === "tts") {
    const nextIndex = Math.max(0, state.listen.currentSentenceIndex - 1);
    restartTtsFromIndex(nextIndex);
  }
}

function skipForward() {
  if (state.listen.mode === "audiobook" && state.listen.audioElement) {
    const duration = Number(state.listen.audioElement.duration || 0);
    const next = state.listen.audioElement.currentTime + 10;
    state.listen.audioElement.currentTime = duration > 0 ? Math.min(next, duration) : next;
    saveListenProgress();
    return;
  }

  if (state.listen.mode === "tts") {
    const maxIndex = Math.max(0, state.listen.ttsSentences.length - 1);
    const nextIndex = Math.min(maxIndex, state.listen.currentSentenceIndex + 1);
    restartTtsFromIndex(nextIndex);
  }
}

function jumpToSentence(index) {
  restartTtsFromIndex(index);
}

function setPlaybackSpeed(speed) {
  state.listen.speed = speed;
  if (state.listen.audioElement) {
    state.listen.audioElement.playbackRate = speed;
  }

  if (state.listen.mode === "tts" && state.listen.isPlaying) {
    restartTtsFromIndex(state.listen.currentSentenceIndex);
    return;
  }

  saveListenProgress();
}

function hydrateAudioMap(tracks) {
  state.listen.audioByChapterId = {};
  tracks.forEach((track) => {
    if (!track || !track.chapter || !track.chapter.id || !track.audioUrl) {
      return;
    }

    state.listen.audioByChapterId[track.chapter.id] = {
      trackId: track.id,
      audioUrl: track.audioUrl,
      chapterNumber: track.chapter.chapterNumber,
      title: track.title || "Track",
    };
  });
}

function loadTtsVoicePrefs() {
  const saved = loadJsonStorage(readerScoped('ttsVoice'), {});
  state.listen.ttsSelectedLang = String(saved.lang || "");
  state.listen.ttsSelectedVoiceName = String(saved.voiceName || "");
}

function saveTtsVoicePrefs() {
  saveJsonStorage(readerScoped('ttsVoice'), {
    lang: state.listen.ttsSelectedLang,
    voiceName: state.listen.ttsSelectedVoiceName,
  });
}

function getUniqueSortedLangs(voices) {
  const set = new Set(voices.map((v) => v.lang).filter(Boolean));
  return [...set].sort();
}

function getLangDisplayName(langCode) {
  try {
    const dn = new Intl.DisplayNames(["en"], { type: "language" });
    const label = dn.of(langCode);
    return label && label !== langCode ? `${label} (${langCode})` : langCode;
  } catch (_) {
    return langCode;
  }
}

function populateTtsAccentSelect(voices) {
  const langs = getUniqueSortedLangs(voices);
  elements.ttsAccentSelect.innerHTML = "";

  const blankOpt = document.createElement("option");
  blankOpt.value = "";
  blankOpt.textContent = "All accents";
  elements.ttsAccentSelect.appendChild(blankOpt);

  langs.forEach((lang) => {
    const opt = document.createElement("option");
    opt.value = lang;
    opt.textContent = getLangDisplayName(lang);
    elements.ttsAccentSelect.appendChild(opt);
  });

  elements.ttsAccentSelect.value = state.listen.ttsSelectedLang;
}

function populateTtsVoiceSelect(lang) {
  elements.ttsVoiceSelect.innerHTML = "";
  const filtered = lang
    ? state.listen.ttsVoices.filter((v) => v.lang === lang)
    : state.listen.ttsVoices;

  if (!filtered.length) {
    const defOpt = document.createElement("option");
    defOpt.value = "";
    defOpt.textContent = "Default voice";
    elements.ttsVoiceSelect.appendChild(defOpt);
    state.listen.ttsSelectedVoiceName = "";
    return;
  }

  filtered.forEach((voice) => {
    const opt = document.createElement("option");
    opt.value = voice.name;
    opt.textContent = voice.name;
    elements.ttsVoiceSelect.appendChild(opt);
  });

  const savedMatch = filtered.find((v) => v.name === state.listen.ttsSelectedVoiceName);
  elements.ttsVoiceSelect.value = savedMatch
    ? state.listen.ttsSelectedVoiceName
    : filtered[0].name;

  state.listen.ttsSelectedVoiceName = elements.ttsVoiceSelect.value;
}

function getSelectedTtsVoice() {
  const name = state.listen.ttsSelectedVoiceName;
  if (!name) {
    return null;
  }
  return state.listen.ttsVoices.find((v) => v.name === name) || null;
}

function onTtsVoicesLoaded() {
  const voices = window.speechSynthesis ? window.speechSynthesis.getVoices() : [];
  if (!voices.length) {
    return;
  }
  state.listen.ttsVoices = voices;
  populateTtsAccentSelect(voices);
  populateTtsVoiceSelect(state.listen.ttsSelectedLang);
}

function buildListeningApiPayload() {
  if (!state.currentBook || !state.currentChapter || !state.listen.audioElement) {
    return null;
  }

  const entry = state.listen.audioByChapterId[state.currentChapter.id];
  if (!entry || !entry.trackId) {
    return null;
  }

  return {
    bookId: state.currentBook.id,
    audioTrackId: entry.trackId,
    currentTimeSeconds: Math.max(0, Math.floor(state.listen.audioElement.currentTime || 0)),
  };
}

async function syncListeningProgressToApi(options = {}) {
  if (!state.listen.listeningApiEnabled || state.listen.mode !== "audiobook") {
    return;
  }

  const payload = buildListeningApiPayload();
  if (!payload) {
    return;
  }

  const now = Date.now();
  const minInterval = options.force ? 0 : 5000;
  if (now - state.listen.lastListeningSyncMs < minInterval) {
    return;
  }

  state.listen.lastListeningSyncMs = now;

  try {
    const response = await fetch(`${API_BASE_URL}/api/progress/listening`, {
      method: "POST",
      credentials: "include",
      keepalive: Boolean(options.keepalive),
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (response.status === 401) {
      state.listen.listeningApiEnabled = false;
      if (!state.listen.listeningApiAuthMissingNotified) {
        state.listen.listeningApiAuthMissingNotified = true;
        showToast("Sign in to sync listening progress across devices");
      }
      return;
    }
  } catch (error) {
    console.warn("Listening progress sync failed:", error);
  }
}

async function saveReadingProgressToApi(payload) {
  if (!state.progressApiEnabled) {
    return;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/progress/reading`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (response.status === 401) {
      state.progressApiEnabled = false;
      if (!state.progressApiAuthMissingNotified) {
        state.progressApiAuthMissingNotified = true;
        showToast("Sign in to sync reading progress across devices");
      }
      return;
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    // Auto-update streak in the monetization widget if it's loaded on this page
    try {
      const data = await response.json();
      if (data && data.streak && typeof window.notifyStreakUpdate === "function") {
        window.notifyStreakUpdate(data.streak);
      }
    } catch (_) {
      // Non-fatal — streak widget update is best-effort
    }
  } catch (error) {
    console.warn("Progress sync failed:", error);
  }
}

async function getReadingProgressFromApi(bookId) {
  if (!state.progressApiEnabled) {
    return null;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/progress/reading/${encodeURIComponent(bookId)}`, {
      cache: "no-store",
      credentials: "include",
    });

    if (response.status === 401) {
      state.progressApiEnabled = false;
      return null;
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const payload = await response.json();
    if (!payload.success || !payload.data) {
      return null;
    }

    return payload.data;
  } catch (error) {
    console.warn("Failed to fetch reading progress from API:", error);
    return null;
  }
}

function saveProgress() {
  if (!state.currentBook) {
    return;
  }

  const currentChapter = getCurrentChapterMeta();
  if (!currentChapter) {
    return;
  }

  const progress = getProgressMap();
  const chapterCount = state.currentBook.chapters.length || 1;
  const chapterProgress = getChapterScrollRatio();
  const scrollTop = Math.max(0, elements.readingViewport.scrollTop);
  const percent = Number((((state.currentChapterIndex + chapterProgress) / chapterCount) * 100).toFixed(2));

  progress[getBookStorageKey(state.currentBook.id)] = {
    chapterIndex: state.currentChapterIndex,
    scrollTop,
    percent,
  };

  saveJsonStorage(readerScoped('progress'), progress);

  saveReadingProgressToApi({
    bookId: state.currentBook.id,
    chapterId: currentChapter.id,
    progressPercent: percent,
    lastLocation: buildLastLocation(scrollTop, chapterProgress),
  });
}

function loadProgress() {
  if (!state.currentBook) {
    return null;
  }
  const progress = getProgressMap();
  return progress[getBookStorageKey(state.currentBook.id)] || null;
}

function saveBookmark() {
  if (!state.currentBook) {
    return;
  }

  const bookId = state.currentBook.id;
  const chapterId = state.currentChapter ? state.currentChapter.id : '';
  const chapterNumber = state.currentChapterIndex + 1;
  const jumpUrl = `/reader/reader.html?bookId=${encodeURIComponent(bookId)}${chapterId ? `&chapterId=${encodeURIComponent(chapterId)}` : ''}`;
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2);

  const entry = {
    id,
    userId: getCurrentUserId(),
    bookId,
    bookTitle: state.currentBook.title || 'Unknown Book',
    bookGenre: state.currentBook.genre || 'default',
    chapterId,
    chapterNumber,
    snippet: '-',
    note: '',
    dateSaved: new Date().toISOString(),
    jumpUrl,
  };

  try {
    const bmKey = readerScoped('bookmarks');
    const entries = JSON.parse(localStorage.getItem(bmKey) || '[]');
    entries.unshift(entry);
    localStorage.setItem(bmKey, JSON.stringify(entries));
  } catch (e) { /* storage full */ }

  showToast("Bookmark saved");
}

function getNotesMap() {
  return loadJsonStorage(readerScoped('notes'), {});
}

function addNote(note) {
  if (!state.currentBook) {
    return;
  }

  const notesMap = getNotesMap();
  const key = getBookStorageKey(state.currentBook.id);
  const notes = Array.isArray(notesMap[key]) ? notesMap[key] : [];
  notes.unshift(note);
  notesMap[key] = notes.slice(0, 100);
  saveJsonStorage(readerScoped('notes'), notesMap);
  renderNotes();
}

function getChapterScrollRatio() {
  const max = elements.readingViewport.scrollHeight - elements.readingViewport.clientHeight;
  if (max <= 0) {
    // Chapters should open at 0% even before layout settles.
    return 0;
  }
  const ratio = elements.readingViewport.scrollTop / max;
  return Math.min(1, Math.max(0, ratio));
}

function updateProgressUi() {
  if (!state.currentBook) {
    return;
  }

  const chapterCount = state.currentBook.chapters.length || 1;
  const chapterProgress = getChapterScrollRatio();
  const chapterPercent = Math.round(chapterProgress * 100);
  const currentChapterNumber = state.currentChapter?.number || state.currentChapterIndex + 1;
  const currentChapterTitle = state.currentChapter?.title || `Chapter ${currentChapterNumber}`;

  elements.progressSlider.value = String(chapterPercent);
  elements.progressText.textContent = `Ch ${currentChapterNumber} of ${chapterCount}: ${currentChapterTitle} ${chapterPercent}%`;
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildSentenceWordMarkup(sentence) {
  const tokens = String(sentence || "").match(/\S+\s*/g) || [];
  if (!tokens.length) {
    return escapeHtml(sentence);
  }

  return tokens
    .map((token, wordIndex) => `<span class="tts-word" data-word-index="${wordIndex}">${escapeHtml(token)}</span>`)
    .join("");
}

function createParagraphMarkup(paragraph, startIndex) {
  const parts = splitIntoSentences(paragraph);
  if (!parts.length) {
    return {
      html: `<p>${escapeHtml(paragraph)}</p>`,
      count: 0,
    };
  }

  // Sentence spans let TTS highlight and jump to exact positions.
  const html = parts
    .map((sentence, idx) => {
      const sentenceIndex = startIndex + idx;
      return `<span class="sentence" data-sentence-index="${sentenceIndex}" role="button" tabindex="0" title="Click to start narration from this sentence">${buildSentenceWordMarkup(sentence)}</span> `;
    })
    .join("")
    .trim();

  return {
    html: `<p>${html}</p>`,
    count: parts.length,
  };
}

function renderChapterEndNavigation() {
  const maxIndex = (state.currentBook?.chapters.length || 1) - 1;
  const isAtStart = state.currentChapterIndex <= 0;
  const isAtEnd = state.currentChapterIndex >= maxIndex;

  if (isAtStart) {
    return `
      <div class="chapter-end-nav" aria-label="Chapter navigation">
        <div></div>
        <button type="button" class="icon-btn" id="sendGiftBtn" data-chapter-end-nav="gift">💖 Send Gift</button>
        <button type="button" class="icon-btn" data-chapter-end-nav="next" ${isAtEnd ? "disabled" : ""}>Next</button>
      </div>
    `;
  }

  return `
    <div class="chapter-end-nav" aria-label="Chapter navigation">
      <button type="button" class="icon-btn" data-chapter-end-nav="prev" ${isAtStart ? "disabled" : ""}>Prev</button>
      <button type="button" class="icon-btn" id="sendGiftBtn" data-chapter-end-nav="gift">💖 Send Gift</button>
      <button type="button" class="icon-btn" data-chapter-end-nav="next" ${isAtEnd ? "disabled" : ""}>Next</button>
    </div>
  `;
}

function renderStructuredChapter(chapter) {
  const text = String(chapter.content || "").trim();
  if (!text) {
    elements.readerContent.innerHTML = `<p>No chapter content available.</p>${renderChapterEndNavigation()}`;
    state.listen.ttsSentences = [];
    state.listen.ttsSentenceNodes = [];
    state.listen.ttsWordBoundaries = [];
    return;
  }

  const paragraphs = text
    .split(/\n\s*\n/)
    .map((chunk) => chunk.trim())
    .filter(Boolean);

  let index = 0;
  const htmlParts = [];
  paragraphs.forEach((paragraph) => {
    const result = createParagraphMarkup(paragraph, index);
    htmlParts.push(result.html);
    index += result.count;
  });

  elements.readerContent.innerHTML = `${htmlParts.join("")}${renderChapterEndNavigation()}`;
  state.listen.ttsSentences = splitIntoSentences(text);
  state.listen.ttsSentenceNodes = [
    ...elements.readerContent.querySelectorAll(".sentence[data-sentence-index]"),
  ];
  state.listen.ttsWordBoundaries = state.listen.ttsSentences.map(getWordBoundaries);
}

function renderPdfShell() {
  const hasPdf = state.currentBook && state.currentBook.pdfUrl;
  const url = state.localFileUrl || (hasPdf ? state.currentBook.pdfUrl : "");

  elements.readerContent.innerHTML = `
    <div class="format-shell">
      <h2>PDF Reader</h2>
      <p>${url ? "PDF loaded below." : "No PDF loaded. Use settings to open a local PDF file."}</p>
      ${url ? `<iframe class="pdf-frame" src="${url}" title="PDF Reader"></iframe>` : ""}
    </div>
    ${renderChapterEndNavigation()}
  `;
}

function renderEpubShell() {
  elements.readerContent.innerHTML = `
    <div class="format-shell">
      <h2>EPUB Reader</h2>
      <p>EPUB container is ready. Browser-native EPUB rendering is limited; integrate epub.js for production pagination and TOC.</p>
      <p>You can still open structured chapters in this reader and preserve notes, progress, and bookmarks.</p>
    </div>
    ${renderChapterEndNavigation()}
  `;
}

function renderCurrentChapter() {
  if (!state.currentBook || !state.currentChapter) {
    elements.readerContent.innerHTML = "<p>Chapter not found.</p>";
    return;
  }

  const chapter = state.currentChapter;
  const preferredLanguage = String(state.settings.preferredLanguage || "en").toLowerCase();
  const translated = preferredLanguage !== "en"
    ? (chapter.translatedLanguage === preferredLanguage
      ? chapter.translatedContent
      : getCachedTranslation(chapter.id, preferredLanguage))
    : "";
  const chapterToRender = translated
    ? { ...chapter, content: translated }
    : chapter;
  elements.toolbarBookTitle.textContent = state.currentBook.title;
  elements.toolbarChapterTitle.textContent = `Chapter ${chapter.number}: ${chapter.title}`;
  document.title = `${state.currentBook.title} - Chapter ${chapter.number}`;

  const hasPdfSource = Boolean(state.localFileUrl || state.currentBook.pdfUrl);
  const hasEpubSource = Boolean(state.localFileUrl && /\.epub(\?|#|$)/i.test(state.localFileUrl));

  if (state.settings.contentFormat === "pdf" && !hasPdfSource) {
    renderStructuredChapter(chapterToRender);
  } else if (state.settings.contentFormat === "epub" && !hasEpubSource) {
    renderStructuredChapter(chapterToRender);
  } else if (state.settings.contentFormat === "pdf") {
    renderPdfShell();
  } else if (state.settings.contentFormat === "epub") {
    renderEpubShell();
  } else {
    renderStructuredChapter(chapterToRender);
  }

  updateChapterNavUi();
  elements.readingViewport.scrollTop = 0;
  updateProgressUi();
  window.requestAnimationFrame(updateProgressUi);
}

function updateChapterNavUi() {
  const buttons = [...elements.chapterList.querySelectorAll("button[data-chapter-index]")];
  buttons.forEach((button) => {
    const active = Number(button.dataset.chapterIndex) === state.currentChapterIndex;
    button.classList.toggle("active", active);
  });

  const maxIndex = (state.currentBook?.chapters.length || 1) - 1;
  if (elements.prevBtn) {
    elements.prevBtn.disabled = state.currentChapterIndex <= 0;
  }
  if (elements.nextBtn) {
    elements.nextBtn.disabled = state.currentChapterIndex >= maxIndex;
  }

  const chapterPrevBtn = elements.readerContent.querySelector('button[data-chapter-end-nav="prev"]');
  const chapterNextBtn = elements.readerContent.querySelector('button[data-chapter-end-nav="next"]');
  if (chapterPrevBtn) {
    chapterPrevBtn.disabled = state.currentChapterIndex <= 0;
  }
  if (chapterNextBtn) {
    chapterNextBtn.disabled = state.currentChapterIndex >= maxIndex;
  }
}

function renderChapterDrawer() {
  elements.chapterList.innerHTML = "";
  if (!state.currentBook) {
    return;
  }

  state.currentBook.chapters.forEach((chapter, idx) => {
    const isLocked = isChapterLockedForGuest(chapter);
    const li = document.createElement("li");
    li.innerHTML = `
      <button type="button" class="chapter-btn ${idx === state.currentChapterIndex ? "active" : ""} ${isLocked ? "is-locked" : ""}" data-chapter-index="${idx}" ${isLocked ? 'data-chapter-locked="true"' : ""}>
        <small>Chapter ${chapter.number}${isLocked ? " • Locked" : ""}</small>
        ${chapter.title}${isLocked ? " <strong class=\"lock-badge\">Login required</strong>" : ""}
      </button>
    `;
    elements.chapterList.appendChild(li);
  });

  if (state.currentBook.hasAudiobook && state.currentBook.audiobookTracks.length) {
    elements.trackSection.classList.remove("hidden");
    elements.trackList.innerHTML = "";
    state.currentBook.audiobookTracks.forEach((track) => {
      const li = document.createElement("li");
      li.innerHTML = `
        <button type="button" class="track-btn" data-track-number="${track.number}" data-chapter-index="${track.chapterIndex}">
          <small>Track ${track.number}</small>
          ${track.title}
        </button>
      `;
      elements.trackList.appendChild(li);
    });
  } else {
    elements.trackSection.classList.add("hidden");
    elements.trackList.innerHTML = "";
  }
}

function renderNotes() {
  if (!state.currentBook) {
    return;
  }

  const notesMap = getNotesMap();
  const notes = notesMap[getBookStorageKey(state.currentBook.id)] || [];

  if (!notes.length) {
    elements.noteList.innerHTML = "<li class=\"note-card\"><p>No notes yet. Select text and add one.</p></li>";
    return;
  }

  elements.noteList.innerHTML = "";
  notes.forEach((item) => {
    const li = document.createElement("li");
    li.className = "note-card";
    li.innerHTML = `
      <strong>Chapter ${item.chapterNumber}</strong>
      <p>${item.selectedText}</p>
      <p>${item.noteText || "No note text"}</p>
    `;
    elements.noteList.appendChild(li);
  });
}

async function resumeProgress() {
  if (!state.currentBook || state.resumeApplied) {
    return;
  }

  const apiProgress = await getReadingProgressFromApi(state.currentBook.id);

  if (apiProgress && apiProgress.chapterId) {
    const chapterIndex = state.currentBook.chapters.findIndex(
      (chapter) => chapter.id === apiProgress.chapterId
    );

    if (chapterIndex >= 0) {
      state.currentChapterIndex = chapterIndex;
      await loadAndRenderChapterByIndex(state.currentChapterIndex);

      const location = parseLastLocation(apiProgress.lastLocation);
      if (location) {
        elements.readingViewport.scrollTop = location.scrollTop;
      }

      updateProgressUi();
      showToast(`Resumed at ${Math.round(Number(apiProgress.progressPercent || 0))}%`);
      state.resumeApplied = true;
      return;
    }
  }

  const localProgress = loadProgress();
  if (!localProgress) {
    return;
  }

  const chapterMax = state.currentBook.chapters.length - 1;
  state.currentChapterIndex = Math.min(chapterMax, Math.max(0, localProgress.chapterIndex || 0));
  await loadAndRenderChapterByIndex(state.currentChapterIndex);
  elements.readingViewport.scrollTop = Math.max(0, localProgress.scrollTop || 0);
  updateProgressUi();
  showToast(`Resumed at ${Math.round(Number(localProgress.percent || 0))}%`);
  state.resumeApplied = true;
}

async function loadAndRenderChapterByIndex(index) {
  if (!state.currentBook) {
    return;
  }

  const chapterMeta = state.currentBook.chapters[index];
  if (!chapterMeta) {
    return;
  }

  if (isChapterLockedForGuest(chapterMeta)) {
    requestLoginForChapterAccess(chapterMeta);
    return;
  }

  elements.readerContent.innerHTML = "<p>Loading chapter...</p>";

  // For collection books, chapters already have content loaded from IndexedDB
  const isLocalBook = state.bookSource === 'collection' || state.bookSource === 'localApp' || state.bookSource === 'localStorage';
  
  let chapterContent;
  if (isLocalBook && chapterMeta.content) {
    // Use content already loaded from IndexedDB
    chapterContent = chapterMeta.content;
  } else if (!isLocalBook) {
    // API books: fetch from server
    const chapter = await fetchChapterById(chapterMeta.id);
    chapterContent = chapter.content;
  } else {
    chapterContent = '';
  }

  state.currentChapter = {
    ...chapterMeta,
    content: chapterContent,
  };

  updateTranslationStatus("", { showSave: false });

  const params = new URLSearchParams(window.location.search);
  params.set("bookId", state.currentBook.id);
  params.set("chapterId", chapterMeta.id);
  window.history.replaceState({}, "", `/reader/reader.html?${params.toString()}`);

  renderCurrentChapter();

  if (state.settings.autoTranslate && String(state.settings.preferredLanguage || "en").toLowerCase() !== "en") {
    translateCurrentChapter(state.settings.preferredLanguage).catch((error) => {
      updateTranslationStatus(error.message || "Translation failed", { showSave: false });
    });
  }
}

function jumpToChapter(index) {
  if (!state.currentBook) {
    return;
  }

  // Prevent navigation if already loading
  if (state._chapterLoading) return;
  state._chapterLoading = true;

  // Disable navigation buttons during load
  if (elements.prevBtn) elements.prevBtn.disabled = true;
  if (elements.nextBtn) elements.nextBtn.disabled = true;

  stopPlayback();
  const chapterMax = state.currentBook.chapters.length - 1;
  const nextChapterIndex = Math.min(chapterMax, Math.max(0, index));
  const nextChapterMeta = state.currentBook.chapters[nextChapterIndex];
  if (isChapterLockedForGuest(nextChapterMeta)) {
    requestLoginForChapterAccess(nextChapterMeta);
    state._chapterLoading = false;
    updateChapterNavUi();
    return;
  }

  state.currentChapterIndex = nextChapterIndex;
  loadAndRenderChapterByIndex(state.currentChapterIndex)
    .then(() => {
      saveProgress();
      state._chapterLoading = false;
      updateChapterNavUi();
    })
    .catch((error) => {
      state._chapterLoading = false;
      updateChapterNavUi();
      console.error("Failed to load chapter:", error);
      if (error && (error.code === "CHAPTER_LOCKED" || error.status === 403 || error.loginRequired)) {
        if (state.currentUser && !error.loginRequired) {
          requestPaymentForChapterAccess(nextChapterMeta);
        } else {
          requestLoginForChapterAccess(nextChapterMeta);
        }
        return;
      }
      elements.readerContent.innerHTML = "<p>Unable to load this chapter.</p>";
      showToast("Unable to load chapter");
    });
}

function openSettingsModal() {
  elements.settingsModal.classList.add("show");
  elements.settingsModal.setAttribute("aria-hidden", "false");
}

function closeSettingsModal() {
  elements.settingsModal.classList.remove("show");
  elements.settingsModal.setAttribute("aria-hidden", "true");
}

function clearSearchMarks() {
  const marks = [...elements.readerContent.querySelectorAll("mark.search-mark")];
  marks.forEach((mark) => {
    const parent = mark.parentNode;
    if (!parent) {
      return;
    }
    parent.replaceChild(document.createTextNode(mark.textContent || ""), mark);
    parent.normalize();
  });
}

function searchInChapter(query) {
  clearSearchMarks();
  if (!query.trim() || state.settings.contentFormat !== "structured") {
    return;
  }

  const walker = document.createTreeWalker(elements.readerContent, NodeFilter.SHOW_TEXT);
  const regex = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "ig");

  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (!node.nodeValue || !regex.test(node.nodeValue)) {
      regex.lastIndex = 0;
      continue;
    }

    const fragment = document.createDocumentFragment();
    let lastIndex = 0;
    regex.lastIndex = 0;
    let match = regex.exec(node.nodeValue);
    while (match) {
      const before = node.nodeValue.slice(lastIndex, match.index);
      if (before) {
        fragment.appendChild(document.createTextNode(before));
      }
      const mark = document.createElement("mark");
      mark.className = "search-mark";
      mark.textContent = match[0];
      fragment.appendChild(mark);
      lastIndex = match.index + match[0].length;
      match = regex.exec(node.nodeValue);
    }

    const after = node.nodeValue.slice(lastIndex);
    if (after) {
      fragment.appendChild(document.createTextNode(after));
    }

    if (node.parentNode) {
      node.parentNode.replaceChild(fragment, node);
    }
    regex.lastIndex = 0;
  }
}

function saveSelectionAsHighlight(noteText) {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || !state.currentBook) {
    return;
  }

  const range = selection.getRangeAt(0);
  if (range.collapsed || !elements.readerContent.contains(range.commonAncestorContainer)) {
    return;
  }

  const selectedText = selection.toString().trim();
  if (!selectedText) {
    return;
  }

  let highlighted = false;
  try {
    if (range.startContainer === range.endContainer && range.startContainer.nodeType === Node.TEXT_NODE) {
      const span = document.createElement("span");
      span.className = "highlight";
      range.surroundContents(span);
      highlighted = true;
    }
  } catch (error) {
    highlighted = false;
  }

  addNote({
    chapterNumber: state.currentBook.chapters[state.currentChapterIndex].number,
    selectedText,
    noteText: noteText || "",
    highlighted,
    createdAt: new Date().toISOString()
  });

  selection.removeAllRanges();
  elements.selectionTools.style.display = "none";
  state.activeSelection = null;
  showToast(noteText ? "Highlight with note added" : "Highlight saved");
}

function moveByPage(direction) {
  if (state.settings.readingMode === "paginated") {
    const distance = elements.readingViewport.clientHeight * direction;
    elements.readingViewport.scrollBy({ top: distance, behavior: "smooth" });
    return;
  }

  // Prevent out-of-bounds navigation
  const nextIdx = state.currentChapterIndex + direction;
  if (!state.currentBook || nextIdx < 0 || nextIdx >= state.currentBook.chapters.length) {
    updateChapterNavUi();
    return;
  }
  jumpToChapter(nextIdx);
}

function setContentFormat(format) {
  state.settings.contentFormat = format;
  persistSettings();
  renderCurrentChapter();
}

function setReadingMode(mode) {
  state.settings.readingMode = mode;
  persistSettings();
  applySettings();
  showToast(mode === "paginated" ? "Paginated mode enabled" : "Scroll mode enabled");
}

function bindEvents() {
  if (elements.panelFullscreenBtn) {
    elements.panelFullscreenBtn.addEventListener("click", toggleFullscreen);
  }

  document.addEventListener("fullscreenchange", updateFullscreenButtonLabel);

  elements.drawerToggleBtn.addEventListener("click", () => {
    elements.chapterDrawer.classList.toggle("hidden");
    updateReaderMainLayout();
  });

  elements.notesToggleBtn.addEventListener("click", () => {
    const hidden = elements.notesPanel.classList.toggle("hidden");
    elements.notesToggleBtn.classList.toggle("active", !hidden);
    updateReaderMainLayout();
  });

  window.addEventListener("resize", updateReaderMainLayout);

  elements.settingsBtn.addEventListener("click", openSettingsModal);
  elements.closeSettingsBtn.addEventListener("click", closeSettingsModal);
  elements.settingsModal.addEventListener("click", (event) => {
    if (event.target === elements.settingsModal) {
      closeSettingsModal();
    }
  });

  elements.listenBtn.addEventListener("click", handleListen);
  elements.miniPlayPauseBtn.addEventListener("click", () => {
    if (state.listen.isPlaying) {
      pausePlayback();
      return;
    }
    resumePlayback();
  });
  elements.miniBackBtn.addEventListener("click", skipBackward);
  elements.miniForwardBtn.addEventListener("click", skipForward);
  elements.miniStopBtn.addEventListener("click", stopPlayback);
  elements.miniSpeedSelect.addEventListener("change", () => {
    const speed = Number(elements.miniSpeedSelect.value || 1);
    setPlaybackSpeed(speed);
  });

  elements.ttsAccentSelect.addEventListener("change", () => {
    state.listen.ttsSelectedLang = elements.ttsAccentSelect.value;
    populateTtsVoiceSelect(state.listen.ttsSelectedLang);
    saveTtsVoicePrefs();
    // Restart narration with new voice if TTS is active.
    if (state.listen.mode === "tts") {
      restartTtsFromIndex(state.listen.currentSentenceIndex);
    }
  });

  elements.ttsVoiceSelect.addEventListener("change", () => {
    state.listen.ttsSelectedVoiceName = elements.ttsVoiceSelect.value;
    saveTtsVoicePrefs();
    if (state.listen.mode === "tts") {
      restartTtsFromIndex(state.listen.currentSentenceIndex);
    }
  });

  if (elements.prevBtn) {
    elements.prevBtn.addEventListener("click", () => {
      if (state._chapterLoading) return;
      moveByPage(-1);
    });
  }
  if (elements.nextBtn) {
    elements.nextBtn.addEventListener("click", () => {
      if (state._chapterLoading) return;
      moveByPage(1);
    });
  }

  elements.progressSlider.addEventListener("input", () => {
    if (!state.currentBook || !state.currentChapter) {
      return;
    }

    const raw = Math.max(0, Math.min(100, Number(elements.progressSlider.value) || 0)) / 100;
    const maxScrollTop = Math.max(0, elements.readingViewport.scrollHeight - elements.readingViewport.clientHeight);
    elements.readingViewport.scrollTop = raw * maxScrollTop;
    updateProgressUi();
    // Update continue reading on slider move
    try {
      addContinueReading({
        bookId: state.currentBook.id,
        source: 'reader',
        currentChapter: state.currentBook.chapters[state.currentChapterIndex]?.id,
        progress: Math.round(raw * 100)
      });
    } catch (err) {}
  });

  let progressTimer = null;
  elements.readingViewport.addEventListener("scroll", () => {
    updateProgressUi();
    if (progressTimer) {
      clearTimeout(progressTimer);
    }
    progressTimer = window.setTimeout(() => {
      saveProgress();
      // Periodically update continue reading on scroll
      try {
        addContinueReading({
          bookId: state.currentBook.id,
          source: 'reader',
          currentChapter: state.currentBook.chapters[state.currentChapterIndex]?.id,
          progress: Math.round(getChapterScrollRatio() * 100)
        });
      } catch (err) {}
    }, 180);
  });

  elements.chapterList.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-chapter-index]");
    if (!button) {
      return;
    }

    if (button.dataset.chapterLocked === "true") {
      const chapterMeta = state.currentBook?.chapters?.[Number(button.dataset.chapterIndex)];
      requestLoginForChapterAccess(chapterMeta);
      return;
    }

    jumpToChapter(Number(button.dataset.chapterIndex));
    // Also update continue reading on manual chapter jump
    try {
      addContinueReading({
        bookId: state.currentBook.id,
        source: 'reader',
        currentChapter: state.currentBook.chapters[Number(button.dataset.chapterIndex)]?.id,
        progress: Number(button.dataset.chapterIndex)
      });
    } catch (err) {}
  });

  elements.trackList.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-track-number]");
    if (!button) {
      return;
    }

    const chapterIndex = Number(button.dataset.chapterIndex || "-1");
    if (chapterIndex >= 0) {
      jumpToChapter(chapterIndex);
    }
  });

  elements.searchInput.addEventListener("input", () => {
    searchInChapter(elements.searchInput.value);
  });

  if (elements.translateChapterBtn) {
    elements.translateChapterBtn.addEventListener("click", async () => {
      try {
        elements.translateChapterBtn.disabled = true;
        const lang = elements.translationLanguageSelect
          ? elements.translationLanguageSelect.value
          : state.settings.preferredLanguage;
        await translateCurrentChapter(lang);
      } catch (error) {
        updateTranslationStatus(error.message || "Translation failed", { showSave: false });
      } finally {
        elements.translateChapterBtn.disabled = false;
      }
    });
  }

  if (elements.translationLanguageSelect) {
    elements.translationLanguageSelect.addEventListener("change", () => {
      state.settings.preferredLanguage = elements.translationLanguageSelect.value;
      if (elements.preferredLanguageSelect) {
        elements.preferredLanguageSelect.value = state.settings.preferredLanguage;
      }
      persistSettings();
    });
  }

  if (elements.saveTranslationBtn) {
    elements.saveTranslationBtn.addEventListener("click", async () => {
      try {
        await saveCurrentLanguageToLibrary();
      } catch (error) {
        showToast(error.message || "Unable to save translation");
      }
    });
  }

  elements.fontSizeInput.addEventListener("input", () => {
    state.settings.fontSize = Number(elements.fontSizeInput.value);
    persistSettings();
    applySettings();
  });

  elements.fontFamilySelect.addEventListener("change", () => {
    state.settings.fontFamily = elements.fontFamilySelect.value;
    persistSettings();
    applySettings();
  });

  elements.lineHeightInput.addEventListener("input", () => {
    state.settings.lineHeight = Number(elements.lineHeightInput.value);
    persistSettings();
    applySettings();
  });

  elements.themeSelect.addEventListener("change", () => {
    state.settings.theme = elements.themeSelect.value;
    persistSettings();
    applySettings();
  });

  elements.pageWidthInput.addEventListener("input", () => {
    state.settings.pageWidth = Number(elements.pageWidthInput.value);
    persistSettings();
    applySettings();
  });

  elements.modeSelect.addEventListener("change", () => {
    setReadingMode(elements.modeSelect.value);
  });

  elements.formatSelect.addEventListener("change", () => {
    setContentFormat(elements.formatSelect.value);
  });

  if (elements.preferredLanguageSelect) {
    elements.preferredLanguageSelect.addEventListener("change", () => {
      state.settings.preferredLanguage = elements.preferredLanguageSelect.value;
      if (elements.translationLanguageSelect) {
        elements.translationLanguageSelect.value = state.settings.preferredLanguage;
      }
      persistSettings();
    });
  }

  if (elements.autoTranslateInput) {
    elements.autoTranslateInput.addEventListener("change", () => {
      state.settings.autoTranslate = Boolean(elements.autoTranslateInput.checked);
      persistSettings();
    });
  }

  if (elements.saveTranslationsInput) {
    elements.saveTranslationsInput.addEventListener("change", () => {
      state.settings.saveTranslations = Boolean(elements.saveTranslationsInput.checked);
      persistSettings();
    });
  }

  elements.filePicker.addEventListener("change", () => {
    const file = elements.filePicker.files?.[0];
    if (!file) {
      return;
    }

    if (state.localFileUrl) {
      URL.revokeObjectURL(state.localFileUrl);
      state.localFileUrl = null;
    }

    state.localFileUrl = URL.createObjectURL(file);
    const ext = file.name.split(".").pop()?.toLowerCase() || "";

    if (ext === "pdf") {
      setContentFormat("pdf");
      showToast("Local PDF loaded");
      return;
    }

    if (ext === "epub") {
      setContentFormat("epub");
      showToast("EPUB container ready (integrate epub.js for full render)");
      return;
    }

    showToast("Unsupported file type");
  });

  elements.readerContent.addEventListener("click", (event) => {
    const endNavButton = event.target.closest("button[data-chapter-end-nav]");
    if (endNavButton) {
      const action = endNavButton.dataset.chapterEndNav;
      if (action === "gift") {
        openGiftModal();
      } else {
        const direction = action === "prev" ? -1 : 1;
        moveByPage(direction);
      }
      return;
    }

    const sentence = event.target.closest(".sentence[data-sentence-index]");
    if (!sentence || !state.currentChapter) {
      return;
    }

    const sentenceIndex = Number(sentence.dataset.sentenceIndex);
    if (!Number.isFinite(sentenceIndex)) {
      return;
    }

    jumpToSentence(sentenceIndex);
  });

  elements.readerContent.addEventListener("keydown", (event) => {
    const sentence = event.target.closest(".sentence[data-sentence-index]");
    if (!sentence || !state.currentChapter) {
      return;
    }

    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    event.preventDefault();
    const sentenceIndex = Number(sentence.dataset.sentenceIndex);
    if (!Number.isFinite(sentenceIndex)) {
      return;
    }

    jumpToSentence(sentenceIndex);
  });

  elements.readingViewport.addEventListener("mouseup", () => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      elements.selectionTools.style.display = "none";
      return;
    }

    const selectedText = selection.toString().trim();
    if (!selectedText || !elements.readerContent.contains(selection.anchorNode)) {
      elements.selectionTools.style.display = "none";
      return;
    }

    const rangeRect = selection.getRangeAt(0).getBoundingClientRect();
    elements.selectionTools.style.left = `${Math.max(8, rangeRect.left)}px`;
    elements.selectionTools.style.top = `${Math.max(8, rangeRect.top - 46)}px`;
    elements.selectionTools.style.display = "inline-flex";
    state.activeSelection = selectedText;
  });

  elements.highlightBtn.addEventListener("click", () => {
    saveSelectionAsHighlight("");
  });

  elements.addNoteBtn.addEventListener("click", () => {
    if (!state.activeSelection) {
      return;
    }
    const noteText = window.prompt("Add note for selected text:", "") || "";
    saveSelectionAsHighlight(noteText.trim());
  });

  document.addEventListener("click", (event) => {
    if (!event.target.closest("#selectionTools") && !event.target.closest("#readerContent")) {
      elements.selectionTools.style.display = "none";
    }
  });

  elements.leftTapZone.addEventListener("click", () => {
    moveByPage(-1);
  });

  elements.rightTapZone.addEventListener("click", () => {
    moveByPage(1);
  });

  elements.centerTapZone.addEventListener("click", () => {
    elements.app.classList.toggle("controls-hidden");
  });

  window.addEventListener("beforeunload", () => {
    saveProgress();
    saveListenProgress();
    syncListeningProgressToApi({ force: true, keepalive: true });
    stopPlayback();
    if (state.localFileUrl) {
      URL.revokeObjectURL(state.localFileUrl);
    }
  });

  // Gift modal event handlers
  const giftModal = document.getElementById("sendGiftModal");
  const giftConfirmModal = document.getElementById("giftConfirmModal");
  const giftSuccessModal = document.getElementById("giftSuccessModal");
  const giftCustomAmountInput = document.getElementById("giftCustomAmountInput");
  const maxBtn = document.getElementById("maxBtn");
  const quickAmountBtns = document.querySelectorAll(".quick-amount-btn");
  const giftModalClose = document.querySelector(".gift-modal-close");
  const giftModalOverlay = document.querySelector(".gift-modal-overlay");
  const cancelGiftBtn = document.getElementById("cancelGiftBtn");
  const sendGiftConfirmBtn = document.getElementById("sendGiftConfirmBtn");
  const confirmCancelBtn = document.getElementById("confirmCancelBtn");
  const confirmSendBtn = document.getElementById("confirmSendBtn");
  const successCloseBtn = document.getElementById("successCloseBtn");

  // Quick amount buttons
  quickAmountBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const amount = btn.dataset.amount;
      giftCustomAmountInput.value = amount;
      quickAmountBtns.forEach((b) => b.classList.remove("selected"));
      btn.classList.add("selected");
      updateGiftBalanceDisplay();
    });
  });

  // MAX button
  if (maxBtn) {
    maxBtn.addEventListener("click", () => {
      const maxCoins = state.currentUser?.coins || 0;
      giftCustomAmountInput.value = maxCoins;
      quickAmountBtns.forEach((b) => b.classList.remove("selected"));
      updateGiftBalanceDisplay();
    });
  }

  // Clear quick amount selection and update balance when user types in custom input
  if (giftCustomAmountInput) {
    giftCustomAmountInput.addEventListener("input", () => {
      quickAmountBtns.forEach((b) => b.classList.remove("selected"));
      updateGiftBalanceDisplay();
    });
  }

  if (giftModalClose) {
    giftModalClose.addEventListener("click", closeGiftModal);
  }

  if (giftModalOverlay) {
    giftModalOverlay.addEventListener("click", closeGiftModal);
  }

  if (cancelGiftBtn) {
    cancelGiftBtn.addEventListener("click", closeGiftModal);
  }

  if (sendGiftConfirmBtn) {
    sendGiftConfirmBtn.addEventListener("click", validateAndProceedGift);
  }

  if (confirmCancelBtn) {
    confirmCancelBtn.addEventListener("click", closeConfirmModal);
  }

  if (confirmSendBtn) {
    confirmSendBtn.addEventListener("click", sendGift);
  }

  if (successCloseBtn) {
    successCloseBtn.addEventListener("click", closeSuccessModal);
  }
}

function updateGiftBalanceDisplay() {
  const balanceDisplay = document.getElementById("giftBalanceDisplay");
  const amountInput = document.getElementById("giftCustomAmountInput");
  const amountLine = document.getElementById("giftAmountLine");
  const remainingLine = document.getElementById("remainingLine");
  const amountValue = document.getElementById("giftAmountValue");
  const remainingValue = document.getElementById("remainingValue");

  const userCoins = state.currentUser?.coins || 0;
  if (balanceDisplay) {
    balanceDisplay.textContent = userCoins;
  }

  const amount = Number(amountInput?.value || 0);
  if (amount > 0) {
    if (amountLine) amountLine.classList.remove("hidden");
    if (remainingLine) remainingLine.classList.remove("hidden");
    if (amountValue) amountValue.textContent = amount;
    if (remainingValue) remainingValue.textContent = Math.max(0, userCoins - amount);
  } else {
    if (amountLine) amountLine.classList.add("hidden");
    if (remainingLine) remainingLine.classList.add("hidden");
  }
}

function openGiftModal() {
  if (!state.currentUser) {
    showToast("Login required to send gifts");
    return;
  }

  const giftModal = document.getElementById("sendGiftModal");
  if (giftModal) {
    updateGiftBalanceDisplay();
    giftModal.setAttribute("aria-hidden", "false");
  }
}

function closeGiftModal() {
  const giftModal = document.getElementById("sendGiftModal");
  if (giftModal) {
    giftModal.setAttribute("aria-hidden", "true");
    document.getElementById("giftCustomAmountInput").value = "";
    document.getElementById("giftMessageInput").value = "";
    // Clear quick amount selection
    document.querySelectorAll(".quick-amount-btn").forEach((btn) => {
      btn.classList.remove("selected");
    });
    // Hide balance display
    document.getElementById("giftAmountLine").classList.add("hidden");
    document.getElementById("remainingLine").classList.add("hidden");
  }
}

function validateAndProceedGift() {
  const amount = Number(document.getElementById("giftCustomAmountInput").value || 0);

  // Validate amount
  if (!Number.isFinite(amount) || amount < 1) {
    showToast("Please enter an amount of at least 1 coin");
    return;
  }

  // Check balance
  const userCoins = state.currentUser?.coins || 0;
  if (amount > userCoins) {
    showToast(`Not enough coins. You have ${userCoins} coins.`);
    return;
  }

  // Show confirmation for large gifts (500+)
  if (amount >= 500) {
    showConfirmModal(amount);
  } else {
    // For small gifts, send directly
    sendGift(amount);
  }
}

function showConfirmModal(amount) {
  const confirmModal = document.getElementById("giftConfirmModal");
  const confirmOverlay = document.querySelector("#giftConfirmModal .gift-modal-overlay");
  if (confirmModal) {
    document.getElementById("confirmAmount").textContent = amount;
    document.getElementById("confirmTarget").textContent = state.currentBook?.author || state.currentBook?.authorName || "this author";
    confirmModal.setAttribute("aria-hidden", "false");
    // Store values for confirmation
    confirmModal.dataset.amount = amount;
  }
  if (confirmOverlay) {
    confirmOverlay.addEventListener("click", closeConfirmModal, { once: true });
  }
}

function closeConfirmModal() {
  const confirmModal = document.getElementById("giftConfirmModal");
  if (confirmModal) {
    confirmModal.setAttribute("aria-hidden", "true");
    delete confirmModal.dataset.amount;
  }
}

function showSuccessModal(amount) {
  const successModal = document.getElementById("giftSuccessModal");
  if (successModal) {
    document.getElementById("successAmount").textContent = amount;
    successModal.setAttribute("aria-hidden", "false");
  }
}

function closeSuccessModal() {
  const successModal = document.getElementById("giftSuccessModal");
  if (successModal) {
    successModal.setAttribute("aria-hidden", "true");
  }
}

function createCoinBurstAnimation() {
  const giftModal = document.getElementById("giftSuccessModal");
  if (!giftModal) return;

  const rect = giftModal.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;

  // Create coin burst (quick, outward)
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    const distance = 150;
    const tx = Math.cos(angle) * distance;
    const ty = Math.sin(angle) * distance;

    const particle = document.createElement("div");
    particle.className = "coin-particle";
    particle.textContent = "💰";
    particle.style.left = centerX + "px";
    particle.style.top = centerY + "px";
    particle.style.setProperty("--tx", tx + "px");
    particle.style.setProperty("--ty", ty + "px");
    document.body.appendChild(particle);

    setTimeout(() => particle.remove(), 800);
  }

  // Create floating hearts (slow, upward with curves)
  const heartEmojis = ["💖", "💕", "💗", "💓"];
  for (let i = 0; i < 12; i++) {
    const delay = i * 80; // Stagger the hearts
    const emoji = heartEmojis[Math.floor(Math.random() * heartEmojis.length)];
    const positionVariant = i % 3; // 0 = center, 1 = left, 2 = right

    const particle = document.createElement("div");
    particle.className = "heart-particle";
    if (positionVariant === 1) particle.classList.add("left");
    if (positionVariant === 2) particle.classList.add("right");

    particle.textContent = emoji;
    particle.style.left = centerX + "px";
    particle.style.top = centerY + "px";
    particle.style.animationDelay = delay + "ms";
    document.body.appendChild(particle);

    setTimeout(() => particle.remove(), 2000 + delay);
  }
}

async function sendGift(fallbackAmount) {
  const confirmModal = document.getElementById("giftConfirmModal");
  const amount = Number(confirmModal?.dataset.amount || fallbackAmount || document.getElementById("giftCustomAmountInput").value || 0);
  const message = document.getElementById("giftMessageInput").value.trim();
  const bookId = state.currentBook?.id || "";
  const chapterId = state.currentChapter?.id || "";

  closeConfirmModal();

  // Validate amount
  if (!Number.isFinite(amount) || amount < 10 || amount > 10000) {
    showToast("Please enter an amount between 10 and 10,000 coins");
    return;
  }

  if (!bookId) {
    showToast("Unable to determine the current book");
    return;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/gift/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      credentials: "include",
      body: JSON.stringify({
        bookId,
        chapterId,
        amount,
        message
      })
    });

    const data = await response.json();

    if (response.ok) {
      showToast(`Gift of ${amount} coins sent to the author!`);
      if (state.currentUser) {
        state.currentUser.coins = data.coinsRemaining || (state.currentUser.coins - amount);
      }
      closeGiftModal();
    } else {
      showToast(data.error || "Failed to send gift. Please try again.");
    }
  } catch (error) {
    console.error("Gift send error:", error);
    showToast("Error sending gift. Please check your connection.");
  }
}

function applyIncomingMode(mode) {
  if (mode !== "audio") {
    return;
  }

  elements.notesPanel.classList.remove("hidden");
  elements.notesToggleBtn.classList.add("active");
  updateReaderMainLayout();
  handleListen();
}

function setupBackLink(bookId) {
  const params = getParams();
  if (params.source === 'collection' || String(bookId).startsWith('local_')) {
    elements.backButton.href = '/reader/my-collection.html';
    elements.backButton.textContent = '← My Collection';
    const bookChatBtn = document.getElementById('bookChatBtn');
    if (bookChatBtn) bookChatBtn.style.display = 'none';
    // Hide gift modal for private books
    const giftModal = document.getElementById('sendGiftModal');
    if (giftModal) giftModal.setAttribute('aria-hidden', 'true');
    return;
  }
  elements.backButton.href = `/reader/book.html?id=${encodeURIComponent(bookId)}`;
  const bookChatBtn = document.getElementById('bookChatBtn');
  if (bookChatBtn) {
    bookChatBtn.href = `/reader/book-chat.html?bookId=${encodeURIComponent(bookId)}`;
  }
}

function renderLoadingState(message) {
  elements.readerContent.innerHTML = `<p>${message}</p>`;
  elements.toolbarBookTitle.textContent = "Loading book...";
  elements.toolbarChapterTitle.textContent = "Loading chapter...";
}

function renderErrorState(message) {
  elements.readerContent.innerHTML = `<p>${message}</p>`;
  elements.toolbarBookTitle.textContent = "Unable to load book";
  elements.toolbarChapterTitle.textContent = "";
  elements.chapterList.innerHTML = "";
  if (elements.prevBtn) {
    elements.prevBtn.disabled = true;
  }
  if (elements.nextBtn) {
    elements.nextBtn.disabled = true;
  }
}

function renderEmptyState() {
  elements.readerContent.innerHTML = "<p>No published chapters available for this book.</p>";
  elements.toolbarChapterTitle.textContent = "No chapters";
  elements.chapterList.innerHTML = "";
  if (elements.prevBtn) {
    elements.prevBtn.disabled = true;
  }
  if (elements.nextBtn) {
    elements.nextBtn.disabled = true;
  }
}

async function bootstrap() {
  console.debug('[reader] reader init started');
  try {
    // Defensive DOM checks
    const requiredSelectors = [
      ['toolbarBookTitle', elements.toolbarBookTitle],
      ['toolbarChapterTitle', elements.toolbarChapterTitle],
      ['chapterList', elements.chapterList],
      ['readerContent', elements.readerContent],
    ];
    let domOk = true;
    for (const [name, el] of requiredSelectors) {
      if (!el) {
        console.error(`[reader] MISSING DOM element: #${name}`);
        domOk = false;
      } else {
        console.debug(`[reader] Found DOM element: #${name}`);
      }
    }
    if (!domOk) {
      throw new Error('Missing required DOM elements. See console for details.');
    }

    const { bookId, chapterId, chapter, mode, source } = getParams();
    console.debug('[reader] Parsed URL params:', { bookId, chapterId, chapter, mode, source });
    if (!bookId) {
      renderErrorState("Missing bookId in URL.");
      console.error('[reader] No bookId in URL params');
      clearLoadingState();
      return;
    }

    // Initialize auth state before lock checks so chapter gating is accurate.
    await fetchCurrentUser();
    loadSettings();
    applySettings();

    renderLoadingState("Loading chapters...");
    setupBackLink(bookId);

    // Helper: Normalize book object
    function normalizeBookObj(raw, index = 0) {
      if (!raw) return null;
      return {
        id: raw.id || raw.bookId || `book-${index + 1}`,
        title: raw.title || raw.name || 'Untitled',
        author: raw.authorName || raw.author || 'Unknown Author',
        chapters: Array.isArray(raw.chapters) ? raw.chapters : [],
        coverUrl: raw.coverUrl || '',
        genre: raw.genre || '',
        audiobookTracks: raw.audiobookTracks || [],
        hasAudiobook: !!(raw.audiobookTracks && raw.audiobookTracks.length),
        ...raw
      };
    }

    // Helper: Normalize chapter object
    function normalizeChapterObj(raw, idx = 0) {
      if (!raw) return null;
      return {
        id: raw.id || raw.chapterId || raw.slug || String(idx + 1),
        number: raw.number || raw.chapterNumber || idx + 1,
        title: raw.title || `Chapter ${idx + 1}`,
        content: raw.content || raw.text || raw.body || '',
        ...raw
      };
    }

    // Try all sources for book data
    let book = null;
    let chapters = [];
    let audioTracks = [];
    state.bookSource = 'api';

    // 0. Try My Collection (IndexedDB) if source=collection or bookId starts with "local_"
    if (source === 'collection' || String(bookId).startsWith('local_')) {
      console.debug('[reader] Attempting to load from My Collection (IndexedDB)');
      try {
        if (window.MyCollectionDB) {
          const db = window.MyCollectionDB;
          const dbBook = await db.getBook(bookId);
          if (dbBook) {
            const dbChapters = await db.getChapters(bookId);
            book = normalizeBookObj({
              id: dbBook.id,
              title: dbBook.title,
              author: dbBook.author,
              genre: dbBook.genre || 'General',
              coverUrl: dbBook.coverDataUri || '',
              chapters: dbChapters.map(normalizeChapterObj),
              hasAudiobook: false,
              audiobookTracks: [],
            });
            chapters = dbChapters.map(normalizeChapterObj);
            state.bookSource = 'collection';
            book.format = dbBook.format || 'txt';
            // If the book is a PDF with stored file data, create a blob URL for rendering
            if (dbBook.format === 'pdf' && dbBook.fileData) {
              if (state.localFileUrl) URL.revokeObjectURL(state.localFileUrl);
              state.localFileUrl = URL.createObjectURL(new Blob([dbBook.fileData], { type: 'application/pdf' }));
            }
            console.debug('[reader] Loaded from My Collection:', book.title);
          }
        }
      } catch (dbErr) {
        console.error('[reader] IndexedDB book load failed:', dbErr);
      }
    }

    if (!book) {
      try {
        // 1. Try API
        const [bookMeta, apiChapters, apiAudioTracks] = await Promise.all([
          fetchBookMetadata(bookId),
          fetchChapterList(bookId),
          fetchBookAudioTracks(bookId).catch(() => []),
        ]);
        book = normalizeBookObj(bookMeta);
        chapters = Array.isArray(apiChapters) ? apiChapters.map(normalizeChapterObj) : [];
        audioTracks = Array.isArray(apiAudioTracks) ? apiAudioTracks : [];
        state.bookSource = 'api';
        if (!book || !chapters.length) throw new Error('API book/chapters missing');
      } catch (apiErr) {
        console.warn('[reader] API book/chapters failed:', apiErr);
        // 2. Try local app dataset (window.allBooks or window.books)
        let localBooks = window.allBooks || window.books || [];
        if (!Array.isArray(localBooks)) localBooks = [];
        book = normalizeBookObj(localBooks.find(b => (b.id || b.bookId) == bookId));
        if (book && Array.isArray(book.chapters) && book.chapters.length) {
          chapters = book.chapters.map(normalizeChapterObj);
          state.bookSource = 'localApp';
        } else {
          // 3. Try localStorage continue-reading/library
          try {
            const cr = JSON.parse(localStorage.getItem(readerScoped('continueReading')) || '[]');
            const libRaw = localStorage.getItem(readerScoped('savedBooks'));
            let lib = [];
            try {
              const parsed = libRaw ? JSON.parse(libRaw) : [];
              lib = Array.isArray(parsed) ? parsed : [];
              if (lib.length && typeof lib[0] === 'string') {
                lib = lib.map((id) => ({ bookId: id }));
              }
            } catch (e) {
              lib = [];
            }
            const all = [...cr, ...lib];
            const found = all.find(e => (e.bookId || e.id) == bookId);
            if (found) {
              book = normalizeBookObj(found);
              if (Array.isArray(book.chapters) && book.chapters.length) {
                chapters = book.chapters.map(normalizeChapterObj);
                state.bookSource = 'localStorage';
              }
            }
          } catch (lsErr) {
            console.error('[reader] localStorage parse error:', lsErr);
          }
        }
      }
    }

    // Defensive: fallback to empty
    if (!book) {
      pruneStaleReaderBookState(bookId);
      renderErrorState("Book not found. Return to library and try again.");
      console.error('[reader] Book not found after all sources; stale reader state cleared if present', { bookId });
      clearLoadingState();
      return;
    }
    if (!Array.isArray(chapters)) chapters = [];
    book.chapters = chapters;
    // Attach audioTracks if available
    if (Array.isArray(audioTracks) && audioTracks.length) {
      book.audiobookTracks = audioTracks;
      book.hasAudiobook = true;
    }

    // Debug logs
    console.debug('[reader] Book resolved:', book);
    console.debug('[reader] Chapter count:', chapters.length);

    // Normalize chapters array
    if (!Array.isArray(book.chapters) || !book.chapters.length) {
      renderErrorState("No chapters available for this book.");
      clearLoadingState();
      console.error('[reader] Book has no chapters', { book });
      return;
    }

    // Find chapter index by id, string, or fallback
    function findChapterIndex(chapters, chapterId, chapterNum) {
      if (!Array.isArray(chapters) || !chapters.length) return 0;
      if (chapterId) {
        // Try exact id match
        let idx = chapters.findIndex(c => c.id == chapterId);
        if (idx >= 0) return idx;
        // Try string match
        idx = chapters.findIndex(c => String(c.id).toLowerCase() === String(chapterId).toLowerCase());
        if (idx >= 0) return idx;
        // Try slug match
        idx = chapters.findIndex(c => c.slug && c.slug == chapterId);
        if (idx >= 0) return idx;
      }
      // Fallback to chapter number (1-based)
      if (chapterNum && chapters[chapterNum - 1]) return chapterNum - 1;
      // Fallback to first
      return 0;
    }

    let chapterIdx = findChapterIndex(book.chapters, chapterId, chapter);
    let resolvedChapter = book.chapters[chapterIdx];
    if (!resolvedChapter) {
      // fallback to first valid chapter
      chapterIdx = 0;
      resolvedChapter = book.chapters[0];
      console.warn('[reader] Requested chapter not found, loading first chapter.');
    }
    state.currentBook = book;
    state.currentChapterIndex = chapterIdx;
    
    // Update SEO schema for the story
    updateStorySchema();
    
    // Debug log
    console.debug('[reader] Chapter resolved:', resolvedChapter);

    // Hydrate audio map if needed
    if (Array.isArray(book.audiobookTracks)) hydrateAudioMap(book.audiobookTracks);


    // Render sidebar/chapters list (unchanged)
    function renderChaptersList() {
      elements.chapterList.innerHTML = '';
      if (!state.currentBook || !Array.isArray(state.currentBook.chapters)) return;
      state.currentBook.chapters.forEach((chapter, idx) => {
        const li = document.createElement('li');
        li.innerHTML = `<button type=\"button\" class=\"chapter-btn${idx === state.currentChapterIndex ? ' active' : ''}\" data-chapter-index=\"${idx}\"><small>Chapter ${chapter.number}</small> ${chapter.title}</button>`;
        elements.chapterList.appendChild(li);
      });
      console.debug('[reader] renderChaptersList completed');
    }

    // Render main chapter content (now expects chapterWithContent)
    function renderChapter(chapter) {
      console.debug('[reader] render started');
      if (!chapter) {
        elements.readerContent.innerHTML = '<p>Chapter content unavailable.</p>';
        clearLoadingState();
        console.debug('[reader] render completed');
        return;
      }
      // Book/chapter titles
      elements.toolbarBookTitle.textContent = state.currentBook.title;
      elements.toolbarChapterTitle.textContent = `Chapter ${chapter.number}: ${chapter.title}`;
      
      // Update chapter SEO schema
      state.currentChapter = chapter;
      updateChapterSchema();
      
      // PDF books: render via iframe using the stored blob URL
      if (state.currentBook.format === 'pdf' && state.localFileUrl) {
        elements.readerContent.innerHTML = `<div style="width:100%;height:85vh;"><iframe src="${state.localFileUrl}" style="width:100%;height:100%;border:none;" title="PDF Document"></iframe></div>`;
        clearLoadingState();
        console.debug('[reader] render completed (PDF)');
        return;
      }
      // Main content
      let content = chapter.content || chapter.text || chapter.body || '';
      if (!content.trim()) {
        elements.readerContent.innerHTML = '<p>Chapter content unavailable.</p>';
        clearLoadingState();
        console.debug('[reader] render completed');
        return;
      }
      // Simple paragraph split
      const paragraphs = content.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
      elements.readerContent.innerHTML = paragraphs.map(p => `<p>${p}</p>`).join('');
      clearLoadingState();
      console.debug('[reader] render completed');
    }

    renderChaptersList();

    // For local collection books, chapter content is already in IndexedDB.
    if (state.bookSource === 'collection' || state.bookSource === 'localApp' || state.bookSource === 'localStorage') {
      renderChapter(resolvedChapter);
    } else {
      // API books: fetch the canonical chapter payload.
      try {
        console.debug('[reader] fetching chapter content for id:', resolvedChapter.id);
        const fullChapter = await fetchChapterById(resolvedChapter.id);
        console.debug('[reader] fetch success for chapter id:', resolvedChapter.id);
        const chapterWithContent = {
          ...resolvedChapter,
          content: fullChapter.content || ''
        };
        renderChapter(chapterWithContent);
      } catch (err) {
        console.error('[reader] Failed to load chapter:', err);
        if (err && (err.code === "CHAPTER_LOCKED" || err.status === 403 || err.loginRequired)) {
          if (state.currentUser && !err.loginRequired) {
            await requestPaymentForChapterAccess(resolvedChapter);
          } else {
            requestLoginForChapterAccess(resolvedChapter);
          }
          return;
        }
        elements.readerContent.innerHTML = '<p>Failed to load chapter.</p>';
        clearLoadingState();
      }
    }

    renderNotes && renderNotes();
    if (state.currentUser && typeof resumeProgress === 'function') {
      await resumeProgress();
    }
    applyIncomingMode && applyIncomingMode(mode);
    // Update continue-reading progress after successful load
    try {
      addContinueReading({
        bookId: book.id,
        source: state.bookSource,
        currentChapter: resolvedChapter?.id,
        progress: chapterIdx
      });
    } catch (err) {
      console.error('[reader] Failed to update continue-reading:', err);
    }
  } catch (err) {
    renderErrorState('Unable to load book or chapter.');
    clearLoadingState();
    console.error('[reader] reader init error:', err);
  }
}

function clearLoadingState() {
  if (elements.toolbarBookTitle) elements.toolbarBookTitle.textContent = '';
  if (elements.toolbarChapterTitle) elements.toolbarChapterTitle.textContent = '';
}
    
bootstrap();
updateFullscreenButtonLabel();
