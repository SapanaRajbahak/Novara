const fs = require("fs/promises");
const path = require("path");

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgresql://Novara:Novara_password@localhost:5433/Novara";
}

const prisma = require("../prisma/client");

const MAPPED_BOOKS_PATH = path.join(__dirname, "..", "..", "books", "books.json");

function normalize(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function slugFromFileName(fileName) {
  const base = String(fileName || "")
    .replace(/\\/g, "/")
    .split("/")
    .pop()
    .replace(/\.txt$/i, "");

  return base;
}

function slugify(value) {
  return normalize(value).replace(/\s+/g, "-");
}

function scoreBookMatch(mappedTitle, mappedSlug, dbBook) {
  const dbTitle = normalize(dbBook.title);
  const dbSlug = String(dbBook.slug || "").toLowerCase();

  if (!dbTitle && !dbSlug) {
    return 0;
  }

  if (dbTitle === mappedTitle) {
    return 100;
  }

  if (dbSlug === mappedSlug) {
    return 98;
  }

  if (dbSlug.includes(mappedSlug) || mappedSlug.includes(dbSlug)) {
    return 88;
  }

  if (dbTitle.includes(mappedTitle) || mappedTitle.includes(dbTitle)) {
    return 84;
  }

  const mappedTokens = mappedTitle.split(" ").filter(Boolean);
  const dbTokens = new Set(dbTitle.split(" ").filter(Boolean));
  if (!mappedTokens.length || !dbTokens.size) {
    return 0;
  }

  let overlap = 0;
  for (const token of mappedTokens) {
    if (dbTokens.has(token)) {
      overlap += 1;
    }
  }

  const overlapRatio = overlap / mappedTokens.length;
  if (overlapRatio >= 0.9) {
    return 78;
  }
  if (overlapRatio >= 0.8) {
    return 70;
  }

  return 0;
}

function findBestDbMatch(mappedTitle, mappedSlug, dbBooks) {
  const scored = dbBooks
    .map((dbBook) => ({
      dbBook,
      score: scoreBookMatch(mappedTitle, mappedSlug, dbBook),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  if (!scored.length) {
    return null;
  }

  const best = scored[0];
  const second = scored[1];

  if (best.score < 78) {
    return null;
  }

  if (second && best.score - second.score < 6) {
    return null;
  }

  return best.dbBook;
}

async function main() {
  const raw = await fs.readFile(MAPPED_BOOKS_PATH, "utf8");
  const mappedBooks = JSON.parse(raw);

  if (!Array.isArray(mappedBooks) || !mappedBooks.length) {
    console.log("No mapped books found in books.json.");
    return;
  }

  await prisma.$connect();

  const dbBooks = await prisma.book.findMany({
    select: { id: true, title: true, slug: true, genre: true },
  });

  const bySlug = new Map(dbBooks.map((b) => [b.slug, b]));
  const byTitle = new Map(dbBooks.map((b) => [normalize(b.title), b]));

  let updated = 0;
  let skipped = 0;
  let unmatched = 0;

  for (const item of mappedBooks) {
    const mappedSlug = slugFromFileName(item.fileName) || slugify(item.title);
    const mappedTitle = normalize(item.title);
    const mappedGenre = String(item.genre || "").trim();

    if (!mappedGenre) {
      skipped += 1;
      continue;
    }

    const target = bySlug.get(mappedSlug) || byTitle.get(mappedTitle) || findBestDbMatch(mappedTitle, mappedSlug, dbBooks);

    if (!target) {
      unmatched += 1;
      console.log(`[UNMATCHED] ${item.title}`);
      continue;
    }

    if (String(target.genre || "") === mappedGenre) {
      skipped += 1;
      continue;
    }

    await prisma.book.update({
      where: { id: target.id },
      data: { genre: mappedGenre },
    });

    updated += 1;
    console.log(`[UPDATED] ${target.title} -> ${mappedGenre}`);
  }

  console.log("------------------------------------------------------------");
  console.log(`Updated genres: ${updated}`);
  console.log(`Already correct / skipped: ${skipped}`);
  console.log(`Unmatched mapped entries: ${unmatched}`);
}

main()
  .catch((error) => {
    console.error("Genre sync failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
