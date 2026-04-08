const fs = require("fs/promises");
const path = require("path");

const BOOKS_DIR = path.join(__dirname, "..", "..", "books");
const TEXT_DIR = path.join(BOOKS_DIR, "text");
const META_DIR = path.join(BOOKS_DIR, "meta");
const OUTPUT_DIR = path.join(BOOKS_DIR, "genre-mapped");
const COMBINED_OUTPUT_PATH = path.join(BOOKS_DIR, "books.json");
const UNMATCHED_OUTPUT_PATH = path.join(BOOKS_DIR, "unmatched.json");

const GENRE_MAP = {
  "Classic Literature": [
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
    "My \u00c1ntonia",
    "Siddhartha",
  ],
  "Mystery / Detective": [
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
  ],
  "Horror / Gothic": [
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
  ],
  "Adventure / Action": [
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
  ],
  "Science Fiction": [
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
  ],
  Shakespeare: [
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
  ],
  "World Classics": [
    "Les Mis\u00e9rables",
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
  ],
};

function normalize(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function slugify(value) {
  return normalize(value).replace(/\s+/g, "-");
}

function toTitleCandidateFromFileName(fileName) {
  const stem = String(fileName || "").replace(/\.[^.]+$/, "");
  const words = stem
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);

  if (!words.length) {
    return "";
  }

  return words
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function buildTitleCatalog() {
  const catalog = [];
  for (const [genre, titles] of Object.entries(GENRE_MAP)) {
    for (const title of titles) {
      catalog.push({
        title,
        genre,
        normalizedTitle: normalize(title),
        normalizedSlug: slugify(title),
      });
    }
  }
  return catalog;
}

function scoreTitleMatch(candidateNormalized, candidateSlug, titleEntry) {
  const target = titleEntry.normalizedTitle;
  const targetSlug = titleEntry.normalizedSlug;

  if (!candidateNormalized) {
    return 0;
  }

  if (candidateNormalized === target) {
    return 100;
  }

  if (candidateSlug && candidateSlug === targetSlug) {
    return 98;
  }

  if (candidateNormalized.includes(target) || target.includes(candidateNormalized)) {
    return 82;
  }

  if (candidateSlug && (candidateSlug.includes(targetSlug) || targetSlug.includes(candidateSlug))) {
    return 80;
  }

  const candidateTokens = new Set(candidateNormalized.split(" ").filter(Boolean));
  const targetTokens = target.split(" ").filter(Boolean);
  if (!candidateTokens.size || !targetTokens.length) {
    return 0;
  }

  let overlap = 0;
  for (const token of targetTokens) {
    if (candidateTokens.has(token)) {
      overlap += 1;
    }
  }

  const overlapRatio = overlap / targetTokens.length;
  if (overlapRatio >= 0.9) {
    return 72;
  }
  if (overlapRatio >= 0.75) {
    return 62;
  }
  if (overlapRatio >= 0.6) {
    return 52;
  }

  return 0;
}

function findBestTitleMatch(candidateTitle, fileBaseName, titleCatalog) {
  const normalizedCandidate = normalize(candidateTitle);
  const normalizedFileBase = normalize(fileBaseName);
  const candidateSlug = slugify(candidateTitle || fileBaseName);

  const scored = titleCatalog
    .map((entry) => {
      const scoreFromTitle = scoreTitleMatch(normalizedCandidate, candidateSlug, entry);
      const scoreFromBase = scoreTitleMatch(normalizedFileBase, slugify(fileBaseName), entry);
      return {
        entry,
        score: Math.max(scoreFromTitle, scoreFromBase),
      };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  if (!scored.length) {
    return { match: null, reason: "No mapping candidate scored above 0" };
  }

  const best = scored[0];
  const second = scored[1];

  if (best.score < 70) {
    return { match: null, reason: `Low confidence score (${best.score})` };
  }

  if (second && best.score - second.score < 8) {
    return {
      match: null,
      reason: `Ambiguous mapping (${best.entry.title} vs ${second.entry.title})`,
    };
  }

  return { match: best.entry, reason: null };
}

async function safeReadJson(filePath) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    return null;
  }
}

async function listDownloadedTextFiles() {
  const candidates = [];

  const scanDirs = [TEXT_DIR, BOOKS_DIR];
  for (const scanDir of scanDirs) {
    try {
      const entries = await fs.readdir(scanDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".txt")) {
          continue;
        }

        const absolutePath = path.join(scanDir, entry.name);
        const relativePath = path.relative(BOOKS_DIR, absolutePath).replace(/\\/g, "/");
        candidates.push({
          absolutePath,
          relativePath,
          fileName: entry.name,
          baseName: entry.name.slice(0, -4),
        });
      }
    } catch (error) {
      // Ignore missing directory and continue.
    }
  }

  const deduped = new Map();
  for (const item of candidates) {
    if (!deduped.has(item.baseName)) {
      deduped.set(item.baseName, item);
    }
  }

  return [...deduped.values()].sort((a, b) => a.baseName.localeCompare(b.baseName));
}

async function buildBookRecord(file, titleCatalog) {
  const metaPath = path.join(META_DIR, `${file.baseName}.json`);
  const meta = await safeReadJson(metaPath);

  const candidateTitle = (meta && meta.title) || toTitleCandidateFromFileName(file.fileName);
  const candidateAuthor = (meta && meta.author) || "Unknown";
  const { match, reason } = findBestTitleMatch(candidateTitle, file.baseName, titleCatalog);

  if (!match) {
    return {
      matched: false,
      fileName: file.relativePath,
      detectedTitle: candidateTitle,
      reason,
    };
  }

  return {
    matched: true,
    record: {
      title: match.title,
      author: String(candidateAuthor || "Unknown"),
      genre: match.genre,
      source: "Project Gutenberg",
      fileName: file.relativePath,
    },
  };
}

async function writeOutputs(matchedBooks, unmatchedFiles) {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  for (const book of matchedBooks) {
    const safeName = slugify(book.title) || slugify(book.fileName) || "book";
    const targetPath = path.join(OUTPUT_DIR, `${safeName}.json`);
    await fs.writeFile(targetPath, `${JSON.stringify(book, null, 2)}\n`, "utf8");
  }

  await fs.writeFile(COMBINED_OUTPUT_PATH, `${JSON.stringify(matchedBooks, null, 2)}\n`, "utf8");
  await fs.writeFile(UNMATCHED_OUTPUT_PATH, `${JSON.stringify(unmatchedFiles, null, 2)}\n`, "utf8");
}

async function main() {
  const titleCatalog = buildTitleCatalog();
  const textFiles = await listDownloadedTextFiles();

  if (!textFiles.length) {
    console.log("No downloaded .txt files found under books/text or books/.");
    return;
  }

  const matchedBooks = [];
  const unmatchedFiles = [];

  for (const file of textFiles) {
    const result = await buildBookRecord(file, titleCatalog);
    if (result.matched) {
      matchedBooks.push(result.record);
      console.log(`[MATCHED] ${result.record.title} -> ${result.record.genre}`);
    } else {
      unmatchedFiles.push({
        fileName: result.fileName,
        detectedTitle: result.detectedTitle,
        reason: result.reason,
      });
      console.log(`[UNMATCHED] ${result.fileName} -> ${result.reason}`);
    }
  }

  await writeOutputs(matchedBooks, unmatchedFiles);

  console.log("------------------------------------------------------------");
  console.log(`Total files scanned: ${textFiles.length}`);
  console.log(`Matched: ${matchedBooks.length}`);
  console.log(`Unmatched: ${unmatchedFiles.length}`);
  console.log(`Combined output: ${COMBINED_OUTPUT_PATH}`);
  console.log(`Unmatched output: ${UNMATCHED_OUTPUT_PATH}`);
}

main().catch((error) => {
  console.error("Genre mapping script failed:", error);
  process.exitCode = 1;
});
