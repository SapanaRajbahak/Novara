require("dotenv").config();

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgresql://Novara:Novara_password@localhost:5433/Novara";
}

const prisma = require("../prisma/client");

const PUBLIC_DOMAIN_TAGS = ["public-domain", "project-gutenberg"];

async function main() {
  await prisma.$connect();

  const books = await prisma.book.findMany({
    where: {
      tags: {
        hasSome: PUBLIC_DOMAIN_TAGS,
      },
    },
    select: {
      id: true,
      title: true,
    },
  });

  if (!books.length) {
    console.log("No public-domain books found to publish.");
    return;
  }

  const bookIds = books.map((book) => book.id);

  const [bookUpdateResult, chapterUpdateResult] = await Promise.all([
    prisma.book.updateMany({
      where: {
        id: { in: bookIds },
      },
      data: {
        status: "PUBLISHED",
      },
    }),
    prisma.chapter.updateMany({
      where: {
        bookId: { in: bookIds },
      },
      data: {
        isPublished: true,
      },
    }),
  ]);

  console.log(`Published ${bookUpdateResult.count} public-domain book(s).`);
  console.log(`Marked ${chapterUpdateResult.count} chapter(s) as published.`);
}

main()
  .catch((error) => {
    console.error("Failed to publish public-domain books:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });