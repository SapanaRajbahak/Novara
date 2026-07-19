const ADMIN_AUTH_KEY = "novara.admin.auth";

const API_BASE_URL = (window.NovaraSession && window.NovaraSession.API_BASE_URL) || "https://novara-6s67.onrender.com";

const elements = {
  widgets: document.getElementById("widgets"),
  uploadsTableBody: document.getElementById("uploadsTableBody"),
  aiGrid: document.getElementById("aiGrid"),
  aiPanel: document.getElementById("aiGrid") ? document.getElementById("aiGrid").closest("section.panel") : null,
  quickActions: document.getElementById("quickActions"),
  logoutBtn: document.getElementById("logoutBtn"),
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
  if (!elements.widgets) {
    return;
  }

  elements.widgets.innerHTML = "";
  const cards = [
    ["Total Books", metrics.totalBooks],
    ["Total Chapters", metrics.totalChapters],
    ["Total Audiobooks", metrics.totalAudiobooks],
    ["Total Users", metrics.totalUsers],
    ["Drafts", metrics.drafts],
    ["Published Books", metrics.publishedBooks],
  ];

  cards.forEach(([label, value]) => {
    elements.widgets.appendChild(createWidget(label, value));
  });
}

function renderUploads(rows) {
  if (!elements.uploadsTableBody) {
    return;
  }

  elements.uploadsTableBody.innerHTML = "";
  if (!rows.length) {
    const tr = document.createElement("tr");
    tr.innerHTML = "<td colspan=\"5\">No real data yet</td>";
    elements.uploadsTableBody.appendChild(tr);
    return;
  }

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
  if (!elements.aiGrid) {
    return;
  }

  if (!items.length) {
    elements.aiGrid.innerHTML = "<p>No real data yet</p>";
    return;
  }

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
  if (!elements.quickActions) {
    return;
  }

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

async function apiFetch(path) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    credentials: "include",
    cache: "no-store",
  });

  const payload = await response.json().catch(() => ({ success: false }));
  if (!response.ok || !payload.success) {
    throw new Error(payload.error || `HTTP ${response.status}`);
  }

  return payload.data;
}

function formatUploadedAt(value) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "-";
  }
  return parsed.toLocaleString();
}

function normalizeUploadRows(rows) {
  if (!Array.isArray(rows)) {
    return [];
  }
  return rows.map((row) => ({
    title: row.title || "Untitled",
    type: row.type || "Unknown",
    author: row.author || "Unknown",
    status: row.status || "Draft",
    uploadedAt: formatUploadedAt(row.uploadedAt || row.createdAt),
  }));
}

function normalizeAiRows(rows) {
  if (!Array.isArray(rows)) {
    return [];
  }
  return rows.map((row) => ({
    title: row.title || "Untitled",
    type: row.type || "AI Content",
    createdAt: formatUploadedAt(row.createdAt),
  }));
}

function bindEvents() {
  if (elements.logoutBtn) {
    elements.logoutBtn.addEventListener("click", () => {
      localStorage.removeItem(ADMIN_AUTH_KEY);
      window.location.href = "/index.html";
    });
  }
}

async function loadDashboardData() {
  const [metrics, recentUploads, recentAiContent] = await Promise.all([
    apiFetch("/api/admin/stats"),
    apiFetch("/api/admin/recent-uploads?limit=10"),
    apiFetch("/api/admin/recent-ai-content?limit=6").catch(() => []),
  ]);

  return {
    metrics,
    recentUploads: normalizeUploadRows(recentUploads),
    recentAiContent: normalizeAiRows(recentAiContent),
    quickActions: ["Upload New Book", "Create AI Story", "Publish Drafts", "Invite Editor"],
  };
}

async function bootstrap() {
  if (!requireAuth()) {
    return;
  }

  try {
    const data = await loadDashboardData();
    renderWidgets(data.metrics);
    renderUploads(data.recentUploads);
    renderAiContent(data.recentAiContent);
    renderQuickActions(data.quickActions);
    if (elements.aiPanel && !data.recentAiContent.length) {
      elements.aiPanel.hidden = true;
    }
  } catch (error) {
    console.error("Failed to load admin dashboard data:", error);
    renderWidgets({
      totalBooks: 0,
      totalChapters: 0,
      totalAudiobooks: 0,
      totalUsers: 0,
      drafts: 0,
      publishedBooks: 0,
    });
    renderUploads([]);
    renderAiContent([]);
    renderQuickActions(["Upload New Book", "Create AI Story", "Publish Drafts", "Invite Editor"]);
    if (elements.aiPanel) {
      elements.aiPanel.hidden = true;
    }
    
    const errorMessage = document.createElement("div");
    errorMessage.className = "error-message";
    errorMessage.style.cssText = "padding: 16px; background: #fee; border: 1px solid #fcc; border-radius: 8px; margin: 16px 0; color: #c33;";
    errorMessage.textContent = `Unable to load dashboard data: ${error.message || "Unknown error"}. Please check your connection and try again.`;
    
    const widgetsSection = document.querySelector(".widgets");
    if (widgetsSection && widgetsSection.parentNode) {
      widgetsSection.parentNode.insertBefore(errorMessage, widgetsSection.nextSibling);
    }
  }

  bindEvents();
}

bootstrap();

const openControlsPanelBtn = document.getElementById("openControlsPanelBtn");
const openPayoutPanelBtn = document.getElementById("openPayoutPanelBtn");
const openRevenuePanelBtn = document.getElementById("openRevenuePanelBtn");
const openSubscriptionPanelBtn = document.getElementById("openSubscriptionPanelBtn");

if (openControlsPanelBtn) {
  openControlsPanelBtn.addEventListener("click", () => {
    window.location.href = "admin-controls.html";
  });
}
if (openPayoutPanelBtn) {
  openPayoutPanelBtn.addEventListener("click", () => {
    window.location.href = "admin-payout.html";
  });
}
if (openRevenuePanelBtn) {
  openRevenuePanelBtn.addEventListener("click", () => {
    window.location.href = "admin-revenue.html";
  });
}
if (openSubscriptionPanelBtn) {
  openSubscriptionPanelBtn.addEventListener("click", () => {
    window.location.href = "admin-subscriptions.html";
  });
}

