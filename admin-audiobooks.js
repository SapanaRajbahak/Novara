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
  bookPicker: document.getElementById("bookPicker"),
  bookPickerBtn: document.getElementById("bookPickerBtn"),
  bookPickerMenu: document.getElementById("bookPickerMenu"),
  refreshBtn: document.getElementById("refreshBtn"),
  pageMessage: document.getElementById("pageMessage"),
  formHeading: document.getElementById("formHeading"),
  formMode: document.getElementById("formMode"),
  trackForm: document.getElementById("trackForm"),
  trackTitleInput: document.getElementById("trackTitleInput"),
  audioUrlInput: document.getElementById("audioUrlInput"),
  orderInput: document.getElementById("orderInput"),
  durationInput: document.getElementById("durationInput"),
  chapterIdSelect: document.getElementById("chapterIdSelect"),
  saveTrackBtn: document.getElementById("saveTrackBtn"),
  cancelEditBtn: document.getElementById("cancelEditBtn"),
  formMessage: document.getElementById("formMessage"),
  trackSummary: document.getElementById("trackSummary"),
  tracksTableBody: document.getElementById("tracksTableBody"),
};

const state = {
  books: [],
  selectedBookId: "",
  chapters: [],
  tracks: [],
  editingTrackId: null,
  isLoading: false,
};

function showToast(message) {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  document.body.appendChild(toast);
  window.setTimeout(() => toast.remove(), 1600);
}

function requirePageAuth() {
  const auth = localStorage.getItem(ADMIN_AUTH_KEY);
  if (auth !== "1") {
    const next = encodeURIComponent("admin-audiobooks.html");
    window.location.href = `admin-login.html?next=${next}`;
    return false;
  }
  return true;
}

function setPageMessage(text, tone = "info") {
  elements.pageMessage.textContent = text;
  elements.pageMessage.dataset.tone = tone;
}

function setFormMessage(text, tone = "info") {
  elements.formMessage.textContent = text;
  elements.formMessage.dataset.tone = tone;
}

function setBusyState(busy) {
  state.isLoading = busy;
  elements.bookPickerBtn.disabled = busy;
  elements.refreshBtn.disabled = busy;
  elements.saveTrackBtn.disabled = busy;
  elements.cancelEditBtn.disabled = busy && !state.editingTrackId;
}

async function apiFetch(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    credentials: "include",
    cache: "no-store",
    ...options,
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch (error) {
    payload = null;
  }

  return { response, payload };
}

function toUiStatus(status) {
  return status === "PUBLISHED" ? "Published" : "Draft";
}

function toStatusClass(status) {
  return status === "PUBLISHED" ? "published" : "draft";
}

function renderSelectedBookLabel() {
  if (!state.selectedBookId) {
    elements.bookPickerBtn.innerHTML = "<span>Select a book</span>";
    return;
  }

  const selectedBook = state.books.find((book) => book.id === state.selectedBookId);
  if (!selectedBook) {
    elements.bookPickerBtn.innerHTML = "<span>Select a book</span>";
    return;
  }

  elements.bookPickerBtn.innerHTML = `
    <span class="picker-label">${selectedBook.title}</span>
    <span class="book-status-chip ${toStatusClass(selectedBook.status)}">${toUiStatus(selectedBook.status)}</span>
  `;
}

function renderBookOptions() {
  elements.bookPickerMenu.innerHTML = "";

  if (!state.books.length) {
    elements.bookPickerBtn.disabled = true;
    elements.bookPickerBtn.innerHTML = "<span>No books available</span>";
    return;
  }

  if (!state.selectedBookId) {
    state.selectedBookId = state.books[0].id;
  }

  elements.bookPickerBtn.disabled = false;

  state.books.forEach((book) => {
    const option = document.createElement("button");
    option.type = "button";
    option.className = `picker-option ${book.id === state.selectedBookId ? "active" : ""}`;
    option.setAttribute("role", "option");
    option.dataset.bookId = book.id;
    option.innerHTML = `
      <span class="picker-option-label">${book.title}</span>
      <span class="book-status-chip ${toStatusClass(book.status)}">${toUiStatus(book.status)}</span>
    `;
    elements.bookPickerMenu.appendChild(option);
  });

  renderSelectedBookLabel();
}

function toggleBookPicker(open) {
  const shouldOpen = typeof open === "boolean" ? open : elements.bookPickerMenu.classList.contains("hidden");
  elements.bookPickerMenu.classList.toggle("hidden", !shouldOpen);
  elements.bookPickerBtn.setAttribute("aria-expanded", String(shouldOpen));
}

function renderChapterOptions() {
  const options = [
    `<option value="">No chapter linked</option>`,
    ...state.chapters.map(
      (chapter) => `<option value="${chapter.id}">Chapter ${chapter.chapterNumber}: ${chapter.title}</option>`
    ),
  ];

  elements.chapterIdSelect.innerHTML = options.join("");
}

function formatDuration(seconds) {
  const value = Number(seconds);
  if (!Number.isFinite(value) || value <= 0) {
    return "--";
  }

  return `${value}s`;
}

function getChapterLabel(track) {
  if (track.chapter && track.chapter.title) {
    return `Chapter ${track.chapter.chapterNumber}: ${track.chapter.title}`;
  }

  if (!track.chapterId) {
    return "Not linked";
  }

  const chapter = state.chapters.find((item) => item.id === track.chapterId);
  if (!chapter) {
    return "Linked chapter unavailable";
  }

  return `Chapter ${chapter.chapterNumber}: ${chapter.title}`;
}

function renderTracksTable() {
  elements.tracksTableBody.innerHTML = "";
  elements.trackSummary.textContent = `${state.tracks.length} tracks`;

  if (!state.tracks.length) {
    elements.tracksTableBody.innerHTML = `
      <tr>
        <td colspan="8">No audio tracks yet for this book. Use the form to create one.</td>
      </tr>
    `;
    return;
  }

  state.tracks.forEach((track) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${track.order}</td>
      <td>${track.title}</td>
      <td>${getChapterLabel(track)}</td>
      <td>${formatDuration(track.duration)}</td>
      <td><a href="${track.audioUrl}" target="_blank" rel="noopener noreferrer">Open URL</a></td>
      <td><span class="status-pill ok">Ready</span></td>
      <td>
        <button type="button" class="text-btn" data-action="edit" data-id="${track.id}">Edit</button>
        <button type="button" class="text-btn danger" data-action="delete" data-id="${track.id}">Delete</button>
      </td>
    `;
    elements.tracksTableBody.appendChild(tr);
  });
}

function resetForm(defaultOrder = 0) {
  state.editingTrackId = null;
  elements.formHeading.textContent = "Create Audio Track";
  elements.formMode.textContent = "Create mode";
  elements.saveTrackBtn.textContent = "Create Track";
  elements.cancelEditBtn.disabled = true;

  elements.trackTitleInput.value = "";
  elements.audioUrlInput.value = "";
  elements.orderInput.value = String(defaultOrder);
  elements.durationInput.value = "";
  elements.chapterIdSelect.value = "";
  setFormMessage("", "info");
}

function getNextOrderValue() {
  if (!state.tracks.length) {
    return 0;
  }

  const maxOrder = Math.max(...state.tracks.map((track) => Number(track.order) || 0));
  return maxOrder + 1;
}

function startEditTrack(trackId) {
  const track = state.tracks.find((item) => item.id === trackId);
  if (!track) {
    return;
  }

  state.editingTrackId = track.id;
  elements.formHeading.textContent = "Edit Audio Track";
  elements.formMode.textContent = `Editing track #${track.order}`;
  elements.saveTrackBtn.textContent = "Update Track";
  elements.cancelEditBtn.disabled = false;

  elements.trackTitleInput.value = track.title || "";
  elements.audioUrlInput.value = track.audioUrl || "";
  elements.orderInput.value = String(track.order ?? 0);
  elements.durationInput.value = track.duration ? String(track.duration) : "";
  elements.chapterIdSelect.value = track.chapterId || "";
  setFormMessage("You are editing an existing track.", "info");
}

function parseFormPayload() {
  const title = elements.trackTitleInput.value.trim();
  const audioUrl = elements.audioUrlInput.value.trim();
  const order = Number(elements.orderInput.value);
  const durationRaw = elements.durationInput.value.trim();
  const chapterId = elements.chapterIdSelect.value || null;

  if (!title) {
    return { error: "Title is required." };
  }

  if (!audioUrl) {
    return { error: "Audio URL is required." };
  }

  if (!Number.isInteger(order) || order < 0) {
    return { error: "Order must be a non-negative whole number." };
  }

  let duration;
  if (durationRaw.length) {
    duration = Number(durationRaw);
    if (!Number.isFinite(duration) || duration <= 0) {
      return { error: "Duration must be a positive number when provided." };
    }
  }

  const payload = {
    title,
    audioUrl,
    order,
    chapterId,
  };

  if (duration !== undefined) {
    payload.duration = Math.floor(duration);
  }

  return { payload };
}

async function loadBooks() {
  const { response, payload } = await apiFetch(`/api/admin/books?page=1&limit=200&sort=title_asc`);

  if (!response.ok || !payload?.success || !Array.isArray(payload.data)) {
    throw new Error(payload?.error || `Failed to load books (HTTP ${response.status})`);
  }

  state.books = payload.data;
  state.selectedBookId = state.books[0]?.id || "";
}

async function loadChapters(bookId) {
  const { response, payload } = await apiFetch(`/api/books/${encodeURIComponent(bookId)}/chapters`);

  if (!response.ok || !payload?.success || !Array.isArray(payload.data)) {
    throw new Error(payload?.error || `Failed to load chapters (HTTP ${response.status})`);
  }

  state.chapters = payload.data;
}

async function loadTracks(bookId) {
  const { response, payload } = await apiFetch(`/api/books/${encodeURIComponent(bookId)}/audio`);

  if (!response.ok || !payload?.success || !Array.isArray(payload.data)) {
    throw new Error(payload?.error || `Failed to load tracks (HTTP ${response.status})`);
  }

  state.tracks = [...payload.data].sort((a, b) => Number(a.order) - Number(b.order));
}

async function refreshBookData() {
  if (!state.selectedBookId) {
    state.chapters = [];
    state.tracks = [];
    renderChapterOptions();
    renderTracksTable();
    return;
  }

  setBusyState(true);
  setPageMessage("Loading chapters and tracks...", "loading");

  try {
    await Promise.all([
      loadChapters(state.selectedBookId),
      loadTracks(state.selectedBookId),
    ]);

    renderChapterOptions();
    renderTracksTable();
    resetForm(getNextOrderValue());
    setPageMessage("Tracks loaded.", "success");
  } catch (error) {
    state.chapters = [];
    state.tracks = [];
    renderChapterOptions();
    renderTracksTable();

    if (String(error.message || "").includes("HTTP 401") || String(error.message || "").includes("HTTP 403")) {
      setPageMessage("Admin session required. Please sign in again.", "error");
    } else {
      setPageMessage(error.message || "Failed to load book data.", "error");
    }
  } finally {
    setBusyState(false);
  }
}

async function createTrack(payload) {
  const { response, payload: body } = await apiFetch(
    `/api/admin/books/${encodeURIComponent(state.selectedBookId)}/audio`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    }
  );

  if (!response.ok || !body?.success) {
    throw new Error(body?.error || `Failed to create track (HTTP ${response.status})`);
  }
}

async function updateTrack(trackId, payload) {
  const { response, payload: body } = await apiFetch(`/api/admin/audio/${encodeURIComponent(trackId)}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok || !body?.success) {
    throw new Error(body?.error || `Failed to update track (HTTP ${response.status})`);
  }
}

async function deleteTrack(trackId) {
  const { response, payload } = await apiFetch(`/api/admin/audio/${encodeURIComponent(trackId)}`, {
    method: "DELETE",
  });

  if (!response.ok || !payload?.success) {
    throw new Error(payload?.error || `Failed to delete track (HTTP ${response.status})`);
  }
}

async function handleSubmit(event) {
  event.preventDefault();

  if (!state.selectedBookId) {
    setFormMessage("Select a book first.", "error");
    return;
  }

  const { payload, error } = parseFormPayload();
  if (error) {
    setFormMessage(error, "error");
    return;
  }

  setBusyState(true);
  setFormMessage(state.editingTrackId ? "Updating track..." : "Creating track...", "loading");

  try {
    if (state.editingTrackId) {
      await updateTrack(state.editingTrackId, payload);
      showToast("Track updated");
    } else {
      await createTrack(payload);
      showToast("Track created");
    }

    await refreshBookData();
    setFormMessage("Saved successfully.", "success");
  } catch (submitError) {
    setFormMessage(submitError.message || "Failed to save track.", "error");
  } finally {
    setBusyState(false);
  }
}

async function handleDelete(trackId) {
  const track = state.tracks.find((item) => item.id === trackId);
  if (!track) {
    return;
  }

  const confirmed = window.confirm(`Delete track \"${track.title}\" (order ${track.order})?`);
  if (!confirmed) {
    return;
  }

  setBusyState(true);
  setPageMessage("Deleting track...", "loading");

  try {
    await deleteTrack(trackId);
    showToast("Track deleted");
    await refreshBookData();
    setPageMessage("Track deleted.", "success");
  } catch (error) {
    setPageMessage(error.message || "Failed to delete track.", "error");
  } finally {
    setBusyState(false);
  }
}

function bindEvents() {
  elements.logoutBtn.addEventListener("click", () => {
    localStorage.removeItem(ADMIN_AUTH_KEY);
    window.location.href = "index.html";
  });

  elements.bookPickerBtn.addEventListener("click", () => {
    if (!state.books.length || state.isLoading) {
      return;
    }
    toggleBookPicker();
  });

  elements.bookPickerMenu.addEventListener("click", async (event) => {
    const option = event.target.closest("button[data-book-id]");
    if (!option) {
      return;
    }

    const nextBookId = option.dataset.bookId;
    if (!nextBookId || nextBookId === state.selectedBookId) {
      toggleBookPicker(false);
      return;
    }

    state.selectedBookId = nextBookId;
    renderBookOptions();
    toggleBookPicker(false);
    await refreshBookData();
  });

  document.addEventListener("click", (event) => {
    if (!elements.bookPicker.contains(event.target)) {
      toggleBookPicker(false);
    }
  });

  elements.refreshBtn.addEventListener("click", async () => {
    await refreshBookData();
  });

  elements.trackForm.addEventListener("submit", handleSubmit);

  elements.cancelEditBtn.addEventListener("click", () => {
    resetForm(getNextOrderValue());
    setFormMessage("Switched to create mode.", "info");
  });

  elements.tracksTableBody.addEventListener("click", async (event) => {
    const editButton = event.target.closest("button[data-action='edit'][data-id]");
    if (editButton) {
      startEditTrack(editButton.dataset.id);
      return;
    }

    const deleteButton = event.target.closest("button[data-action='delete'][data-id]");
    if (deleteButton) {
      await handleDelete(deleteButton.dataset.id);
    }
  });
}

async function bootstrap() {
  if (!requirePageAuth()) {
    return;
  }

  bindEvents();
  setBusyState(true);
  setPageMessage("Loading books...", "loading");

  try {
    await loadBooks();
    renderBookOptions();

    if (!state.selectedBookId) {
      setPageMessage("No books available. Create or publish a book first.", "error");
      renderChapterOptions();
      renderTracksTable();
      return;
    }

    await refreshBookData();
  } catch (error) {
    setPageMessage(error.message || "Failed to load audiobook admin data.", "error");
  } finally {
    setBusyState(false);
  }
}

bootstrap();

