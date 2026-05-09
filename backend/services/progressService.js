const prisma = require("../prisma/client");
const { evaluateReferralByBookId } = require("./referralService");

// ─── Streak helpers ───────────────────────────────────────────────────────────

/** Returns a UTC date string "YYYY-MM-DD" for the given Date (or now). */
function toDateStr(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

/**
 * Automatically update the reading streak for a user.
 * Called each time reading progress is saved.
 * - Same day  → no change (already counted)
 * - Yesterday → increment streak
 * - Older     → reset to 1 (or consume a freeze if available)
 * Returns { streakDays, streakReadToday, freezesLeft, milestoneReached }
 */
async function updateReadingStreak(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      readingStreak: true,
      streakLastReadDate: true,
      streakFreezesLeft: true,
    },
  });

  if (!user) return null;

  const today = toDateStr();
  const lastRead = user.streakLastReadDate ? toDateStr(user.streakLastReadDate) : null;

  // Already counted today — nothing to do
  if (lastRead === today) {
    return {
      streakDays: user.readingStreak,
      streakReadToday: true,
      freezesLeft: user.streakFreezesLeft,
      milestoneReached: null,
    };
  }

  const yesterday = toDateStr(new Date(Date.now() - 86400000));
  let newStreak;
  let newFreezes = user.streakFreezesLeft;

  if (lastRead === yesterday) {
    // Consecutive day
    newStreak = user.readingStreak + 1;
  } else if (lastRead !== null && user.streakFreezesLeft > 0) {
    // Gap, but user has a freeze — consume it and continue streak
    newStreak = user.readingStreak + 1;
    newFreezes = user.streakFreezesLeft - 1;
  } else {
    // Broken streak — reset to 1
    newStreak = 1;
  }

  // Check if this streak count hits a milestone (3, 7, 14, 30)
  const MILESTONES = [
    { days: 3, coins: 5 },
    { days: 7, coins: 10 },
    { days: 14, coins: 25 },
    { days: 30, coins: 50 },
  ];
  const milestone = MILESTONES.find((m) => m.days === newStreak) || null;

  await prisma.user.update({
    where: { id: userId },
    data: {
      readingStreak: newStreak,
      streakLastReadDate: new Date(),
      streakFreezesLeft: newFreezes,
      // Award coins for milestone
      ...(milestone ? { coins: { increment: milestone.coins } } : {}),
    },
  });

  return {
    streakDays: newStreak,
    streakReadToday: true,
    freezesLeft: newFreezes,
    milestoneReached: milestone,
  };
}

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

  await evaluateReferralByBookId(payload.bookId);

  // Auto-update reading streak on every progress save
  const streakUpdate = await updateReadingStreak(userId);

  return { data: progress, streak: streakUpdate };
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
  updateReadingStreak,
  getStreakForUser: async (userId) => {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        readingStreak: true,
        streakLastReadDate: true,
        streakFreezesLeft: true,
      },
    });
    if (!user) return null;
    const today = toDateStr();
    const lastRead = user.streakLastReadDate ? toDateStr(user.streakLastReadDate) : null;
    return {
      streakDays: user.readingStreak,
      streakReadToday: lastRead === today,
      freezesLeft: user.streakFreezesLeft,
    };
  },
};
