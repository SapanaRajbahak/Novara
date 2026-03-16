const AUDIO_PROGRESS_KEY = "novelread.audio.progress";
const AUDIO_BOOKMARKS_KEY = "novelread.audio.bookmarks";

const state = {
  books: [],
  currentBook: null,
  currentTrackIndex: 0,
  currentSec: 0,
  playing: false,
  speed: 1,
  sleepTimerId: null,
  tickId: null
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
  miniNextBtn: document.getElementById("miniNextBtn")
};

function showToast(message) {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  document.body.appendChild(toast);
  window.setTimeout(() => toast.remove(), 1500);
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
    bookId: params.get("book") || "book-last-lantern",
    track: Number(params.get("track") || 1)
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

function getBookKey(bookId) {
  return `book:${bookId}`;
}

async function loadData() {
  try {
    const response = await fetch("./data/audiobooks.json", { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = await response.json();
    state.books = Array.isArray(data.books) ? data.books : [];
  } catch (error) {
    state.books = [];
  }
}

function getCurrentTrack() {
  if (!state.currentBook) {
    return null;
  }
  return state.currentBook.tracks[state.currentTrackIndex] || null;
}

function getTrackDuration() {
  const track = getCurrentTrack();
  return track ? Number(track.durationSec || 0) : 0;
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
  state.currentBook.tracks.forEach((track, idx) => {
    const li = document.createElement("li");
    li.innerHTML = `
      <button type="button" class="track-item ${idx === state.currentTrackIndex ? "active" : ""}" data-track-index="${idx}">
        <small>Track ${track.number}</small>
        ${track.title}
      </button>
    `;
    elements.trackList.appendChild(li);
  });
}

function renderBookmarks() {
  const all = loadJsonStorage(AUDIO_BOOKMARKS_KEY, {});
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
  const all = loadJsonStorage(AUDIO_PROGRESS_KEY, {});
  all[getBookKey(state.currentBook.id)] = {
    trackIndex: state.currentTrackIndex,
    second: state.currentSec,
    speed: state.speed,
    updatedAt: new Date().toISOString()
  };
  saveJsonStorage(AUDIO_PROGRESS_KEY, all);
}

function resumeProgress() {
  const all = loadJsonStorage(AUDIO_PROGRESS_KEY, {});
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
  const duration = getTrackDuration();
  const progress = duration ? Math.min(1, state.currentSec / duration) : 0;

  elements.currentTrack.textContent = track ? `Track ${track.number}: ${track.title}` : "No track";
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
  state.playing = false;
  if (state.tickId) {
    clearInterval(state.tickId);
    state.tickId = null;
  }
  updateUi();
  saveProgress();
}

function playPlayback() {
  if (state.playing) {
    return;
  }
  state.playing = true;
  if (state.tickId) {
    clearInterval(state.tickId);
  }
  state.tickId = window.setInterval(() => {
    const duration = getTrackDuration();
    state.currentSec += 1 * state.speed;

    if (state.currentSec >= duration) {
      if (state.currentTrackIndex < state.currentBook.tracks.length - 1) {
        state.currentTrackIndex += 1;
        state.currentSec = 0;
      } else {
        state.currentSec = duration;
        pausePlayback();
        return;
      }
    }

    updateUi();
    saveProgress();
  }, 1000);
  updateUi();
}

function togglePlay() {
  if (state.playing) {
    pausePlayback();
  } else {
    playPlayback();
  }
}

function jumpTrack(index) {
  state.currentTrackIndex = Math.min(state.currentBook.tracks.length - 1, Math.max(0, index));
  state.currentSec = 0;
  updateUi();
  saveProgress();
}

function addBookmark() {
  const all = loadJsonStorage(AUDIO_BOOKMARKS_KEY, {});
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
  saveJsonStorage(AUDIO_BOOKMARKS_KEY, all);
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
    state.currentSec = Math.max(0, state.currentSec - 10);
    updateUi();
    saveProgress();
  });

  elements.skipForwardBtn.addEventListener("click", () => {
    const duration = getTrackDuration();
    state.currentSec = Math.min(duration, state.currentSec + 10);
    updateUi();
    saveProgress();
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
    updateUi();
    saveProgress();
  });

  elements.trackList.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-track-index]");
    if (!button) {
      return;
    }
    jumpTrack(Number(button.dataset.trackIndex));
  });

  elements.bookmarkBtn.addEventListener("click", addBookmark);

  elements.bookmarkList.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-bookmark-index]");
    if (!button) {
      return;
    }

    const all = loadJsonStorage(AUDIO_BOOKMARKS_KEY, {});
    const list = all[getBookKey(state.currentBook.id)] || [];
    const item = list[Number(button.dataset.bookmarkIndex)];
    if (!item) {
      return;
    }

    state.currentTrackIndex = item.trackIndex;
    state.currentSec = item.second;
    updateUi();
    saveProgress();
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
    if (state.tickId) {
      clearInterval(state.tickId);
    }
    if (state.sleepTimerId) {
      clearTimeout(state.sleepTimerId);
    }
  });
}

function renderBook() {
  elements.bookTitle.textContent = state.currentBook.title;
  elements.bookAuthor.textContent = `by ${state.currentBook.author}`;
  elements.coverImage.src = createCoverSvg(state.currentBook.title, state.currentBook.genre || "default");
  elements.coverImage.alt = `${state.currentBook.title} cover`;
  elements.backLink.href = `book.html?id=${encodeURIComponent(state.currentBook.id)}`;
  document.title = `${state.currentBook.title} | Audiobook`;
  renderTracks();
  renderBookmarks();
  updateUi();
}

async function bootstrap() {
  buildWaveBars();
  bindEvents();
  await loadData();

  const { bookId, track } = parseParams();
  state.currentBook = state.books.find((book) => book.id === bookId) || state.books[0] || null;

  if (!state.currentBook) {
    elements.bookTitle.textContent = "No audiobook found";
    elements.bookAuthor.textContent = "Please return to library.";
    return;
  }

  state.currentTrackIndex = Math.min(state.currentBook.tracks.length - 1, Math.max(0, track - 1));
  resumeProgress();
  renderBook();
}

bootstrap();
