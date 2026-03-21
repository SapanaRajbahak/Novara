const elements = {
  dashboardSwitcher: document.getElementById("dashboardSwitcher"),
  writerSignOutBtn: document.getElementById("writerSignOutBtn"),
  writerHeading: document.getElementById("writerHeading"),
  writerSubtitle: document.getElementById("writerSubtitle"),
  writerPenName: document.getElementById("writerPenName"),
  writerBio: document.getElementById("writerBio"),
  writerGenres: document.getElementById("writerGenres"),
  writerStats: document.getElementById("writerStats"),
  writerContent: document.getElementById("writerContent"),
  accessNotice: document.getElementById("accessNotice"),
  authorAvatar: document.getElementById("authorAvatar"),
  storyFilterTabs: document.getElementById("storyFilterTabs"),
  storySort: document.getElementById("storySort"),
  storySearch: document.getElementById("storySearch"),
  writingTools: document.getElementById("writingTools"),
  readsChart: document.getElementById("readsChart"),
  analyticsStats: document.getElementById("analyticsStats"),
  recentActivity: document.getElementById("recentActivity"),
  monetizationStats: document.getElementById("monetizationStats"),
  assistantActions: document.getElementById("assistantActions"),
  heroActions: document.getElementById("heroActions"),
};

const uiState = {
  activeFilter: "ALL",
  searchTerm: "",
  sortBy: "last-edited",
  books: [],
  profile: null,
  insights: null,
};

const filterTabs = [
  { key: "ALL", label: "All" },
  { key: "DRAFT", label: "Drafts" },
  { key: "PUBLISHED", label: "Published" },
  { key: "SCHEDULED", label: "Scheduled" },
];

const aiActions = [
  "Generate Story Idea",
  "Generate Chapter",
  "Rewrite Scene",
  "Improve Dialogue",
  "Expand Description",
  "Translate Chapter",
];

const appRoutes = window.NovelReadSession && window.NovelReadSession.APP_ROUTES
  ? {
    ...window.NovelReadSession.APP_ROUTES,
    writerOnboarding: "./writer-onboarding.html",
  }
  : {
    readerDashboard: "./reader-dashboard.html",
    writerDashboard: "./writer-dashboard.html",
    writerOnboarding: "./writer-onboarding.html",
    writerStudio: "./writer-stories-new.html",
  };

function normalizeBookStatus(status) {
  const value = String(status || "DRAFT").toUpperCase();
  if (value === "SCHEDULED" || value === "PUBLISHED" || value === "DRAFT") {
    return value;
  }
  return "DRAFT";
}

function formatStatusLabel(status) {
  const normalized = normalizeBookStatus(status);
  if (normalized === "PUBLISHED") {
    return "Published";
  }
  if (normalized === "SCHEDULED") {
    return "Scheduled";
  }
  return "Draft";
}

function getStatusBadgeClass(status) {
  const normalized = normalizeBookStatus(status);
  if (normalized === "PUBLISHED") {
    return "badge badge-published";
  }
  if (normalized === "SCHEDULED") {
    return "badge badge-scheduled";
  }
  return "badge badge-draft";
}

function formatDate(value) {
  if (!value) {
    return "Recently";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "Recently";
  }
  return parsed.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function extractInitials(name) {
  if (!name || typeof name !== "string") {
    return "NR";
  }
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) {
    return "NR";
  }
  return words
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join("");
}

function renderGenres(genres) {
  const values = Array.isArray(genres) && genres.length ? genres : ["General Fiction", "Contemporary"];
  elements.writerGenres.innerHTML = values
    .map((genre) => `<span class="genre-chip">${genre}</span>`)
    .join("");
}

function renderStats(stats) {
  const cards = [
    { label: "Total Books", value: Number(stats.totalBooks || 0).toLocaleString() },
    { label: "Published", value: Number(stats.publishedBooks || 0).toLocaleString() },
    { label: "Drafts", value: Number(stats.drafts || 0).toLocaleString() },
    { label: "Total Chapters", value: Number(stats.totalChapters || 0).toLocaleString() },
    { label: "Total Reads", value: Number(stats.totalReads || 0).toLocaleString() },
    { label: "Likes / Favorites", value: Number(stats.totalFavorites || 0).toLocaleString() },
    { label: "Comments", value: Number(stats.totalComments || 0).toLocaleString() },
    { label: "Genres", value: Number(stats.totalGenres || 0).toLocaleString() },
  ];

  elements.writerStats.innerHTML = cards
    .map((card) => `
      <article class="stat-card">
        <p>${card.label}</p>
        <strong>${card.value}</strong>
      </article>
    `)
    .join("");
}

function renderFilterTabs() {
  elements.storyFilterTabs.innerHTML = filterTabs
    .map((tab) => `
      <button
        type="button"
        class="tab-btn ${uiState.activeFilter === tab.key ? "is-active" : ""}"
        role="tab"
        aria-selected="${uiState.activeFilter === tab.key ? "true" : "false"}"
        data-filter="${tab.key}"
      >
        ${tab.label}
      </button>
    `)
    .join("");
}

function getBookCoverStyle(index) {
  const palettes = [
    "linear-gradient(145deg, #3f665b, #c37f59)",
    "linear-gradient(145deg, #c37b52, #7b4c3a)",
    "linear-gradient(145deg, #4f6f62, #947243)",
    "linear-gradient(145deg, #6d4b38, #b9874f)",
  ];
  return palettes[index % palettes.length];
}

function getStoryDescription(book) {
  const genre = book.genre || "Literary";
  return `${genre} narrative exploring layered characters, emotional tension, and a polished chapter flow for publication.`;
}

function getFilteredBooks() {
  return uiState.books
    .filter((book) => {
      if (uiState.activeFilter === "ALL") {
        return true;
      }
      return normalizeBookStatus(book.status) === uiState.activeFilter;
    })
    .filter((book) => {
      if (!uiState.searchTerm) {
        return true;
      }
      const term = uiState.searchTerm.toLowerCase();
      return String(book.title || "").toLowerCase().includes(term);
    })
    .sort((a, b) => {
      if (uiState.sortBy === "a-z") {
        return String(a.title || "").localeCompare(String(b.title || ""));
      }
      if (uiState.sortBy === "most-read") {
        return Number(b.reads || 0) - Number(a.reads || 0);
      }
      const dateA = new Date(a.updatedAt).getTime() || 0;
      const dateB = new Date(b.updatedAt).getTime() || 0;
      return dateB - dateA;
    });
}

function renderEmptyState(profile) {
  elements.writerContent.innerHTML = `
    <section class="empty-state">
      <h3>Your writer space is ready.</h3>
      <p class="helper-text">${profile.penName}, your premium writing workspace is active. Start your creation flow with your first concept, then move to chapters, preview, and publish.</p>
      <button type="button" class="btn btn-primary" data-action="create-story">Create Your First Story</button>
      <div class="empty-checklist">
        <article class="empty-step">
          <span class="empty-step-index">1</span>
          <div>
            <strong>Shape your first concept</strong>
            <p class="helper-text">Define your story core, themes, and genre promise for readers.</p>
          </div>
        </article>
        <article class="empty-step">
          <span class="empty-step-index">2</span>
          <div>
            <strong>Prepare your first manuscript</strong>
            <p class="helper-text">Create chapters and iterate with your writing tools before release.</p>
          </div>
        </article>
        <article class="empty-step">
          <span class="empty-step-index">3</span>
          <div>
            <strong>Publish when ready</strong>
            <p class="helper-text">Preview your story experience and publish with confidence.</p>
          </div>
        </article>
      </div>
    </section>
  `;
}

function renderBooks(books) {
  if (!books.length) {
    renderEmptyState(uiState.profile);
    return;
  }

  elements.writerContent.innerHTML = `
    <div class="story-list">
      ${books
        .map((book, index) => {
          const statusLabel = formatStatusLabel(book.status);
          const badgeClass = getStatusBadgeClass(book.status);
          const genreLabel = book.genre || "Genre pending";
          return `
          <article class="story-card" data-story-id="${book.id}">
            <div class="story-cover" style="background:${getBookCoverStyle(index)}">
              ${genreLabel}
            </div>
            <div class="story-main">
              <div class="story-title-row">
                <h3 class="story-title">${book.title || "Untitled Story"}</h3>
                <span class="${badgeClass}">${statusLabel}</span>
              </div>
              <p class="story-excerpt">${getStoryDescription(book)}</p>
              <div class="genre-list">
                <span class="genre-chip">${genreLabel}</span>
              </div>
              <div class="story-meta">
                <span>Last edited: ${formatDate(book.updatedAt)}</span>
                <span>Chapters: ${Number(book.chapters || 0)}</span>
                <span>Reads: ${Number(book.reads || 0).toLocaleString()}</span>
                <span>Favorites: ${Number(book.likes || 0).toLocaleString()}</span>
              </div>
              <div class="story-actions">
                <button type="button" class="btn btn-soft" data-action="edit-story">Edit</button>
                <button type="button" class="btn btn-soft" data-action="manage-chapters">Manage Chapters</button>
                <button type="button" class="btn btn-soft" data-action="preview-story">Preview</button>
                <button type="button" class="btn btn-primary" data-action="publish-story">Publish</button>
              </div>
            </div>
          </article>
        `;
        })
        .join("")}
    </div>
  `;
}

function renderWritingTools(tools) {
  const toolCards = [
    { label: "Word Count Today", value: `${Number(tools.wordCountToday || 0).toLocaleString()} words` },
    { label: "Weekly Writing Streak", value: `${Number(tools.weeklyWritingStreak || 0).toLocaleString()} days` },
    { label: "Draft Completion %", value: `${Number(tools.draftCompletionPercent || 0).toLocaleString()}%` },
    { label: "Auto-save Status", value: tools.autoSaveStatus || "Active - waiting for your first draft" },
  ];

  elements.writingTools.innerHTML = toolCards
    .map((tool) => `
      <article class="tool-item">
        <p>${tool.label}</p>
        <strong>${tool.value}</strong>
      </article>
    `)
    .join("");
}

function renderReadsChart(readsOverTime) {
  const series = Array.isArray(readsOverTime) ? readsOverTime : [];
  const values = series.map((item) => Number(item.value || 0));
  const maxValue = Math.max(...values, 1);

  elements.readsChart.innerHTML = values
    .map((value, index) => {
      const height = Math.max(18, Math.round((Number(value || 0) / maxValue) * 120));
      return `
        <div class="chart-bar" style="height:${height}px">
          <span>${series[index] ? series[index].month : "-"}</span>
        </div>
      `;
    })
    .join("");

  return values;
}

function renderAnalytics(analytics) {
  renderReadsChart(analytics.readsOverTime || []);
  const trendValue = Number(analytics.engagementTrend || 0);

  const analyticsCards = [
    { label: "Engagement Trend", value: `${trendValue >= 0 ? "+" : ""}${trendValue}%` },
    { label: "Most Popular Book", value: analytics.mostPopularBook || "No story published yet" },
    { label: "Recent Reader Activity", value: `${Number(analytics.recentReaderActivity || 0).toLocaleString()} events` },
    { label: "Completion Rate", value: analytics.completionRate || "0%" },
  ];

  elements.analyticsStats.innerHTML = analyticsCards
    .map((item) => `
      <article class="analytics-item">
        <p>${item.label}</p>
        <strong>${item.value}</strong>
      </article>
    `)
    .join("");
}

function renderMonetization(monetization) {
  const moneyCards = [
    { label: "Coins Earned", value: Number(monetization.coinsEarned || 0).toLocaleString() },
    { label: "Estimated Revenue", value: `$${Number(monetization.estimatedRevenue || 0).toLocaleString()}` },
    { label: "Paid Chapters Unlocked", value: Number(monetization.paidChaptersUnlocked || 0).toLocaleString() },
    { label: "Subscription Readers", value: Number(monetization.subscriptionReaders || 0).toLocaleString() },
  ];

  elements.monetizationStats.innerHTML = moneyCards
    .map((item) => `
      <article class="money-item">
        <p>${item.label}</p>
        <strong>${item.value}</strong>
      </article>
    `)
    .join("");
}

function renderActivity(recentActivity) {
  const activityRows = Array.isArray(recentActivity) ? recentActivity : [];

  if (!activityRows.length) {
    elements.recentActivity.innerHTML = `
      <article class="activity-item">
        <strong>No recent reader activity yet</strong>
        <p>As readers engage with your stories, real-time events will appear here.</p>
      </article>
    `;
    return;
  }

  elements.recentActivity.innerHTML = activityRows
    .slice(0, 7)
    .map((activity) => `
      <article class="activity-item">
        <strong>${activity.title}</strong>
        <p>${activity.note}${activity.dateLabel ? ` · ${activity.dateLabel}` : ""}</p>
      </article>
    `)
    .join("");
}

function renderAssistantActions() {
  elements.assistantActions.innerHTML = aiActions
    .map((label) => `<button type="button" class="assistant-btn" data-action="ai-tool">${label}</button>`)
    .join("");
}

function renderAccessNotice(message, linkHref, linkLabel) {
  elements.accessNotice.hidden = false;
  elements.accessNotice.innerHTML = `<p>${message} <a href="${linkHref}">${linkLabel}</a></p>`;
}

function clearAccessNotice() {
  elements.accessNotice.hidden = true;
  elements.accessNotice.innerHTML = "";
}

function refreshStoriesWorkspace() {
  renderFilterTabs();
  renderBooks(getFilteredBooks());
}

function bindStoryControls() {
  elements.storyFilterTabs.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-filter]");
    if (!button) {
      return;
    }
    uiState.activeFilter = button.dataset.filter;
    refreshStoriesWorkspace();
  });

  elements.storySort.addEventListener("change", (event) => {
    uiState.sortBy = event.target.value;
    refreshStoriesWorkspace();
  });

  elements.storySearch.addEventListener("input", (event) => {
    uiState.searchTerm = event.target.value.trim();
    refreshStoriesWorkspace();
  });
}

function onActionClick(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) {
    return;
  }

  const storyCard = button.closest(".story-card");
  const storyId = storyCard ? storyCard.dataset.storyId : "";

  const action = button.dataset.action;
  if (action === "preview-profile") {
    window.location.href = "./profile.html";
    return;
  }

  if (action === "edit-profile") {
    window.location.href = appRoutes.writerOnboarding;
    return;
  }

  if (action === "create-story" || action === "new-chapter" || action === "continue-writing") {
    window.location.href = appRoutes.writerStudio;
    return;
  }

  if (action === "manage-chapters" && storyId) {
    window.location.href = `./writer-story-chapters.html?storyId=${encodeURIComponent(storyId)}`;
    return;
  }

  if (action === "preview-story" && storyId) {
    window.location.href = `./book.html?id=${encodeURIComponent(storyId)}`;
    return;
  }

  if (action === "edit-story" && storyId) {
    window.location.href = `./writer-story-chapters.html?storyId=${encodeURIComponent(storyId)}`;
    return;
  }

  if (action === "publish-story" && storyId) {
    fetch(`${window.NovelReadSession.API_BASE_URL}/api/writer/stories/${storyId}/publish`, {
      method: "POST",
      credentials: "include",
    })
      .then((response) => response.json().then((payload) => ({ response, payload })))
      .then(({ response, payload }) => {
        if (!response.ok || !payload.success) {
          throw new Error(payload.error || "Unable to publish story");
        }
        return fetchWriterDashboardData();
      })
      .then((latestData) => {
        const profile = latestData.profile || uiState.profile;
        renderPremiumDashboard(profile, latestData);
        if (window.NovelReadSession && typeof window.NovelReadSession.showToast === "function") {
          window.NovelReadSession.showToast("Story published successfully");
        }
      })
      .catch(() => {
        if (window.NovelReadSession && typeof window.NovelReadSession.showToast === "function") {
          window.NovelReadSession.showToast("Unable to publish this story right now");
        }
      });
    return;
  }

  if (window.NovelReadSession && typeof window.NovelReadSession.showToast === "function") {
    window.NovelReadSession.showToast("This feature will be connected in the next writer tools release.");
  }
}

async function fetchWriterDashboardData() {
  const response = await fetch(`${window.NovelReadSession.API_BASE_URL}/api/writer/dashboard`, {
    cache: "no-store",
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error("Writer dashboard unavailable");
  }

  const payload = await response.json();
  if (!payload || !payload.data) {
    throw new Error("Invalid writer dashboard payload");
  }
  return payload.data;
}

function initializePageInteractions() {
  bindStoryControls();
  elements.heroActions.addEventListener("click", onActionClick);
  document.addEventListener("click", onActionClick);
  renderAssistantActions();

  if (elements.writerSignOutBtn) {
    elements.writerSignOutBtn.addEventListener("click", async () => {
      if (window.NovelReadSession && typeof window.NovelReadSession.signOut === "function") {
        await window.NovelReadSession.signOut("./index.html");
        return;
      }
      window.location.href = "./index.html";
    });
  }
}

function renderPremiumDashboard(profile, data) {
  const books = Array.isArray(data.books) ? data.books : [];
  const stats = data.stats || {};
  const tools = data.tools || {};
  const analytics = data.analytics || {};
  const monetization = data.monetization || {};
  const recentActivity = Array.isArray(data.recentActivity) ? data.recentActivity : [];

  uiState.profile = profile;
  uiState.books = books;
  uiState.insights = data;

  elements.writerHeading.textContent = `Welcome back, ${profile.penName}.`;
  elements.writerSubtitle.textContent = "Manage your author profile, stories, and publishing flow while switching between reader and writer dashboards from one account.";
  elements.writerPenName.textContent = profile.penName;
  elements.writerBio.textContent = profile.bio || "Add a short author bio to build trust with your readers and highlight your writing voice.";
  elements.authorAvatar.textContent = extractInitials(profile.penName || profile.name || "NovelRead");

  renderGenres(profile.preferredGenres || []);
  renderStats(stats);
  renderWritingTools(tools);
  renderAnalytics(analytics);
  renderMonetization(monetization);
  renderActivity(recentActivity);
  refreshStoriesWorkspace();
}

async function loadDashboard() {
  initializePageInteractions();

  const user = window.NovelReadSession ? await window.NovelReadSession.fetchCurrentUser() : null;

  if (!user) {
    elements.writerHeading.textContent = "Writer access requires a signed-in reader account.";
    elements.writerSubtitle.textContent = "Sign in first, then enable writer access from the same account.";
    renderAccessNotice(
      "This dashboard is hidden until writer access is enabled on your reader profile.",
      appRoutes.readerDashboard,
      "Return to Reader Dashboard"
    );
    return;
  }

  if (window.NovelReadSession) {
    window.NovelReadSession.renderDashboardSwitcher(elements.dashboardSwitcher, {
      currentDashboard: "writer",
      readerHref: appRoutes.readerDashboard,
      writerHref: appRoutes.writerDashboard,
    });
  }

  if (!window.NovelReadSession.canUseWriter(user)) {
    elements.writerHeading.textContent = "Writer access has not been enabled yet.";
    elements.writerSubtitle.textContent = "Complete onboarding to unlock your writer dashboard without opening a second account.";
    renderAccessNotice(
      "You can start the writer journey from your reader account in one step.",
      appRoutes.writerOnboarding,
      "Open Writer Onboarding"
    );
    return;
  }

  clearAccessNotice();

  try {
    const data = await fetchWriterDashboardData();
    const profile = data.profile || {
      penName: user.name || "Writer",
      bio: "",
      preferredGenres: [],
    };
    renderPremiumDashboard(profile, data);
  } catch (error) {
    elements.writerHeading.textContent = "Your writer dashboard could not be loaded.";
    elements.writerSubtitle.textContent = "The account is writer-enabled, but the dashboard data request failed.";
    renderAccessNotice(
      "Try returning to your reader dashboard and re-open the writer workspace.",
      appRoutes.readerDashboard,
      "Open Reader Dashboard"
    );
  }
}

loadDashboard();