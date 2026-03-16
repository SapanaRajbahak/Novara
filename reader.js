const SETTINGS_KEY = "novelread.reader.settings";
const PROGRESS_KEY = "novelread.reader.progress";
const BOOKMARK_KEY = "novelread.reader.bookmarks";
const NOTES_KEY = "novelread.reader.notes";
const API_BASE_URL = "http://localhost:5000";

const state = {
  currentBook: null,
  chapterCache: {},
  currentChapter: null,
  currentChapterIndex: 0,
  progressApiEnabled: true,
  progressApiAuthMissingNotified: false,
  resumeApplied: false,
  settings: {
    fontSize: 19,
    fontFamily: "Fraunces, serif",
    lineHeight: 1.75,
    theme: "light",
    pageWidth: 760,
    readingMode: "scroll",
    contentFormat: "structured"
  },
  activeSelection: null,
  localFileUrl: null
};

const elements = {
  root: document.documentElement,
  app: document.getElementById("readerApp"),
  toolbar: document.getElementById("readerToolbar"),
  bottom: document.getElementById("readerBottom"),
  backButton: document.getElementById("backButton"),
  drawerToggleBtn: document.getElementById("drawerToggleBtn"),
  notesToggleBtn: document.getElementById("notesToggleBtn"),
  settingsBtn: document.getElementById("settingsBtn"),
  bookmarkBtn: document.getElementById("bookmarkBtn"),
  searchInput: document.getElementById("searchInput"),
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
  settingsModal: document.getElementById("settingsModal"),
  closeSettingsBtn: document.getElementById("closeSettingsBtn"),
  fontSizeInput: document.getElementById("fontSizeInput"),
  fontFamilySelect: document.getElementById("fontFamilySelect"),
  lineHeightInput: document.getElementById("lineHeightInput"),
  themeSelect: document.getElementById("themeSelect"),
  pageWidthInput: document.getElementById("pageWidthInput"),
  modeSelect: document.getElementById("modeSelect"),
  formatSelect: document.getElementById("formatSelect"),
  filePicker: document.getElementById("filePicker"),
  selectionTools: document.getElementById("selectionTools"),
  highlightBtn: document.getElementById("highlightBtn"),
  addNoteBtn: document.getElementById("addNoteBtn"),
  leftTapZone: document.getElementById("leftTapZone"),
  centerTapZone: document.getElementById("centerTapZone"),
  rightTapZone: document.getElementById("rightTapZone")
};

function showToast(message) {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  document.body.appendChild(toast);
  window.setTimeout(() => toast.remove(), 1600);
}

function getParams() {
  const params = new URLSearchParams(window.location.search);

  const chapterFromQuery = Number(params.get("chapter") || 1);

  return {
    bookId: params.get("bookId") || params.get("book") || "",
    chapterId: params.get("chapterId") || "",
    chapter: Number.isFinite(chapterFromQuery) ? chapterFromQuery : 1,
    mode: params.get("mode") || "read"
  };
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

function loadSettings() {
  const saved = loadJsonStorage(SETTINGS_KEY, null);
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

  if (state.settings.readingMode === "paginated") {
    elements.readingViewport.style.scrollSnapType = "y mandatory";
  } else {
    elements.readingViewport.style.scrollSnapType = "none";
  }
}

function persistSettings() {
  saveJsonStorage(SETTINGS_KEY, state.settings);
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
  }));
}

async function fetchChapterById(chapterId) {
  if (state.chapterCache[chapterId]) {
    return state.chapterCache[chapterId];
  }

  const response = await fetch(`${API_BASE_URL}/api/chapters/${encodeURIComponent(chapterId)}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch chapter content (HTTP ${response.status})`);
  }

  const payload = await response.json();
  if (!payload.success || !payload.data) {
    throw new Error("Chapter response is invalid");
  }

  state.chapterCache[chapterId] = payload.data;
  return payload.data;
}

function getProgressMap() {
  return loadJsonStorage(PROGRESS_KEY, {});
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

  saveJsonStorage(PROGRESS_KEY, progress);

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

function getBookmarksMap() {
  return loadJsonStorage(BOOKMARK_KEY, {});
}

function saveBookmark() {
  if (!state.currentBook) {
    return;
  }

  const map = getBookmarksMap();
  map[getBookStorageKey(state.currentBook.id)] = {
    chapterIndex: state.currentChapterIndex,
    createdAt: new Date().toISOString()
  };
  saveJsonStorage(BOOKMARK_KEY, map);
  showToast("Bookmark saved");
}

function getNotesMap() {
  return loadJsonStorage(NOTES_KEY, {});
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
  saveJsonStorage(NOTES_KEY, notesMap);
  renderNotes();
}

function getChapterScrollRatio() {
  const max = elements.readingViewport.scrollHeight - elements.readingViewport.clientHeight;
  if (max <= 0) {
    return 1;
  }
  return Math.min(1, Math.max(0, elements.readingViewport.scrollTop / max));
}

function updateProgressUi() {
  if (!state.currentBook) {
    return;
  }

  const chapterCount = state.currentBook.chapters.length || 1;
  const chapterProgress = getChapterScrollRatio();
  const totalPercent = ((state.currentChapterIndex + chapterProgress) / chapterCount) * 100;
  elements.progressSlider.value = String(Math.round(totalPercent));
  elements.progressText.textContent = `${Math.round(totalPercent)}%`;
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function createParagraphMarkup(paragraph) {
  return `<p>${escapeHtml(paragraph)}</p>`;
}

function renderStructuredChapter(chapter) {
  const text = String(chapter.content || "").trim();
  if (!text) {
    elements.readerContent.innerHTML = "<p>No chapter content available.</p>";
    return;
  }

  const paragraphs = text
    .split(/\n\s*\n/)
    .map((chunk) => chunk.trim())
    .filter(Boolean);

  elements.readerContent.innerHTML = paragraphs.map(createParagraphMarkup).join("");
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
  `;
}

function renderEpubShell() {
  elements.readerContent.innerHTML = `
    <div class="format-shell">
      <h2>EPUB Reader</h2>
      <p>EPUB container is ready. Browser-native EPUB rendering is limited; integrate epub.js for production pagination and TOC.</p>
      <p>You can still open structured chapters in this reader and preserve notes, progress, and bookmarks.</p>
    </div>
  `;
}

function renderCurrentChapter() {
  if (!state.currentBook || !state.currentChapter) {
    elements.readerContent.innerHTML = "<p>Chapter not found.</p>";
    return;
  }

  const chapter = state.currentChapter;
  elements.toolbarBookTitle.textContent = state.currentBook.title;
  elements.toolbarChapterTitle.textContent = `Chapter ${chapter.number}: ${chapter.title}`;
  document.title = `${state.currentBook.title} - Chapter ${chapter.number}`;

  if (state.settings.contentFormat === "pdf") {
    renderPdfShell();
  } else if (state.settings.contentFormat === "epub") {
    renderEpubShell();
  } else {
    renderStructuredChapter(chapter);
  }

  updateChapterNavUi();
  elements.readingViewport.scrollTop = 0;
  updateProgressUi();
}

function updateChapterNavUi() {
  const buttons = [...elements.chapterList.querySelectorAll("button[data-chapter-index]")];
  buttons.forEach((button) => {
    const active = Number(button.dataset.chapterIndex) === state.currentChapterIndex;
    button.classList.toggle("active", active);
  });

  const maxIndex = (state.currentBook?.chapters.length || 1) - 1;
  elements.prevBtn.disabled = state.currentChapterIndex <= 0;
  elements.nextBtn.disabled = state.currentChapterIndex >= maxIndex;
}

function renderChapterDrawer() {
  elements.chapterList.innerHTML = "";
  if (!state.currentBook) {
    return;
  }

  state.currentBook.chapters.forEach((chapter, idx) => {
    const li = document.createElement("li");
    li.innerHTML = `
      <button type="button" class="chapter-btn ${idx === state.currentChapterIndex ? "active" : ""}" data-chapter-index="${idx}">
        <small>Chapter ${chapter.number}</small>
        ${chapter.title}
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
        <button type="button" class="track-btn" data-track-number="${track.number}">
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

  elements.readerContent.innerHTML = "<p>Loading chapter...</p>";

  const chapter = await fetchChapterById(chapterMeta.id);
  state.currentChapter = {
    ...chapterMeta,
    content: chapter.content,
  };

  const params = new URLSearchParams(window.location.search);
  params.set("bookId", state.currentBook.id);
  params.set("chapterId", chapterMeta.id);
  window.history.replaceState({}, "", `reader.html?${params.toString()}`);

  renderCurrentChapter();
}

function jumpToChapter(index) {
  if (!state.currentBook) {
    return;
  }
  const chapterMax = state.currentBook.chapters.length - 1;
  state.currentChapterIndex = Math.min(chapterMax, Math.max(0, index));
  loadAndRenderChapterByIndex(state.currentChapterIndex)
    .then(saveProgress)
    .catch((error) => {
      console.error("Failed to load chapter:", error);
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

  jumpToChapter(state.currentChapterIndex + direction);
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
  elements.drawerToggleBtn.addEventListener("click", () => {
    elements.chapterDrawer.classList.toggle("hidden");
  });

  elements.notesToggleBtn.addEventListener("click", () => {
    const hidden = elements.notesPanel.classList.toggle("hidden");
    elements.notesToggleBtn.classList.toggle("active", !hidden);
  });

  elements.settingsBtn.addEventListener("click", openSettingsModal);
  elements.closeSettingsBtn.addEventListener("click", closeSettingsModal);
  elements.settingsModal.addEventListener("click", (event) => {
    if (event.target === elements.settingsModal) {
      closeSettingsModal();
    }
  });

  elements.bookmarkBtn.addEventListener("click", saveBookmark);

  elements.prevBtn.addEventListener("click", () => moveByPage(-1));
  elements.nextBtn.addEventListener("click", () => moveByPage(1));

  elements.progressSlider.addEventListener("input", () => {
    if (!state.currentBook) {
      return;
    }
    const chapterCount = state.currentBook.chapters.length;
    const raw = Number(elements.progressSlider.value) / 100;
    const targetIndex = Math.floor(raw * chapterCount);
    jumpToChapter(Math.min(chapterCount - 1, targetIndex));
  });

  let progressTimer = null;
  elements.readingViewport.addEventListener("scroll", () => {
    updateProgressUi();
    if (progressTimer) {
      clearTimeout(progressTimer);
    }
    progressTimer = window.setTimeout(saveProgress, 180);
  });

  elements.chapterList.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-chapter-index]");
    if (!button) {
      return;
    }
    jumpToChapter(Number(button.dataset.chapterIndex));
  });

  elements.trackList.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-track-number]");
    if (!button) {
      return;
    }
    showToast(`Playing track ${button.dataset.trackNumber}`);
  });

  elements.searchInput.addEventListener("input", () => {
    searchInChapter(elements.searchInput.value);
  });

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
    if (state.localFileUrl) {
      URL.revokeObjectURL(state.localFileUrl);
    }
  });
}

function applyIncomingMode(mode) {
  if (mode === "audio") {
    elements.notesPanel.classList.remove("hidden");
    elements.notesToggleBtn.classList.add("active");
    showToast("Audiobook-ready mode");
  }
}

function setupBackLink(bookId) {
  elements.backButton.href = `book.html?id=${encodeURIComponent(bookId)}`;
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
  elements.prevBtn.disabled = true;
  elements.nextBtn.disabled = true;
}

function renderEmptyState() {
  elements.readerContent.innerHTML = "<p>No published chapters available for this book.</p>";
  elements.toolbarChapterTitle.textContent = "No chapters";
  elements.chapterList.innerHTML = "";
  elements.prevBtn.disabled = true;
  elements.nextBtn.disabled = true;
}

async function bootstrap() {
  loadSettings();
  applySettings();
  bindEvents();

  const { bookId, chapterId, chapter, mode } = getParams();
  if (!bookId) {
    renderErrorState("Missing bookId in URL.");
    return;
  }

  renderLoadingState("Loading chapters...");
  setupBackLink(bookId);

  try {
    const [bookMeta, chapters] = await Promise.all([
      fetchBookMetadata(bookId),
      fetchChapterList(bookId),
    ]);

    state.currentBook = {
      ...bookMeta,
      chapters,
    };
  } catch (error) {
    console.error("Failed to initialize reader:", error);
    renderErrorState("Unable to load this book. Return to library and try again.");
    return;
  }

  if (!state.currentBook.chapters.length) {
    renderEmptyState();
    return;
  }

  const chapterIndexFromId = state.currentBook.chapters.findIndex((item) => item.id === chapterId);
  const fallbackIndex = Math.min(state.currentBook.chapters.length - 1, Math.max(0, chapter - 1));
  state.currentChapterIndex = chapterIndexFromId >= 0 ? chapterIndexFromId : fallbackIndex;

  renderChapterDrawer();
  try {
    await loadAndRenderChapterByIndex(state.currentChapterIndex);
  } catch (error) {
    console.error("Failed to load initial chapter:", error);
    renderErrorState("Unable to load chapter content.");
    return;
  }

  renderNotes();
  applyIncomingMode(mode);
  await resumeProgress();
}

bootstrap();
