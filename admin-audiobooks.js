const ADMIN_AUTH_KEY = "novelread.admin.auth";
const BOOKS_STORE_KEY = "novelread.admin.uploadedBooks";
const CHAPTERS_STORE_KEY = "novelread.admin.chapterDrafts";
const AUDIO_STORE_KEY = "novelread.admin.audioLibrary";

const elements = {
  logoutBtn: document.getElementById("logoutBtn"),
  bookSelect: document.getElementById("bookSelect"),
  fullAudioInput: document.getElementById("fullAudioInput"),
  fullDropzone: document.getElementById("fullDropzone"),
  fullAudioName: document.getElementById("fullAudioName"),
  saveFullBtn: document.getElementById("saveFullBtn"),
  removeFullBtn: document.getElementById("removeFullBtn"),
  chapterList: document.getElementById("chapterList"),
  matchSummary: document.getElementById("matchSummary"),
  editorHint: document.getElementById("editorHint"),
  chapterAudioInput: document.getElementById("chapterAudioInput"),
  chapterDropzone: document.getElementById("chapterDropzone"),
  chapterAudioName: document.getElementById("chapterAudioName"),
  saveTrackBtn: document.getElementById("saveTrackBtn"),
  deleteTrackBtn: document.getElementById("deleteTrackBtn"),
  trackTitleInput: document.getElementById("trackTitleInput"),
  narratorInput: document.getElementById("narratorInput"),
  durationInput: document.getElementById("durationInput"),
  saveMetaBtn: document.getElementById("saveMetaBtn"),
  message: document.getElementById("message"),
  tracksTableBody: document.getElementById("tracksTableBody"),
  previewPlayer: document.getElementById("previewPlayer"),
  previewInfo: document.getElementById("previewInfo")
};

const state = {
  books: [],
  selectedBookId: "",
  selectedChapterNumber: 0,
  tempUrls: {}
};

function requireAuth() {
  const auth = localStorage.getItem(ADMIN_AUTH_KEY);
  if (auth !== "1") {
    const next = encodeURIComponent("admin-audiobooks.html");
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

function getChaptersByBook(bookId) {
  const store = readJson(CHAPTERS_STORE_KEY, {});
  const list = Array.isArray(store[bookId]) ? store[bookId] : [];
  const sorted = [...list].sort((a, b) => Number(a.number) - Number(b.number));

  if (sorted.length) {
    return sorted.map((chapter) => ({ number: Number(chapter.number), title: chapter.title || `Chapter ${chapter.number}` }));
  }

  return [
    { number: 1, title: "Chapter 1" },
    { number: 2, title: "Chapter 2" },
    { number: 3, title: "Chapter 3" }
  ];
}

function getAudioStore() {
  return readJson(AUDIO_STORE_KEY, {});
}

function saveAudioStore(store) {
  writeJson(AUDIO_STORE_KEY, store);
}

function ensureBookAudio(bookId) {
  const store = getAudioStore();
  if (!store[bookId]) {
    store[bookId] = {
      fullAudiobook: null,
      tracksByChapter: {}
    };
    saveAudioStore(store);
  }
  return store;
}

function getBookAudioData(bookId) {
  const store = ensureBookAudio(bookId);
  return store[bookId];
}

function setMessage(text) {
  elements.message.textContent = text;
}

function connectDropzone(dropzone, input, labelEl) {
  dropzone.addEventListener("click", () => input.click());

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
    input.files = event.dataTransfer.files;
    labelEl.textContent = input.files[0]?.name || "No file selected";
  });

  input.addEventListener("change", () => {
    labelEl.textContent = input.files?.[0]?.name || "No file selected";
  });
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
  const chapters = getChaptersByBook(state.selectedBookId);
  const audioData = getBookAudioData(state.selectedBookId);
  const tracks = audioData.tracksByChapter || {};
  elements.chapterList.innerHTML = "";

  let matched = 0;
  chapters.forEach((chapter) => {
    const track = tracks[String(chapter.number)];
    const hasAudio = Boolean(track?.fileName);
    if (hasAudio) {
      matched += 1;
    }

    const li = document.createElement("li");
    li.className = `chapter-item ${chapter.number === state.selectedChapterNumber ? "active" : ""}`;
    li.innerHTML = `
      <button type="button" data-chapter-number="${chapter.number}">
        Chapter ${chapter.number}: ${chapter.title}
      </button>
      <span class="match-pill ${hasAudio ? "ok" : "no"}">${hasAudio ? "Audio matched" : "No audio"}</span>
    `;
    elements.chapterList.appendChild(li);
  });

  elements.matchSummary.textContent = `${matched} / ${chapters.length} matched`;

  if (!state.selectedChapterNumber && chapters.length) {
    state.selectedChapterNumber = chapters[0].number;
  }

  renderEditor();
  renderTracksTable();
}

function getSelectedTrack() {
  const audioData = getBookAudioData(state.selectedBookId);
  return audioData.tracksByChapter?.[String(state.selectedChapterNumber)] || null;
}

function renderEditor() {
  const track = getSelectedTrack();
  elements.editorHint.textContent = `Editing chapter ${state.selectedChapterNumber || "-"}`;

  elements.trackTitleInput.value = track?.title || `Chapter ${state.selectedChapterNumber} Track`;
  elements.narratorInput.value = track?.narrator || "";
  elements.durationInput.value = track?.duration || "";
  elements.chapterAudioName.textContent = track?.fileName || "No file selected";

  const fullAudio = getBookAudioData(state.selectedBookId).fullAudiobook;
  elements.fullAudioName.textContent = fullAudio?.fileName || "No file selected";

  if (track?.tempUrl) {
    elements.previewPlayer.src = track.tempUrl;
    elements.previewInfo.textContent = `Previewing ${track.fileName}`;
  } else {
    elements.previewPlayer.removeAttribute("src");
    elements.previewPlayer.load();
    elements.previewInfo.textContent = "Select a chapter track with a file to preview.";
  }
}

function renderTracksTable() {
  const chapters = getChaptersByBook(state.selectedBookId);
  const tracks = getBookAudioData(state.selectedBookId).tracksByChapter || {};
  elements.tracksTableBody.innerHTML = "";

  chapters.forEach((chapter) => {
    const track = tracks[String(chapter.number)] || null;
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>Chapter ${chapter.number}</td>
      <td>${track?.title || "-"}</td>
      <td>${track?.duration || "--:--"}</td>
      <td><span class="status-pill ${track?.fileName ? "ok" : "no"}">${track?.fileName ? "Matched" : "Missing"}</span></td>
      <td>
        <button type="button" class="text-btn" data-action="select" data-chapter="${chapter.number}">Edit</button>
      </td>
    `;
    elements.tracksTableBody.appendChild(tr);
  });
}

function saveTrackFile() {
  const file = elements.chapterAudioInput.files?.[0] || null;
  if (!file) {
    setMessage("Select an audio file first.");
    return;
  }

  if (!file.type.startsWith("audio/")) {
    setMessage("Invalid file type. Please upload audio.");
    return;
  }

  const store = ensureBookAudio(state.selectedBookId);
  const bookAudio = store[state.selectedBookId];
  const key = String(state.selectedChapterNumber);
  const previous = bookAudio.tracksByChapter?.[key];

  if (previous?.tempUrl) {
    URL.revokeObjectURL(previous.tempUrl);
  }

  const tempUrl = URL.createObjectURL(file);
  state.tempUrls[`${state.selectedBookId}:${key}`] = tempUrl;

  bookAudio.tracksByChapter[key] = {
    ...(previous || {}),
    title: elements.trackTitleInput.value.trim() || `Chapter ${state.selectedChapterNumber} Track`,
    narrator: elements.narratorInput.value.trim(),
    duration: elements.durationInput.value.trim() || "--:--",
    fileName: file.name,
    fileType: file.type,
    updatedAt: new Date().toISOString(),
    tempUrl
  };

  saveAudioStore(store);
  renderChapterList();
  setMessage("Track file saved.");
  showToast("Track uploaded");
}

function saveTrackMeta() {
  const store = ensureBookAudio(state.selectedBookId);
  const bookAudio = store[state.selectedBookId];
  const key = String(state.selectedChapterNumber);
  const existing = bookAudio.tracksByChapter[key] || {};

  bookAudio.tracksByChapter[key] = {
    ...existing,
    title: elements.trackTitleInput.value.trim() || `Chapter ${state.selectedChapterNumber} Track`,
    narrator: elements.narratorInput.value.trim(),
    duration: elements.durationInput.value.trim() || "--:--",
    updatedAt: new Date().toISOString()
  };

  saveAudioStore(store);
  renderTracksTable();
  setMessage("Track metadata saved.");
  showToast("Metadata saved");
}

function deleteTrack() {
  const store = ensureBookAudio(state.selectedBookId);
  const bookAudio = store[state.selectedBookId];
  const key = String(state.selectedChapterNumber);
  const existing = bookAudio.tracksByChapter[key];

  if (!existing) {
    setMessage("No audio to delete for this chapter.");
    return;
  }

  if (existing.tempUrl) {
    URL.revokeObjectURL(existing.tempUrl);
  }

  delete bookAudio.tracksByChapter[key];
  saveAudioStore(store);
  renderChapterList();
  setMessage("Chapter audio deleted.");
  showToast("Audio deleted");
}

function saveFullAudiobook() {
  const file = elements.fullAudioInput.files?.[0] || null;
  if (!file) {
    setMessage("Select a full audiobook file first.");
    return;
  }

  if (!file.type.startsWith("audio/")) {
    setMessage("Invalid full audiobook format.");
    return;
  }

  const store = ensureBookAudio(state.selectedBookId);
  const bookAudio = store[state.selectedBookId];
  const previous = bookAudio.fullAudiobook;
  if (previous?.tempUrl) {
    URL.revokeObjectURL(previous.tempUrl);
  }

  const tempUrl = URL.createObjectURL(file);
  state.tempUrls[`${state.selectedBookId}:full`] = tempUrl;

  bookAudio.fullAudiobook = {
    fileName: file.name,
    fileType: file.type,
    tempUrl,
    updatedAt: new Date().toISOString()
  };

  saveAudioStore(store);
  renderEditor();
  setMessage("Full audiobook saved.");
  showToast("Full audiobook uploaded");
}

function removeFullAudiobook() {
  const store = ensureBookAudio(state.selectedBookId);
  const bookAudio = store[state.selectedBookId];
  if (bookAudio.fullAudiobook?.tempUrl) {
    URL.revokeObjectURL(bookAudio.fullAudiobook.tempUrl);
  }
  bookAudio.fullAudiobook = null;
  saveAudioStore(store);
  renderEditor();
  setMessage("Full audiobook removed.");
}

function bindEvents() {
  elements.logoutBtn.addEventListener("click", () => {
    localStorage.removeItem(ADMIN_AUTH_KEY);
    window.location.href = "admin-login.html";
  });

  elements.bookSelect.addEventListener("change", () => {
    state.selectedBookId = elements.bookSelect.value;
    state.selectedChapterNumber = 0;
    renderChapterList();
    setMessage("Book changed.");
  });

  elements.chapterList.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-chapter-number]");
    if (!button) {
      return;
    }
    state.selectedChapterNumber = Number(button.dataset.chapterNumber);
    renderChapterList();
  });

  elements.tracksTableBody.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action='select'][data-chapter]");
    if (!button) {
      return;
    }
    state.selectedChapterNumber = Number(button.dataset.chapter);
    renderChapterList();
  });

  connectDropzone(elements.fullDropzone, elements.fullAudioInput, elements.fullAudioName);
  connectDropzone(elements.chapterDropzone, elements.chapterAudioInput, elements.chapterAudioName);

  elements.saveTrackBtn.addEventListener("click", saveTrackFile);
  elements.deleteTrackBtn.addEventListener("click", deleteTrack);
  elements.saveMetaBtn.addEventListener("click", saveTrackMeta);
  elements.saveFullBtn.addEventListener("click", saveFullAudiobook);
  elements.removeFullBtn.addEventListener("click", removeFullAudiobook);

  window.addEventListener("beforeunload", () => {
    Object.values(state.tempUrls).forEach((url) => {
      try {
        URL.revokeObjectURL(url);
      } catch (error) {
        return;
      }
    });
  });
}

function bootstrap() {
  if (!requireAuth()) {
    return;
  }

  state.books = getBooks();
  if (!state.books.length) {
    setMessage("No books found. Upload a book first.");
    return;
  }

  state.selectedBookId = state.books[0].id;
  renderBookSelect();
  renderChapterList();
  bindEvents();
}

bootstrap();
