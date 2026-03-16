const defaultDashboardData = {
  continueReading: [
    { id: "book-last-lantern", title: "The Last Lantern", author: "M. K. Vale", genre: "Mystery", progress: 68 },
    { id: "book-echoes-dawn", title: "Echoes at Dawn", author: "Nira Sol", genre: "Fantasy", progress: 34 },
    { id: "book-code-silence", title: "Code of Silence", author: "Leah Warren", genre: "Thriller", progress: 82 }
  ],
  trendingNovels: [
    { id: "book-midnight-atlas", title: "Midnight Atlas", author: "Jonas Reed", genre: "Adventure" },
    { id: "book-glass-orchard", title: "The Glass Orchard", author: "Emi Hart", genre: "Romance" },
    { id: "book-ashes-winter", title: "Ashes of Winter", author: "R. T. Crow", genre: "Epic" },
    { id: "book-velvet-constellations", title: "Velvet Constellations", author: "Ira Bloom", genre: "Sci-Fi" }
  ],
  newReleases: [
    { id: "book-paper-moons", title: "Paper Moons", author: "Talia Mercer", genre: "Contemporary" },
    { id: "book-ninth-listener", title: "The Ninth Listener", author: "Miko Hale", genre: "Horror" },
    { id: "book-whisperline", title: "Whisperline", author: "Ana Flores", genre: "Drama" }
  ],
  recommendedForYou: [
    { id: "book-quiet-waters", title: "Below Quiet Waters", author: "Adrian Poe", genre: "Mystery", progress: 12 },
    { id: "book-sun-attic", title: "Sun in the Attic", author: "Hazel Nyx", genre: "Historical" },
    { id: "book-clockmaker-signal", title: "The Clockmaker's Signal", author: "Noah Pierce", genre: "Steampunk", progress: 49 }
  ],
  audiobooks: [
    { id: "book-wild-meridian", title: "Wild Meridian", author: "Sara Quinn", genre: "Audiobook" },
    { id: "book-house-wind", title: "A House of Wind", author: "Peter Lane", genre: "Audiobook", progress: 55 },
    { id: "book-poets-harbor", title: "The Poet's Harbor", author: "Jamie Cross", genre: "Audiobook" }
  ],
  categoriesGenres: [
    "Fantasy",
    "Romance",
    "Mystery",
    "Sci-Fi",
    "Historical",
    "Self Growth",
    "Young Adult",
    "Dark Academia"
  ],
  recentlyAdded: []
};

const dashboardData = structuredClone(defaultDashboardData);
const SECTION_KEYS = [
  "continueReading",
  "trendingNovels",
  "newReleases",
  "recommendedForYou",
  "audiobooks",
  "recentlyAdded"
];
const SAVED_BOOKS_KEY = "novelread.savedBooks";
let savedBooks = loadSavedBooks();

const sectionRows = {
  continueReading: document.getElementById("continueReadingRow"),
  trendingNovels: document.getElementById("trendingNovelsRow"),
  newReleases: document.getElementById("newReleasesRow"),
  recommendedForYou: document.getElementById("recommendedForYouRow"),
  audiobooks: document.getElementById("audiobooksRow"),
  categoriesGenres: document.getElementById("categoriesRow"),
  recentlyAdded: document.getElementById("recentlyAddedRow")
};
const searchInput = document.getElementById("searchInput");

function loadSavedBooks() {
  try {
    const raw = localStorage.getItem(SAVED_BOOKS_KEY);
    const parsed = JSON.parse(raw || "[]");
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch (error) {
    return new Set();
  }
}

function persistSavedBooks() {
  localStorage.setItem(SAVED_BOOKS_KEY, JSON.stringify([...savedBooks]));
}

function getBookId(book) {
  if (book.id) {
    return book.id;
  }

  return `${book.title}-${book.author}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
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
    Epic: ["#253b2f", "#6a9f74"],
    Drama: ["#3f3348", "#8672a1"],
    Horror: ["#282225", "#7f4f59"],
    Adventure: ["#2b4337", "#5f9267"],
    Contemporary: ["#2f3945", "#7191b1"],
    Audiobook: ["#4a3325", "#b67c4b"],
    "Self Growth": ["#3a4a2a", "#8fb063"],
    "Dark Academia": ["#2f2b23", "#8f7e57"],
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

function createSkeletonCard() {
  const card = document.createElement("article");
  card.className = "skeleton-card";
  card.innerHTML = `
    <div class="skeleton-content">
      <div class="skeleton-line"></div>
      <div class="skeleton-line short"></div>
      <div class="skeleton-line"></div>
    </div>
  `;
  return card;
}

function renderSkeletons() {
  Object.entries(sectionRows).forEach(([key, row]) => {
    row.innerHTML = "";
    if (key === "categoriesGenres") {
      for (let i = 0; i < 6; i += 1) {
        const chip = document.createElement("div");
        chip.className = "skeleton-chip";
        row.appendChild(chip);
      }
      return;
    }

    for (let i = 0; i < 4; i += 1) {
      row.appendChild(createSkeletonCard());
    }
  });
}

function createBookCard(book) {
  const card = document.createElement("article");
  card.className = "book-card";
  const bookId = getBookId(book);
  const isSaved = savedBooks.has(bookId);

  const progressMarkup = typeof book.progress === "number"
    ? `
      <div class="progress-wrap" aria-label="Reading progress ${book.progress}%">
        <small>${book.progress}% complete</small>
        <div class="progress-track"><span style="width:${book.progress}%"></span></div>
      </div>`
    : "";

  card.innerHTML = `
    <img class="cover" src="${createCoverSvg(book.title, book.genre)}" alt="${book.title} cover" loading="lazy" />
    <p class="book-title">${book.title}</p>
    <p class="book-meta">${book.author}<br>${book.genre}</p>
    ${progressMarkup}
    <div class="card-actions">
      <button type="button" data-action="read" data-book-id="${bookId}" data-book-title="${book.title}">Read</button>
      <button type="button" data-action="listen" data-book-id="${bookId}" data-book-title="${book.title}">Listen</button>
      <button type="button" data-action="save" data-book-id="${bookId}" data-book-title="${book.title}" class="${isSaved ? "is-saved" : ""}">${isSaved ? "Saved" : "Save"}</button>
    </div>
  `;
  return card;
}

function createEmptyState(message) {
  const empty = document.createElement("div");
  empty.className = "empty-state";
  empty.innerHTML = `<div><strong>Nothing here yet</strong><p>${message}</p></div>`;
  return empty;
}

function filterBooks(items, query) {
  if (!query) {
    return items;
  }

  const normalizedQuery = query.trim().toLowerCase();
  return items.filter((book) => [book.title, book.author, book.genre].join(" ").toLowerCase().includes(normalizedQuery));
}

function renderSectionBooks(sectionKey, emptyMessage, query = "") {
  const row = sectionRows[sectionKey];
  const items = filterBooks(dashboardData[sectionKey] || [], query);

  row.innerHTML = "";

  if (!items.length) {
    row.appendChild(createEmptyState(emptyMessage));
    return;
  }

  items.forEach((book) => {
    row.appendChild(createBookCard(book));
  });
}

function renderCategories() {
  const row = sectionRows.categoriesGenres;
  const categories = dashboardData.categoriesGenres || [];

  row.innerHTML = "";

  if (!categories.length) {
    row.appendChild(createEmptyState("Add genre preferences to personalize recommendations."));
    return;
  }

  categories.forEach((label) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip";
    chip.textContent = label;
    row.appendChild(chip);
  });
}

function renderDashboard() {
  const query = searchInput.value || "";
  renderSectionBooks("continueReading", "Start reading a novel and continue it from here.", query);
  renderSectionBooks("trendingNovels", "No trending novels available right now.", query);
  renderSectionBooks("newReleases", "New releases are on the way.", query);
  renderSectionBooks("recommendedForYou", "Complete a few reads to unlock recommendations.", query);
  renderSectionBooks("audiobooks", "No audiobooks available yet.", query);
  renderSectionBooks("recentlyAdded", "Recently added books will appear once new content is uploaded.", query);
  renderCategories();
}

function setupBookActions() {
  document.addEventListener("click", (event) => {
    const actionButton = event.target.closest("button[data-action]");
    if (!actionButton) {
      return;
    }

    const { action, bookId, bookTitle } = actionButton.dataset;
    if (!action || !bookId || !bookTitle) {
      return;
    }

    if (action === "save") {
      const isSaved = savedBooks.has(bookId);
      if (isSaved) {
        savedBooks.delete(bookId);
        actionButton.classList.remove("is-saved");
        actionButton.textContent = "Save";
        showToast(`Removed ${bookTitle} from saved books`);
      } else {
        savedBooks.add(bookId);
        actionButton.classList.add("is-saved");
        actionButton.textContent = "Saved";
        showToast(`Saved ${bookTitle}`);
      }
      persistSavedBooks();
      return;
    }

    if (action === "read") {
      window.location.href = `book.html?id=${encodeURIComponent(bookId)}`;
      return;
    }

    if (action === "listen") {
      window.location.href = `audiobook.html?book=${encodeURIComponent(bookId)}`;
    }
  });
}

function setupSearch() {
  searchInput.addEventListener("input", () => {
    renderDashboard();
  });
}

function showToast(message) {
  let toastRoot = document.getElementById("toastRoot");
  if (!toastRoot) {
    toastRoot = document.createElement("div");
    toastRoot.id = "toastRoot";
    toastRoot.className = "toast-root";
    document.body.appendChild(toastRoot);
  }

  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  toastRoot.appendChild(toast);

  window.setTimeout(() => {
    toast.classList.add("hide");
    window.setTimeout(() => toast.remove(), 220);
  }, 1700);
}

async function loadDashboardData() {
  try {
    const response = await fetch("./data/dashboard.json", { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    SECTION_KEYS.forEach((key) => {
      dashboardData[key] = Array.isArray(data[key]) ? data[key] : [];
    });
    dashboardData.categoriesGenres = Array.isArray(data.categoriesGenres) ? data.categoriesGenres : [];
  } catch (error) {
    SECTION_KEYS.forEach((key) => {
      dashboardData[key] = defaultDashboardData[key];
    });
    dashboardData.categoriesGenres = defaultDashboardData.categoriesGenres;
    showToast("Loaded local sample data");
  }
}

function setupProfileMenu() {
  const menuBtn = document.getElementById("profileMenuBtn");
  const dropdown = document.getElementById("profileDropdown");

  menuBtn.addEventListener("click", () => {
    const isOpen = dropdown.classList.toggle("show");
    menuBtn.setAttribute("aria-expanded", String(isOpen));
  });

  document.addEventListener("click", (event) => {
    if (!event.target.closest(".profile-menu")) {
      dropdown.classList.remove("show");
      menuBtn.setAttribute("aria-expanded", "false");
    }
  });
}

async function bootstrap() {
  renderSkeletons();
  setupProfileMenu();
  setupBookActions();
  setupSearch();
  await loadDashboardData();
  window.setTimeout(renderDashboard, 850);
}

bootstrap();
