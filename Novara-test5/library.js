function resolveApiBaseUrl() {
  const explicitBase = window.localStorage.getItem("Novara.apiBaseUrl");
  if (explicitBase) {
    try {
      const parsed = new URL(explicitBase);
      const isLocalPage = window.location.protocol === "file:" || ["localhost", "127.0.0.1"].includes(window.location.hostname);
      const isExplicitLocal = ["localhost", "127.0.0.1"].includes(parsed.hostname);

      if (!isLocalPage || isExplicitLocal) {
        return explicitBase.replace(/\/$/, "");
      }
    } catch (error) {
      // Ignore invalid override and fall back to local default.
    }
  }

  const isFileProtocol = window.location.protocol === "file:";
  const protocol = isFileProtocol ? "http:" : window.location.protocol;
  const host = !isFileProtocol && window.location.hostname ? window.location.hostname : "localhost";
  return `${protocol}//${host}:5001`;
}

const API_BASE_URL = resolveApiBaseUrl();
const SAVED_BOOKS_KEY = "novara.savedBooks";
const LOCAL_PROGRESS_KEY = "novara.reader.progress";

const elements = {
  homeLinks: [...document.querySelectorAll("[data-home-link='true']")],
  hubContinueRow: document.getElementById("hubContinueRow"),
  yourLibraryRow: document.getElementById("yourLibraryRow"),
  recommendedRow: document.getElementById("recommendedRow"),
  becauseHeading: document.getElementById("becauseHeading"),
  becauseReadRow: document.getElementById("becauseReadRow"),
  favoritesPanel: document.getElementById("favoritesPanel"),
  favoritesRow: document.getElementById("favoritesRow"),
  hubSearchInput: document.getElementById("hubSearchInput"),
  hubGenreFilter: document.getElementById("hubGenreFilter"),
  hubDiscoverGrid: document.getElementById("hubDiscoverGrid"),
  hubLoadMoreBtn: document.getElementById("hubLoadMoreBtn"),
  statBooksInProgress: document.getElementById("statBooksInProgress"),
  statChaptersRead: document.getElementById("statChaptersRead"),
  statReadingTime: document.getElementById("statReadingTime"),
};

const state = {
  books: [],
  inProgress: [],
  favorites: [],
  yourBooks: [],
  recommended: [],
  becauseYouRead: [],
  becauseAnchor: null,
  savedBookIds: loadSavedBooks(),
  discoverPage: 1,
  discoverPageSize: 8,
  discoverSearch: "",
  discoverGenre: "all",
  isSignedIn: false,
};

function loadSavedBooks() {
  try {
    const parsed = JSON.parse(localStorage.getItem(SAVED_BOOKS_KEY) || "[]");
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch (error) {
    return new Set();
  }
}

function saveSavedBooks() {
  localStorage.setItem(SAVED_BOOKS_KEY, JSON.stringify([...state.savedBookIds]));
}

function readLocalProgressMap() {
  try {
    const parsed = JSON.parse(localStorage.getItem(LOCAL_PROGRESS_KEY) || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    return {};
  }
}

function clampPercent(value) {
  const number = Number(value);
  if (Number.isNaN(number)) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round(number)));
}

function createCoverSvg(title, genre) {
  const initials = String(title || "Book")
    .split(" ")
    .map((word) => word[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const palette = {
    Romance: ["#6a3047", "#bf6e91"],
    Fantasy: ["#553458", "#9d6aa6"],
    Mystery: ["#23323f", "#46667b"],
    Thriller: ["#3f2a1b", "#ab6a3a"],
    "Sci-Fi": ["#1f3d55", "#53a2d8"],
    Historical: ["#4f412d", "#a58a5a"],
    Drama: ["#3f3348", "#8672a1"],
    default: ["#2d3b3a", "#608982"],
  };

  const [c1, c2] = palette[genre] || palette.default;
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='300' height='400'>
    <defs>
      <linearGradient id='g' x1='0' x2='1' y1='0' y2='1'>
        <stop offset='0%' stop-color='${c1}'/>
        <stop offset='100%' stop-color='${c2}'/>
      </linearGradient>
    </defs>
    <rect width='100%' height='100%' rx='22' fill='url(#g)'/>
    <rect x='22' y='24' width='256' height='352' rx='16' fill='rgba(255,255,255,0.10)'/>
    <text x='50%' y='55%' dominant-baseline='middle' text-anchor='middle' fill='rgba(255,255,255,0.9)' font-family='Arial' font-size='62' font-weight='700'>${initials}</text>
  </svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function toAbsoluteCoverUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }

  if (/^(https?:)?\/\//i.test(raw) || raw.startsWith("data:")) {
    return raw;
  }

  return `${API_BASE_URL}${raw.startsWith("/") ? raw : `/${raw}`}`;
}

function normalizeBook(book, index = 0) {
  return {
    id: book.id || `book-${index + 1}`,
    title: book.title || "Untitled",
    authorName: book.authorName || book.author || "Unknown Author",
    genre: book.genre || "General",
    coverUrl: toAbsoluteCoverUrl(book.coverUrl) || createCoverSvg(book.title, book.genre),
  };
}

function createEmptyState(message) {
  const node = document.createElement("div");
  node.className = "empty-state";
  node.innerHTML = `<div><strong>Nothing here yet</strong><p>${message}</p></div>`;
  return node;
}

function syncHomeLinksForAuth(_isSignedIn) {
  // Always route Home to the reader dashboard — it works for both signed-in and guest users.
  elements.homeLinks.forEach((link) => {
    link.setAttribute("href", "reader-dashboard.html");
  });
}

async function ensureSignedInUser() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
      cache: "no-store",
      credentials: "include",
    });

    if (!response.ok) {
      state.isSignedIn = false;
      syncHomeLinksForAuth(false);
      return false;
    }

    const payload = await response.json();
    state.isSignedIn = Boolean(payload.success && payload.user && payload.user.id);
    syncHomeLinksForAuth(state.isSignedIn);
    return state.isSignedIn;
  } catch (error) {
    state.isSignedIn = false;
    syncHomeLinksForAuth(false);
    return false;
  }
}

async function fetchBooks() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/books?page=1&limit=140&sort=newest`, {
      cache: "no-store",
      credentials: "include",
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const payload = await response.json();
    if (!payload.success || !Array.isArray(payload.data)) {
      throw new Error("Invalid books payload");
    }

    return payload.data.map(normalizeBook);
  } catch (error) {
    console.warn("Library could not load book catalog:", error);
    return [];
  }
}

async function fetchReadingProgress(bookId) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/progress/reading/${encodeURIComponent(bookId)}`, {
      cache: "no-store",
      credentials: "include",
    });

    if (!response.ok) {
      return null;
    }

    const payload = await response.json();
    if (!payload.success || !payload.data) {
      return null;
    }

    return payload.data;
  } catch (error) {
    return null;
  }
}

async function buildInProgressBooks() {
  // Build a map from bookId -> local progress entry for books the user has touched.
  const localRaw = readLocalProgressMap();
  const localMap = {};
  Object.entries(localRaw).forEach(([key, entry]) => {
    const bookId = String(key).replace(/^book:/, "");
    const pct = Number(entry?.percent || 0);
    if (pct > 0 && bookId) {
      localMap[bookId] = entry;
    }
  });

  const sampled = state.books.slice(0, 48);
  const progressByBook = await Promise.all(sampled.map((book) => fetchReadingProgress(book.id)));

  const entries = [];
  progressByBook.forEach((progress, index) => {
    const book = sampled[index];
    const apiPercent = progress ? clampPercent(progress.progressPercent) : 0;

    if (apiPercent > 0) {
      entries.push({
        ...book,
        progressPercent: apiPercent,
        chapterId: progress.chapterId || "",
        chapterNumber: Number(progress.chapterNumber || progress.chapterIndex + 1 || 1),
        updatedAt: progress.updatedAt || "",
      });
    } else {
      // Fall back to localStorage — covers guest reading and offline sessions.
      const local = localMap[book.id];
      if (local) {
        const localPercent = clampPercent(local.percent);
        if (localPercent > 0) {
          entries.push({
            ...book,
            progressPercent: localPercent,
            chapterId: "",
            chapterNumber: Number(local.chapterIndex ?? 0) + 1,
            updatedAt: "",
          });
        }
      }
    }
  });

  entries.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  return entries;
}

function createContinueCard(item) {
  const chapterIdParam = item.chapterId ? `&chapterId=${encodeURIComponent(item.chapterId)}` : "";
  const card = document.createElement("article");
  card.className = "continue-card";
  card.innerHTML = `
    <img class="cover" src="${item.coverUrl}" alt="${item.title} cover" loading="lazy" />
    <div>
      <p class="title">${item.title}</p>
      <p class="meta">${item.authorName}</p>
      <p class="progress-text">Chapter ${item.chapterNumber} · ${item.progressPercent}%</p>
      <div class="progress-track"><span style="width:${item.progressPercent}%"></span></div>
      <div class="inline-actions">
        <a class="solid" href="reader.html?bookId=${encodeURIComponent(item.id)}${chapterIdParam}">Resume</a>
      </div>
    </div>
  `;
  return card;
}

function createBookCard(book) {
  const isSaved = state.savedBookIds.has(book.id);
  const card = document.createElement("article");
  card.className = "card";
  card.innerHTML = `
    <img class="cover" src="${book.coverUrl}" alt="${book.title} cover" loading="lazy" />
    <p class="title">${book.title}</p>
    <p class="meta">${book.authorName} · ${book.genre}</p>
    <div class="inline-actions">
      <a href="book.html?id=${encodeURIComponent(book.id)}">Details</a>
      <a class="solid" href="reader.html?bookId=${encodeURIComponent(book.id)}">Read</a>
      <button type="button" data-save-id="${book.id}">${isSaved ? "Saved" : "Save"}</button>
    </div>
  `;
  return card;
}

function createRailCard(book, label) {
  const card = createBookCard(book);
  const badge = document.createElement("p");
  badge.className = "meta";
  badge.textContent = label;
  card.querySelector(".meta")?.insertAdjacentElement("afterend", badge);
  return card;
}

function renderContinueReading() {
  elements.hubContinueRow.innerHTML = "";
  const entries = getContinueReading().filter(e => e.userId === getCurrentUserId());
  if (!entries.length) {
    elements.hubContinueRow.appendChild(createEmptyState("Start any novel and your progress will appear here."));
    return;
  }
  entries.slice(0, 10).forEach((entry) => {
    const book = state.books.find(b => b.id === entry.bookId);
    if (book) {
      elements.hubContinueRow.appendChild(createContinueCard({
        ...book,
        chapterId: entry.currentChapter,
        chapterNumber: entry.currentChapter ? (parseInt(entry.currentChapter.replace(/\D/g, "")) || 1) : 1,
        progressPercent: entry.progress || 0
      }));
    }
  });
}

function renderGrid(target, books, emptyMessage) {
  target.innerHTML = "";
  if (!books.length) {
    target.appendChild(createEmptyState(emptyMessage));
    return;
  }
  books.forEach((book) => {
    target.appendChild(createBookCard(book));
  });
}

function renderRail(target, books, emptyMessage, label) {
  target.innerHTML = "";
  if (!books.length) {
    target.appendChild(createEmptyState(emptyMessage));
    return;
  }

  books.forEach((book) => {
    target.appendChild(createRailCard(book, label));
  });
}

function buildPersonalizedSections() {
  // Use unified helpers for library and continue reading
  const userId = getCurrentUserId();
  const continueEntries = getContinueReading().filter(e => e.userId === userId);
  const libraryEntries = getLibrary().filter(e => e.userId === userId);

  // YourBooks: all books in library or in progress
  const inProgressIds = new Set(continueEntries.map(e => e.bookId));
  const libraryIds = new Set(libraryEntries.map(e => e.bookId));
  state.yourBooks = state.books.filter(book => inProgressIds.has(book.id) || libraryIds.has(book.id)).slice(0, 12);

  // Favorites: all books in library
  state.favorites = state.books.filter(book => libraryIds.has(book.id));

  // Recommendations and because logic unchanged
  const genreCount = new Map();
  state.yourBooks.forEach((book) => {
    genreCount.set(book.genre, (genreCount.get(book.genre) || 0) + 1);
  });
  state.favorites.forEach((book) => {
    genreCount.set(book.genre, (genreCount.get(book.genre) || 0) + 1);
  });

  const rankedGenres = [...genreCount.entries()].sort((a, b) => b[1] - a[1]).map((entry) => entry[0]);
  if (!rankedGenres.length && state.books.length) {
    rankedGenres.push(state.books[0].genre);
  }

  const recommended = [];
  rankedGenres.forEach((genre) => {
    state.books.forEach((book) => {
      if (book.genre === genre && !inProgressIds.has(book.id) && !recommended.some((item) => item.id === book.id)) {
        recommended.push(book);
      }
    });
  });
  state.recommended = recommended.slice(0, 16);

  state.becauseAnchor = state.yourBooks[0] || null;
  if (state.becauseAnchor) {
    state.becauseYouRead = state.books
      .filter((book) => book.id !== state.becauseAnchor.id && book.genre === state.becauseAnchor.genre)
      .slice(0, 12);
  } else {
    state.becauseYouRead = [];
  }
}

function renderBecauseSection() {
  if (state.becauseAnchor) {
    elements.becauseHeading.textContent = `Because you read ${state.becauseAnchor.title}`;
  } else {
    elements.becauseHeading.textContent = "Because You Read...";
  }

  renderRail(
    elements.becauseReadRow,
    state.becauseYouRead,
    "Read a few books and we will personalize this section.",
    "Similar pick"
  );
}

function updateDiscoverGenreOptions() {
  const genres = [...new Set(state.books.map((book) => book.genre).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const options = ["<option value='all'>All Genres</option>"]
    .concat(genres.map((genre) => `<option value="${genre}">${genre}</option>`));

  elements.hubGenreFilter.innerHTML = options.join("");
  elements.hubGenreFilter.value = state.discoverGenre;
}

function getFilteredDiscoverBooks() {
  const query = state.discoverSearch.trim().toLowerCase();

  return state.books.filter((book) => {
    const genreMatch = state.discoverGenre === "all" || book.genre === state.discoverGenre;
    if (!genreMatch) {
      return false;
    }

    if (!query) {
      return true;
    }

    const haystack = `${book.title} ${book.authorName} ${book.genre}`.toLowerCase();
    return haystack.includes(query);
  });
}

function renderDiscover() {
  elements.hubDiscoverGrid.innerHTML = "";
  const filtered = getFilteredDiscoverBooks();
  if (!filtered.length) {
    elements.hubDiscoverGrid.appendChild(createEmptyState("No books match this search yet."));
    elements.hubLoadMoreBtn.hidden = true;
    return;
  }

  const limit = state.discoverPage * state.discoverPageSize;
  filtered.slice(0, limit).forEach((book) => {
    elements.hubDiscoverGrid.appendChild(createBookCard(book));
  });

  elements.hubLoadMoreBtn.hidden = limit >= filtered.length;
}

function renderStats() {
  const inProgressCount = state.inProgress.length;
  const localProgress = readLocalProgressMap();

  let chapterUnits = 0;
  Object.values(localProgress).forEach((entry) => {
    if (!entry || typeof entry !== "object") {
      return;
    }
    const chapterIndex = Number(entry.chapterIndex || 0);
    const percent = Number(entry.percent || 0);
    chapterUnits += Math.max(1, chapterIndex + percent / 100);
  });

  if (chapterUnits === 0) {
    chapterUnits = state.inProgress.reduce((sum, item) => sum + Math.max(1, item.progressPercent / 100), 0);
  }

  const chaptersRead = Math.round(chapterUnits);
  const readingMinutes = Math.max(0, Math.round(chapterUnits * 18));

  elements.statBooksInProgress.textContent = String(inProgressCount);
  elements.statChaptersRead.textContent = String(chaptersRead);
  elements.statReadingTime.textContent = `${readingMinutes} min`;
}

function bindEvents() {
  elements.hubSearchInput.addEventListener("input", () => {
    state.discoverSearch = elements.hubSearchInput.value || "";
    state.discoverPage = 1;
    renderDiscover();
  });

  elements.hubGenreFilter.addEventListener("change", () => {
    state.discoverGenre = elements.hubGenreFilter.value;
    state.discoverPage = 1;
    renderDiscover();
  });

  elements.hubLoadMoreBtn.addEventListener("click", () => {
    state.discoverPage += 1;
    renderDiscover();
  });

  document.addEventListener("click", (event) => {
    const saveButton = event.target.closest("button[data-save-id]");
    if (!saveButton) {
      return;
    }

    const bookId = saveButton.dataset.saveId;
    if (state.savedBookIds.has(bookId)) {
      state.savedBookIds.delete(bookId);
      saveButton.textContent = "Save";
    } else {
      state.savedBookIds.add(bookId);
      saveButton.textContent = "Saved";
    }

    saveSavedBooks();
    buildPersonalizedSections();
    renderGrid(elements.favoritesRow, state.favorites, "No saved books yet.");
    elements.favoritesPanel.hidden = !state.favorites.length;
  });
}

function renderAll() {
  renderContinueReading();
  renderGrid(elements.yourLibraryRow, state.yourBooks, "Open or save books to build your personal shelf.");
  renderRail(elements.recommendedRow, state.recommended, "Recommendations will appear once we learn your taste.", "Recommended for you");
  renderBecauseSection();
  renderGrid(elements.favoritesRow, state.favorites, "No favorites yet.");
  elements.favoritesPanel.hidden = !state.favorites.length;

  updateDiscoverGenreOptions();
  renderDiscover();
  renderStats();
}

async function bootstrap() {
  await ensureSignedInUser();
  state.books = await fetchBooks();
  state.inProgress = await buildInProgressBooks();

  buildPersonalizedSections();
  bindEvents();
  renderAll();
}

bootstrap();
