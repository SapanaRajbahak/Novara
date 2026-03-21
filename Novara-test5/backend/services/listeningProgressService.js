const prisma = require("../prisma/client");

const LISTENING_PROGRESS_INCLUDE = {
  audioTrack: {
    select: {
      id: true,
      title: true,
      order: true,
      duration: true,
      audioUrl: true,
      chapter: {
        select: {
          id: true,
          chapterNumber: true,
          title: true,
        },
      },
    },
  },
};

async function ensureTrackBelongsToBook(audioTrackId, bookId) {
  const track = await prisma.audioTrack.findUnique({
    where: { id: audioTrackId },
    select: { id: true, bookId: true },
  });

  if (!track || track.bookId !== bookId) {
    return null;
  }

  return track;
}

async function saveListeningProgress(userId, payload) {
  const track = await ensureTrackBelongsToBook(payload.audioTrackId, payload.bookId);
  if (!track) {
    return { error: "AUDIO_TRACK_NOT_FOUND" };
  }

  const existingRows = await prisma.listeningProgress.findMany({
    where: {
      userId,
      bookId: payload.bookId,
    },
    orderBy: {
      updatedAt: "desc",
    },
    select: {
      id: true,
      audioTrackId: true,
    },
  });

  const existing = existingRows[0] || null;
  const duplicateIds = existingRows.slice(1).map((row) => row.id);

  const progressData = {
    audioTrackId: payload.audioTrackId,
    currentTimeSeconds: Math.floor(Number(payload.currentTimeSeconds)),
  };

  const progress = await prisma.$transaction(async (tx) => {
    if (existing && duplicateIds.length) {
      await tx.listeningProgress.deleteMany({
        where: {
          id: {
            in: duplicateIds,
          },
        },
      });
    }

    if (existing) {
      return tx.listeningProgress.update({
        where: { id: existing.id },
        data: progressData,
        include: LISTENING_PROGRESS_INCLUDE,
      });
    }

    return tx.listeningProgress.create({
      data: {
        userId,
        bookId: payload.bookId,
        ...progressData,
      },
      include: LISTENING_PROGRESS_INCLUDE,
    });
  });

  return { data: progress };
}

async function getListeningProgress(userId, bookId) {
  return prisma.listeningProgress.findFirst({
    where: {
      userId,
      bookId,
    },
    orderBy: {
      updatedAt: "desc",
    },
    include: LISTENING_PROGRESS_INCLUDE,
  });
}

module.exports = {
  saveListeningProgress,
  getListeningProgress,
};
