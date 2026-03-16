const API_BASE_URL = "http://localhost:5000";
const PAGE_SIZE = 8;

const elements = {
  searchInput: document.getElementById("searchInput"),
  genreFilter: document.getElementById("genreFilter"),
  languageFilter: document.getElementById("languageFilter"),
  typeFilter: document.getElementById("typeFilter"),
  accessFilter: document.getElementById("accessFilter"),
  discoveryFilter: document.getElementById("discoveryFilter"),
  sortBy: document.getElementById("sortBy"),
  booksContainer: document.getElementById("booksContainer"),
  resultsMeta: document.getElementById("resultsMeta"),
  pageMeta: document.getElementById("pageMeta"),
  prevPageBtn: document.getElementById("prevPageBtn"),
  nextPageBtn: document.getElementById("nextPageBtn"),
  viewButtons: [...document.querySelectorAll(".view-btn")],
};

let books = [];
let pagination = { page: 1, limit: PAGE_SIZE, total: 0, totalPages: 1 };
const genreOptions = new Set();
const readingProgressCache = new Map();
const readingProgressInFlight = new Map();
const listeningProgressCache = new Map();
const listeningProgressInFlight = new Map();
let readingProgressEnabled = true;
let listeningProgressEnabled = true;
const authState = {
  checked: false,
  signedIn: false,
};

const state = {
  query: "",
  view: "grid",
  genre: "all",
  type: "all",
  sortBy: "newest",
  currentPage: 1,
};

function createCoverSvg(title, genre) {
  const safeTitle = title || "Book";
  const initials = safeTitle
    .split(" ")
    .map((word) => word[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const palette = {
    mystery: ["#23323f", "#46667b"],
    fantasy: ["#553458", "#9d6aa6"],
    thriller: ["#3f2a1b", "#ab6a3a"],
    romance: ["#6a3047", "#bf6e91"],
    drama: ["#3f3348", "#8672a1"],
    adventure: ["#2b4337", "#5f9267"],
    default: ["#2d3b3a", "#608982"],
  };

  const key = String(genre || "").toLowerCase();
  const [c1, c2] = palette[key] || palette.default;
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

function normalizeBook(book) {
  const resolvedCover = book.coverUrl
    ? (book.coverUrl.startsWith("http") ? book.coverUrl : `${API_BASE_URL}${book.coverUrl}`)
    : createCoverSvg(book.title, book.genre);

  return {
    id: book.id,
    title: book.title || "Untitled",
    authorName: book.authorName || "Unknown Author",
    description: book.description || "No description available.",
    genre: book.genre || "Unknown",
    coverUrl: resolvedCover,
    isAudiobookAvailable: Boolean(book.isAudiobookAvailable),
  };
}

function mapSortOption(value) {
  if (value === "title") {
    return "title_asc";
  }
  if (value === "popularity") {
    return "newest";
  }
  return "newest";
}

function clampPercent(value) {
  const number = Number(value);
  if (Number.isNaN(number)) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round(number)));
}

async function ensureSignedInUser() {
  if (authState.checked) {
    return authState.signedIn;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
      cache: "no-store",
      credentials: "include",
    });

    if (!response.ok) {
      authState.checked = true;
      authState.signedIn = false;
      readingProgressEnabled = false;
      listeningProgressEnabled = false;
      return false;
    }

    const payload = await response.json();
    authState.checked = true;
    authState.signedIn = Boolean(payload.success && payload.user && payload.user.id);

    if (!authState.signedIn) {
      readingProgressEnabled = false;
      listeningProgressEnabled = false;
    }

    return authState.signedIn;
  } catch (error) {
    authState.checked = true;
    authState.signedIn = false;
    readingProgressEnabled = false;
    listeningProgressEnabled = false;
    return false;
  }
}

async function fetchReadingProgress(bookId) {
  if (!readingProgressEnabled) {
    return null;
  }

  if (readingProgressCache.has(bookId)) {
    return readingProgressCache.get(bookId);
  }

  if (readingProgressInFlight.has(bookId)) {
    return readingProgressInFlight.get(bookId);
  }

  const request = (async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/progress/reading/${encodeURIComponent(bookId)}`, {
        cache: "no-store",
        credentials: "include",
      });

      if (response.status === 401) {
        readingProgressEnabled = false;
        return null;
      }

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
  })();

  readingProgressInFlight.set(bookId, request);

  const result = await request;
  readingProgressCache.set(bookId, result);
  readingProgressInFlight.delete(bookId);
  return result;
}

async function fetchListeningProgress(bookId) {
  if (!listeningProgressEnabled) {
    return null;
  }

  if (listeningProgressCache.has(bookId)) {
    return listeningProgressCache.get(bookId);
  }

  if (listeningProgressInFlight.has(bookId)) {
    return listeningProgressInFlight.get(bookId);
  }

  const request = (async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/progress/listening/${encodeURIComponent(bookId)}`, {
        cache: "no-store",
        credentials: "include",
      });

      if (response.status === 401) {
        listeningProgressEnabled = false;
        return null;
      }

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
  })();

  listeningProgressInFlight.set(bookId, request);

  const result = await request;
  listeningProgressCache.set(bookId, result);
  listeningProgressInFlight.delete(bookId);
  return result;
}

async function hydrateReadingProgressForBooks(bookList) {
  if (!readingProgressEnabled) {
    return;
  }

  await Promise.all(bookList.map((book) => fetchReadingProgress(book.id)));
}

async function hydrateListeningProgressForBooks(bookList) {
  if (!listeningProgressEnabled) {
    return;
  }

  await Promise.all(bookList.map((book) => fetchListeningProgress(book.id)));
}

function updateGenreFilterOptions() {
  const options = [`<option value="all">All Genres</option>`]
    .concat(
      [...genreOptions]
        .sort((a, b) => a.localeCompare(b))
        .map((genre) => `<option value="${genre}">${genre}</option>`)
    );

  const currentValue = elements.genreFilter.value || "all";
  elements.genreFilter.innerHTML = options.join("");
  elements.genreFilter.value = [...genreOptions].includes(currentValue) ? currentValue : "all";
}

function buildApiUrl() {
  const params = new URLSearchParams();
  params.set("page", String(state.currentPage));
  params.set("limit", String(PAGE_SIZE));
  params.set("sort", mapSortOption(state.sortBy));

  if (state.query.trim()) {
    params.set("search", state.query.trim());
  }
  if (state.genre !== "all") {
    params.set("genre", state.genre);
  }

  if (state.type === "ebook") {
    params.set("isAudiobookAvailable", "false");
  } else if (state.type === "audiobook" || state.type === "both") {
    params.set("isAudiobookAvailable", "true");
  }

  return `${API_BASE_URL}/api/books?${params.toString()}`;
}

function renderLoadingState() {
  elements.booksContainer.innerHTML = `
    <div class="empty-state">
      <div>
        <h3>Loading books...</h3>
        <p>Please wait while we fetch the latest library from the server.</p>
      </div>
    </div>
  `;
  elements.resultsMeta.textContent = "Loading books...";
  elements.pageMeta.textContent = "Loading...";
  elements.prevPageBtn.disabled = true;
  elements.nextPageBtn.disabled = true;
}

function renderErrorState(message) {
  elements.booksContainer.innerHTML = `
    <div class="empty-state">
      <div>
        <h3>Unable to load books</h3>
        <p>${message}</p>
      </div>
    </div>
  `;
  elements.resultsMeta.textContent = "Failed to fetch books";
  elements.pageMeta.textContent = "Page 0 of 0";
  elements.prevPageBtn.disabled = true;
  elements.nextPageBtn.disabled = true;
}

function renderEmptyState() {
  elements.booksContainer.innerHTML = `
    <div class="empty-state">
      <div>
        <h3>No books found</h3>
        <p>Try changing your search text or filters.</p>
      </div>
    </div>
  `;
  elements.resultsMeta.textContent = "0 books found";
  elements.pageMeta.textContent = "Page 0 of 0";
  elements.prevPageBtn.disabled = true;
  elements.nextPageBtn.disabled = true;
}

function createBookCard(book) {
  const card = document.createElement("article");
  card.className = "book-card";

  const progress = readingProgressCache.get(book.id);
  const hasProgress = Boolean(progress);
  const progressPercent = hasProgress ? clampPercent(progress.progressPercent) : 0;

  const hasChapterId =
    hasProgress &&
    typeof progress.chapterId === "string" &&
    progress.chapterId.trim().length > 0;

  const progressHref = hasChapterId
    ? `reader.html?bookId=${encodeURIComponent(book.id)}&chapterId=${encodeURIComponent(progress.chapterId)}`
    : `book.html?id=${encodeURIComponent(book.id)}`;

  const progressMarkup = hasProgress
    ? `
      <div class="reading-progress" aria-label="Reading progress">
        <a
          href="${progressHref}"
          class="progress-badge progress-badge-link"
          title="Resume reading"
          aria-label="Resume reading from ${progressPercent}%"
        >${progressPercent}% complete</a>
        <div class="progress-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progressPercent}">
          <span style="width: ${progressPercent}%"></span>
        </div>
      </div>
    `
    : "";

  const listeningProgress = listeningProgressCache.get(book.id);
  const hasListeningProgress = Boolean(
    listeningProgress &&
    typeof listeningProgress.audioTrackId === "string" &&
    listeningProgress.audioTrackId.trim().length > 0
  );

  const listeningActionMarkup = hasListeningProgress
    ? `
      <a
        href="audiobook.html?bookId=${encodeURIComponent(book.id)}"
        class="card-link-btn"
        title="Last listened track available"
        aria-label="Resume listening for ${book.title}"
      >Resume Listening</a>
    `
    : `<button type="button" data-action="listen" data-id="${book.id}" ${book.isAudiobookAvailable ? "" : "disabled"}>Listen</button>`;

  const listeningHintMarkup = hasListeningProgress
    ? `<p class="book-author">Resume audio</p>`
    : "";

  const safeDescription = book.description.length > 150
    ? `${book.description.slice(0, 147)}...`
    : book.description;

  card.innerHTML = `
    <img class="cover" src="${book.coverUrl}" alt="${book.title} cover" loading="lazy" />
    <div class="card-body">
      <p class="book-title">${book.title}</p>
      <p class="book-author">${book.authorName} • ${book.genre}</p>
      ${progressMarkup}
      ${listeningHintMarkup}
      <p class="book-description">${safeDescription}</p>
      <div class="card-actions">
        <a href="book.html?id=${encodeURIComponent(book.id)}" class="card-link-btn">Open Details</a>
        ${listeningActionMarkup}
      </div>
    </div>
  `;

  return card;
}

function renderBooks() {
  if (!books.length) {
    renderEmptyState();
    return;
  }

  elements.booksContainer.classList.toggle("books-grid", state.view === "grid");
  elements.booksContainer.classList.toggle("books-list", state.view === "list");

  elements.booksContainer.innerHTML = "";
  books.forEach((book) => {
    elements.booksContainer.appendChild(createBookCard(book));
  });

  const from = pagination.total === 0 ? 0 : (pagination.page - 1) * pagination.limit + 1;
  const to = Math.min(pagination.page * pagination.limit, pagination.total);

  elements.resultsMeta.textContent = `Showing ${from}-${to} of ${pagination.total} books`;
  elements.pageMeta.textContent = `Page ${pagination.page} of ${pagination.totalPages}`;
  elements.prevPageBtn.disabled = pagination.page <= 1;
  elements.nextPageBtn.disabled = pagination.page >= pagination.totalPages;
}

async function loadBooksFromApi() {
  renderLoadingState();

  try {
    const response = await fetch(buildApiUrl(), { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Server responded with HTTP ${response.status}`);
    }

    const payload = await response.json();
    if (!payload.success || !Array.isArray(payload.data)) {
      throw new Error("Unexpected API response format");
    }

    books = payload.data.map(normalizeBook);
    pagination = payload.pagination || { page: 1, limit: PAGE_SIZE, total: 0, totalPages: 1 };

    books.forEach((book) => {
      if (book.genre && book.genre !== "Unknown") {
        genreOptions.add(book.genre);
      }
    });
    updateGenreFilterOptions();

    const isSignedIn = await ensureSignedInUser();
    if (isSignedIn) {
      await Promise.all([
        hydrateReadingProgressForBooks(books),
        hydrateListeningProgressForBooks(books),
      ]);
    }

    renderBooks();
  } catch (error) {
    renderErrorState(error.message || "Please check that the backend is running on http://localhost:5000");
  }
}

function setView(view) {
  state.view = view;
  elements.viewButtons.forEach((button) => {
    const active = button.dataset.view === view;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  renderBooks();
}

function setupEvents() {
  elements.languageFilter.innerHTML = "<option value='all'>Not available</option>";

  elements.searchInput.addEventListener("input", () => {
    state.query = elements.searchInput.value;
    state.currentPage = 1;
    loadBooksFromApi();
  });

  elements.genreFilter.addEventListener("change", () => {
    state.genre = elements.genreFilter.value;
    state.currentPage = 1;
    loadBooksFromApi();
  });

  // Keep legacy filter controls in UI but disable unsupported API filters.
  elements.languageFilter.disabled = true;
  elements.accessFilter.disabled = true;
  elements.discoveryFilter.disabled = true;

  elements.typeFilter.addEventListener("change", () => {
    state.type = elements.typeFilter.value;
    state.currentPage = 1;
    loadBooksFromApi();
  });

  elements.sortBy.addEventListener("change", () => {
    state.sortBy = elements.sortBy.value;
    state.currentPage = 1;
    loadBooksFromApi();
  });

  elements.viewButtons.forEach((button) => {
    button.addEventListener("click", () => {
      setView(button.dataset.view);
    });
  });

  elements.prevPageBtn.addEventListener("click", () => {
    if (state.currentPage > 1) {
      state.currentPage -= 1;
      loadBooksFromApi();
    }
  });

  elements.nextPageBtn.addEventListener("click", () => {
    if (state.currentPage < pagination.totalPages) {
      state.currentPage += 1;
      loadBooksFromApi();
    }
  });

  elements.booksContainer.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action='listen']");
    if (!button || button.disabled) {
      return;
    }
    window.location.href = `audiobook.html?bookId=${encodeURIComponent(button.dataset.id)}`;
  });
}

async function bootstrap() {
  setupEvents();
  state.view = "grid";
  elements.viewButtons.forEach((button) => {
    const active = button.dataset.view === "grid";
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  await loadBooksFromApi();
}

bootstrap();
