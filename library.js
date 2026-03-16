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
  viewButtons: [...document.querySelectorAll(".view-btn")]
};

const fallbackBooks = [
  {
    id: "book-last-lantern",
    title: "The Last Lantern",
    author: "M. K. Vale",
    description: "A detective returns to a coastal town where every answer is hidden in lighthouse logs.",
    genre: "Mystery",
    language: "English",
    type: "both",
    access: "paid",
    tags: ["Bestseller", "Noir"],
    publishedAt: "2026-02-12",
    popularity: 95
  },
  {
    id: "book-echoes-dawn",
    title: "Echoes at Dawn",
    author: "Nira Sol",
    description: "A cursed musician can rewrite fate by performing forbidden songs at sunrise.",
    genre: "Fantasy",
    language: "English",
    type: "ebook",
    access: "free",
    tags: ["Magic", "Epic"],
    publishedAt: "2026-01-19",
    popularity: 88
  },
  {
    id: "book-poets-harbor",
    title: "The Poet's Harbor",
    author: "Jamie Cross",
    description: "A lyrical story of strangers finding home in a windswept seaside reading room.",
    genre: "Drama",
    language: "English",
    type: "audiobook",
    access: "paid",
    tags: ["Emotional", "Slow Burn"],
    publishedAt: "2025-11-06",
    popularity: 84
  }
];

let books = [];
const state = {
  query: "",
  view: "grid",
  genre: "all",
  language: "all",
  type: "all",
  access: "all",
  discovery: "all",
  sortBy: "newest",
  currentPage: 1
};

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
    Epic: ["#253b2f", "#6a9f74"],
    Drama: ["#3f3348", "#8672a1"],
    Horror: ["#282225", "#7f4f59"],
    Adventure: ["#2b4337", "#5f9267"],
    Contemporary: ["#2f3945", "#7191b1"],
    Audiobook: ["#4a3325", "#b67c4b"],
    default: ["#2d3b3a", "#608982"]
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

function normalizeBook(book) {
  return {
    ...book,
    id: book.id || `${book.title}-${book.author}`.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    tags: Array.isArray(book.tags) ? book.tags : [],
    popularity: Number(book.popularity) || 0,
    type: book.type || "ebook",
    access: book.access || "paid",
    language: book.language || "English"
  };
}

function populateSelect(selectEl, values, label) {
  const options = [`<option value="all">All ${label}</option>`]
    .concat([...values].sort((a, b) => a.localeCompare(b)).map((v) => `<option value="${v}">${v}</option>`));
  selectEl.innerHTML = options.join("");
}

function setupDynamicFilters() {
  const genres = new Set(books.map((book) => book.genre).filter(Boolean));
  const languages = new Set(books.map((book) => book.language).filter(Boolean));

  populateSelect(elements.genreFilter, genres, "Genres");
  populateSelect(elements.languageFilter, languages, "Languages");
}

function filterBooks(source) {
  const query = state.query.trim().toLowerCase();

  return source.filter((book) => {
    if (query) {
      const haystack = [book.title, book.author, book.description, ...(book.tags || []), book.genre, book.language].join(" ").toLowerCase();
      if (!haystack.includes(query)) {
        return false;
      }
    }

    if (state.genre !== "all" && book.genre !== state.genre) {
      return false;
    }

    if (state.language !== "all" && book.language !== state.language) {
      return false;
    }

    if (state.type !== "all" && book.type !== state.type) {
      return false;
    }

    if (state.access !== "all" && book.access !== state.access) {
      return false;
    }

    if (state.discovery === "latest") {
      const daysAgo = (Date.now() - new Date(book.publishedAt).getTime()) / (1000 * 60 * 60 * 24);
      if (daysAgo > 120) {
        return false;
      }
    }

    if (state.discovery === "popular" && book.popularity < 80) {
      return false;
    }

    return true;
  });
}

function sortBooks(source) {
  const sorted = [...source];

  if (state.sortBy === "title") {
    sorted.sort((a, b) => a.title.localeCompare(b.title));
    return sorted;
  }

  if (state.sortBy === "popularity") {
    sorted.sort((a, b) => b.popularity - a.popularity);
    return sorted;
  }

  sorted.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
  return sorted;
}

function createBookCard(book) {
  const card = document.createElement("article");
  card.className = "book-card";

  const tags = (book.tags || []).map((tag) => `<span class="tag">${tag}</span>`).join("");
  const hasListen = book.type === "audiobook" || book.type === "both";

  card.innerHTML = `
    <img class="cover" src="${createCoverSvg(book.title, book.genre)}" alt="${book.title} cover" loading="lazy" />
    <div class="card-body">
      <p class="book-title">${book.title}</p>
      <p class="book-author">${book.author} • ${book.genre} • ${book.language}</p>
      <p class="book-description">${book.description}</p>
      <div class="tags">${tags}</div>
      <div class="card-actions">
        <button type="button" data-action="read" data-id="${book.id}">Read</button>
        <button type="button" data-action="listen" data-id="${book.id}" ${hasListen ? "" : "disabled"}>Listen</button>
      </div>
    </div>
  `;

  return card;
}

function renderEmptyState() {
  elements.booksContainer.innerHTML = `
    <div class="empty-state">
      <div>
        <h3>No books match your filters</h3>
        <p>Try clearing a filter or changing your search query.</p>
      </div>
    </div>
  `;
  elements.resultsMeta.textContent = "0 books found";
  elements.pageMeta.textContent = "Page 0 of 0";
  elements.prevPageBtn.disabled = true;
  elements.nextPageBtn.disabled = true;
}

function renderBooks() {
  const filtered = sortBooks(filterBooks(books));

  if (!filtered.length) {
    renderEmptyState();
    return;
  }

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  state.currentPage = Math.min(state.currentPage, totalPages);

  const start = (state.currentPage - 1) * PAGE_SIZE;
  const visible = filtered.slice(start, start + PAGE_SIZE);

  elements.booksContainer.classList.toggle("books-grid", state.view === "grid");
  elements.booksContainer.classList.toggle("books-list", state.view === "list");

  elements.booksContainer.innerHTML = "";
  visible.forEach((book) => {
    elements.booksContainer.appendChild(createBookCard(book));
  });

  const from = start + 1;
  const to = Math.min(start + visible.length, filtered.length);
  elements.resultsMeta.textContent = `Showing ${from}-${to} of ${filtered.length} books`;
  elements.pageMeta.textContent = `Page ${state.currentPage} of ${totalPages}`;
  elements.prevPageBtn.disabled = state.currentPage === 1;
  elements.nextPageBtn.disabled = state.currentPage === totalPages;
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
  elements.searchInput.addEventListener("input", () => {
    state.query = elements.searchInput.value;
    state.currentPage = 1;
    renderBooks();
  });

  elements.genreFilter.addEventListener("change", () => {
    state.genre = elements.genreFilter.value;
    state.currentPage = 1;
    renderBooks();
  });

  elements.languageFilter.addEventListener("change", () => {
    state.language = elements.languageFilter.value;
    state.currentPage = 1;
    renderBooks();
  });

  elements.typeFilter.addEventListener("change", () => {
    state.type = elements.typeFilter.value;
    state.currentPage = 1;
    renderBooks();
  });

  elements.accessFilter.addEventListener("change", () => {
    state.access = elements.accessFilter.value;
    state.currentPage = 1;
    renderBooks();
  });

  elements.discoveryFilter.addEventListener("change", () => {
    state.discovery = elements.discoveryFilter.value;
    state.currentPage = 1;
    renderBooks();
  });

  elements.sortBy.addEventListener("change", () => {
    state.sortBy = elements.sortBy.value;
    state.currentPage = 1;
    renderBooks();
  });

  elements.viewButtons.forEach((button) => {
    button.addEventListener("click", () => {
      setView(button.dataset.view);
    });
  });

  elements.prevPageBtn.addEventListener("click", () => {
    if (state.currentPage > 1) {
      state.currentPage -= 1;
      renderBooks();
    }
  });

  elements.nextPageBtn.addEventListener("click", () => {
    state.currentPage += 1;
    renderBooks();
  });

  elements.booksContainer.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) {
      return;
    }

    const book = books.find((item) => item.id === button.dataset.id);
    if (!book) {
      return;
    }

    if (button.dataset.action === "read") {
      window.location.href = `book.html?id=${encodeURIComponent(book.id)}`;
      return;
    }

    if (button.dataset.action === "listen" && !button.disabled) {
      window.location.href = `audiobook.html?book=${encodeURIComponent(book.id)}`;
    }
  });
}

async function loadBooks() {
  try {
    const response = await fetch("./data/library.json", { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = await response.json();
    books = Array.isArray(data.books) ? data.books.map(normalizeBook) : fallbackBooks.map(normalizeBook);
  } catch (error) {
    books = fallbackBooks.map(normalizeBook);
  }
}

async function bootstrap() {
  await loadBooks();
  setupDynamicFilters();
  setupEvents();
  setView("grid");
}

bootstrap();
