const BOOKMARK_KEY = "novelread.reader.bookmarks";
const NOTES_KEY = "novelread.reader.notes";

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
  booksById: {},
  selectedBook: "all",
  bookmarks: [],
  highlights: [],
  notes: []
};

function loadJsonStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (error) {
    return fallback;
  }
}

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

function normalizeBook(book) {
  if (!book || !book.id) {
    return null;
  }

  return {
    id: book.id,
    title: book.title || "Unknown Book",
    genre: Array.isArray(book.genre) ? book.genre[0] || "default" : (book.genre || "default")
  };
}

async function loadBookMeta() {
  const sources = ["./data/book-details.json", "./data/library.json", "./data/discover.json", "./data/reader-content.json"];

  for (const source of sources) {
    try {
      const response = await fetch(source, { cache: "no-store" });
      if (!response.ok) {
        continue;
      }
      const data = await response.json();
      const books = Array.isArray(data.books) ? data.books : [];
      books.forEach((book) => {
        const normalized = normalizeBook(book);
        if (normalized && !state.booksById[normalized.id]) {
          state.booksById[normalized.id] = normalized;
        }
      });
    } catch (error) {
      continue;
    }
  }
}

function getBookMeta(bookId) {
  return state.booksById[bookId] || { id: bookId, title: bookId.replace(/^book-/, "").replace(/-/g, " "), genre: "default" };
}

function mapBookmarks() {
  const bookmarksMap = loadJsonStorage(BOOKMARK_KEY, {});
  const items = [];

  Object.entries(bookmarksMap).forEach(([key, value]) => {
    const bookId = String(key).replace(/^book:/, "");
    const chapter = Number(value.chapterIndex || 0) + 1;
    items.push({
      bookId,
      chapter,
      snippet: "Bookmark saved at this chapter position.",
      note: "-",
      dateSaved: value.createdAt || null,
      jumpUrl: `reader.html?book=${encodeURIComponent(bookId)}&chapter=${encodeURIComponent(chapter)}`
    });
  });

  items.sort((a, b) => new Date(b.dateSaved || 0).getTime() - new Date(a.dateSaved || 0).getTime());
  return items;
}

function mapHighlightsAndNotes() {
  const notesMap = loadJsonStorage(NOTES_KEY, {});
  const highlights = [];
  const notes = [];

  Object.entries(notesMap).forEach(([key, list]) => {
    const bookId = String(key).replace(/^book:/, "");
    if (!Array.isArray(list)) {
      return;
    }

    list.forEach((entry) => {
      const chapter = Number(entry.chapterNumber || 1);
      const item = {
        bookId,
        chapter,
        snippet: entry.selectedText || "No highlighted text",
        note: entry.noteText || "-",
        dateSaved: entry.createdAt || null,
        jumpUrl: `reader.html?book=${encodeURIComponent(bookId)}&chapter=${encodeURIComponent(chapter)}`
      };

      if (entry.highlighted) {
        highlights.push(item);
      }

      if (entry.noteText && entry.noteText.trim()) {
        notes.push(item);
      }
    });
  });

  const byDate = (a, b) => new Date(b.dateSaved || 0).getTime() - new Date(a.dateSaved || 0).getTime();
  highlights.sort(byDate);
  notes.sort(byDate);

  return { highlights, notes };
}

function createItemCard(item, type) {
  const book = getBookMeta(item.bookId);
  const card = document.createElement("article");
  card.className = "item";
  card.innerHTML = `
    <div class="item-head">
      <img class="thumb" src="${createCoverSvg(book.title, book.genre)}" alt="${book.title} cover" loading="lazy" />
      <div>
        <h3>${book.title}</h3>
        <p class="meta">Chapter ${item.chapter}</p>
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
      <a class="jump-btn" href="${item.jumpUrl}">${type === "bookmarks" ? "Jump to Bookmark" : "Open in Reader"}</a>
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
  [...uniqueIds].sort((a, b) => getBookMeta(a).title.localeCompare(getBookMeta(b).title)).forEach((bookId) => {
    options.push(`<option value=\"${bookId}\">${getBookMeta(bookId).title}</option>`);
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
}

async function bootstrap() {
  await loadBookMeta();
  state.bookmarks = mapBookmarks();
  const grouped = mapHighlightsAndNotes();
  state.highlights = grouped.highlights;
  state.notes = grouped.notes;
  populateBookFilter();
  bindEvents();
  renderAll();
}

bootstrap();
