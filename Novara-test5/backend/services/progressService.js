const prisma = require("../prisma/client");

async function saveReadingProgress(userId, payload) {
  const chapter = await prisma.chapter.findFirst({
    where: {
      id: payload.chapterId,
      bookId: payload.bookId,
    },
    select: {
      id: true,
      bookId: true,
    },
  });

  if (!chapter) {
    return { error: "CHAPTER_NOT_FOUND" };
  }

  const progress = await prisma.readingProgress.upsert({
    where: {
      userId_bookId: {
        userId,
        bookId: payload.bookId,
      },
    },
    update: {
      chapterId: payload.chapterId,
      progressPercent: Number(payload.progressPercent),
      lastLocation: payload.lastLocation || null,
    },
    create: {
      userId,
      bookId: payload.bookId,
      chapterId: payload.chapterId,
      progressPercent: Number(payload.progressPercent),
      lastLocation: payload.lastLocation || null,
    },
    include: {
      chapter: {
        select: {
          id: true,
          chapterNumber: true,
          title: true,
        },
      },
    },
  });

  return { data: progress };
}

async function getReadingProgress(userId, bookId) {
  const progress = await prisma.readingProgress.findUnique({
    where: {
      userId_bookId: {
        userId,
        bookId,
      },
    },
    include: {
      chapter: {
        select: {
          id: true,
          chapterNumber: true,
          title: true,
        },
      },
    },
  });

  return progress;
}

module.exports = {
  saveReadingProgress,
  getReadingProgress,
};
