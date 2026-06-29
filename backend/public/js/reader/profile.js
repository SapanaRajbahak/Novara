const API_BASE_URL = (window.NovaraSession && window.NovaraSession.API_BASE_URL) || "https://novara-6s67.onrender.com";

async function apiFetch(path, options = {}) {
  const url = `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
  const response = await fetch(url, { credentials: "include", ...options });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || data.message || "Request failed");
  }
  return data;
}

const elements = {
  userAvatar: document.getElementById("userAvatar"),
  userName: document.getElementById("userName"),
  userEmail: document.getElementById("userEmail"),
  userJoinedAt: document.getElementById("userJoinedAt"),
  userRoles: document.getElementById("userRoles"),
  userBio: document.getElementById("userBio"),
  profilePhotoNote: document.getElementById("profilePhotoNote"),
  profileDashboardSwitcher: document.getElementById("profileDashboardSwitcher"),
  profileWriterPanel: document.getElementById("profileWriterPanel"),
  writerProfileNavLink: document.getElementById("writerProfileNavLink"),
  editProfileBtn: document.getElementById("editProfileBtn"),
  viewSettingsBtn: document.getElementById("viewSettingsBtn"),
  editProfilePanel: document.getElementById("editProfilePanel"),
  profileForm: document.getElementById("profileForm"),
  nameInput: document.getElementById("nameInput"),
  penNameField: document.getElementById("penNameField"),
  penNameInput: document.getElementById("penNameInput"),
  bioInput: document.getElementById("bioInput"),
  avatarInput: document.getElementById("avatarInput"),
  removeAvatarToggle: document.getElementById("removeAvatarToggle"),
  preferredGenresInput: document.getElementById("preferredGenresInput"),
  photoSupportMessage: document.getElementById("photoSupportMessage"),
  profileFormMessage: document.getElementById("profileFormMessage"),
  cancelEditBtn: document.getElementById("cancelEditBtn"),
  statsGrid: document.getElementById("statsGrid"),
  writerStatsSection: document.getElementById("writerStatsSection"),
  writerStatsGrid: document.getElementById("writerStatsGrid"),
  savedBooksList: document.getElementById("savedBooksList"),
  preferencesList: document.getElementById("preferencesList"),
  activityList: document.getElementById("activityList"),
  settingsShortcutBtn: document.getElementById("settingsShortcutBtn"),
};

const state = {
  profile: null,
  stats: null,
  library: [],
  activity: [],
  pendingAvatarDataUrl: "",
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
    Drama: ["#3f3348", "#8672a1"],
    Adventure: ["#2b4337", "#5f9267"],
    default: ["#2d3b3a", "#608982"]
  };

  const [c1, c2] = palette[genre] || palette.default;
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='320' height='420'>
    <defs>
      <linearGradient id='g' x1='0' x2='1' y1='0' y2='1'>
        <stop offset='0%' stop-color='${c1}'/>
        <stop offset='100%' stop-color='${c2}'/>
      </linearGradient>
    </defs>
    <rect width='100%' height='100%' rx='22' fill='url(#g)'/>
    <rect x='22' y='24' width='276' height='372' rx='16' fill='rgba(255,255,255,0.10)'/>
    <text x='50%' y='55%' dominant-baseline='middle' text-anchor='middle' fill='rgba(255,255,255,0.9)' font-family='Arial' font-size='66' font-weight='700'>${initials}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function formatDate(value) {
  if (!value) {
    return "Joined date unavailable";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Joined date unavailable";
  }
  return `Joined ${date.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}`;
}

function renderStatCards(target, cards, emptyMessage) {
  target.innerHTML = "";

  if (!cards.length) {
    target.innerHTML = `<div class="placeholder">${emptyMessage}</div>`;
    return;
  }

  cards.forEach((card) => {
    const item = document.createElement("article");
    item.className = "stat-card";
    item.innerHTML = `<p>${card.label}</p><strong>${card.value}</strong>`;
    target.appendChild(item);
  });
}

function renderReaderStats(stats) {
  const cards = [
    { label: "Books Completed", value: stats && typeof stats.booksCompleted === "number" ? stats.booksCompleted : "No data yet" },
    { label: "Books In Progress", value: stats && typeof stats.booksInProgress === "number" ? stats.booksInProgress : "No data yet" },
    { label: "Hours Listened", value: stats && typeof stats.hoursListened === "number" ? `${stats.hoursListened}h` : "No data yet" },
    { label: "Favorite Genre", value: stats && stats.favoriteGenre ? stats.favoriteGenre : "No data yet" },
    { label: "Saved Bookmarks", value: stats && typeof stats.savedBookmarks === "number" ? stats.savedBookmarks : "No data yet" },
    { label: "Notes", value: stats && typeof stats.notesCount === "number" ? stats.notesCount : "No data yet" },
    { label: "Highlights", value: stats && typeof stats.highlightsCount === "number" ? stats.highlightsCount : "No data yet" },
  ];

  renderStatCards(elements.statsGrid, cards, "No reader stats yet.");
}

function renderWriterStats(stats) {
  if (!stats) {
    elements.writerStatsSection.hidden = true;
    elements.writerStatsGrid.innerHTML = "";
    return;
  }

  elements.writerStatsSection.hidden = false;
  const cards = [
    { label: "Total Books", value: stats.totalBooks },
    { label: "Published Books", value: stats.publishedBooks },
    { label: "Drafts", value: stats.draftBooks },
    { label: "Total Reads", value: stats.totalReads },
    { label: "Favorites", value: stats.totalFavorites },
    { label: "Chapters", value: stats.totalChapters },
  ];

  renderStatCards(elements.writerStatsGrid, cards, "No writer stats yet.");
}

function applyAvatar(profile) {
  const displayName = profile.fullName || "Account";
  const initials = window.NovaraSession
    ? window.NovaraSession.getInitials(displayName)
    : displayName.slice(0, 2).toUpperCase();

  if (profile.avatarUrl) {
    const avatarUrl = profile.avatarUrl.startsWith("http") || profile.avatarUrl.startsWith("data:")
      ? profile.avatarUrl
      : `${API_BASE_URL}${profile.avatarUrl}`;
    elements.userAvatar.classList.add("has-image");
    elements.userAvatar.style.backgroundImage = `url('${avatarUrl.replace(/'/g, "\\'")}')`;
    elements.userAvatar.textContent = initials;
    return;
  }

  elements.userAvatar.classList.remove("has-image");
  elements.userAvatar.style.backgroundImage = "";
  elements.userAvatar.textContent = initials;
}

function renderSavedBooks(books) {
  elements.savedBooksList.innerHTML = "";

  if (!books.length) {
    elements.savedBooksList.innerHTML = "<div class=\"placeholder\">No real library activity yet.</div>";
    return;
  }

  books.forEach((book) => {
    const cover = book.coverUrl
      ? (book.coverUrl.startsWith("http") || book.coverUrl.startsWith("data:") ? book.coverUrl : `${API_BASE_URL}${book.coverUrl}`)
      : createCoverSvg(book.title, book.genre);
    const card = document.createElement("article");
    card.className = "book-card";
    card.innerHTML = `
      <img class="book-cover" src="${cover}" alt="${book.title} cover" loading="lazy" />
      <h3>${book.title}</h3>
      <p>${book.authorName || "Unknown Author"}</p>
      <div class="book-meta">
        ${book.genre ? `<span>${book.genre}</span>` : ""}
        ${book.activityType ? `<span>${book.activityType}</span>` : ""}
        ${typeof book.progressPercent === "number" ? `<span>${book.progressPercent}%</span>` : ""}
      </div>
      <a class="btn" href="/reader/book.html?id=${encodeURIComponent(book.id)}">Open</a>
    `;
    elements.savedBooksList.appendChild(card);
  });
}

function renderRoleChips(profile) {
  elements.userRoles.innerHTML = "";
  (profile.roles || []).forEach((role) => {
    const chip = document.createElement("span");
    chip.className = "role-chip";
    chip.textContent = role;
    elements.userRoles.appendChild(chip);
  });
}

function renderPreferences(profile) {
  elements.preferencesList.innerHTML = "";
  const genres = profile.preferences && Array.isArray(profile.preferences.preferredGenres)
    ? profile.preferences.preferredGenres
    : [];

  if (!genres.length) {
    elements.preferencesList.innerHTML = '<div class="placeholder">No profile preferences saved yet.</div>';
    return;
  }

  genres.forEach((genre) => {
    const chip = document.createElement("span");
    chip.className = "chip";
    chip.textContent = genre;
    elements.preferencesList.appendChild(chip);
  });
}

function renderActivity(items) {
  elements.activityList.innerHTML = "";

  if (!items.length) {
    elements.activityList.innerHTML = '<li class="placeholder">No activity yet.</li>';
    return;
  }

  items.forEach((item) => {
    const li = document.createElement("li");
    li.className = "activity-item";
    li.innerHTML = `
      <div class="activity-copy">
        <strong>${item.title}</strong>
        <span>${item.note}</span>
      </div>
      <span class="activity-date">${item.dateLabel || "Recently"}</span>
    `;
    elements.activityList.appendChild(li);
  });
}

function populateForm(profile) {
  elements.nameInput.value = profile.fullName || "";
  elements.bioInput.value = profile.bio || "";
  elements.preferredGenresInput.value = profile.preferences && Array.isArray(profile.preferences.preferredGenres)
    ? profile.preferences.preferredGenres.join(", ")
    : "";

  const showPenName = profile.capabilities && profile.capabilities.canEditPenName;
  elements.penNameField.hidden = !showPenName;
  elements.penNameInput.value = profile.penName || "";
  elements.avatarInput.value = "";
  elements.removeAvatarToggle.checked = false;
  state.pendingAvatarDataUrl = "";
  elements.photoSupportMessage.textContent = profile.capabilities && profile.capabilities.supportsAvatarUpload
    ? "Profile photo uploads are available for this account."
    : "Profile photo uploads are not supported yet, so this page uses your initials as the avatar.";
}

function renderProfile(profile) {
  state.profile = profile;
  const displayName = profile.fullName || "Account";
  applyAvatar(profile);
  elements.userName.textContent = displayName;
  elements.userEmail.textContent = profile.email || "";
  elements.userJoinedAt.textContent = formatDate(profile.joinedAt);
  elements.userBio.textContent = profile.bio || "No bio yet.";
  elements.profilePhotoNote.textContent = profile.capabilities && profile.capabilities.supportsAvatarUpload
    ? "Profile photo uploads are enabled for this account."
    : "Photo uploads are not supported yet. Your avatar uses your real initials instead of placeholder art.";
  renderRoleChips(profile);
  renderPreferences(profile);
  populateForm(profile);
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(new Error("Unable to read image file"));
    reader.readAsDataURL(file);
  });
}

async function refreshProfilePage() {
  try {
    const { profile } = await apiFetch("/api/profile/me");
    if (!profile) {
      renderProfile({ fullName: "", email: "", bio: "", roles: [], preferences: {}, capabilities: {} });
      return;
    }
    renderProfile(profile);
  } catch (e) {
    renderProfile({ fullName: "", email: "", bio: "", roles: [], preferences: {}, capabilities: {} });
  }
}

function setFormMessage(message) {
  elements.profileFormMessage.textContent = message;
}

function bindEvents() {
  elements.settingsShortcutBtn.addEventListener("click", () => {
    window.location.href = "/reader/settings.html";
  });

  elements.viewSettingsBtn.addEventListener("click", () => {
    window.location.href = "/reader/settings.html";
  });

  elements.editProfileBtn.addEventListener("click", () => {
    elements.editProfilePanel.hidden = false;
    setFormMessage("");
  });

  elements.cancelEditBtn.addEventListener("click", () => {
    elements.editProfilePanel.hidden = true;
    setFormMessage("");
    if (state.profile) {
      populateForm(state.profile);
    }
  });

  elements.profileForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    try {
      setFormMessage("Saving profile...");
      const body = {
        name: elements.nameInput.value.trim(),
        bio: elements.bioInput.value,
        preferredGenres: elements.preferredGenresInput.value,
      };

      if (!elements.penNameField.hidden) {
        body.penName = elements.penNameInput.value;
      }

      if (elements.removeAvatarToggle.checked) {
        body.avatarUrl = null;
      } else if (state.pendingAvatarDataUrl) {
        body.avatarUrl = state.pendingAvatarDataUrl;
      }

      console.log("Sending profile update:", body);
      const response = await apiFetch("/api/profile", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      console.log("Profile update response:", response);

      await refreshProfilePage();
      elements.editProfilePanel.hidden = true;
      setFormMessage("Profile updated successfully.");
      if (window.NovaraSession) {
        window.NovaraSession.showToast("Profile updated");
      }
    } catch (error) {
      console.error("Profile update error:", error);
      setFormMessage(error.message || "Unable to update profile.");
    }
  });

  elements.avatarInput.addEventListener("change", async () => {
    const file = elements.avatarInput.files && elements.avatarInput.files[0];
    if (!file) {
      state.pendingAvatarDataUrl = "";
      return;
    }

    const isValidType = /image\/(png|jpe?g|webp|gif)/i.test(file.type || "");
    if (!isValidType) {
      setFormMessage("Please select a PNG, JPG, WEBP, or GIF image.");
      elements.avatarInput.value = "";
      state.pendingAvatarDataUrl = "";
      return;
    }

    if (file.size > 1024 * 1024) {
      setFormMessage("Please keep profile photos under 1MB.");
      elements.avatarInput.value = "";
      state.pendingAvatarDataUrl = "";
      return;
    }

    try {
      state.pendingAvatarDataUrl = await fileToDataUrl(file);
      elements.removeAvatarToggle.checked = false;
      setFormMessage("Avatar selected. Save changes to apply it.");
    } catch (error) {
      state.pendingAvatarDataUrl = "";
      setFormMessage(error.message || "Unable to process image.");
    }
  });

  elements.removeAvatarToggle.addEventListener("change", () => {
    if (elements.removeAvatarToggle.checked) {
      state.pendingAvatarDataUrl = "";
      elements.avatarInput.value = "";
    }
  });
}

async function bootstrap() {
  bindEvents();

  try {
    await refreshProfilePage();
  } catch (error) {
    elements.userName.textContent = "Profile unavailable";
    elements.userEmail.textContent = error.message || "Unable to load profile.";
    elements.userJoinedAt.textContent = "";
    elements.userBio.textContent = "No profile data available.";
    elements.userRoles.innerHTML = "";
    renderReaderStats(null);
    renderWriterStats(null);
    renderSavedBooks([]);
    renderActivity([]);
    elements.preferencesList.innerHTML = '<div class="placeholder">Unable to load preferences.</div>';
  }
}

bootstrap();

