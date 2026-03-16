const ADMIN_AUTH_KEY = "novelread.admin.auth";

const elements = {
  widgets: document.getElementById("widgets"),
  uploadsTableBody: document.getElementById("uploadsTableBody"),
  aiGrid: document.getElementById("aiGrid"),
  quickActions: document.getElementById("quickActions"),
  logoutBtn: document.getElementById("logoutBtn")
};

function requireAuth() {
  const auth = localStorage.getItem(ADMIN_AUTH_KEY);
  if (auth !== "1") {
    const next = encodeURIComponent("admin.html");
    window.location.href = `admin-login.html?next=${next}`;
    return false;
  }
  return true;
}

function createWidget(label, value) {
  const card = document.createElement("article");
  card.className = "widget";
  card.innerHTML = `<p>${label}</p><strong>${value}</strong>`;
  return card;
}

function renderWidgets(metrics) {
  elements.widgets.innerHTML = "";
  const cards = [
    ["Total Books", metrics.totalBooks],
    ["Total Chapters", metrics.totalChapters],
    ["Total Audiobooks", metrics.totalAudiobooks],
    ["Total Users", metrics.totalUsers],
    ["Drafts", metrics.drafts],
    ["Published Books", metrics.publishedBooks]
  ];

  cards.forEach(([label, value]) => {
    elements.widgets.appendChild(createWidget(label, value));
  });
}

function renderUploads(rows) {
  elements.uploadsTableBody.innerHTML = "";
  rows.forEach((row) => {
    const tr = document.createElement("tr");
    const statusClass = String(row.status || "").toLowerCase() === "published" ? "published" : "draft";
    tr.innerHTML = `
      <td>${row.title}</td>
      <td>${row.type}</td>
      <td>${row.author}</td>
      <td><span class="status ${statusClass}">${row.status}</span></td>
      <td>${row.uploadedAt}</td>
    `;
    elements.uploadsTableBody.appendChild(tr);
  });
}

function renderAiContent(items) {
  elements.aiGrid.innerHTML = "";
  items.forEach((item) => {
    const card = document.createElement("article");
    card.className = "ai-card";
    card.innerHTML = `
      <h3>${item.title}</h3>
      <p>${item.type}</p>
      <p>${item.createdAt}</p>
    `;
    elements.aiGrid.appendChild(card);
  });
}

function renderQuickActions(actions) {
  elements.quickActions.innerHTML = "";
  actions.forEach((action) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "action-btn";
    button.textContent = action;
    button.addEventListener("click", () => {
      window.alert(`${action} action placeholder`);
    });
    elements.quickActions.appendChild(button);
  });
}

function bindEvents() {
  elements.logoutBtn.addEventListener("click", () => {
    localStorage.removeItem(ADMIN_AUTH_KEY);
    window.location.href = "admin-login.html";
  });
}

async function loadDashboardData() {
  try {
    const response = await fetch("./data/admin-dashboard.json", { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    return {
      metrics: {
        totalBooks: 0,
        totalChapters: 0,
        totalAudiobooks: 0,
        totalUsers: 0,
        drafts: 0,
        publishedBooks: 0
      },
      recentUploads: [],
      recentAiContent: [],
      quickActions: []
    };
  }
}

async function bootstrap() {
  if (!requireAuth()) {
    return;
  }

  const data = await loadDashboardData();
  renderWidgets(data.metrics);
  renderUploads(data.recentUploads);
  renderAiContent(data.recentAiContent);
  renderQuickActions(data.quickActions);
  bindEvents();
}

bootstrap();
