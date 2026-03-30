const ADMIN_AUTH_KEY = "novara.admin.auth";
const BOOKS_STORE_KEY = "novara.admin.uploadedBooks";
const CHAPTERS_STORE_KEY = "novara.admin.chapterDrafts";
const AI_DRAFTS_KEY = "novara.admin.aiDrafts";

const elements = {
  logoutBtn: document.getElementById("logoutBtn"),
  form: document.getElementById("generatorForm"),
  genreInput: document.getElementById("genreInput"),
  toneInput: document.getElementById("toneInput"),
  audienceInput: document.getElementById("audienceInput"),
  settingInput: document.getElementById("settingInput"),
  mainCharacterInput: document.getElementById("mainCharacterInput"),
  supportingCharactersInput: document.getElementById("supportingCharactersInput"),
  premiseInput: document.getElementById("premiseInput"),
  themesInput: document.getElementById("themesInput"),
  chapterCountInput: document.getElementById("chapterCountInput"),
  outputTypeSelect: document.getElementById("outputTypeSelect"),
  modelStatus: document.getElementById("modelStatus"),
  outputEditor: document.getElementById("outputEditor"),
  generateBtn: document.getElementById("generateBtn"),
  regenerateBtn: document.getElementById("regenerateBtn"),
  expandBtn: document.getElementById("expandBtn"),
  shortenBtn: document.getElementById("shortenBtn"),
  rewriteBtn: document.getElementById("rewriteBtn"),
  saveDraftBtn: document.getElementById("saveDraftBtn"),
  saveChapterBtn: document.getElementById("saveChapterBtn"),
  createBookBtn: document.getElementById("createBookBtn"),
  targetBookSelect: document.getElementById("targetBookSelect"),
  targetChapterSelect: document.getElementById("targetChapterSelect"),
  studioMessage: document.getElementById("studioMessage"),
  wordCount: document.getElementById("wordCount"),
  charCount: document.getElementById("charCount")
};

const state = {
  regenCount: 0
};

function requireAuth() {
  const auth = localStorage.getItem(ADMIN_AUTH_KEY);
  if (auth !== "1") {
    const next = encodeURIComponent("admin-ai.html");
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
  window.setTimeout(() => toast.remove(), 1500);
}

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (error) {
    return fallback;
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function setMessage(text) {
  elements.studioMessage.textContent = text;
}

function getFormData() {
  return {
    genre: elements.genreInput.value.trim(),
    tone: elements.toneInput.value.trim(),
    audience: elements.audienceInput.value.trim(),
    setting: elements.settingInput.value.trim(),
    mainCharacter: elements.mainCharacterInput.value.trim(),
    supportingCharacters: elements.supportingCharactersInput.value.trim(),
    premise: elements.premiseInput.value.trim(),
    themes: elements.themesInput.value.trim(),
    chapterCount: Number(elements.chapterCountInput.value) || 12,
    outputType: elements.outputTypeSelect.value
  };
}

function validateData(data) {
  if (!data.genre || !data.tone || !data.audience || !data.setting || !data.mainCharacter || !data.premise) {
    setMessage("Complete all required fields before generating.");
    return false;
  }
  return true;
}

function getSupportingList(data) {
  if (!data.supportingCharacters) {
    return ["Rhea", "Milo", "Kade"];
  }
  return data.supportingCharacters.split(",").map((name) => name.trim()).filter(Boolean);
}

function getThemeList(data) {
  if (!data.themes) {
    return ["identity", "resilience", "trust"];
  }
  return data.themes.split(",").map((theme) => theme.trim()).filter(Boolean);
}

function chapterOutlineLines(data) {
  const lines = [];
  for (let i = 1; i <= data.chapterCount; i += 1) {
    lines.push(`${i}. Chapter ${i}: Escalation beat tied to ${data.mainCharacter} and the central conflict.`);
  }
  return lines.join("\n");
}

function buildOutput(data) {
  const supporting = getSupportingList(data);
  const themes = getThemeList(data);
  const variantTag = state.regenCount ? `Variation ${state.regenCount}` : "Primary Draft";

  switch (data.outputType) {
    case "title-ideas":
      return [
        `Output: Title Ideas (${variantTag})`,
        "",
        `- The ${data.genre} of ${data.setting}`,
        `- ${data.mainCharacter} and the Silent Threshold`,
        `- Ember Signals in ${data.setting}`,
        `- The Last Promise of ${data.mainCharacter}`,
        `- When ${themes[0] || "memory"} Breaks`
      ].join("\n");

    case "story-concept":
      return [
        `Output: Story Concept (${variantTag})`,
        "",
        `${data.mainCharacter} is pulled into a ${data.tone.toLowerCase()} ${data.genre.toLowerCase()} narrative set in ${data.setting}.`,
        `Premise: ${data.premise}`,
        `Audience focus: ${data.audience}.`,
        `Primary themes: ${themes.join(", ")}.`,
        `Supporting cast anchor points: ${supporting.join(", ")}.`
      ].join("\n");

    case "character-bios":
      return [
        `Output: Character Bios (${variantTag})`,
        "",
        `${data.mainCharacter}: Protagonist carrying the burden of the main conflict. Voice is ${data.tone.toLowerCase()} and emotionally layered.`,
        ...supporting.map((name, index) => `${name}: Supporting role ${index + 1} tied to ${themes[index % themes.length] || "change"}.`)
      ].join("\n\n");

    case "chapter-outline":
      return [
        `Output: Chapter Outline (${variantTag})`,
        "",
        `Genre: ${data.genre}`,
        `Tone: ${data.tone}`,
        `Chapters: ${data.chapterCount}`,
        "",
        chapterOutlineLines(data)
      ].join("\n");

    case "full-chapter":
      return [
        `Output: Full Chapter (${variantTag})`,
        "",
        `Chapter 1 - ${data.mainCharacter} in ${data.setting}`,
        "",
        `${data.mainCharacter} paused at the edge of the streetlight haze, listening for the thing everyone else had stopped hearing.`,
        `The city answered in small fractures: a whisper from a vent, a pulse from a cracked sign, the echo of ${supporting[0] || "a friend"}'s warning.`,
        `If ${data.premise.toLowerCase()} was true, this was the hour where no one could pretend safety still existed.`
      ].join("\n");

    case "rewrite-scene":
      return [
        `Output: Rewrite Scene (${variantTag})`,
        "",
        `Rewritten with a ${data.tone.toLowerCase()} style for ${data.audience}:`,
        `${data.mainCharacter} crossed ${data.setting} with a deliberate pace, every decision sharpened by ${themes[0] || "uncertainty"}.`,
        `The original scene is reframed to increase sensory detail and tighten conflict progression.`
      ].join("\n");

    case "summarize-chapter":
      return [
        `Output: Summarize Chapter (${variantTag})`,
        "",
        `In this chapter, ${data.mainCharacter} confronts the immediate consequence of ${data.premise.toLowerCase()}.`,
        `The chapter emphasizes ${themes.slice(0, 2).join(" and ")} while setting up the next turning point.`
      ].join("\n");

    case "book-description":
      return [
        `Output: Book Description (${variantTag})`,
        "",
        `${data.mainCharacter} thought ${data.setting} already took everything worth losing. Then a hidden truth forces one impossible choice.`,
        `In this ${data.genre.toLowerCase()} novel for ${data.audience.toLowerCase()} readers, ${themes.join(", ")} collide in a ${data.tone.toLowerCase()} journey of consequence.`
      ].join("\n");

    default:
      return "";
  }
}

function updateMetrics() {
  const text = elements.outputEditor.value.trim();
  const words = text ? text.split(/\s+/).length : 0;
  elements.wordCount.textContent = `${words} words`;
  elements.charCount.textContent = `${text.length} chars`;
}

function withStatus(nextStatus, fn) {
  elements.modelStatus.textContent = nextStatus;
  window.setTimeout(() => {
    fn();
    elements.modelStatus.textContent = "Model ready";
  }, 240);
}

function generate() {
  const data = getFormData();
  if (!validateData(data)) {
    return;
  }

  withStatus("Generating output...", () => {
    elements.outputEditor.value = buildOutput(data);
    updateMetrics();
    setMessage("Generation complete.");
  });
}

function regenerate() {
  state.regenCount += 1;
  generate();
}

function expandOutput() {
  const current = elements.outputEditor.value.trim();
  if (!current) {
    setMessage("Generate content before expanding.");
    return;
  }

  withStatus("Expanding output...", () => {
    const extension = "\n\nExpansion:\n- Add a stronger emotional pivot near the midpoint.\n- Increase consequence in the closing beat.\n- Seed a callback motif for later chapters.";
    elements.outputEditor.value = `${current}${extension}`;
    updateMetrics();
    setMessage("Output expanded.");
  });
}

function shortenOutput() {
  const current = elements.outputEditor.value.trim();
  if (!current) {
    setMessage("Generate content before shortening.");
    return;
  }

  withStatus("Shortening output...", () => {
    const lines = current.split("\n").filter(Boolean);
    const shortened = lines.slice(0, Math.max(3, Math.floor(lines.length * 0.45))).join("\n");
    elements.outputEditor.value = shortened;
    updateMetrics();
    setMessage("Output shortened.");
  });
}

function rewriteOutput() {
  const current = elements.outputEditor.value.trim();
  if (!current) {
    setMessage("Generate content before rewriting.");
    return;
  }

  withStatus("Rewriting output...", () => {
    let rewritten = current;
    rewritten = rewritten.replaceAll(" is ", " becomes ");
    rewritten = rewritten.replaceAll("In this", "Within this");
    rewritten = `Rewrite Pass:\n${rewritten}`;
    elements.outputEditor.value = rewritten;
    updateMetrics();
    setMessage("Output rewritten.");
  });
}

function getBooks() {
  const uploaded = readJson(BOOKS_STORE_KEY, []);
  if (uploaded.length) {
    return uploaded;
  }

  return [
    { id: "book-last-lantern", title: "The Last Lantern" },
    { id: "book-echoes-dawn", title: "Echoes at Dawn" }
  ];
}

function getChapterStore() {
  return readJson(CHAPTERS_STORE_KEY, {});
}

function saveChapterStore(store) {
  writeJson(CHAPTERS_STORE_KEY, store);
}

function renderTargetBooks() {
  const books = getBooks();
  elements.targetBookSelect.innerHTML = "";

  books.forEach((book) => {
    const option = document.createElement("option");
    option.value = book.id;
    option.textContent = book.title;
    elements.targetBookSelect.appendChild(option);
  });

  renderTargetChapters();
}

function renderTargetChapters() {
  const bookId = elements.targetBookSelect.value;
  const chapterStore = getChapterStore();
  const chapters = Array.isArray(chapterStore[bookId]) ? chapterStore[bookId] : [];

  elements.targetChapterSelect.innerHTML = "";

  if (!chapters.length) {
    for (let i = 1; i <= 12; i += 1) {
      const option = document.createElement("option");
      option.value = String(i);
      option.textContent = `Chapter ${i}`;
      elements.targetChapterSelect.appendChild(option);
    }
    return;
  }

  chapters
    .slice()
    .sort((a, b) => Number(a.number) - Number(b.number))
    .forEach((chapter) => {
      const option = document.createElement("option");
      option.value = String(chapter.number);
      option.textContent = chapter.title ? `Ch ${chapter.number}: ${chapter.title}` : `Chapter ${chapter.number}`;
      elements.targetChapterSelect.appendChild(option);
    });
}

function saveDraft() {
  const output = elements.outputEditor.value.trim();
  if (!output) {
    setMessage("Nothing to save. Generate output first.");
    return;
  }

  const drafts = readJson(AI_DRAFTS_KEY, []);
  const record = {
    id: `ai-draft-${Date.now()}`,
    createdAt: new Date().toISOString(),
    outputType: elements.outputTypeSelect.value,
    formData: getFormData(),
    output
  };

  drafts.unshift(record);
  writeJson(AI_DRAFTS_KEY, drafts.slice(0, 100));
  setMessage("Draft saved.");
  showToast("Saved as draft");
}

function saveToChapter() {
  const output = elements.outputEditor.value.trim();
  if (!output) {
    setMessage("Nothing to save to chapter.");
    return;
  }

  const bookId = elements.targetBookSelect.value;
  const chapterNumber = Number(elements.targetChapterSelect.value);
  if (!bookId || !chapterNumber) {
    setMessage("Select a target book and chapter.");
    return;
  }

  const store = getChapterStore();
  const chapterList = Array.isArray(store[bookId]) ? store[bookId] : [];
  const existing = chapterList.find((chapter) => Number(chapter.number) === chapterNumber);

  if (existing) {
    existing.content = output;
    existing.title = existing.title || `Chapter ${chapterNumber}`;
    existing.updatedAt = new Date().toISOString();
  } else {
    chapterList.push({
      id: `ch-${bookId}-${chapterNumber}`,
      number: chapterNumber,
      title: `Chapter ${chapterNumber}`,
      content: output,
      status: "draft",
      updatedAt: new Date().toISOString()
    });
  }

  store[bookId] = chapterList;
  saveChapterStore(store);
  setMessage(`Saved to chapter ${chapterNumber}.`);
  showToast("Saved to chapter");
}

function createBookFromOutput() {
  const output = elements.outputEditor.value.trim();
  if (!output) {
    setMessage("Nothing to convert into a new book.");
    return;
  }

  const books = readJson(BOOKS_STORE_KEY, []);
  const formData = getFormData();
  const titleLine = output.split("\n").find((line) => line.trim().length > 0) || "AI Generated Book";
  const cleanTitle = titleLine.replace(/^Output:\s*/i, "").slice(0, 80);

  const bookId = `book-ai-${Date.now()}`;
  books.unshift({
    id: bookId,
    title: cleanTitle,
    author: "AI Studio",
    genre: formData.genre,
    source: "ai",
    status: "draft",
    createdAt: new Date().toISOString()
  });
  writeJson(BOOKS_STORE_KEY, books);

  const chapterStore = getChapterStore();
  chapterStore[bookId] = [
    {
      id: `ch-${bookId}-1`,
      number: 1,
      title: "Chapter 1",
      content: output,
      status: "draft",
      updatedAt: new Date().toISOString()
    }
  ];
  saveChapterStore(chapterStore);

  renderTargetBooks();
  elements.targetBookSelect.value = bookId;
  renderTargetChapters();

  setMessage(`New draft book created: ${cleanTitle}`);
  showToast("New book created");
}

function bindEvents() {
  elements.logoutBtn.addEventListener("click", () => {
    localStorage.removeItem(ADMIN_AUTH_KEY);
    window.location.href = "index.html";
  });

  elements.generateBtn.addEventListener("click", generate);
  elements.regenerateBtn.addEventListener("click", regenerate);
  elements.expandBtn.addEventListener("click", expandOutput);
  elements.shortenBtn.addEventListener("click", shortenOutput);
  elements.rewriteBtn.addEventListener("click", rewriteOutput);
  elements.saveDraftBtn.addEventListener("click", saveDraft);
  elements.saveChapterBtn.addEventListener("click", saveToChapter);
  elements.createBookBtn.addEventListener("click", createBookFromOutput);

  elements.targetBookSelect.addEventListener("change", renderTargetChapters);
  elements.outputEditor.addEventListener("input", updateMetrics);
}

function seedDefaults() {
  elements.genreInput.value = "Speculative Mystery";
  elements.toneInput.value = "Cinematic, tense, and intimate";
  elements.audienceInput.value = "Young adult and crossover adult readers";
  elements.settingInput.value = "A floating city above a storm-locked sea";
  elements.mainCharacterInput.value = "Nira Vale";
  elements.supportingCharactersInput.value = "Ilan Crest, Mara Quill, Oren Pike";
  elements.premiseInput.value = "An apprentice mapmaker discovers the city charts are being altered to hide an approaching collapse.";
  elements.themesInput.value = "truth, loyalty, grief, courage";
  elements.chapterCountInput.value = "14";
}

function bootstrap() {
  if (!requireAuth()) {
    return;
  }

  seedDefaults();
  renderTargetBooks();
  bindEvents();
  updateMetrics();
  setMessage("Ready to generate.");
}

bootstrap();

