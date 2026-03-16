const fs = require("fs/promises");
const path = require("path");
const bcrypt = require("bcrypt");

// Use a sensible default for local Docker Postgres if DATABASE_URL is not set.
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgresql://novara:novara_password@localhost:5433/novara";
}

const prisma = require("../prisma/client");

const BOOKS_TO_IMPORT = [
  {
    title: "Alice's Adventures in Wonderland",
    authorName: "Lewis Carroll",
    genre: "fantasy",
    description:
      "A classic public-domain fantasy novel following Alice through a whimsical world.",
    sourceUrl: "https://www.gutenberg.org/ebooks/11.epub.images",
    fileName: "alice-in-wonderland.epub",
  },
  {
    title: "The Adventures of Sherlock Holmes",
    authorName: "Arthur Conan Doyle",
    genre: "mystery",
    description:
      "A public-domain collection of detective stories featuring Sherlock Holmes.",
    sourceUrl: "https://www.gutenberg.org/ebooks/1661.epub.images",
    fileName: "sherlock-holmes.epub",
  },
];

function slugify(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

async function ensureUploadsDirectory() {
  const uploadsDir = path.join(__dirname, "..", "uploads", "books");
  await fs.mkdir(uploadsDir, { recursive: true });
  return uploadsDir;
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

  const createdAdmin = await prisma.user.create({
    data: {
      name: "Import Admin",
      email: "import-admin@novara.local",
      password: passwordHash,
      role: "ADMIN",
    },
    select: { id: true },
  });

  return createdAdmin.id;
}

async function downloadEpub(url, targetFilePath) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "NovaraImporter/1.0 (+https://www.gutenberg.org)",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed download from ${url}. HTTP ${response.status}`);
  }

  const fileBuffer = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(targetFilePath, fileBuffer);
}

async function importBook(book, uploadsDir, createdByUserId) {
  const slug = slugify(book.title);

  const existingBook = await prisma.book.findUnique({
    where: { slug },
    select: { id: true, slug: true },
  });

  if (existingBook) {
    console.log(`[SKIP] ${book.title} already exists (slug: ${slug})`);
    return { status: "skipped", title: book.title };
  }

  const targetPath = path.join(uploadsDir, book.fileName);
  await downloadEpub(book.sourceUrl, targetPath);

  const fileUrl = `/uploads/books/${book.fileName}`;

  await prisma.book.create({
    data: {
      title: book.title,
      slug,
      description: book.description,
      authorName: book.authorName,
      genre: book.genre,
      tags: [book.genre, "public-domain", "project-gutenberg"],
      fileUrl,
      fileType: "EPUB",
      isAudiobookAvailable: false,
      isAiGenerated: false,
      status: "PUBLISHED",
      createdBy: createdByUserId,
    },
  });

  console.log(`[IMPORTED] ${book.title} -> ${targetPath}`);
  return { status: "imported", title: book.title };
}

async function main() {
  console.log("Starting public-domain book import...");

  await prisma.$connect();

  const uploadsDir = await ensureUploadsDirectory();
  const adminUserId = await ensureAdminUserId();

  let importedCount = 0;
  let skippedCount = 0;

  for (const book of BOOKS_TO_IMPORT) {
    try {
      const result = await importBook(book, uploadsDir, adminUserId);
      if (result.status === "imported") {
        importedCount += 1;
      } else {
        skippedCount += 1;
      }
    } catch (error) {
      console.error(`[ERROR] Failed to import ${book.title}:`, error.message);
    }
  }

  console.log("Import completed.");
  console.log(`Imported: ${importedCount}`);
  console.log(`Skipped: ${skippedCount}`);
}

main()
  .catch((error) => {
    console.error("Import script failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
