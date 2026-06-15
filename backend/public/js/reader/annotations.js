const API_BASE_URL = (window.NovaraSession && window.NovaraSession.API_BASE_URL) || "https://novara-6s67.onrender.com";

function readerScoped(segment) {
  if (window.NovaraSession && typeof window.NovaraSession.readerDataKey === "function") {
    return window.NovaraSession.readerDataKey(segment);
  }
  const uid = localStorage.getItem("novara.userId") || "guest";
  return `novara.reader.u.${uid}.${segment}`;
}

// Inline fallbacks — app.js is not loaded on this page
function getCurrentUserId() {
  return localStorage.getItem("novara.userId") || "guest";
}
function getBookmarks() {
  try {
    return JSON.parse(localStorage.getItem(readerScoped("bookmarks")) || "[]");
  } catch (e) {
    return [];
  }
}
function setBookmarks(entries) {
  localStorage.setItem(readerScoped("bookmarks"), JSON.stringify(entries));
}
const elements = {
  bookFilter: document.getElementById("bookFilter"),
  bookmarksList: document.getElementById("bookmarksList"),
  highlightsList: document.getElementById("highlightsList"),
  notesList: document.getElementById("notesList"),
  bookmarksCount: document.getElementById("bookmarksCount"),
  highlightsCount: document.getElementById("highlightsCount"),
  notesCount: document.getElementById("notesCount")
};

const state = {
  selectedBook: "all",
  bookmarks: [],
  highlights: [],
  notes: []
};

const ACTION_LABELS = {
  bookmarks: {
    edit: "Edit label",
    remove: "Delete bookmark",
  },
  highlights: {
    edit: "Edit note",
    remove: "Delete highlight",
  },
  notes: {
    edit: "Edit note",
    remove: "Delete note",
  },
};

function formatDate(iso) {
  if (!iso) {
    return "Date unavailable";
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "Date unavailable";
  }
  return date.toLocaleString([], { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function createCoverSvg(title, genre) {
  const initials = title
    .split(" ")
    .map((word) => word[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const palette = {
    Mystery: ["#23323f", "#46667b"],
    Fantasy: ["#553458", "#9d6aa6"],
    Thriller: ["#3f2a1b", "#ab6a3a"],
    Romance: ["#6a3047", "#bf6e91"],
    "Sci-Fi": ["#1f3d55", "#53a2d8"],
    Historical: ["#4f412d", "#a58a5a"],
    Drama: ["#3f3348", "#8672a1"],
    Adventure: ["#2b4337", "#5f9267"],
    default: ["#2d3b3a", "#608982"]
  };

  const [c1, c2] = palette[genre] || palette.default;
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='220' height='300'>
    <defs>
      <linearGradient id='g' x1='0' x2='1' y1='0' y2='1'>
        <stop offset='0%' stop-color='${c1}'/>
        <stop offset='100%' stop-color='${c2}'/>
      </linearGradient>
    </defs>
    <rect width='100%' height='100%' rx='16' fill='url(#g)'/>
    <rect x='14' y='16' width='192' height='268' rx='12' fill='rgba(255,255,255,0.10)'/>
    <text x='50%' y='56%' dominant-baseline='middle' text-anchor='middle' fill='rgba(255,255,255,0.92)' font-family='Arial' font-size='52' font-weight='700'>${initials}</text>
  </svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function getBookMeta(item) {
  const book = item.book || {};
  return {
    id: book.id || item.bookId,
    title: book.title || item.bookTitle || "Unknown Book",
    genre: book.genre || item.bookGenre || "default",
  };
}

async function apiRequest(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    cache: "no-store",
    credentials: "include",
    ...options,
    headers: {
      ...(options.headers || {}),
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
  });

  const payload = await response.json().catch(() => ({ success: false }));

  if (response.status === 401 || response.status === 403) {
    window.location.href = "/index.html";
    throw new Error("Authentication required");
  }

  if (!response.ok || !payload.success) {
    throw new Error(payload.error || `HTTP ${response.status}`);
  }

  return payload;
}

function findSourceItem(type, id) {
  const list = Array.isArray(state[type]) ? state[type] : [];
  return list.find((item) => item.id === id) || null;
}

// Use localStorage fallback for bookmarks if backend is not ready
function loadAnnotationsData() {
  const userId = getCurrentUserId();
  state.bookmarks = getBookmarks().filter(e => e.userId === userId);
}

function reloadAndRender() {
  const previousFilter = state.selectedBook;
  loadAnnotationsData();
  populateBookFilter();
  const selectedStillExists = elements.bookFilter.querySelector(`option[value="${previousFilter}"]`);
  state.selectedBook = selectedStillExists ? previousFilter : "all";
  elements.bookFilter.value = state.selectedBook;
  renderAll();
}

function updateAnnotation(type, item, value) {
  if (!item) return;
  if (type === 'bookmarks') {
    let entries = getBookmarks();
    entries = entries.map(e => (e.id === item.id ? { ...e, note: value } : e));
    setBookmarks(entries);
    reloadAndRender();
  }
}

function deleteAnnotation(type, item) {
  if (!item) return;
  if (type === 'bookmarks') {
    let entries = getBookmarks();
    entries = entries.filter(e => e.id !== item.id);
    setBookmarks(entries);
    reloadAndRender();
  }
}

function handleItemAction(type, action, id) {
  const item = findSourceItem(type, id);
  if (!item) return;
  if (action === "edit") {
    const promptLabel = type === "bookmarks" ? "Update bookmark label:" : "Update note:";
    const currentValue = type === "bookmarks" ? item.snippet : item.note;
    const input = window.prompt(promptLabel, currentValue === "-" ? "" : currentValue);
    if (input === null) return;
    const nextValue = input.trim();
    if (type === "notes" && !nextValue) {
      window.alert("Note content cannot be empty.");
      return;
    }
    updateAnnotation(type, item, nextValue);
    return;
  }
  if (action === "remove") {
    const confirmed = window.confirm(`Are you sure you want to ${ACTION_LABELS[type].remove.toLowerCase()}?`);
    if (!confirmed) return;
    deleteAnnotation(type, item);
  }
}

function createItemCard(item, type) {
  const book = getBookMeta(item);
  const chapterLabel = item.chapterNumber ? `Chapter ${item.chapterNumber}` : "Chapter unavailable";
  const actionConfig = ACTION_LABELS[type] || ACTION_LABELS.notes;
  const card = document.createElement("article");
  card.className = "item";
  card.innerHTML = `
    <div class="item-head">
      <img class="thumb" src="${createCoverSvg(book.title, book.genre)}" alt="${book.title} cover" loading="lazy" />
      <div>
        <h3>${book.title}</h3>
        <p class="meta">${chapterLabel}</p>
      </div>
    </div>

    <div>
      <p class="label">Highlighted Text</p>
      <p class="snippet">${item.snippet}</p>
    </div>

    <div>
      <p class="label">Note</p>
      <p class="note">${item.note}</p>
    </div>

    <div class="item-footer">
      <span class="date">${formatDate(item.dateSaved)}</span>
      <div class="item-actions">
        <a class="jump-btn" href="${item.jumpUrl}">${type === "bookmarks" ? "Jump to Bookmark" : "Open in Reader"}</a>
        <button class="secondary-btn" data-action="edit" data-type="${type}" data-id="${item.id}" type="button">${actionConfig.edit}</button>
        <button class="danger-btn" data-action="remove" data-type="${type}" data-id="${item.id}" type="button">Delete</button>
      </div>
    </div>
  `;
  return card;
}

function renderEmpty(container, message) {
  container.innerHTML = `<div class="empty">${message}</div>`;
}

function filterByBook(items) {
  if (state.selectedBook === "all") {
    return items;
  }
  return items.filter((item) => item.bookId === state.selectedBook);
}

function renderSection(container, countNode, items, type, emptyMessage) {
  const filtered = filterByBook(items);
  countNode.textContent = String(filtered.length);
  container.innerHTML = "";

  if (!filtered.length) {
    renderEmpty(container, emptyMessage);
    return;
  }

  filtered.forEach((item) => container.appendChild(createItemCard(item, type)));
}

function populateBookFilter() {
  const uniqueIds = new Set(
    state.bookmarks.map((item) => item.bookId)
      .concat(state.highlights.map((item) => item.bookId))
      .concat(state.notes.map((item) => item.bookId))
  );

  const options = ["<option value=\"all\">All Books</option>"];
  [...uniqueIds].sort((a, b) => {
    const first = state.bookmarks.find((item) => item.bookId === a)
      || state.highlights.find((item) => item.bookId === a)
      || state.notes.find((item) => item.bookId === a);
    const second = state.bookmarks.find((item) => item.bookId === b)
      || state.highlights.find((item) => item.bookId === b)
      || state.notes.find((item) => item.bookId === b);
    return getBookMeta(first).title.localeCompare(getBookMeta(second).title);
  }).forEach((bookId) => {
    const source = state.bookmarks.find((item) => item.bookId === bookId)
      || state.highlights.find((item) => item.bookId === bookId)
      || state.notes.find((item) => item.bookId === bookId);
    options.push(`<option value=\"${bookId}\">${getBookMeta(source).title}</option>`);
  });

  elements.bookFilter.innerHTML = options.join("");
}

function renderAll() {
  renderSection(
    elements.bookmarksList,
    elements.bookmarksCount,
    state.bookmarks,
    "bookmarks",
    "No bookmarks found for this filter."
  );

  renderSection(
    elements.highlightsList,
    elements.highlightsCount,
    state.highlights,
    "highlights",
    "No highlights found for this filter."
  );

  renderSection(
    elements.notesList,
    elements.notesCount,
    state.notes,
    "notes",
    "No notes found for this filter."
  );
}

function bindEvents() {
  elements.bookFilter.addEventListener("change", () => {
    state.selectedBook = elements.bookFilter.value;
    renderAll();
  });

  [elements.bookmarksList, elements.highlightsList, elements.notesList].forEach((container) => {
    container.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-action][data-type][data-id]");
      if (!button) {
        return;
      }

      const action = button.dataset.action;
      const type = button.dataset.type;
      const id = button.dataset.id;
      handleItemAction(type, action, id);
    });
  });
}

async function bootstrap() {
  if (window.NovaraSession && typeof window.NovaraSession.fetchCurrentUser === "function") {
    await window.NovaraSession.fetchCurrentUser();
  }
  try {
    loadAnnotationsData();
  } catch (error) {
    state.bookmarks = [];
    state.highlights = [];
    state.notes = [];
  }
  populateBookFilter();
  bindEvents();
  renderAll();
}

bootstrap();

