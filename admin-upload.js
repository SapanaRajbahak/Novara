const ADMIN_AUTH_KEY = "novelread.admin.auth";
const BOOK_DRAFTS_KEY = "novelread.admin.uploadedBooks";
const CHAPTER_DRAFTS_KEY = "novelread.admin.chapterDrafts";

const elements = {
  logoutBtn: document.getElementById("logoutBtn"),
  uploadForm: document.getElementById("uploadForm"),
  formError: document.getElementById("formError"),
  title: document.getElementById("title"),
  author: document.getElementById("author"),
  description: document.getElementById("description"),
  genre: document.getElementById("genre"),
  tags: document.getElementById("tags"),
  status: document.getElementById("status"),
  bookType: document.getElementById("bookType"),
  mainFileHint: document.getElementById("mainFileHint"),
  coverInput: document.getElementById("coverInput"),
  mainFileInput: document.getElementById("mainFileInput"),
  audiobookInput: document.getElementById("audiobookInput"),
  sampleAudioInput: document.getElementById("sampleAudioInput"),
  coverFileName: document.getElementById("coverFileName"),
  mainFileName: document.getElementById("mainFileName"),
  audiobookFileName: document.getElementById("audiobookFileName"),
  sampleAudioFileName: document.getElementById("sampleAudioFileName"),
  chapterBuilder: document.getElementById("chapterBuilder"),
  chapterForm: document.getElementById("chapterForm"),
  chapterError: document.getElementById("chapterError"),
  chapterTitle: document.getElementById("chapterTitle"),
  chapterNumber: document.getElementById("chapterNumber"),
  chapterContent: document.getElementById("chapterContent"),
  chapterList: document.getElementById("chapterList")
};

let currentBookDraftId = "";

function requireAuth() {
  const auth = localStorage.getItem(ADMIN_AUTH_KEY);
  if (auth !== "1") {
    const next = encodeURIComponent("admin-upload.html");
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
  window.setTimeout(() => toast.remove(), 1500);
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

function getBookTypeConfig(type) {
  if (type === "epub") {
    return { required: true, acceptExt: [".epub"], label: "Main EPUB file is required" };
  }
  if (type === "pdf") {
    return { required: true, acceptExt: [".pdf"], label: "Main PDF file is required" };
  }
  return { required: false, acceptExt: [], label: "Main file optional in chapter mode" };
}

function validateMainFile(type) {
  const config = getBookTypeConfig(type);
  const file = elements.mainFileInput.files?.[0] || null;

  if (!config.required) {
    return "";
  }

  if (!file) {
    return config.label;
  }

  const lowerName = file.name.toLowerCase();
  const hasValidExt = config.acceptExt.some((ext) => lowerName.endsWith(ext));
  if (!hasValidExt) {
    return `Invalid main file. Expected ${config.acceptExt.join(" or ")}`;
  }

  return "";
}

function validateUploadForm() {
  if (!elements.title.value.trim()) {
    return "Title is required.";
  }

  if (!elements.author.value.trim()) {
    return "Author is required.";
  }

  if (!elements.description.value.trim()) {
    return "Description is required.";
  }

  if (!elements.genre.value) {
    return "Genre is required.";
  }

  const cover = elements.coverInput.files?.[0] || null;
  if (!cover) {
    return "Cover image is required.";
  }

  if (!cover.type.startsWith("image/")) {
    return "Cover file must be an image.";
  }

  const mainFileError = validateMainFile(elements.bookType.value);
  if (mainFileError) {
    return mainFileError;
  }

  const audiobook = elements.audiobookInput.files?.[0];
  if (audiobook && !audiobook.type.startsWith("audio/")) {
    return "Audiobook file must be audio format.";
  }

  const sample = elements.sampleAudioInput.files?.[0];
  if (sample && !sample.type.startsWith("audio/")) {
    return "Sample audio file must be audio format.";
  }

  return "";
}

function serializeBasicForm() {
  const tags = elements.tags.value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);

  return {
    id: currentBookDraftId || `draft-${Date.now()}`,
    title: elements.title.value.trim(),
    author: elements.author.value.trim(),
    description: elements.description.value.trim(),
    genre: elements.genre.value,
    tags,
    status: elements.status.value,
    bookType: elements.bookType.value,
    files: {
      cover: elements.coverInput.files?.[0]?.name || "",
      main: elements.mainFileInput.files?.[0]?.name || "",
      audiobook: elements.audiobookInput.files?.[0]?.name || "",
      sampleAudio: elements.sampleAudioInput.files?.[0]?.name || ""
    },
    savedAt: new Date().toISOString()
  };
}

function persistBookDraft(payload) {
  const drafts = readJson(BOOK_DRAFTS_KEY, []);
  const idx = drafts.findIndex((item) => item.id === payload.id);
  if (idx >= 0) {
    drafts[idx] = payload;
  } else {
    drafts.unshift(payload);
  }
  writeJson(BOOK_DRAFTS_KEY, drafts);
}

function getChapterStore() {
  return readJson(CHAPTER_DRAFTS_KEY, {});
}

function persistChapterStore(store) {
  writeJson(CHAPTER_DRAFTS_KEY, store);
}

function getCurrentBookChapters() {
  if (!currentBookDraftId) {
    return [];
  }
  const store = getChapterStore();
  return Array.isArray(store[currentBookDraftId]) ? store[currentBookDraftId] : [];
}

function renderChapterList() {
  const chapters = getCurrentBookChapters();
  elements.chapterList.innerHTML = "";

  if (!chapters.length) {
    elements.chapterList.innerHTML = "<li class=\"chapter-item\">No chapters added yet.</li>";
    return;
  }

  chapters
    .sort((a, b) => a.number - b.number)
    .forEach((chapter) => {
      const li = document.createElement("li");
      li.className = "chapter-item";
      li.innerHTML = `<strong>Chapter ${chapter.number}: ${chapter.title}</strong><p>${chapter.content.slice(0, 130)}${chapter.content.length > 130 ? "..." : ""}</p>`;
      elements.chapterList.appendChild(li);
    });
}

function validateChapterForm() {
  if (!currentBookDraftId) {
    return "Save basic info first.";
  }

  if (!elements.chapterTitle.value.trim()) {
    return "Chapter title is required.";
  }

  const number = Number(elements.chapterNumber.value);
  if (!Number.isInteger(number) || number < 1) {
    return "Chapter number must be a positive integer.";
  }

  if (!elements.chapterContent.value.trim()) {
    return "Chapter content is required.";
  }

  const existing = getCurrentBookChapters();
  if (existing.some((chapter) => chapter.number === number)) {
    return "Chapter number already exists.";
  }

  return "";
}

function addChapter() {
  const store = getChapterStore();
  const list = Array.isArray(store[currentBookDraftId]) ? store[currentBookDraftId] : [];

  list.push({
    number: Number(elements.chapterNumber.value),
    title: elements.chapterTitle.value.trim(),
    content: elements.chapterContent.value.trim(),
    createdAt: new Date().toISOString()
  });

  store[currentBookDraftId] = list;
  persistChapterStore(store);
}

function updateMainFileHint() {
  const type = elements.bookType.value;
  const config = getBookTypeConfig(type);
  elements.mainFileHint.textContent = config.label;

  if (type === "epub") {
    elements.mainFileInput.accept = ".epub,application/epub+zip";
    return;
  }

  if (type === "pdf") {
    elements.mainFileInput.accept = ".pdf,application/pdf";
    return;
  }

  elements.mainFileInput.accept = "";
}

function connectDropzone(dropzoneId, inputEl, labelEl) {
  const dropzone = document.getElementById(dropzoneId);
  if (!dropzone) {
    return;
  }

  dropzone.addEventListener("click", () => {
    inputEl.click();
  });

  dropzone.addEventListener("dragover", (event) => {
    event.preventDefault();
    dropzone.classList.add("drag-over");
  });

  dropzone.addEventListener("dragleave", () => {
    dropzone.classList.remove("drag-over");
  });

  dropzone.addEventListener("drop", (event) => {
    event.preventDefault();
    dropzone.classList.remove("drag-over");

    if (!event.dataTransfer?.files?.length) {
      return;
    }

    inputEl.files = event.dataTransfer.files;
    labelEl.textContent = inputEl.files[0]?.name || "No file selected";
  });

  inputEl.addEventListener("change", () => {
    labelEl.textContent = inputEl.files?.[0]?.name || "No file selected";
  });
}

function bindEvents() {
  elements.logoutBtn.addEventListener("click", () => {
    localStorage.removeItem(ADMIN_AUTH_KEY);
    window.location.href = "admin-login.html";
  });

  elements.bookType.addEventListener("change", () => {
    updateMainFileHint();
    if (elements.bookType.value !== "chapters") {
      elements.chapterBuilder.classList.add("hidden");
    }
  });

  elements.uploadForm.addEventListener("submit", (event) => {
    event.preventDefault();
    elements.formError.textContent = "";

    const error = validateUploadForm();
    if (error) {
      elements.formError.textContent = error;
      return;
    }

    const payload = serializeBasicForm();
    currentBookDraftId = payload.id;
    persistBookDraft(payload);

    if (payload.bookType === "chapters") {
      elements.chapterBuilder.classList.remove("hidden");
      renderChapterList();
      showToast("Basic info saved. You can add chapters now.");
      return;
    }

    elements.chapterBuilder.classList.add("hidden");
    showToast("Book saved successfully.");
  });

  elements.chapterForm.addEventListener("submit", (event) => {
    event.preventDefault();
    elements.chapterError.textContent = "";

    const error = validateChapterForm();
    if (error) {
      elements.chapterError.textContent = error;
      return;
    }

    addChapter();
    renderChapterList();
    elements.chapterTitle.value = "";
    elements.chapterNumber.value = "";
    elements.chapterContent.value = "";
    showToast("Chapter added.");
  });

  connectDropzone("coverDropzone", elements.coverInput, elements.coverFileName);
  connectDropzone("mainDropzone", elements.mainFileInput, elements.mainFileName);
  connectDropzone("audiobookDropzone", elements.audiobookInput, elements.audiobookFileName);
  connectDropzone("sampleAudioDropzone", elements.sampleAudioInput, elements.sampleAudioFileName);
}

function bootstrap() {
  if (!requireAuth()) {
    return;
  }
  updateMainFileHint();
  bindEvents();
}

bootstrap();
