const prisma = require("../prisma/client");

function getMonthWindow(monthsBack) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - monthsBack + 1, 1);
  return { start, now };
}

function bucketByMonth(dates, monthsBack) {
  const now = new Date();
  const labels = [];
  const counts = [];

  for (let i = monthsBack - 1; i >= 0; i -= 1) {
    const current = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, "0")}`;
    labels.push({
      key,
      label: current.toLocaleString(undefined, { month: "short" }),
    });
    counts.push(0);
  }

  const map = new Map(labels.map((item, index) => [item.key, index]));
  dates.forEach((dateValue) => {
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) {
      return;
    }
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const index = map.get(key);
    if (index !== undefined) {
      counts[index] += 1;
    }
  });

  return labels.map((item, index) => ({
    month: item.label,
    value: counts[index],
  }));
}

function calculateStreak(daysWithUpdates) {
  let streak = 0;
  let cursor = new Date();
  cursor.setHours(0, 0, 0, 0);

  while (daysWithUpdates.has(cursor.toISOString().slice(0, 10))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
}

function formatActivityDate(dateValue) {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) {
    return "Recently";
  }
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

async function getWriterDashboard(req, res) {
  try {
    const userId = req.session.user.id;
    const monthsBack = 6;
    const monthWindow = getMonthWindow(monthsBack);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const streakWindowStart = new Date();
    streakWindowStart.setDate(streakWindowStart.getDate() - 14);

    const [
      books,
      todayChapterUpdates,
      streakChapterUpdates,
      totalChapterCount,
      publishedChapterCount,
      readingProgressRows,
      listeningProgressRows,
      noteRows,
      bookmarkRows,
    ] = await Promise.all([
      prisma.book.findMany({
        where: { createdBy: String(userId) },
        orderBy: { updatedAt: "desc" },
        include: {
          _count: {
            select: {
              chapters: true,
              readingProgress: true,
              listeningProgress: true,
              bookmarks: true,
              notes: true,
            },
          },
        },
      }),
      prisma.chapter.findMany({
        where: {
          book: { createdBy: String(userId) },
          updatedAt: { gte: todayStart },
        },
        select: { content: true, updatedAt: true },
      }),
      prisma.chapter.findMany({
        where: {
          book: { createdBy: String(userId) },
          updatedAt: { gte: streakWindowStart },
        },
        select: { updatedAt: true },
      }),
      prisma.chapter.count({
        where: { book: { createdBy: String(userId) } },
      }),
      prisma.chapter.count({
        where: {
          book: { createdBy: String(userId) },
          isPublished: true,
        },
      }),
      prisma.readingProgress.findMany({
        where: {
          book: { createdBy: String(userId) },
          updatedAt: { gte: monthWindow.start },
        },
        select: {
          id: true,
          bookId: true,
          updatedAt: true,
          progressPercent: true,
          book: { select: { title: true } },
        },
      }),
      prisma.listeningProgress.findMany({
        where: {
          book: { createdBy: String(userId) },
          updatedAt: { gte: monthWindow.start },
        },
        select: {
          id: true,
          bookId: true,
          updatedAt: true,
          currentTimeSeconds: true,
          book: { select: { title: true } },
        },
      }),
      prisma.note.findMany({
        where: { book: { createdBy: String(userId) } },
        orderBy: { createdAt: "desc" },
        take: 8,
        select: {
          id: true,
          createdAt: true,
          book: { select: { title: true } },
        },
      }),
      prisma.bookmark.findMany({
        where: { book: { createdBy: String(userId) } },
        orderBy: { createdAt: "desc" },
        take: 8,
        select: {
          id: true,
          createdAt: true,
          book: { select: { title: true } },
        },
      }),
    ]);

    const publishedCount = books.filter((book) => book.status === "PUBLISHED").length;
    const draftCount = books.filter((book) => book.status === "DRAFT").length;
    const totalChapters = books.reduce((sum, book) => sum + (book._count?.chapters || 0), 0);
    const totalReads = books.reduce(
      (sum, book) => sum + (book._count?.readingProgress || 0) + (book._count?.listeningProgress || 0),
      0
    );
    const totalFavorites = books.reduce((sum, book) => sum + (book._count?.bookmarks || 0), 0);
    const totalComments = books.reduce((sum, book) => sum + (book._count?.notes || 0), 0);

    const genres = new Set([
      ...(Array.isArray(req.session.user.writerProfile.preferredGenres)
        ? req.session.user.writerProfile.preferredGenres
        : []),
      ...books.map((book) => book.genre).filter(Boolean),
    ]);

    const wordsToday = todayChapterUpdates.reduce((sum, chapter) => {
      if (!chapter.content) {
        return sum;
      }
      const words = String(chapter.content).trim().split(/\s+/).filter(Boolean).length;
      return sum + words;
    }, 0);

    const activeDays = new Set(
      streakChapterUpdates.map((item) => {
        const date = new Date(item.updatedAt);
        date.setHours(0, 0, 0, 0);
        return date.toISOString().slice(0, 10);
      })
    );

    const chapterProgressPercent = totalChapterCount
      ? Math.round((publishedChapterCount / totalChapterCount) * 100)
      : 0;

    const mostRecentUpdate = books.length ? books[0].updatedAt : null;
    const autoSaveStatus = mostRecentUpdate
      ? `Active - last synced ${formatActivityDate(mostRecentUpdate)}`
      : "Active - waiting for your first draft";

    const readEvents = readingProgressRows.map((row) => row.updatedAt);
    const listenEvents = listeningProgressRows.map((row) => row.updatedAt);
    const readsOverTime = bucketByMonth([...readEvents, ...listenEvents], monthsBack);

    const firstSeries = readsOverTime.length ? readsOverTime[0].value : 0;
    const lastSeries = readsOverTime.length ? readsOverTime[readsOverTime.length - 1].value : 0;
    const engagementTrend = firstSeries > 0
      ? Math.round(((lastSeries - firstSeries) / firstSeries) * 100)
      : (lastSeries > 0 ? 100 : 0);

    const bookReadMap = new Map();
    readingProgressRows.forEach((row) => {
      bookReadMap.set(row.bookId, (bookReadMap.get(row.bookId) || 0) + 1);
    });
    listeningProgressRows.forEach((row) => {
      bookReadMap.set(row.bookId, (bookReadMap.get(row.bookId) || 0) + 1);
    });

    const mostPopularBook = books.length
      ? books
        .map((book) => ({
          title: book.title,
          reads: bookReadMap.get(book.id) || 0,
        }))
        .sort((a, b) => b.reads - a.reads)[0]
      : null;

    const avgCompletion = readingProgressRows.length
      ? Math.round(
        readingProgressRows.reduce((sum, row) => sum + Number(row.progressPercent || 0), 0) /
        readingProgressRows.length
      )
      : 0;

    const mergedActivity = [
      ...noteRows.map((row) => ({
        title: `New comment-style note on ${row.book?.title || "your story"}`,
        note: "A reader annotation was added in your chapter.",
        date: row.createdAt,
      })),
      ...bookmarkRows.map((row) => ({
        title: `New favorite on ${row.book?.title || "your story"}`,
        note: "A reader bookmarked this story as a favorite.",
        date: row.createdAt,
      })),
      ...readingProgressRows.slice(0, 6).map((row) => ({
        title: `Reading progress updated in ${row.book?.title || "your story"}`,
        note: "A reader continued through your chapters.",
        date: row.updatedAt,
      })),
      ...listeningProgressRows.slice(0, 6).map((row) => ({
        title: `Chapter unlock activity in ${row.book?.title || "your story"}`,
        note: "A listener resumed your audiobook content.",
        date: row.updatedAt,
      })),
    ]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 7)
      .map((item) => ({
        title: item.title,
        note: item.note,
        dateLabel: formatActivityDate(item.date),
      }));

    const booksPayload = books.map((book) => ({
      id: book.id,
      title: book.title,
      status: book.status,
      updatedAt: book.updatedAt,
      genre: book.genre,
      chapters: book._count?.chapters || 0,
      reads: (book._count?.readingProgress || 0) + (book._count?.listeningProgress || 0),
      likes: book._count?.bookmarks || 0,
      comments: book._count?.notes || 0,
    }));

    return res.json({
      success: true,
      data: {
        profile: {
          name: req.session.user.name,
          penName: req.session.user.writerProfile.penName || req.session.user.name,
          bio: req.session.user.writerProfile.bio,
          preferredGenres: req.session.user.writerProfile.preferredGenres,
        },
        stats: {
          totalBooks: books.length,
          publishedBooks: publishedCount,
          drafts: draftCount,
          totalChapters,
          totalReads,
          totalFavorites,
          totalComments,
          totalGenres: genres.size,
        },
        tools: {
          wordCountToday: wordsToday,
          weeklyWritingStreak: calculateStreak(activeDays),
          draftCompletionPercent: chapterProgressPercent,
          autoSaveStatus,
        },
        analytics: {
          readsOverTime,
          engagementTrend,
          mostPopularBook: mostPopularBook ? mostPopularBook.title : "No story published yet",
          recentReaderActivity: mergedActivity.length,
          completionRate: `${avgCompletion}%`,
        },
        monetization: {
          coinsEarned: 0,
          estimatedRevenue: 0,
          paidChaptersUnlocked: 0,
          subscriptionReaders: 0,
          isActive: false,
        },
        recentActivity: mergedActivity,
        books: booksPayload,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: "Failed to load writer dashboard",
    });
  }
}

module.exports = {
  getWriterDashboard,
};