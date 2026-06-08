if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgresql://Novara:Novara_password@localhost:5433/Novara";
}

const prisma = require("../prisma/client");

async function main() {
  const book = await prisma.book.findFirst({
    where: {
      OR: [
        { slug: "romeo-and-juliet" },
        { title: { contains: "Romeo and Juliet", mode: "insensitive" } },
      ],
    },
    select: { id: true, slug: true, title: true, genre: true },
  });

  if (!book) {
    console.log("BOOK_NOT_FOUND");
    return;
  }

  console.log(`BOOK|${book.slug}|${book.title}|genre=${book.genre}`);

  const chapters = await prisma.chapter.findMany({
    where: { bookId: book.id },
    orderBy: { chapterNumber: "asc" },
    select: { id: true, chapterNumber: true, title: true, content: true },
  });

  console.log(`CHAPTER_COUNT|${chapters.length}`);
  for (const chapter of chapters.slice(0, 20)) {
    const text = String(chapter.content || "").trim();
    const preview = text.replace(/\s+/g, " ").slice(0, 140);
    console.log(`${chapter.chapterNumber}|${chapter.title}|len=${text.length}|${preview}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
