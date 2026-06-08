if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgresql://Novara:Novara_password@localhost:5433/Novara";
}

const prisma = require("../prisma/client");

const BOOK_IMPORT_CONFIG = [
  {
    slug: "alices-adventures-in-wonderland",
    title: "Alice's Adventures in Wonderland",
    textUrl: "https://www.gutenberg.org/cache/epub/11/pg11.txt",
    parser: "alice",
  },
  {
    slug: "the-adventures-of-sherlock-holmes",
    title: "The Adventures of Sherlock Holmes",
    textUrl: "https://www.gutenberg.org/cache/epub/1661/pg1661.txt",
    parser: "sherlock",
  },
];

function normalizeText(text) {
  return text.replace(/\r\n/g, "\n");
}

function stripGutenbergBoilerplate(text) {
  const normalized = normalizeText(text);

  const startMatch = normalized.match(/\*\*\*\s*START OF (?:THE|THIS) PROJECT GUTENBERG EBOOK[\s\S]*?\*\*\*/i);
  const endMatch = normalized.match(/\*\*\*\s*END OF (?:THE|THIS) PROJECT GUTENBERG EBOOK[\s\S]*?\*\*\*/i);

  let sliced = normalized;

  if (startMatch) {
    const startIndex = startMatch.index + startMatch[0].length;
    sliced = sliced.slice(startIndex);
  }

  if (endMatch) {
    const endIndex = sliced.search(/\*\*\*\s*END OF (?:THE|THIS) PROJECT GUTENBERG EBOOK[\s\S]*?\*\*\*/i);
    if (endIndex >= 0) {
      sliced = sliced.slice(0, endIndex);
    }
  }

  return sliced.trim();
}

function compactContent(value) {
  return value
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

function parseAliceChapters(text) {
  const lines = text.split("\n");
  const markers = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();

    if (/^CHAPTER\s+[IVXLCDM]+\.?$/i.test(line)) {
      let titleLine = "";
      for (let j = i + 1; j < lines.length; j += 1) {
        const candidate = lines[j].trim();
        if (!candidate) {
          continue;
        }
        titleLine = candidate.replace(/^\.\s*/, "").trim();
        break;
      }

      const chapterTitle = titleLine ? `${line} - ${titleLine}` : line;
      markers.push({ index: i, title: chapterTitle });
    }
  }

  if (!markers.length) {
    return [];
  }

  const chapters = [];

  for (let i = 0; i < markers.length; i += 1) {
    const start = markers[i].index;
    const end = i + 1 < markers.length ? markers[i + 1].index : lines.length;
    const content = compactContent(lines.slice(start, end).join("\n"));

    if (!content) {
      continue;
    }

    chapters.push({
      chapterNumber: i + 1,
      title: markers[i].title,
      content,
    });
  }

  return chapters;
}

function parseSherlockChapters(text) {
  const lines = text.split("\n");
  const romanToNumber = {
    I: 1,
    II: 2,
    III: 3,
    IV: 4,
    V: 5,
    VI: 6,
    VII: 7,
    VIII: 8,
    IX: 9,
    X: 10,
    XI: 11,
    XII: 12,
  };

  const markersByNumber = new Map();

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();

    // Capture numerals at line start and keep the last occurrence for each numeral,
    // which reliably picks the real chapter heading over the earlier TOC heading.
    const match = line.match(/^([IVXLCDM]+)\.\s+(.+)$/);
    if (!match) {
      continue;
    }

    const numeral = match[1];
    const chapterNumber = romanToNumber[numeral];
    if (!chapterNumber || chapterNumber < 1 || chapterNumber > 12) {
      continue;
    }

    markersByNumber.set(chapterNumber, {
      index: i,
      chapterNumber,
      title: line,
    });
  }

  const markers = [...markersByNumber.values()].sort((a, b) => a.chapterNumber - b.chapterNumber);

  if (!markers.length) {
    return [];
  }

  const chapters = [];

  for (let i = 0; i < markers.length; i += 1) {
    const start = markers[i].index;
    const end = i + 1 < markers.length ? markers[i + 1].index : lines.length;
    const content = compactContent(lines.slice(start, end).join("\n"));

    if (!content) {
      continue;
    }

    chapters.push({
      chapterNumber: markers[i].chapterNumber,
      title: markers[i].title,
      content,
    });
  }

  return chapters;
}

function parseChapters(parserName, text) {
  if (parserName === "alice") {
    return parseAliceChapters(text);
  }

  if (parserName === "sherlock") {
    return parseSherlockChapters(text);
  }

  return [];
}

async function fetchBookText(textUrl) {
  const response = await fetch(textUrl, {
    headers: {
      "User-Agent": "NovaraChapterImporter/1.0 (+https://www.gutenberg.org)",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${textUrl} (HTTP ${response.status})`);
  }

  return response.text();
}

async function importChaptersForBook(config) {
  const book = await prisma.book.findUnique({
    where: { slug: config.slug },
    select: { id: true, title: true, slug: true },
  });

  if (!book) {
    console.log(`[SKIP] Book not found for slug: ${config.slug}`);
    return { imported: 0, skipped: 0 };
  }

  const rawText = await fetchBookText(config.textUrl);
  const cleanText = stripGutenbergBoilerplate(rawText);
  const parsedChapters = parseChapters(config.parser, cleanText);

  if (!parsedChapters.length) {
    console.log(`[SKIP] No chapters detected for ${book.title}`);
    return { imported: 0, skipped: 0 };
  }

  const existingChapters = await prisma.chapter.findMany({
    where: { bookId: book.id },
    select: { id: true, chapterNumber: true, title: true, content: true, isPublished: true },
  });

  const existingByNumber = new Map(existingChapters.map((item) => [item.chapterNumber, item]));
  const parsedNumbers = new Set(parsedChapters.map((item) => item.chapterNumber));

  let imported = 0;
  let skipped = 0;
  let updated = 0;
  let deleted = 0;

  for (const chapter of parsedChapters) {
    const existing = existingByNumber.get(chapter.chapterNumber);

    if (!existing) {
      await prisma.chapter.create({
        data: {
          bookId: book.id,
          chapterNumber: chapter.chapterNumber,
          title: chapter.title,
          content: chapter.content,
          isPublished: true,
        },
      });

      imported += 1;
      console.log(`[IMPORTED] ${book.title} chapter ${chapter.chapterNumber}: ${chapter.title}`);
      continue;
    }

    const needsUpdate =
      existing.title !== chapter.title ||
      existing.content !== chapter.content ||
      existing.isPublished !== true;

    if (!needsUpdate) {
      skipped += 1;
      console.log(`[SKIP] ${book.title} chapter ${chapter.chapterNumber} unchanged`);
      continue;
    }

    await prisma.chapter.update({
      where: { id: existing.id },
      data: {
        title: chapter.title,
        content: chapter.content,
        isPublished: true,
      },
    });

    updated += 1;
    console.log(`[UPDATED] ${book.title} chapter ${chapter.chapterNumber}: ${chapter.title}`);
  }

  // Cleanup any extra chapters that are no longer in the parsed source.
  for (const existing of existingChapters) {
    if (parsedNumbers.has(existing.chapterNumber)) {
      continue;
    }

    await prisma.chapter.delete({ where: { id: existing.id } });
    deleted += 1;
    console.log(`[DELETED] ${book.title} chapter ${existing.chapterNumber} removed as extra`);
  }

  return { imported, skipped, updated, deleted };
}

async function main() {
  console.log("Starting chapter import...");

  await prisma.$connect();

  let totalImported = 0;
  let totalSkipped = 0;
  let totalUpdated = 0;
  let totalDeleted = 0;

  for (const config of BOOK_IMPORT_CONFIG) {
    try {
      const result = await importChaptersForBook(config);
      totalImported += result.imported;
      totalSkipped += result.skipped;
      totalUpdated += result.updated;
      totalDeleted += result.deleted;
    } catch (error) {
      console.error(`[ERROR] Failed for ${config.title}:`, error.message);
    }
  }

  console.log("Chapter import completed.");
  console.log(`Imported chapters: ${totalImported}`);
  console.log(`Updated chapters: ${totalUpdated}`);
  console.log(`Deleted extra chapters: ${totalDeleted}`);
  console.log(`Skipped chapters: ${totalSkipped}`);
}

main()
  .catch((error) => {
    console.error("Chapter import failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
