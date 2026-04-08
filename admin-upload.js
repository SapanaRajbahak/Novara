const ADMIN_AUTH_KEY = "novara.admin.auth";
function resolveApiBaseUrl() {
  const explicitBase = window.localStorage.getItem("Novara.apiBaseUrl");
  if (explicitBase) {
    return explicitBase.replace(/\/$/, "");
  }

  const isFileProtocol = window.location.protocol === "file:";
  const protocol = isFileProtocol ? "http:" : window.location.protocol;
  const host = !isFileProtocol && window.location.hostname ? window.location.hostname : "localhost";
  return `${protocol}//${host}:5002`;
}

const API_BASE_URL = resolveApiBaseUrl();

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
let currentBookStatus = "DRAFT";
let currentChapters = [];

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

function renderChapterList() {
  const chapters = [...currentChapters];
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
    return "Create the book first.";
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

  if (currentChapters.some((chapter) => chapter.number === number)) {
    return "Chapter number already exists.";
  }

  return "";
}

function mapBookType(type) {
  if (type === "epub") {
    return "EPUB";
  }
  if (type === "pdf") {
    return "PDF";
  }
  return "TXT";
}

function mapStatus(status) {
  return String(status).toLowerCase() === "published" ? "PUBLISHED" : "DRAFT";
}

function readFileAsDataUrl(file) {
  if (!file) {
    return Promise.resolve(null);
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
    reader.onerror = () => reject(new Error(`Unable to read ${file.name}`));
    reader.readAsDataURL(file);
  });
}

async function apiFetch(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    credentials: "include",
    cache: "no-store",
    ...options,
  });

  const payload = await response.json().catch(() => ({ success: false }));
  if (response.status === 401 || response.status === 403) {
    localStorage.removeItem(ADMIN_AUTH_KEY);
    const next = encodeURIComponent("admin-upload.html");
    window.location.href = `admin-login.html?next=${next}`;
    throw new Error("Authentication required");
  }

  if (!response.ok || !payload.success) {
    throw new Error(payload.error || `HTTP ${response.status}`);
  }

  return payload;
}

async function createBookPayload() {
  const tags = elements.tags.value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);

  const [coverUrl, fileUrl, audiobookUrl] = await Promise.all([
    readFileAsDataUrl(elements.coverInput.files?.[0] || null),
    readFileAsDataUrl(elements.mainFileInput.files?.[0] || null),
    readFileAsDataUrl(elements.audiobookInput.files?.[0] || null),
  ]);

  return {
    payload: {
      title: elements.title.value.trim(),
      authorName: elements.author.value.trim(),
      description: elements.description.value.trim(),
      genre: elements.genre.value,
      tags,
      status: mapStatus(elements.status.value),
      fileType: mapBookType(elements.bookType.value),
      coverUrl,
      fileUrl,
      isAudiobookAvailable: Boolean(audiobookUrl),
      isAiGenerated: false,
    },
    audiobookUrl,
  };
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
    window.location.href = "index.html";
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

    const run = async () => {
      const error = validateUploadForm();
      if (error) {
        elements.formError.textContent = error;
        return;
      }

      try {
        const { payload, audiobookUrl } = await createBookPayload();
        const createResult = await apiFetch("/api/admin/books", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });

        currentBookDraftId = createResult.data.id;
        currentBookStatus = payload.status;
        currentChapters = [];

        if (audiobookUrl) {
          await apiFetch(`/api/admin/books/${encodeURIComponent(currentBookDraftId)}/audio`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              title: `${payload.title} Audio`,
              audioUrl: audiobookUrl,
              order: 1,
            }),
          });
        }

        if (elements.bookType.value === "chapters") {
          elements.chapterBuilder.classList.remove("hidden");
          renderChapterList();
          showToast("Book created. You can add chapters now.");
          return;
        }

        elements.chapterBuilder.classList.add("hidden");
        showToast("Book saved successfully.");
        window.setTimeout(() => {
          window.location.href = "admin-books.html";
        }, 900);
      } catch (requestError) {
        elements.formError.textContent = requestError.message || "Unable to save book.";
      }
    };

    run();
  });

  elements.chapterForm.addEventListener("submit", (event) => {
    event.preventDefault();
    elements.chapterError.textContent = "";

    const run = async () => {
      const error = validateChapterForm();
      if (error) {
        elements.chapterError.textContent = error;
        return;
      }

      try {
        const payload = {
          chapterNumber: Number(elements.chapterNumber.value),
          title: elements.chapterTitle.value.trim(),
          content: elements.chapterContent.value.trim(),
          isPublished: currentBookStatus === "PUBLISHED",
        };

        const result = await apiFetch(`/api/admin/books/${encodeURIComponent(currentBookDraftId)}/chapters`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });

        currentChapters.push({
          id: result.data.id,
          number: result.data.chapterNumber,
          title: result.data.title,
          content: payload.content,
          createdAt: result.data.createdAt,
        });

        renderChapterList();
        elements.chapterTitle.value = "";
        elements.chapterNumber.value = "";
        elements.chapterContent.value = "";
        showToast("Chapter added.");
      } catch (requestError) {
        elements.chapterError.textContent = requestError.message || "Unable to add chapter.";
      }
    };

    run();
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

