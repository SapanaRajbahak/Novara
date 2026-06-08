const ADMIN_AUTH_KEY = "novara.admin.auth";
const BOOKS_STORE_KEY = "novara.admin.uploadedBooks";
const CHAPTERS_STORE_KEY = "novara.admin.chapterDrafts";
const AUTOSAVE_KEY = "novara.admin.chapterEditorDrafts";

const elements = {
  logoutBtn: document.getElementById("logoutBtn"),
  bookSelect: document.getElementById("bookSelect"),
  createChapterBtn: document.getElementById("createChapterBtn"),
  globalMessage: document.getElementById("globalMessage"),
  chapterList: document.getElementById("chapterList"),
  chapterTitleInput: document.getElementById("chapterTitleInput"),
  chapterContentInput: document.getElementById("chapterContentInput"),
  autosaveStatus: document.getElementById("autosaveStatus"),
  saveBtn: document.getElementById("saveBtn"),
  publishBtn: document.getElementById("publishBtn"),
  deleteBtn: document.getElementById("deleteBtn"),
  previewPane: document.getElementById("previewPane"),
  toolbarButtons: [...document.querySelectorAll("button[data-md]")]
};

const state = {
  books: [],
  selectedBookId: "",
  selectedChapterId: "",
  autosaveTimer: null
};

function requireAuth() {
  const auth = localStorage.getItem(ADMIN_AUTH_KEY);
  if (auth !== "1") {
    const next = encodeURIComponent("/admin/admin-chapters.html");
    window.location.href = `/admin/admin-login.html?next=${next}`;
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

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (error) {
    return fallback;
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function stripHtml(text) {
  return String(text || "").replace(/<[^>]*>/g, "").replace(/\r\n/g, "\n").trim();
}

function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderMarkdown(markdown) {
  const lines = String(markdown || "").split("\n");
  const html = [];

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (!line.trim()) {
      continue;
    }

    if (line.startsWith("## ")) {
      html.push(`<h2>${inlineMarkdown(line.slice(3))}</h2>`);
      continue;
    }

    if (line.startsWith("> ")) {
      html.push(`<blockquote>${inlineMarkdown(line.slice(2))}</blockquote>`);
      continue;
    }

    if (line.startsWith("- ")) {
      html.push(`<p>&bull; ${inlineMarkdown(line.slice(2))}</p>`);
      continue;
    }

    html.push(`<p>${inlineMarkdown(line)}</p>`);
  }

  return html.join("") || "<p>Preview will appear here...</p>";
}

function inlineMarkdown(text) {
  let out = escapeHtml(text);
  out = out.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/\*(.+?)\*/g, "<em>$1</em>");
  out = out.replace(/`(.+?)`/g, "<code>$1</code>");
  return out;
}

function getBooks() {
  const uploaded = readJson(BOOKS_STORE_KEY, []);
  if (uploaded.length) {
    return uploaded.map((book) => ({ id: book.id, title: book.title }));
  }

  return [
    { id: "book-last-lantern", title: "The Last Lantern" },
    { id: "book-echoes-dawn", title: "Echoes at Dawn" }
  ];
}

function getChapterStore() {
  return readJson(CHAPTERS_STORE_KEY, {});
}

function saveChapterStore(store) {
  writeJson(CHAPTERS_STORE_KEY, store);
}

function getAutosaveStore() {
  return readJson(AUTOSAVE_KEY, {});
}

function saveAutosaveStore(store) {
  writeJson(AUTOSAVE_KEY, store);
}

function getChaptersForBook(bookId) {
  const store = getChapterStore();
  const list = Array.isArray(store[bookId]) ? store[bookId] : [];
  return [...list].sort((a, b) => Number(a.number) - Number(b.number));
}

function setGlobalMessage(text) {
  elements.globalMessage.textContent = text;
}

function renderBookSelect() {
  elements.bookSelect.innerHTML = "";
  state.books.forEach((book) => {
    const option = document.createElement("option");
    option.value = book.id;
    option.textContent = book.title;
    elements.bookSelect.appendChild(option);
  });

  if (!state.selectedBookId && state.books.length) {
    state.selectedBookId = state.books[0].id;
  }

  elements.bookSelect.value = state.selectedBookId;
}

function renderChapterList() {
  const chapters = getChaptersForBook(state.selectedBookId);
  elements.chapterList.innerHTML = "";

  if (!chapters.length) {
    elements.chapterList.innerHTML = "<li class=\"chapter-item\">No chapters yet. Create your first chapter.</li>";
    state.selectedChapterId = "";
    clearEditor();
    return;
  }

  if (!state.selectedChapterId || !chapters.some((ch) => ch.id === state.selectedChapterId)) {
    state.selectedChapterId = chapters[0].id;
  }

  chapters.forEach((chapter, index) => {
    const li = document.createElement("li");
    li.className = `chapter-item ${chapter.id === state.selectedChapterId ? "active" : ""}`;
    li.innerHTML = `
      <button type="button" class="chapter-title-btn" data-action="select" data-id="${chapter.id}">
        Chapter ${chapter.number}: ${chapter.title}
      </button>
      <div class="chapter-meta">${chapter.published ? "Published" : "Draft"}</div>
      <div class="chapter-actions">
        <button type="button" data-action="up" data-id="${chapter.id}" ${index === 0 ? "disabled" : ""}>Up</button>
        <button type="button" data-action="down" data-id="${chapter.id}" ${index === chapters.length - 1 ? "disabled" : ""}>Down</button>
      </div>
    `;
    elements.chapterList.appendChild(li);
  });

  renderEditorFromSelection();
}

function getSelectedChapter() {
  const chapters = getChaptersForBook(state.selectedBookId);
  return chapters.find((chapter) => chapter.id === state.selectedChapterId) || null;
}

function clearEditor() {
  elements.chapterTitleInput.value = "";
  elements.chapterContentInput.value = "";
  elements.previewPane.innerHTML = renderMarkdown("");
}

function renderEditorFromSelection() {
  const chapter = getSelectedChapter();
  if (!chapter) {
    clearEditor();
    return;
  }

  elements.chapterTitleInput.value = chapter.title;
  elements.chapterContentInput.value = chapter.content;
  elements.previewPane.innerHTML = renderMarkdown(chapter.content);
}

function persistChapter(updateFn) {
  const store = getChapterStore();
  const list = Array.isArray(store[state.selectedBookId]) ? store[state.selectedBookId] : [];
  store[state.selectedBookId] = updateFn([...list]);
  saveChapterStore(store);
}

function createChapter() {
  const chapters = getChaptersForBook(state.selectedBookId);
  const nextNum = chapters.length ? Math.max(...chapters.map((ch) => Number(ch.number))) + 1 : 1;
  const chapter = {
    id: `chapter-${Date.now()}`,
    number: nextNum,
    title: `New Chapter ${nextNum}`,
    content: "",
    published: false,
    updatedAt: new Date().toISOString()
  };

  persistChapter((list) => {
    list.push(chapter);
    return list;
  });

  state.selectedChapterId = chapter.id;
  renderChapterList();
  setGlobalMessage("Chapter created.");
}

function reorderChapter(chapterId, direction) {
  persistChapter((list) => {
    const idx = list.findIndex((chapter) => chapter.id === chapterId);
    if (idx < 0) {
      return list;
    }

    const target = idx + direction;
    if (target < 0 || target >= list.length) {
      return list;
    }

    const temp = list[idx];
    list[idx] = list[target];
    list[target] = temp;

    list.forEach((chapter, i) => {
      chapter.number = i + 1;
    });

    return list;
  });

  renderChapterList();
}

function saveChapter({ publish = false } = {}) {
  const chapter = getSelectedChapter();
  if (!chapter) {
    setGlobalMessage("Select or create a chapter first.");
    return;
  }

  const cleanTitle = stripHtml(elements.chapterTitleInput.value);
  const cleanContent = stripHtml(elements.chapterContentInput.value);

  if (!cleanTitle) {
    setGlobalMessage("Chapter title is required.");
    return;
  }

  if (!cleanContent) {
    setGlobalMessage("Chapter content is required.");
    return;
  }

  persistChapter((list) =>
    list.map((item) =>
      item.id === chapter.id
        ? {
            ...item,
            title: cleanTitle,
            content: cleanContent,
            published: publish ? true : item.published,
            updatedAt: new Date().toISOString()
          }
        : item
    )
  );

  renderChapterList();
  setGlobalMessage(publish ? "Chapter published." : "Chapter saved.");
  showToast(publish ? "Published" : "Saved");
}

function deleteChapter() {
  const chapter = getSelectedChapter();
  if (!chapter) {
    setGlobalMessage("No chapter selected.");
    return;
  }

  persistChapter((list) => list.filter((item) => item.id !== chapter.id));
  state.selectedChapterId = "";
  renderChapterList();
  setGlobalMessage("Chapter deleted.");
}

function applyMarkdownToken(type) {
  const textarea = elements.chapterContentInput;
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const before = textarea.value.slice(0, start);
  const selected = textarea.value.slice(start, end);
  const after = textarea.value.slice(end);

  let replacement = selected;

  if (type === "bold") {
    replacement = `**${selected || "bold text"}**`;
  } else if (type === "italic") {
    replacement = `*${selected || "italic text"}*`;
  } else if (type === "h2") {
    replacement = `## ${selected || "Heading"}`;
  } else if (type === "quote") {
    replacement = `> ${selected || "Quote"}`;
  } else if (type === "ul") {
    replacement = `- ${selected || "List item"}`;
  } else if (type === "code") {
    replacement = `\`${selected || "code"}\``;
  }

  textarea.value = `${before}${replacement}${after}`;
  textarea.focus();
  const cursor = before.length + replacement.length;
  textarea.setSelectionRange(cursor, cursor);
  updatePreview();
  scheduleAutosave();
}

function updatePreview() {
  elements.previewPane.innerHTML = renderMarkdown(elements.chapterContentInput.value);
}

function autosaveDraft() {
  const chapter = getSelectedChapter();
  if (!chapter || !state.selectedBookId) {
    return;
  }

  const store = getAutosaveStore();
  const key = `${state.selectedBookId}:${chapter.id}`;
  store[key] = {
    title: stripHtml(elements.chapterTitleInput.value),
    content: stripHtml(elements.chapterContentInput.value),
    savedAt: new Date().toISOString()
  };
  saveAutosaveStore(store);
  elements.autosaveStatus.textContent = `Draft autosaved at ${new Date().toLocaleTimeString()}`;
}

function loadAutosaveForCurrentChapter() {
  const chapter = getSelectedChapter();
  if (!chapter) {
    return;
  }
  const store = getAutosaveStore();
  const key = `${state.selectedBookId}:${chapter.id}`;
  const draft = store[key];
  if (!draft) {
    elements.autosaveStatus.textContent = "Draft autosave idle";
    return;
  }

  if (draft.title) {
    elements.chapterTitleInput.value = draft.title;
  }
  if (draft.content) {
    elements.chapterContentInput.value = draft.content;
  }
  elements.autosaveStatus.textContent = `Loaded autosave from ${new Date(draft.savedAt).toLocaleString()}`;
  updatePreview();
}

function scheduleAutosave() {
  if (state.autosaveTimer) {
    clearTimeout(state.autosaveTimer);
  }
  state.autosaveTimer = window.setTimeout(autosaveDraft, 700);
}

function handleChapterListClick(event) {
  const control = event.target.closest("button[data-action][data-id]");
  if (!control) {
    return;
  }

  const { action, id } = control.dataset;
  if (action === "select") {
    state.selectedChapterId = id;
    renderChapterList();
    loadAutosaveForCurrentChapter();
    return;
  }

  if (action === "up") {
    reorderChapter(id, -1);
    return;
  }

  if (action === "down") {
    reorderChapter(id, 1);
  }
}

function bindEvents() {
  elements.logoutBtn.addEventListener("click", () => {
    localStorage.removeItem(ADMIN_AUTH_KEY);
    window.location.href = "/index.html";
  });

  elements.bookSelect.addEventListener("change", () => {
    state.selectedBookId = elements.bookSelect.value;
    state.selectedChapterId = "";
    renderChapterList();
    setGlobalMessage("Book changed.");
  });

  elements.createChapterBtn.addEventListener("click", createChapter);
  elements.chapterList.addEventListener("click", handleChapterListClick);

  elements.saveBtn.addEventListener("click", () => saveChapter({ publish: false }));
  elements.publishBtn.addEventListener("click", () => saveChapter({ publish: true }));
  elements.deleteBtn.addEventListener("click", deleteChapter);

  elements.chapterTitleInput.addEventListener("input", scheduleAutosave);
  elements.chapterContentInput.addEventListener("input", () => {
    updatePreview();
    scheduleAutosave();
  });

  elements.toolbarButtons.forEach((button) => {
    button.addEventListener("click", () => {
      applyMarkdownToken(button.dataset.md);
    });
  });
}

function bootstrap() {
  if (!requireAuth()) {
    return;
  }

  state.books = getBooks();
  if (!state.books.length) {
    setGlobalMessage("No books available. Upload a book first.");
    return;
  }

  state.selectedBookId = state.books[0].id;
  renderBookSelect();
  renderChapterList();
  bindEvents();
}

bootstrap();

