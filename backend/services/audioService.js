const prisma = require("../prisma/client");

const AUDIO_INCLUDE = {
  chapter: {
    select: {
      id: true,
      title: true,
      chapterNumber: true,
    },
  },
};

async function ensureBookExists(bookId) {
  return prisma.book.findUnique({
    where: { id: bookId },
    select: { id: true, status: true },
  });
}

async function ensureChapterBelongsToBook(chapterId, bookId) {
  if (!chapterId) {
    return { valid: true, chapter: null };
  }

  const chapter = await prisma.chapter.findUnique({
    where: { id: chapterId },
    select: { id: true, bookId: true, title: true, chapterNumber: true },
  });

  if (!chapter || chapter.bookId !== bookId) {
    return { valid: false, chapter: null };
  }

  return { valid: true, chapter };
}

async function listBookAudio(bookId) {
  const book = await prisma.book.findUnique({
    where: { id: bookId },
    select: { id: true, status: true },
  });

  if (!book || book.status !== "PUBLISHED") {
    return [];
  }

  return prisma.audioTrack.findMany({
    where: { bookId },
    include: AUDIO_INCLUDE,
    orderBy: { order: "asc" },
  });
}

async function createAudioTrack(bookId, data) {
  const book = await ensureBookExists(bookId);
  if (!book) {
    return { error: "BOOK_NOT_FOUND" };
  }

  const chapterCheck = await ensureChapterBelongsToBook(data.chapterId || null, bookId);
  if (!chapterCheck.valid) {
    return { error: "INVALID_CHAPTER" };
  }

  const audioTrack = await prisma.audioTrack.create({
    data: {
      bookId,
      chapterId: data.chapterId || null,
      title: data.title.trim(),
      audioUrl: data.audioUrl.trim(),
      duration: data.duration !== undefined && data.duration !== null ? Number(data.duration) : null,
      order: Number(data.order),
    },
    include: AUDIO_INCLUDE,
  });

  return { data: audioTrack };
}

async function updateAudioTrack(id, data) {
  const existingTrack = await prisma.audioTrack.findUnique({
    where: { id },
    select: { id: true, bookId: true },
  });

  if (!existingTrack) {
    return { error: "AUDIO_NOT_FOUND" };
  }

  const nextChapterId = data.chapterId !== undefined ? data.chapterId : undefined;
  if (nextChapterId !== undefined) {
    const chapterCheck = await ensureChapterBelongsToBook(nextChapterId || null, existingTrack.bookId);
    if (!chapterCheck.valid) {
      return { error: "INVALID_CHAPTER" };
    }
  }

  const updateData = {};
  if (data.title !== undefined) updateData.title = data.title.trim();
  if (data.audioUrl !== undefined) updateData.audioUrl = data.audioUrl.trim();
  if (data.order !== undefined) updateData.order = Number(data.order);
  if (data.duration !== undefined) {
    updateData.duration = data.duration === null ? null : Number(data.duration);
  }
  if (data.chapterId !== undefined) {
    updateData.chapterId = data.chapterId || null;
  }

  const updatedTrack = await prisma.audioTrack.update({
    where: { id },
    data: updateData,
    include: AUDIO_INCLUDE,
  });

  return { data: updatedTrack };
}

async function deleteAudioTrack(id) {
  const existingTrack = await prisma.audioTrack.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!existingTrack) {
    return { error: "AUDIO_NOT_FOUND" };
  }

  await prisma.audioTrack.delete({ where: { id } });
  return { success: true };
}

module.exports = {
  listBookAudio,
  createAudioTrack,
  updateAudioTrack,
  deleteAudioTrack,
};
