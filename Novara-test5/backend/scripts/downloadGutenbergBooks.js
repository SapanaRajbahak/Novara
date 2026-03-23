const fs = require("fs/promises");
const path = require("path");

const GUTENDEX_BASE_URL = "https://gutendex.com/books";
const OUTPUT_DIR = path.join(__dirname, "..", "..", "books");
const TEXT_OUTPUT_DIR = path.join(OUTPUT_DIR, "text");
const META_OUTPUT_DIR = path.join(OUTPUT_DIR, "meta");
const COVER_OUTPUT_DIR = path.join(OUTPUT_DIR, "covers");
const OPEN_LIBRARY_SEARCH_URL = "https://openlibrary.org/search.json";
const REQUEST_DELAY_MS = Number(process.env.GUTENBERG_DELAY_MS || 1500);
const REQUEST_TIMEOUT_MS = Number(process.env.GUTENBERG_TIMEOUT_MS || 30000);
const MAX_RETRIES = Number(process.env.GUTENBERG_MAX_RETRIES || 3);

const BOOK_TITLES = [
  "Pride and Prejudice",
  "Sense and Sensibility",
  "Emma",
  "Mansfield Park",
  "Northanger Abbey",
  "Great Expectations",
  "Oliver Twist",
  "A Tale of Two Cities",
  "David Copperfield",
  "Bleak House",
  "Jane Eyre",
  "Wuthering Heights",
  "The Scarlet Letter",
  "The House of the Seven Gables",
  "Moby-Dick",
  "Bartleby, the Scrivener",
  "Little Women",
  "Anne of Green Gables",
  "The Age of Innocence",
  "Ethan Frome",
  "The Awakening",
  "The Call of the Wild",
  "White Fang",
  "My Antonia",
  "Siddhartha",
  "The Adventures of Sherlock Holmes",
  "The Memoirs of Sherlock Holmes",
  "The Hound of the Baskervilles",
  "The Sign of the Four",
  "The Moonstone",
  "The Woman in White",
  "Father Brown Stories",
  "The Mystery of the Yellow Room",
  "The Thirty-Nine Steps",
  "The Circular Staircase",
  "Dracula",
  "Frankenstein",
  "The Picture of Dorian Gray",
  "The Phantom of the Opera",
  "The Turn of the Screw",
  "Carmilla",
  "The Castle of Otranto",
  "Melmoth the Wanderer",
  "The King in Yellow",
  "Ghost Stories of an Antiquary",
  "Treasure Island",
  "Kidnapped",
  "The Three Musketeers",
  "The Count of Monte Cristo",
  "Robinson Crusoe",
  "The Swiss Family Robinson",
  "Around the World in Eighty Days",
  "Journey to the Center of the Earth",
  "Twenty Thousand Leagues Under the Sea",
  "From the Earth to the Moon",
  "King Solomon's Mines",
  "She",
  "The Lost World",
  "The Time Machine",
  "The War of the Worlds",
  "The Invisible Man",
  "The Island of Doctor Moreau",
  "Flatland",
  "Erewhon",
  "The First Men in the Moon",
  "A Princess of Mars",
  "The Gods of Mars",
  "At the Earth's Core",
  "Romeo and Juliet",
  "Hamlet",
  "Macbeth",
  "Othello",
  "King Lear",
  "Julius Caesar",
  "The Tempest",
  "A Midsummer Night's Dream",
  "Much Ado About Nothing",
  "Twelfth Night",
  "Les Miserables",
  "The Hunchback of Notre-Dame",
  "Don Quixote",
  "Crime and Punishment",
  "The Brothers Karamazov",
  "The Idiot",
  "War and Peace",
  "Anna Karenina",
  "Madame Bovary",
  "The Metamorphosis",
  "The Trial",
  "Heart of Darkness",
  "Lord Jim",
  "The Sorrows of Young Werther",
  "Faust",
  "The Decameron",
  "The Divine Comedy",
  "The Prince",
  "Utopia",
  "Candide",
  "Gulliver's Travels",
  "The Strange Case of Dr Jekyll and Mr Hyde",
];

const TEXT_FORMAT_PRIORITY = [
  "text/plain; charset=utf-8",
  "text/plain; charset=us-ascii",
  "text/plain",
  "text/html; charset=utf-8",
  "text/html",
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function slugify(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function normalizeForMatch(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripGutenbergBoilerplate(text) {
  const normalized = String(text || "").replace(/\r\n/g, "\n");

  const startPattern = /\*\*\*\s*START OF (?:THE|THIS) PROJECT GUTENBERG EBOOK[\s\S]*?\*\*\*/i;
  const endPattern = /\*\*\*\s*END OF (?:THE|THIS) PROJECT GUTENBERG EBOOK[\s\S]*?\*\*\*/i;

  let working = normalized;

  const startMatch = working.match(startPattern);
  if (startMatch && typeof startMatch.index === "number") {
    working = working.slice(startMatch.index + startMatch[0].length);
  }

  const endMatch = working.match(endPattern);
  if (endMatch && typeof endMatch.index === "number") {
    working = working.slice(0, endMatch.index);
  }

  return working.replace(/\n{3,}/g, "\n\n").trim();
}

function stripLeadingFrontMatter(text) {
  const source = String(text || "");
  if (!source) {
    return source;
  }

  const candidates = [];
  const prologuePattern = /^\s*THE\s+PROLOGUE\b.*$/gim;
  const actOnePattern = /^\s*ACT\s+I\b.*$/gim;
  const chapterOnePattern = /^\s*CHAPTER\s+I\b.*$/gim;

  for (const pattern of [prologuePattern, actOnePattern, chapterOnePattern]) {
    const indices = [];
    let match = pattern.exec(source);

    while (match) {
      indices.push(match.index);
      match = pattern.exec(source);
    }

    if (indices.length >= 2) {
      candidates.push(indices[1]);
    }
  }

  if (!candidates.length) {
    return source;
  }

  const cutoff = Math.min(...candidates);
  if (cutoff > 0 && cutoff < source.length) {
    return source.slice(cutoff).trimStart();
  }

  return source;
}

function isLikelyHeadingOnlyChapter(chapter) {
  const text = String(chapter?.content || "").trim();
  if (!text || text.length > 260) {
    return false;
  }

  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) {
    return true;
  }

  const hasBodyLikeSentence = lines.some((line, index) => {
    if (index === 0) {
      return false;
    }

    return /[a-z].*[.!?]/.test(line);
  });

  const mostlyUpperHeading = lines.every((line) => {
    const lettersOnly = line.replace(/[^A-Za-z]/g, "");
    return !lettersOnly || lettersOnly === lettersOnly.toUpperCase();
  });

  return !hasBodyLikeSentence && mostlyUpperHeading;
}

function pruneChapterCandidates(chapters) {
  if (!Array.isArray(chapters) || !chapters.length) {
    return [];
  }

  let working = [...chapters];

  // Drop leading table-of-contents style chapter headings before the first real chapter body.
  const firstSubstantiveIndex = working.findIndex((chapter) => {
    const content = String(chapter?.content || "");
    return !isLikelyHeadingOnlyChapter(chapter) && content.length >= 300;
  });

  if (firstSubstantiveIndex > 0) {
    const prefix = working.slice(0, firstSubstantiveIndex);
    if (prefix.every(isLikelyHeadingOnlyChapter)) {
      working = working.slice(firstSubstantiveIndex);
    }
  }

  // Remove heading-only placeholders and TOC duplicates with no chapter body.
  const withoutHeadingOnlyEntries = working.filter((chapter) => {
    const title = String(chapter?.title || "").trim();
    const isHeadingMarker = /^(chapter|act|scene|part|book|volume)\b/i.test(title);
    const isPureHeading = isLikelyHeadingOnlyChapter(chapter);
    const content = String(chapter?.content || "").trim();
    const contentEqualsTitle = normalizeForMatch(content) === normalizeForMatch(title);

    return !(isPureHeading && (isHeadingMarker || contentEqualsTitle));
  });

  return withoutHeadingOnlyEntries.length ? withoutHeadingOnlyEntries : working;
}

function splitIntoChapters(text) {
  const preparedText = stripLeadingFrontMatter(String(text || ""));
  const lines = preparedText.split("\n");
  const markers = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line || line.length > 120) {
      continue;
    }

    const isPrimaryChapterLine = /^(chapter|book|volume|part)\s+([0-9]+|[ivxlcdm]+)\b[\s\.:\-]*.*$/i.test(line);
    const isDramaHeading = /^(act|scene)\s+([0-9]+|[ivxlcdm]+)\b[\s\.:\-]*.*$/i.test(line);
    const isRomanHeading = /^[IVXLCDM]{2,}\.?$/.test(line);

    if (isPrimaryChapterLine || isDramaHeading || isRomanHeading) {
      markers.push({ index: i, title: line });
    }
  }

  if (markers.length < 2) {
    return [
      {
        title: "Chapter 1",
        content: preparedText.trim(),
      },
    ];
  }

  const chapters = [];

  if (markers[0].index > 5) {
    const prefatory = lines.slice(0, markers[0].index).join("\n").trim();
    if (prefatory.length > 200) {
      chapters.push({
        title: "Preface",
        content: prefatory,
      });
    }
  }

  for (let i = 0; i < markers.length; i += 1) {
    const current = markers[i];
    const next = markers[i + 1];
    const start = current.index;
    const end = next ? next.index : lines.length;
    const chapterText = lines.slice(start, end).join("\n").trim();

    if (!chapterText) {
      continue;
    }

    chapters.push({
      title: current.title || `Chapter ${chapters.length + 1}`,
      content: chapterText,
    });
  }

  const cleanedChapters = pruneChapterCandidates(chapters);

  return cleanedChapters.length
    ? cleanedChapters
    : [
        {
          title: "Chapter 1",
          content: preparedText.trim(),
        },
      ];
}

function selectBestTextUrl(formats) {
  if (!formats || typeof formats !== "object") {
    return null;
  }

  for (const key of TEXT_FORMAT_PRIORITY) {
    if (formats[key]) {
      return formats[key];
    }
  }

  const dynamicTextKey = Object.keys(formats).find((key) => key.startsWith("text/plain"));
  if (dynamicTextKey) {
    return formats[dynamicTextKey];
  }

  const htmlKey = Object.keys(formats).find((key) => key.startsWith("text/html"));
  if (htmlKey) {
    return formats[htmlKey];
  }

  return null;
}

function scoreCandidate(requestedTitle, candidate) {
  const target = normalizeForMatch(requestedTitle);
  const actual = normalizeForMatch(candidate.title);

  let score = 0;

  if (actual === target) {
    score += 100;
  }

  if (actual.startsWith(target)) {
    score += 35;
  }

  if (actual.includes(target)) {
    score += 25;
  }

  if (target.includes(actual) && actual.length > 8) {
    score += 10;
  }

  if (Array.isArray(candidate.languages) && candidate.languages.includes("en")) {
    score += 8;
  }

  if (selectBestTextUrl(candidate.formats)) {
    score += 10;
  }

  score += Math.min(Number(candidate.download_count || 0) / 10000, 6);

  return score;
}

async function requestWithRetry(url, parseAs = "json") {
  let lastError = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          "User-Agent": "NovaraGutenbergDownloader/1.0",
          Accept: "application/json,text/plain;q=0.9,*/*;q=0.8",
        },
      });

      clearTimeout(timeoutHandle);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      if (parseAs === "text") {
        return response.text();
      }

      if (parseAs === "buffer") {
        return Buffer.from(await response.arrayBuffer());
      }

      return response.json();
    } catch (error) {
      clearTimeout(timeoutHandle);
      lastError = error;

      if (attempt < MAX_RETRIES) {
        await sleep(750 * attempt);
      }
    }
  }

  throw lastError || new Error("Request failed after retries");
}

async function searchBookByTitle(title) {
  const searchUrl = `${GUTENDEX_BASE_URL}?search=${encodeURIComponent(title)}`;
  const payload = await requestWithRetry(searchUrl, "json");
  const candidates = Array.isArray(payload && payload.results) ? payload.results : [];

  if (!candidates.length) {
    return null;
  }

  const sorted = candidates
    .map((item) => ({ item, score: scoreCandidate(title, item) }))
    .sort((a, b) => b.score - a.score);

  return sorted[0].item;
}

function pickAuthorName(authors) {
  if (!Array.isArray(authors) || !authors.length) {
    return "Unknown";
  }

  return authors[0] && authors[0].name ? String(authors[0].name) : "Unknown";
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch (error) {
    return false;
  }
}

function pickBestCoverDoc(title, author, docs) {
  if (!Array.isArray(docs) || !docs.length) {
    return null;
  }

  const targetTitle = normalizeForMatch(title);
  const targetAuthor = normalizeForMatch(author);

  let bestDoc = null;
  let bestScore = -Infinity;

  for (const doc of docs) {
    const docTitle = normalizeForMatch(doc.title || "");
    const firstAuthor = Array.isArray(doc.author_name) && doc.author_name.length ? doc.author_name[0] : "";
    const docAuthor = normalizeForMatch(firstAuthor);

    let score = 0;

    if (docTitle === targetTitle) {
      score += 80;
    }

    if (docTitle.includes(targetTitle) || targetTitle.includes(docTitle)) {
      score += 25;
    }

    if (docAuthor && targetAuthor && docAuthor === targetAuthor) {
      score += 65;
    }

    if (docAuthor && targetAuthor && (docAuthor.includes(targetAuthor) || targetAuthor.includes(docAuthor))) {
      score += 20;
    }

    if (Number.isInteger(doc.cover_i)) {
      score += 20;
    }

    if (score > bestScore) {
      bestScore = score;
      bestDoc = doc;
    }
  }

  return bestDoc;
}

function buildCoverUrlFromDoc(doc) {
  if (!doc || typeof doc !== "object") {
    return null;
  }

  if (Number.isInteger(doc.cover_i)) {
    return `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg`;
  }

  const editionKey = Array.isArray(doc.edition_key) && doc.edition_key.length ? doc.edition_key[0] : null;
  if (editionKey) {
    return `https://covers.openlibrary.org/b/olid/${editionKey}-L.jpg`;
  }

  return null;
}

async function fetchAndSaveOpenLibraryCover(title, author, baseFileName) {
  const coverFileName = `${baseFileName}.jpg`;
  const localCoverPath = path.join(COVER_OUTPUT_DIR, coverFileName);
  const relativeCoverPath = `/books/covers/${coverFileName}`;

  if (await fileExists(localCoverPath)) {
    return {
      status: "reused",
      coverPath: relativeCoverPath,
      coverSource: "existing-local-file",
    };
  }

  const searchUrl = `${OPEN_LIBRARY_SEARCH_URL}?title=${encodeURIComponent(title)}&author=${encodeURIComponent(author)}&limit=25`;
  const payload = await requestWithRetry(searchUrl, "json");
  const docs = Array.isArray(payload && payload.docs) ? payload.docs : [];

  if (!docs.length) {
    return {
      status: "not-found",
      coverPath: null,
      coverSource: null,
    };
  }

  const bestDoc = pickBestCoverDoc(title, author, docs);
  const coverUrl = buildCoverUrlFromDoc(bestDoc);

  if (!coverUrl) {
    return {
      status: "not-found",
      coverPath: null,
      coverSource: null,
    };
  }

  try {
    const imageData = await requestWithRetry(coverUrl, "buffer");
    if (!imageData || imageData.length === 0) {
      return {
        status: "failed-but-skipped",
        coverPath: null,
        coverSource: coverUrl,
        error: "Empty image response",
      };
    }

    await fs.writeFile(localCoverPath, imageData);
    return {
      status: "downloaded",
      coverPath: relativeCoverPath,
      coverSource: coverUrl,
    };
  } catch (error) {
    return {
      status: "failed-but-skipped",
      coverPath: null,
      coverSource: coverUrl,
      error: error.message,
    };
  }
}

async function ensureOutputDir() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  await fs.mkdir(TEXT_OUTPUT_DIR, { recursive: true });
  await fs.mkdir(META_OUTPUT_DIR, { recursive: true });
  await fs.mkdir(COVER_OUTPUT_DIR, { recursive: true });
}

async function writeBookOutputs(baseFileName, rawText, bookJson) {
  const textPath = path.join(TEXT_OUTPUT_DIR, `${baseFileName}.txt`);
  const jsonPath = path.join(META_OUTPUT_DIR, `${baseFileName}.json`);

  await fs.writeFile(textPath, rawText, "utf8");
  await fs.writeFile(jsonPath, JSON.stringify(bookJson, null, 2), "utf8");

  return { textPath, jsonPath };
}

async function processBook(title, index, total) {
  const listPrefix = `[${index + 1}/${total}]`;

  try {
    const match = await searchBookByTitle(title);
    if (!match) {
      const message = `${listPrefix} FAIL  ${title} -> no search results`;
      console.log(message);
      return { title, status: "failed", error: "No search results" };
    }

    const textUrl = selectBestTextUrl(match.formats);
    if (!textUrl) {
      const message = `${listPrefix} FAIL  ${title} -> no text format available`;
      console.log(message);
      return { title, status: "failed", error: "No text format URL" };
    }

    const downloadedText = await requestWithRetry(textUrl, "text");
    const cleanedText = stripGutenbergBoilerplate(downloadedText);
    const chapters = splitIntoChapters(cleanedText);

    const fileName = slugify(title) || `book-${index + 1}`;
    const author = pickAuthorName(match.authors);

    let coverResult = {
      status: "not-found",
      coverPath: null,
      coverSource: null,
    };

    try {
      coverResult = await fetchAndSaveOpenLibraryCover(match.title || title, author, fileName);
    } catch (error) {
      coverResult = {
        status: "failed-but-skipped",
        coverPath: null,
        coverSource: null,
        error: error.message,
      };
    }

    if (coverResult.status === "downloaded") {
      console.log(`${listPrefix} COVER downloaded -> ${coverResult.coverPath}`);
    } else if (coverResult.status === "reused") {
      console.log(`${listPrefix} COVER reused     -> ${coverResult.coverPath}`);
    } else if (coverResult.status === "not-found") {
      console.log(`${listPrefix} COVER not-found`);
    } else {
      console.log(`${listPrefix} COVER failed-skip -> ${coverResult.error || "unknown"}`);
    }

    const payload = {
      title: match.title || title,
      author,
      source: "Project Gutenberg",
      chapters,
      coverPath: coverResult.coverPath,
      coverSource: coverResult.coverSource,
    };

    const { textPath, jsonPath } = await writeBookOutputs(fileName, cleanedText, payload);

    const message = `${listPrefix} OK    ${title} -> ${path.basename(textPath)}, ${path.basename(jsonPath)}`;
    console.log(message);

    return {
      title,
      status: "success",
      matchedTitle: match.title || title,
      author: payload.author,
      bookId: match.id,
      textUrl,
      coverStatus: coverResult.status,
      coverPath: coverResult.coverPath,
      coverSource: coverResult.coverSource,
      textFile: textPath,
      jsonFile: jsonPath,
      chapterCount: chapters.length,
    };
  } catch (error) {
    const message = `${listPrefix} FAIL  ${title} -> ${error.message}`;
    console.log(message);
    return {
      title,
      status: "failed",
      error: error.message,
    };
  }
}

async function main() {
  await ensureOutputDir();

  const logEntries = [];
  const total = BOOK_TITLES.length;

  console.log(`Starting Gutenberg download for ${total} titles...`);
  console.log(`Output directory: ${OUTPUT_DIR}`);

  for (let i = 0; i < BOOK_TITLES.length; i += 1) {
    if (i > 0) {
      await sleep(REQUEST_DELAY_MS);
    }

    const result = await processBook(BOOK_TITLES[i], i, total);
    logEntries.push(result);
  }

  const successCount = logEntries.filter((item) => item.status === "success").length;
  const failedCount = logEntries.length - successCount;

  const runSummary = {
    timestamp: new Date().toISOString(),
    total,
    successCount,
    failedCount,
    delayMs: REQUEST_DELAY_MS,
    results: logEntries,
  };

  const logPath = path.join(OUTPUT_DIR, "download-log.json");
  await fs.writeFile(logPath, JSON.stringify(runSummary, null, 2), "utf8");

  console.log("------------------------------------------------------------");
  console.log(`Completed. Success: ${successCount}, Failed: ${failedCount}`);
  console.log(`Log file: ${logPath}`);
}

main().catch((error) => {
  console.error("Fatal error while downloading Gutenberg books:", error);
  process.exitCode = 1;
});
