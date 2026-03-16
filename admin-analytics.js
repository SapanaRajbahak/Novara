const ADMIN_AUTH_KEY = "novelread.admin.auth";
const USERS_STORE_KEY = "novelread.admin.users";
const BOOKS_STORE_KEY = "novelread.admin.uploadedBooks";
const AUDIO_STORE_KEY = "novelread.admin.audioLibrary";

const elements = {
  logoutBtn: document.getElementById("logoutBtn"),
  totalReads: document.getElementById("totalReads"),
  listeningHours: document.getElementById("listeningHours"),
  activeUsers: document.getElementById("activeUsers"),
  popularBooksList: document.getElementById("popularBooksList"),
  completedBooksList: document.getElementById("completedBooksList"),
  recentActivityList: document.getElementById("recentActivityList")
};

function requireAuth() {
  const auth = localStorage.getItem(ADMIN_AUTH_KEY);
  if (auth !== "1") {
    const next = encodeURIComponent("admin-analytics.html");
    window.location.href = `admin-login.html?next=${next}`;
    return false;
  }
  return true;
}

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (error) {
    return fallback;
  }
}

function getUsers() {
  const users = readJson(USERS_STORE_KEY, []);
  if (users.length) {
    return users;
  }
  return [
    { id: "u-1001", name: "Rina Sol", booksRead: 27, status: "active" },
    { id: "u-1002", name: "Marek Flint", booksRead: 13, status: "active" },
    { id: "u-1003", name: "Talia Quinn", booksRead: 31, status: "active" },
    { id: "u-1004", name: "Eli Rook", booksRead: 5, status: "suspended" }
  ];
}

function getBooks() {
  const books = readJson(BOOKS_STORE_KEY, []);
  if (books.length) {
    return books;
  }
  return [
    { id: "book-last-lantern", title: "The Last Lantern" },
    { id: "book-echoes-dawn", title: "Echoes at Dawn" },
    { id: "book-cinder-map", title: "Cinder Map" },
    { id: "book-shallow-stars", title: "Shallow Stars" },
    { id: "book-iron-bloom", title: "Iron Bloom" }
  ];
}

function getAudioLibrary() {
  return readJson(AUDIO_STORE_KEY, {});
}

function formatNumber(value) {
  return new Intl.NumberFormat().format(value);
}

function pseudoMetric(seed, min, spread) {
  const hash = Array.from(seed).reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return min + (hash % spread);
}

function buildMetrics() {
  const users = getUsers();
  const books = getBooks();
  const audioLibrary = getAudioLibrary();

  const totalReads = users.reduce((sum, user) => sum + (Number(user.booksRead) || 0), 0);

  const audioBookIds = Object.keys(audioLibrary);
  const baseHours = audioBookIds.reduce((sum, bookId) => {
    const data = audioLibrary[bookId] || {};
    const tracks = data.tracksByChapter || {};
    return sum + Object.keys(tracks).length * 0.6;
  }, 0);
  const listeningHours = Math.max(18, Math.round(baseHours + totalReads * 0.18));

  const activeUsers = users.filter((user) => user.status !== "suspended").length;

  const popularBooks = books.slice(0, 5).map((book) => ({
    title: book.title,
    reads: pseudoMetric(book.id || book.title, 120, 420)
  })).sort((a, b) => b.reads - a.reads);

  const completedBooks = books.slice(0, 5).map((book) => ({
    title: book.title,
    completionRate: pseudoMetric(`${book.id || book.title}-completion`, 52, 44)
  })).sort((a, b) => b.completionRate - a.completionRate);

  const recentActivity = [
    `User ${users[0]?.name || "Unknown"} completed a chapter sequence.`,
    `Audiobook tracks were updated for ${books[0]?.title || "featured book"}.`,
    `AI draft generated for ${books[1]?.title || "next project"}.`,
    `${activeUsers} users are currently marked active.`,
    `Editorial role changes synced for moderation queue.`
  ];

  return {
    totalReads,
    listeningHours,
    activeUsers,
    popularBooks,
    completedBooks,
    recentActivity
  };
}

function renderRankList(target, rows, metricFormatter) {
  target.innerHTML = "";
  rows.forEach((row, index) => {
    const li = document.createElement("li");
    li.className = "rank-item";
    li.innerHTML = `
      <span class="rank-index">${index + 1}</span>
      <span>${row.title}</span>
      <span class="rank-metric">${metricFormatter(row)}</span>
    `;
    target.appendChild(li);
  });
}

function renderActivity(items) {
  elements.recentActivityList.innerHTML = "";
  const now = new Date();

  items.forEach((item, index) => {
    const li = document.createElement("li");
    li.className = "activity-item";

    const stamp = new Date(now.getTime() - index * 35 * 60000);
    li.innerHTML = `
      <span>${item}</span>
      <span class="activity-meta">${stamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
    `;

    elements.recentActivityList.appendChild(li);
  });
}

function bindEvents() {
  elements.logoutBtn.addEventListener("click", () => {
    localStorage.removeItem(ADMIN_AUTH_KEY);
    window.location.href = "admin-login.html";
  });
}

function bootstrap() {
  if (!requireAuth()) {
    return;
  }

  bindEvents();
  const metrics = buildMetrics();

  elements.totalReads.textContent = formatNumber(metrics.totalReads);
  elements.listeningHours.textContent = `${formatNumber(metrics.listeningHours)}h`;
  elements.activeUsers.textContent = formatNumber(metrics.activeUsers);

  renderRankList(elements.popularBooksList, metrics.popularBooks, (row) => `${formatNumber(row.reads)} reads`);
  renderRankList(elements.completedBooksList, metrics.completedBooks, (row) => `${row.completionRate}% complete`);
  renderActivity(metrics.recentActivity);
}

bootstrap();
