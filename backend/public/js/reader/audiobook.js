function readerScoped(segment) {
  if (window.NovaraSession && typeof window.NovaraSession.readerDataKey === "function") {
    return window.NovaraSession.readerDataKey(segment);
  }
  const uid = window.localStorage.getItem("novara.userId") || "guest";
  return `novara.reader.u.${uid}.${segment}`;
}

function getAudioProgressKey() {
  return readerScoped("audioProgress");
}

function getAudioBookmarksKey() {
  return readerScoped("audioBookmarks");
}

const API_BASE_URL = (window.NovaraSession && window.NovaraSession.API_BASE_URL) || "https://novara-6s67.onrender.com";

const state = {
  currentBook: null,
  currentTrackIndex: 0,
  currentSec: 0,
  playing: false,
  speed: 1,
  sleepTimerId: null,
  audioReady: false,
  listeningApiEnabled: true,
  listeningApiAuthMissingNotified: false,
  lastListeningSyncMs: 0,
};

const elements = {
  backLink: document.getElementById("backLink"),
  drawerToggleBtn: document.getElementById("drawerToggleBtn"),
  trackDrawer: document.getElementById("trackDrawer"),
  trackList: document.getElementById("trackList"),
  coverImage: document.getElementById("coverImage"),
  bookTitle: document.getElementById("bookTitle"),
  bookAuthor: document.getElementById("bookAuthor"),
  currentTrack: document.getElementById("currentTrack"),
  waveBars: document.getElementById("waveBars"),
  progressSlider: document.getElementById("progressSlider"),
  currentTime: document.getElementById("currentTime"),
  durationTime: document.getElementById("durationTime"),
  playPauseBtn: document.getElementById("playPauseBtn"),
  skipBackBtn: document.getElementById("skipBackBtn"),
  skipForwardBtn: document.getElementById("skipForwardBtn"),
  speedSelect: document.getElementById("speedSelect"),
  sleepTimerSelect: document.getElementById("sleepTimerSelect"),
  bookmarkBtn: document.getElementById("bookmarkBtn"),
  bookmarkList: document.getElementById("bookmarkList"),
  miniTitle: document.getElementById("miniTitle"),
  miniTime: document.getElementById("miniTime"),
  miniPrevBtn: document.getElementById("miniPrevBtn"),
  miniPlayBtn: document.getElementById("miniPlayBtn"),
  miniNextBtn: document.getElementById("miniNextBtn"),
  audioPlayer: document.getElementById("audioPlayer"),
  syncStatus: document.getElementById("syncStatus"),
};

state.lastListeningSyncSuccessMs = 0;
state.syncStatus = "idle";
state.syncTickerId = null;

function showToast(message) {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  document.body.appendChild(toast);
  window.setTimeout(() => toast.remove(), 1500);
}

function getSyncLabelText() {
  if (state.syncStatus === "error") {
    return "Sync failed";
  }

  if (!state.lastListeningSyncSuccessMs) {
    return "Last synced: not yet";
  }

  const secondsAgo = Math.max(0, Math.floor((Date.now() - state.lastListeningSyncSuccessMs) / 1000));
  if (secondsAgo <= 1) {
    return "Last synced: just now";
  }

  return `Last synced: ${secondsAgo}s ago`;
}

function updateSyncStatusClasses() {
  if (!elements.syncStatus) {
    return;
  }

  elements.syncStatus.classList.add("sync-status");
  elements.syncStatus.classList.remove("sync-idle", "sync-saving", "sync-success", "sync-error");

  const classByStatus = {
    idle: "sync-idle",
    saving: "sync-saving",
    success: "sync-success",
    error: "sync-error",
  };

  const statusClass = classByStatus[state.syncStatus] || "sync-idle";
  elements.syncStatus.classList.add(statusClass);
}

function updateSyncStatusLabel() {
  if (!elements.syncStatus) {
    return;
  }

  updateSyncStatusClasses();
  elements.syncStatus.textContent = getSyncLabelText();
}

function markSyncSaving() {
  state.syncStatus = "saving";
  updateSyncStatusLabel();
}

function markSyncSuccess() {
  state.syncStatus = "success";
  state.lastListeningSyncSuccessMs = Date.now();
  updateSyncStatusLabel();
}

function markSyncFailed() {
  state.syncStatus = "error";
  updateSyncStatusLabel();
}

function startSyncStatusTicker() {
  if (state.syncTickerId) {
    clearInterval(state.syncTickerId);
  }

  updateSyncStatusLabel();
  state.syncTickerId = window.setInterval(() => {
    updateSyncStatusLabel();
  }, 1000);
}

function formatTime(totalSec) {
  const sec = Math.max(0, Math.floor(totalSec));
  const minutes = Math.floor(sec / 60);
  const seconds = sec % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function parseParams() {
  const params = new URLSearchParams(window.location.search);
  return {
    // Support both old (?book=) and new (?bookId=) URL formats.
    bookId: params.get("bookId") || params.get("book") || "",
    track: Number(params.get("track") || 1),
  };
}

function loadJsonStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (error) {
    return fallback;
  }
}

function saveJsonStorage(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function getTrackIndexById(trackId) {
  if (!state.currentBook || !Array.isArray(state.currentBook.tracks)) {
    return -1;
  }

  return state.currentBook.tracks.findIndex((track) => track.id === trackId);
}

function getBookKey(bookId) {
  return `book:${bookId}`;
}

async function fetchBookMeta(bookId) {
  const response = await fetch(`${API_BASE_URL}/api/books/${encodeURIComponent(bookId)}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch book metadata (HTTP ${response.status})`);
  }

  const payload = await response.json();
  if (!payload.success || !payload.data) {
    throw new Error("Invalid book metadata response");
  }

  return payload.data;
}

async function fetchAudioTracks(bookId) {
  const response = await fetch(`${API_BASE_URL}/api/books/${encodeURIComponent(bookId)}/audio`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch audio tracks (HTTP ${response.status})`);
  }

  const payload = await response.json();
  if (!payload.success || !Array.isArray(payload.data)) {
    throw new Error("Invalid audio tracks response");
  }

  return payload.data;
}

function mapApiTrack(track) {
  return {
    id: track.id,
    number: Number(track.order),
    title: track.title || "Untitled Track",
    audioUrl: track.audioUrl || "",
    durationSec: Number(track.duration || 0),
    chapter: track.chapter || null,
  };
}

function buildCurrentBookFromApi(bookMeta, tracks) {
  return {
    id: bookMeta.id,
    title: bookMeta.title || "Untitled Book",
    author: bookMeta.authorName || "Unknown Author",
    genre: bookMeta.genre || "default",
    tracks: tracks.map(mapApiTrack),
  };
}

function getCurrentTrack() {
  if (!state.currentBook) {
    return null;
  }
  return state.currentBook.tracks[state.currentTrackIndex] || null;
}

function getCurrentTimeSeconds() {
  if (Number.isFinite(elements.audioPlayer.currentTime) && elements.audioPlayer.currentTime >= 0) {
    return Number(elements.audioPlayer.currentTime);
  }

  return Math.max(0, Number(state.currentSec || 0));
}

function buildListeningPayload() {
  if (!state.currentBook) {
    return null;
  }

  const track = getCurrentTrack();
  if (!track || !track.id) {
    return null;
  }

  return {
    bookId: state.currentBook.id,
    audioTrackId: track.id,
    currentTimeSeconds: Math.floor(getCurrentTimeSeconds()),
  };
}

async function saveListeningProgressToApi(payload, options = {}) {
  if (!state.listeningApiEnabled || !payload) {
    return;
  }

  markSyncSaving();

  try {
    const response = await fetch(`${API_BASE_URL}/api/progress/listening`, {
      method: "POST",
      credentials: "include",
      keepalive: Boolean(options.keepalive),
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (response.status === 401) {
      state.listeningApiEnabled = false;
      markSyncFailed();
      if (!state.listeningApiAuthMissingNotified) {
        state.listeningApiAuthMissingNotified = true;
        showToast("Sign in to sync listening progress across devices");
      }
      return;
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    markSyncSuccess();
  } catch (error) {
    console.warn("Failed to save listening progress:", error);
    markSyncFailed();
  }
}

async function getListeningProgressFromApi(bookId) {
  if (!state.listeningApiEnabled) {
    return null;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/progress/listening/${encodeURIComponent(bookId)}`, {
      cache: "no-store",
      credentials: "include",
    });

    if (response.status === 401) {
      state.listeningApiEnabled = false;
      return null;
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const payload = await response.json();
    if (!payload.success || !payload.data) {
      return null;
    }

    return payload.data;
  } catch (error) {
    console.warn("Failed to fetch listening progress:", error);
    return null;
  }
}

function syncListeningProgress(options = {}) {
  const payload = buildListeningPayload();
  if (!payload) {
    return;
  }

  const now = Date.now();
  const intervalMs = Number(options.intervalMs || 5000);
  const force = Boolean(options.force);

  if (!force && now - state.lastListeningSyncMs < intervalMs) {
    return;
  }

  state.lastListeningSyncMs = now;
  saveListeningProgressToApi(payload, { keepalive: options.keepalive });
}

function getTrackDuration() {
  if (
    elements.audioPlayer &&
    Number.isFinite(elements.audioPlayer.duration) &&
    elements.audioPlayer.duration > 0
  ) {
    return Number(elements.audioPlayer.duration);
  }

  const track = getCurrentTrack();
  return track ? Number(track.durationSec || 0) : 0;
}

function getResolvedAudioUrl(track) {
  if (!track || !track.audioUrl || typeof track.audioUrl !== "string") {
    return null;
  }

  const raw = track.audioUrl.trim();
  if (!raw) {
    return null;
  }

  try {
    return new URL(raw, window.location.href).toString();
  } catch (error) {
    return null;
  }
}

function setTrackFromState(autoplay, startAtSec = 0) {
  const track = getCurrentTrack();
  if (!track) {
    state.audioReady = false;
    elements.audioPlayer.removeAttribute("src");
    elements.audioPlayer.load();
    updateUi();
    return;
  }

  const resolvedUrl = getResolvedAudioUrl(track);
  if (!resolvedUrl) {
    state.playing = false;
    state.audioReady = false;
    state.currentSec = 0;
    elements.audioPlayer.removeAttribute("src");
    elements.audioPlayer.load();
    updateUi();
    showToast("This track has no valid audio URL");
    return;
  }

  state.audioReady = false;
  elements.audioPlayer.src = resolvedUrl;
  state.currentSec = Math.max(0, Number(startAtSec || 0));
  elements.audioPlayer.currentTime = 0;
  elements.audioPlayer.playbackRate = state.speed;
  elements.audioPlayer.load();

  if (autoplay) {
    const playPromise = elements.audioPlayer.play();
    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch(() => {
        state.playing = false;
        updateUi();
      });
    }
  } else {
    state.playing = false;
    updateUi();
  }
}

function handleTrackEnded() {
  if (!state.currentBook) {
    state.playing = false;
    updateUi();
    return;
  }

  const hasNextTrack = state.currentTrackIndex < state.currentBook.tracks.length - 1;

  if (!hasNextTrack) {
    // Keep final track selected and stop cleanly.
    state.playing = false;
    state.currentSec = getTrackDuration();
    updateUi();
    saveProgress();
    syncListeningProgress({ force: true });
    return;
  }

  state.currentTrackIndex += 1;
  state.currentSec = 0;

  // Load and auto-play the next track using existing real audio flow.
  setTrackFromState(true);
  updateUi();

  // Persist the new audioTrackId immediately after auto-advance.
  saveProgress();
  syncListeningProgress({ force: true });
}

function formatDurationOrDash(seconds) {
  const value = Number(seconds || 0);
  if (!Number.isFinite(value) || value <= 0) {
    return "--:--";
  }
  return formatTime(value);
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
    Drama: ["#3f3348", "#8672a1"],
    default: ["#2d3b3a", "#608982"]
  };

  const [c1, c2] = palette[genre] || palette.default;
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='700' height='700'>
    <defs>
      <linearGradient id='g' x1='0' x2='1' y1='0' y2='1'>
        <stop offset='0%' stop-color='${c1}'/>
        <stop offset='100%' stop-color='${c2}'/>
      </linearGradient>
    </defs>
    <rect width='100%' height='100%' rx='36' fill='url(#g)'/>
    <rect x='52' y='52' width='596' height='596' rx='26' fill='rgba(255,255,255,0.12)'/>
    <text x='50%' y='55%' dominant-baseline='middle' text-anchor='middle' fill='rgba(255,255,255,0.92)' font-family='Arial' font-size='170' font-weight='700'>${initials}</text>
  </svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function buildWaveBars() {
  elements.waveBars.innerHTML = "";
  for (let i = 0; i < 48; i += 1) {
    const bar = document.createElement("span");
    const h = 18 + Math.round(Math.random() * 36);
    bar.style.height = `${h}px`;
    elements.waveBars.appendChild(bar);
  }
}

function updateWaveform(progress) {
  const bars = [...elements.waveBars.children];
  const activeBars = Math.floor(bars.length * progress);
  bars.forEach((bar, idx) => {
    bar.classList.toggle("active", idx <= activeBars);
  });
}

function renderTracks() {
  elements.trackList.innerHTML = "";

  if (!state.currentBook.tracks.length) {
    elements.trackList.innerHTML = "<li class=\"bookmark-item\"><span>No audio tracks available for this book yet.</span></li>";
    return;
  }

  state.currentBook.tracks.forEach((track, idx) => {
    const chapterMeta = track.chapter
      ? `<small>Chapter ${track.chapter.chapterNumber}: ${track.chapter.title}</small>`
      : "<small>No linked chapter</small>";

    const li = document.createElement("li");
    li.innerHTML = `
      <button type="button" class="track-item ${idx === state.currentTrackIndex ? "active" : ""}" data-track-index="${idx}">
        <small>Track ${track.number}</small>
        ${track.title}
        ${chapterMeta}
        <small>Duration: ${formatDurationOrDash(track.durationSec)}</small>
      </button>
    `;
    elements.trackList.appendChild(li);
  });
}

function renderBookmarks() {
  const all = loadJsonStorage(getAudioBookmarksKey(), {});
  const list = all[getBookKey(state.currentBook.id)] || [];

  if (!list.length) {
    elements.bookmarkList.innerHTML = "<li class=\"bookmark-item\"><span>No bookmarks yet.</span></li>";
    return;
  }

  elements.bookmarkList.innerHTML = "";
  list.forEach((item, idx) => {
    const li = document.createElement("li");
    li.className = "bookmark-item";
    li.innerHTML = `
      <span>Track ${item.trackNumber} at ${formatTime(item.second)}</span>
      <button type="button" data-bookmark-index="${idx}">Jump</button>
    `;
    elements.bookmarkList.appendChild(li);
  });
}

function saveProgress() {
  if (!state.currentBook || !state.currentBook.tracks.length) {
    return;
  }

  const all = loadJsonStorage(getAudioProgressKey(), {});
  all[getBookKey(state.currentBook.id)] = {
    trackIndex: state.currentTrackIndex,
    second: getCurrentTimeSeconds(),
    speed: state.speed,
    updatedAt: new Date().toISOString()
  };
  saveJsonStorage(getAudioProgressKey(), all);
}

function resumeProgress() {
  if (!state.currentBook || !state.currentBook.tracks.length) {
    return;
  }

  const all = loadJsonStorage(getAudioProgressKey(), {});
  const saved = all[getBookKey(state.currentBook.id)];
  if (!saved) {
    return;
  }

  state.currentTrackIndex = Math.min(state.currentBook.tracks.length - 1, Math.max(0, Number(saved.trackIndex || 0)));
  state.currentSec = Math.max(0, Number(saved.second || 0));
  state.speed = Number(saved.speed || 1);
  elements.speedSelect.value = String(state.speed);
  showToast(`Resumed from ${formatTime(state.currentSec)}`);
}

function updateUi() {
  const track = getCurrentTrack();
  state.currentSec = getCurrentTimeSeconds();
  const duration = getTrackDuration();
  const progress = duration ? Math.min(1, state.currentSec / duration) : 0;

  const chapterText = track?.chapter
    ? ` • Chapter ${track.chapter.chapterNumber}`
    : "";

  elements.currentTrack.textContent = track ? `Track ${track.number}: ${track.title}${chapterText}` : "No track";
  elements.currentTime.textContent = formatTime(state.currentSec);
  elements.durationTime.textContent = formatTime(duration);
  elements.progressSlider.value = String(Math.round(progress * 100));
  elements.playPauseBtn.textContent = state.playing ? "Pause" : "Play";
  elements.miniPlayBtn.textContent = state.playing ? "Pause" : "Play";
  elements.miniTitle.textContent = track ? track.title : "No track";
  elements.miniTime.textContent = `${formatTime(state.currentSec)} / ${formatTime(duration)}`;

  updateWaveform(progress);
  renderTracks();
}

function pausePlayback() {
  elements.audioPlayer.pause();
}

function playPlayback() {
  if (!state.currentBook || !state.currentBook.tracks.length) {
    return;
  }

  const track = getCurrentTrack();
  const resolvedUrl = getResolvedAudioUrl(track);
  if (!resolvedUrl) {
    showToast("This track has no valid audio URL");
    return;
  }

  const needsLoad = elements.audioPlayer.src !== resolvedUrl;
  if (needsLoad) {
    setTrackFromState(true);
    return;
  }

  const playPromise = elements.audioPlayer.play();
  if (playPromise && typeof playPromise.catch === "function") {
    playPromise.catch(() => {
      state.playing = false;
      updateUi();
    });
  }
}

function togglePlay() {
  if (state.playing) {
    pausePlayback();
  } else {
    playPlayback();
  }
}

function jumpTrack(index) {
  if (!state.currentBook || !state.currentBook.tracks.length) {
    return;
  }

  // Save old track position before switching tracks.
  syncListeningProgress({ force: true });

  state.currentTrackIndex = Math.min(state.currentBook.tracks.length - 1, Math.max(0, index));
  state.currentSec = 0;
  setTrackFromState(false);
  updateUi();
  saveProgress();
}

function addBookmark() {
  if (!state.currentBook || !state.currentBook.tracks.length) {
    return;
  }

  const all = loadJsonStorage(getAudioBookmarksKey(), {});
  const key = getBookKey(state.currentBook.id);
  const list = all[key] || [];
  const track = getCurrentTrack();

  list.unshift({
    trackIndex: state.currentTrackIndex,
    trackNumber: track.number,
    second: Math.floor(state.currentSec),
    createdAt: new Date().toISOString()
  });

  all[key] = list.slice(0, 30);
  saveJsonStorage(getAudioBookmarksKey(), all);
  renderBookmarks();
  showToast("Timestamp bookmarked");
}

function setupSleepTimer(minutes) {
  if (state.sleepTimerId) {
    clearTimeout(state.sleepTimerId);
    state.sleepTimerId = null;
  }

  if (minutes <= 0) {
    showToast("Sleep timer off");
    return;
  }

  state.sleepTimerId = window.setTimeout(() => {
    pausePlayback();
    showToast("Sleep timer ended");
  }, minutes * 60 * 1000);

  showToast(`Sleep timer set for ${minutes} min`);
}

function bindEvents() {
  elements.drawerToggleBtn.addEventListener("click", () => {
    elements.trackDrawer.classList.toggle("hidden");
  });

  elements.playPauseBtn.addEventListener("click", togglePlay);
  elements.miniPlayBtn.addEventListener("click", togglePlay);

  elements.skipBackBtn.addEventListener("click", () => {
    const nextSec = Math.max(0, getCurrentTimeSeconds() - 10);
    elements.audioPlayer.currentTime = nextSec;
    state.currentSec = nextSec;
    updateUi();
    saveProgress();
    syncListeningProgress({ force: true });
  });

  elements.skipForwardBtn.addEventListener("click", () => {
    const duration = getTrackDuration();
    const nextSec = Math.min(duration, getCurrentTimeSeconds() + 10);
    elements.audioPlayer.currentTime = nextSec;
    state.currentSec = nextSec;
    updateUi();
    saveProgress();
    syncListeningProgress({ force: true });
  });

  elements.speedSelect.addEventListener("change", () => {
    state.speed = Number(elements.speedSelect.value);
    saveProgress();
    showToast(`Speed ${state.speed}x`);
  });

  elements.sleepTimerSelect.addEventListener("change", () => {
    setupSleepTimer(Number(elements.sleepTimerSelect.value));
  });

  elements.progressSlider.addEventListener("input", () => {
    const duration = getTrackDuration();
    state.currentSec = (Number(elements.progressSlider.value) / 100) * duration;
    elements.audioPlayer.currentTime = state.currentSec;
    updateUi();
    saveProgress();
    syncListeningProgress({ force: true });
  });

  elements.trackList.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-track-index]");
    if (!button) {
      return;
    }
    jumpTrack(Number(button.dataset.trackIndex));
    playPlayback();
  });

  elements.bookmarkBtn.addEventListener("click", addBookmark);

  elements.bookmarkList.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-bookmark-index]");
    if (!button) {
      return;
    }

    const all = loadJsonStorage(getAudioBookmarksKey(), {});
    const list = all[getBookKey(state.currentBook.id)] || [];
    const item = list[Number(button.dataset.bookmarkIndex)];
    if (!item) {
      return;
    }

    state.currentTrackIndex = item.trackIndex;
    state.currentSec = Math.max(0, Number(item.second || 0));
    setTrackFromState(false);
    if (state.audioReady) {
      try {
        elements.audioPlayer.currentTime = state.currentSec;
      } catch (error) {
        // Ignore seek issues for formats that do not allow seeking immediately.
      }
    }
    updateUi();
    saveProgress();
    syncListeningProgress({ force: true });
    showToast("Jumped to bookmark");
  });

  elements.miniPrevBtn.addEventListener("click", () => {
    jumpTrack(state.currentTrackIndex - 1);
  });

  elements.miniNextBtn.addEventListener("click", () => {
    jumpTrack(state.currentTrackIndex + 1);
  });

  window.addEventListener("beforeunload", () => {
    saveProgress();
    syncListeningProgress({ force: true, keepalive: true });
    if (state.sleepTimerId) {
      clearTimeout(state.sleepTimerId);
    }
  });

  window.addEventListener("pagehide", () => {
    saveProgress();
    syncListeningProgress({ force: true, keepalive: true });
  });
}

function bindAudioEvents() {
  elements.audioPlayer.addEventListener("play", () => {
    state.playing = true;
    updateUi();
  });

  elements.audioPlayer.addEventListener("pause", () => {
    state.playing = false;
    state.currentSec = Number(elements.audioPlayer.currentTime || 0);
    updateUi();
    saveProgress();
    syncListeningProgress({ force: true });
  });

  elements.audioPlayer.addEventListener("timeupdate", () => {
    state.currentSec = Number(elements.audioPlayer.currentTime || 0);
    updateUi();
    syncListeningProgress({ intervalMs: 5000 });
  });

  elements.audioPlayer.addEventListener("loadedmetadata", () => {
    state.audioReady = true;

    // Use persisted timestamp on first load of the selected track.
    if (state.currentSec > 0) {
      try {
        elements.audioPlayer.currentTime = Math.min(state.currentSec, elements.audioPlayer.duration || state.currentSec);
      } catch (error) {
        // Ignore invalid seeks on unsupported streams.
      }
    }

    const track = getCurrentTrack();
    if (track && (!track.durationSec || track.durationSec <= 0) && Number.isFinite(elements.audioPlayer.duration)) {
      track.durationSec = Number(elements.audioPlayer.duration);
    }

    updateUi();
  });

  elements.audioPlayer.addEventListener("ended", () => {
    handleTrackEnded();
  });

  elements.audioPlayer.addEventListener("error", () => {
    state.playing = false;
    state.audioReady = false;
    updateUi();
    showToast("Audio failed to load for this track");
  });
}

function renderBook() {
  elements.bookTitle.textContent = state.currentBook.title;
  elements.bookAuthor.textContent = `by ${state.currentBook.author}`;
  elements.coverImage.src = createCoverSvg(state.currentBook.title, state.currentBook.genre || "default");
  elements.coverImage.alt = `${state.currentBook.title} cover`;
  elements.backLink.href = `/reader/book.html?id=${encodeURIComponent(state.currentBook.id)}`;
  document.title = `${state.currentBook.title} | Audiobook`;
  renderTracks();
  renderBookmarks();
  setTrackFromState(false, state.currentSec);
  updateUi();
}

async function applyResumeFromApiIfChosen() {
  const progress = await getListeningProgressFromApi(state.currentBook.id);
  if (!progress || !progress.audioTrackId) {
    return false;
  }

  const trackIndex = getTrackIndexById(progress.audioTrackId);
  if (trackIndex < 0) {
    return false;
  }

  const resumeTime = Math.max(0, Number(progress.currentTimeSeconds || 0));
  if (resumeTime <= 0 && trackIndex === 0) {
    return false;
  }

  const chosen = window.confirm(
    `Resume from Track ${state.currentBook.tracks[trackIndex].number} at ${formatTime(resumeTime)}?`
  );

  if (!chosen) {
    return false;
  }

  state.currentTrackIndex = trackIndex;
  state.currentSec = resumeTime;
  setTrackFromState(false);

  if (state.audioReady) {
    try {
      elements.audioPlayer.currentTime = resumeTime;
    } catch (error) {
      // Ignore seek issues on streams that are not seekable immediately.
    }
  }

  updateUi();
  showToast(`Resumed from ${formatTime(resumeTime)}`);
  return true;
}

function setPlayerDisabled(disabled) {
  elements.playPauseBtn.disabled = disabled;
  elements.skipBackBtn.disabled = disabled;
  elements.skipForwardBtn.disabled = disabled;
  elements.progressSlider.disabled = disabled;
  elements.bookmarkBtn.disabled = disabled;
  elements.miniPrevBtn.disabled = disabled;
  elements.miniPlayBtn.disabled = disabled;
  elements.miniNextBtn.disabled = disabled;
}

function renderLoadingState() {
  elements.bookTitle.textContent = "Loading audiobook...";
  elements.bookAuthor.textContent = "Fetching tracks from server";
  elements.currentTrack.textContent = "Please wait";
  elements.trackList.innerHTML = "<li class=\"bookmark-item\"><span>Loading tracks...</span></li>";
  setPlayerDisabled(true);
}

function renderErrorState(message) {
  elements.bookTitle.textContent = "Unable to load audiobook";
  elements.bookAuthor.textContent = "Please return to Book Details and try again";
  elements.currentTrack.textContent = message;
  elements.trackList.innerHTML = `<li class=\"bookmark-item\"><span>${message}</span></li>`;
  setPlayerDisabled(true);
}

function renderEmptyState(book) {
  elements.bookTitle.textContent = book.title;
  elements.bookAuthor.textContent = `by ${book.author}`;
  elements.currentTrack.textContent = "No audio tracks available";
  elements.trackList.innerHTML = "<li class=\"bookmark-item\"><span>No tracks found for this book yet.</span></li>";
  elements.coverImage.src = createCoverSvg(book.title, book.genre || "default");
  elements.coverImage.alt = `${book.title} cover`;
  elements.backLink.href = `/reader/book.html?id=${encodeURIComponent(book.id)}`;
  setPlayerDisabled(true);
}

async function bootstrap() {
  buildWaveBars();
  bindEvents();
  bindAudioEvents();
  startSyncStatusTicker();
  renderLoadingState();

  if (window.NovaraSession && typeof window.NovaraSession.fetchCurrentUser === "function") {
    await window.NovaraSession.fetchCurrentUser();
  }

  const { bookId, track } = parseParams();
  if (!bookId) {
    renderErrorState("Missing bookId in URL");
    return;
  }

  let bookMeta;
  let tracks;

  try {
    [bookMeta, tracks] = await Promise.all([
      fetchBookMeta(bookId),
      fetchAudioTracks(bookId),
    ]);
  } catch (error) {
    console.error("Failed to load audiobook data:", error);
    renderErrorState("Could not fetch audiobook tracks from API");
    return;
  }

  state.currentBook = buildCurrentBookFromApi(bookMeta, tracks);

  if (!state.currentBook.tracks.length) {
    renderEmptyState(state.currentBook);
    return;
  }

  state.currentTrackIndex = Math.min(state.currentBook.tracks.length - 1, Math.max(0, track - 1));

  setPlayerDisabled(false);
  renderBook();

  const resumedFromApi = await applyResumeFromApiIfChosen();
  if (!resumedFromApi) {
    resumeProgress();

    if (state.currentSec > 0) {
      setTrackFromState(false, state.currentSec);
      if (state.audioReady) {
        elements.audioPlayer.currentTime = Math.min(state.currentSec, elements.audioPlayer.duration || state.currentSec);
      }
      updateUi();
    }
  }

  // Keep initial resumed position in sync with the audio element if metadata is ready quickly.
  if (state.currentSec > 0 && Number.isFinite(elements.audioPlayer.duration) && elements.audioPlayer.duration > 0) {
    elements.audioPlayer.currentTime = Math.min(state.currentSec, elements.audioPlayer.duration);
  }
}

bootstrap();

