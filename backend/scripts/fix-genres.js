/**
 * One-time script: update genre on all books in the DB using books.json as the source.
 * Run from backend/: node scripts/fix-genres.js
 */
require("dotenv").config();
const prisma = require("../prisma/client");
const booksJson = require("../../books/books.json");

async function main() {
  let updated = 0;
  let skipped = 0;

  for (const entry of booksJson) {
    if (!entry.genre || !entry.title) { skipped++; continue; }

    const result = await prisma.book.updateMany({
      where: {
        title: { equals: entry.title, mode: "insensitive" },
      },
      data: { genre: entry.genre },
    });

    if (result.count > 0) {
      console.log(`✓ "${entry.title}" → ${entry.genre}`);
      updated += result.count;
    } else {
      console.log(`- "${entry.title}" not found in DB`);
      skipped++;
    }
  }

  console.log(`\nDone. Updated: ${updated}, Skipped: ${skipped}`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
