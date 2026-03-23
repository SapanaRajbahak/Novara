const fs = require("fs/promises");
const path = require("path");
const bcrypt = require("bcrypt");

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgresql://Novara:Novara_password@localhost:5433/Novara";
}

const prisma = require("../prisma/client");

const META_DIR = path.join(__dirname, "..", "..", "books", "meta");
const TEXT_DIR = path.join(__dirname, "..", "..", "books", "text");

function slugify(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
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

  const withoutHeadingOnlyEntries = working.filter((chapter) => {
    const title = String(chapter?.title || "").trim();
    const isHeadingMarker = /^(chapter|act|scene|part|book|volume)\b/i.test(title);
    const isPureHeading = isLikelyHeadingOnlyChapter(chapter);
    const normalizedTitle = title
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const normalizedContent = String(chapter?.content || "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const contentEqualsTitle = normalizedTitle && normalizedTitle === normalizedContent;

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

async function ensureAdminUserId() {
  const existingAdmin = await prisma.user.findFirst({
    where: { role: "ADMIN" },
    select: { id: true },
  });

  if (existingAdmin) {
    return existingAdmin.id;
  }

  const passwordHash = await bcrypt.hash("import-admin-123", 10);
  const admin = await prisma.user.create({
    data: {
      name: "Import Admin",
      email: "import-admin@Novara.local",
      password: passwordHash,
      role: "ADMIN",
    },
    select: { id: true },
  });

  return admin.id;
}

async function loadMetaFiles() {
  const entries = await fs.readdir(META_DIR, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".json"))
    .map((entry) => path.join(META_DIR, entry.name));
}

async function readBookMeta(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Invalid JSON object");
  }
  return parsed;
}

async function importBookFromMeta(meta, defaultSlug, adminUserId) {
  const title = String(meta.title || "Untitled").trim();
  const authorName = String(meta.author || "Unknown").trim();
  const slug = slugify(title) || defaultSlug;
  const mappedGenre = String(meta.genre || "").trim();
  const coverUrl = meta.coverPath ? String(meta.coverPath) : null;
  const metaChapters = Array.isArray(meta.chapters) ? meta.chapters : [];
  const textFilePath = path.join(TEXT_DIR, `${defaultSlug}.txt`);

  const fileUrl = `/books/text/${defaultSlug}.txt`;
  const existingText = await fs.access(textFilePath).then(() => true).catch(() => false);

  let chapters = metaChapters;
  if (existingText) {
    try {
      const textRaw = await fs.readFile(textFilePath, "utf8");
      const cleanedText = stripGutenbergBoilerplate(textRaw);
      chapters = splitIntoChapters(cleanedText);
    } catch (error) {
      console.warn(`[WARN] Failed text parse for ${defaultSlug}, falling back to metadata chapters: ${error.message}`);
      chapters = metaChapters;
    }
  }

  const description = chapters.length
    ? String(chapters[0].content || "").slice(0, 300)
    : `${title} by ${authorName}`;

  const book = await prisma.book.upsert({
    where: { slug },
    update: {
      title,
      authorName,
      description,
      coverUrl,
      genre: mappedGenre || undefined,
      tags: ["classic", "public-domain", "project-gutenberg"],
      fileUrl: existingText ? fileUrl : null,
      fileType: existingText ? "TXT" : null,
      isAiGenerated: false,
      status: "PUBLISHED",
    },
    create: {
      title,
      slug,
      authorName,
      description,
      coverUrl,
      genre: mappedGenre || "Classic",
      tags: ["classic", "public-domain", "project-gutenberg"],
      fileUrl: existingText ? fileUrl : null,
      fileType: existingText ? "TXT" : null,
      isAiGenerated: false,
      status: "PUBLISHED",
      createdBy: adminUserId,
    },
    select: {
      id: true,
      slug: true,
    },
  });

  await prisma.chapter.deleteMany({ where: { bookId: book.id } });

  if (chapters.length) {
    await prisma.chapter.createMany({
      data: chapters.map((chapter, index) => ({
        bookId: book.id,
        chapterNumber: index + 1,
        title: String(chapter.title || `Chapter ${index + 1}`).slice(0, 250),
        content: String(chapter.content || "").trim() || "Content unavailable.",
        isPublished: true,
      })),
    });
  }

  return {
    slug: book.slug,
    chapterCount: chapters.length,
  };
}

async function main() {
  console.log("Starting import from books/meta into database...");

  await prisma.$connect();

  const adminUserId = await ensureAdminUserId();
  const files = await loadMetaFiles();

  if (!files.length) {
    console.log("No metadata files found in books/meta.");
    return;
  }

  let success = 0;
  let failed = 0;
  let totalChapters = 0;

  for (const filePath of files) {
    const defaultSlug = path.basename(filePath, ".json");

    try {
      const meta = await readBookMeta(filePath);
      const result = await importBookFromMeta(meta, defaultSlug, adminUserId);
      success += 1;
      totalChapters += result.chapterCount;
      console.log(`[OK] ${result.slug} -> ${result.chapterCount} chapters`);
    } catch (error) {
      failed += 1;
      console.error(`[FAIL] ${defaultSlug}: ${error.message}`);
    }
  }

  console.log("------------------------------------------------------------");
  console.log(`Imported/updated books: ${success}`);
  console.log(`Failed books: ${failed}`);
  console.log(`Total chapters synced: ${totalChapters}`);
}

main()
  .catch((error) => {
    console.error("Import failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
