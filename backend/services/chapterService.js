const prisma = require("../prisma/client");

async function listPublishedChapters(bookId) {
  return prisma.chapter.findMany({
    where: {
      bookId,
      isPublished: true,
      book: {
        status: "PUBLISHED",
      },
    },
    orderBy: {
      chapterNumber: "asc",
    },
    select: {
      id: true,
      bookId: true,
      chapterNumber: true,
      title: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

async function getChapterById(id) {
  return prisma.chapter.findFirst({
    where: {
      id,
      isPublished: true,
      book: {
        status: "PUBLISHED",
      },
    },
    include: {
      book: {
        select: {
          id: true,
          title: true,
          authorName: true,
        },
      },
    },
  });
}

async function createChapter(bookId, payload) {
  const book = await prisma.book.findUnique({ where: { id: bookId } });
  if (!book) {
    return null;
  }

  return prisma.chapter.create({
    data: {
      bookId,
      chapterNumber: Number(payload.chapterNumber),
      title: payload.title.trim(),
      content: payload.content.trim(),
      isPublished: payload.isPublished ?? false,
    },
  });
}

async function updateChapter(id, payload) {
  const existing = await prisma.chapter.findUnique({ where: { id } });
  if (!existing) {
    return null;
  }

  const data = {};
  if (payload.title !== undefined) data.title = payload.title.trim();
  if (payload.content !== undefined) data.content = payload.content.trim();
  if (payload.chapterNumber !== undefined) data.chapterNumber = Number(payload.chapterNumber);
  if (payload.isPublished !== undefined) data.isPublished = payload.isPublished;

  return prisma.chapter.update({
    where: { id },
    data,
  });
}

async function deleteChapter(id) {
  const existing = await prisma.chapter.findUnique({ where: { id } });
  if (!existing) {
    return null;
  }

  await prisma.chapter.delete({ where: { id } });
  return true;
}

module.exports = {
  listPublishedChapters,
  getChapterById,
  createChapter,
  updateChapter,
  deleteChapter,
};
