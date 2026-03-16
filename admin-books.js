const ADMIN_AUTH_KEY = "novelread.admin.auth";
const PAGE_SIZE = 8;

const elements = {
  logoutBtn: document.getElementById("logoutBtn"),
  searchInput: document.getElementById("searchInput"),
  statusFilter: document.getElementById("statusFilter"),
  sourceFilter: document.getElementById("sourceFilter"),
  viewMode: document.getElementById("viewMode"),
  resultsMeta: document.getElementById("resultsMeta"),
  tableView: document.getElementById("tableView"),
  gridView: document.getElementById("gridView"),
  booksTableBody: document.getElementById("booksTableBody"),
  prevPageBtn: document.getElementById("prevPageBtn"),
  nextPageBtn: document.getElementById("nextPageBtn"),
  pageMeta: document.getElementById("pageMeta")
};

const state = {
  books: [],
  currentPage: 1,
  query: "",
  status: "all",
  source: "all",
  view: "table"
};

function requireAuth() {
  const auth = localStorage.getItem(ADMIN_AUTH_KEY);
  if (auth !== "1") {
    const next = encodeURIComponent("admin-books.html");
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

function applyFilters(source) {
  const q = state.query.trim().toLowerCase();
  return source.filter((book) => {
    if (state.status !== "all" && book.status !== state.status) {
      return false;
    }

    if (state.source !== "all" && book.source !== state.source) {
      return false;
    }

    if (!q) {
      return true;
    }

    const haystack = [book.title, book.author, book.genre, ...(book.tags || [])].join(" ").toLowerCase();
    return haystack.includes(q);
  });
}

function paginate(items) {
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  state.currentPage = Math.min(state.currentPage, totalPages);
  const start = (state.currentPage - 1) * PAGE_SIZE;
  const visible = items.slice(start, start + PAGE_SIZE);
  return { visible, totalPages, total: items.length };
}

function createActions(book) {
  const publishLabel = book.status === "published" ? "Unpublish" : "Publish";
  return `
    <div class="actions">
      <button type="button" data-action="edit" data-id="${book.id}">Edit</button>
      <button type="button" data-action="delete" data-id="${book.id}">Delete</button>
      <button type="button" data-action="toggle-publish" data-id="${book.id}">${publishLabel}</button>
      <button type="button" data-action="chapters" data-id="${book.id}">Manage Chapters</button>
      <button type="button" data-action="audio" data-id="${book.id}">Upload Audio</button>
      <a href="book.html?id=${encodeURIComponent(book.id)}" data-action="preview" data-id="${book.id}">Preview</a>
    </div>
  `;
}

function renderTable(items) {
  elements.booksTableBody.innerHTML = "";
  items.forEach((book) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><img class="cover-thumb" src="${createCoverSvg(book.title, book.genre)}" alt="${book.title} cover" loading="lazy" /></td>
      <td>
        <strong>${book.title}</strong>
        <div class="source-chip">${book.source === "ai-generated" ? "AI-generated" : "Uploaded manually"}</div>
      </td>
      <td>${book.author}</td>
      <td>${book.genre}</td>
      <td><span class="status ${book.status}">${book.status}</span></td>
      <td>${book.createdDate}</td>
      <td>${createActions(book)}</td>
    `;
    elements.booksTableBody.appendChild(tr);
  });
}

function renderGrid(items) {
  elements.gridView.innerHTML = "";
  items.forEach((book) => {
    const card = document.createElement("article");
    card.className = "book-card";
    card.innerHTML = `
      <img class="cover-thumb" src="${createCoverSvg(book.title, book.genre)}" alt="${book.title} cover" loading="lazy" />
      <h3>${book.title}</h3>
      <p>${book.author} • ${book.genre}</p>
      <p>${book.createdDate}</p>
      <span class="status ${book.status}">${book.status}</span>
      <span class="source-chip">${book.source === "ai-generated" ? "AI-generated" : "Uploaded manually"}</span>
      ${createActions(book)}
    `;
    elements.gridView.appendChild(card);
  });
}

function render() {
  const filtered = applyFilters(state.books);
  const { visible, totalPages, total } = paginate(filtered);

  elements.resultsMeta.textContent = `${total} results`;
  elements.pageMeta.textContent = `Page ${state.currentPage} of ${totalPages}`;
  elements.prevPageBtn.disabled = state.currentPage === 1;
  elements.nextPageBtn.disabled = state.currentPage === totalPages;

  elements.tableView.classList.toggle("hidden", state.view !== "table");
  elements.gridView.classList.toggle("hidden", state.view !== "grid");

  renderTable(visible);
  renderGrid(visible);
}

function updateBook(id, updater) {
  const index = state.books.findIndex((item) => item.id === id);
  if (index < 0) {
    return;
  }
  state.books[index] = updater(state.books[index]);
}

function handleAction(action, id) {
  const book = state.books.find((item) => item.id === id);
  if (!book) {
    return;
  }

  if (action === "delete") {
    state.books = state.books.filter((item) => item.id !== id);
    showToast("Book deleted");
    render();
    return;
  }

  if (action === "toggle-publish") {
    updateBook(id, (item) => ({ ...item, status: item.status === "published" ? "draft" : "published" }));
    showToast("Publication status updated");
    render();
    return;
  }

  if (action === "edit") {
    showToast(`Edit ${book.title}`);
    return;
  }

  if (action === "chapters") {
    showToast(`Manage chapters for ${book.title}`);
    return;
  }

  if (action === "audio") {
    showToast(`Upload audio for ${book.title}`);
  }
}

function bindEvents() {
  elements.logoutBtn.addEventListener("click", () => {
    localStorage.removeItem(ADMIN_AUTH_KEY);
    window.location.href = "admin-login.html";
  });

  elements.searchInput.addEventListener("input", () => {
    state.query = elements.searchInput.value;
    state.currentPage = 1;
    render();
  });

  elements.statusFilter.addEventListener("change", () => {
    state.status = elements.statusFilter.value;
    state.currentPage = 1;
    render();
  });

  elements.sourceFilter.addEventListener("change", () => {
    state.source = elements.sourceFilter.value;
    state.currentPage = 1;
    render();
  });

  elements.viewMode.addEventListener("change", () => {
    state.view = elements.viewMode.value;
    render();
  });

  elements.prevPageBtn.addEventListener("click", () => {
    if (state.currentPage > 1) {
      state.currentPage -= 1;
      render();
    }
  });

  elements.nextPageBtn.addEventListener("click", () => {
    state.currentPage += 1;
    render();
  });

  document.addEventListener("click", (event) => {
    const actionEl = event.target.closest("[data-action][data-id]");
    if (!actionEl || actionEl.tagName === "A") {
      return;
    }
    handleAction(actionEl.dataset.action, actionEl.dataset.id);
  });
}

async function loadBooks() {
  try {
    const response = await fetch("./data/admin-books.json", { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = await response.json();
    state.books = Array.isArray(data.books) ? data.books : [];
  } catch (error) {
    state.books = [];
  }
}

async function bootstrap() {
  if (!requireAuth()) {
    return;
  }
  bindEvents();
  await loadBooks();
  render();
}

bootstrap();
