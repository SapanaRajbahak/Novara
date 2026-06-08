const prisma = require("../prisma/client");

function toIso(value) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString();
}

function formatHours(seconds) {
  if (!seconds || seconds <= 0) {
    return 0;
  }

  return Math.round((seconds / 3600) * 10) / 10;
}

function buildDailyBuckets(days = 7) {
  const buckets = [];
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  for (let index = days - 1; index >= 0; index -= 1) {
    const date = new Date(now);
    date.setDate(now.getDate() - index);
    buckets.push({
      key: date.toISOString().slice(0, 10),
      label: date.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      reads: 0,
      listeningSeconds: 0,
      activeUsers: new Set(),
    });
  }

  return buckets;
}

function mapBucketsToSeries(buckets, metric) {
  return buckets.map((bucket) => ({
    label: bucket.label,
    value: metric === "listeningHours"
      ? Math.round((bucket.listeningSeconds / 3600) * 10) / 10
      : (metric === "activeUsers" ? bucket.activeUsers.size : bucket.reads),
  }));
}

function computeListeningPercent(row, trackTotals) {
  const totals = trackTotals.get(row.bookId);
  if (!totals || !totals.totalDuration || !totals.prefixByOrder.has(row.audioTrack.order)) {
    return null;
  }

  const currentDuration = typeof row.audioTrack.duration === "number" && row.audioTrack.duration > 0
    ? row.audioTrack.duration
    : Math.max(Number(row.currentTimeSeconds) || 0, 0);
  const previousDuration = totals.prefixByOrder.get(row.audioTrack.order) || 0;
  const listenedSeconds = previousDuration + Math.min(Math.max(Number(row.currentTimeSeconds) || 0, 0), currentDuration);

  if (!totals.totalDuration) {
    return null;
  }

  return Math.max(0, Math.min(100, Math.round((listenedSeconds / totals.totalDuration) * 100)));
}

function pushUserProgress(progressMap, book, userId, percent) {
  if (!book || !userId || typeof percent !== "number" || Number.isNaN(percent)) {
    return;
  }

  const existing = progressMap.get(book.id) || {
    bookId: book.id,
    title: book.title,
    authorName: book.authorName || "Unknown Author",
    users: new Map(),
  };

  existing.users.set(userId, Math.max(existing.users.get(userId) || 0, percent));
  progressMap.set(book.id, existing);
}

function buildCompletionLeaderboard(progressMap, limit = 5) {
  return [...progressMap.values()]
    .map((item) => {
      const engagedUsers = item.users.size;
      const completedUsers = [...item.users.values()].filter((value) => value >= 100).length;
      const completionRate = engagedUsers ? Math.round((completedUsers / engagedUsers) * 100) : 0;

      return {
        bookId: item.bookId,
        title: item.title,
        authorName: item.authorName,
        engagedUsers,
        completedUsers,
        completionRate,
      };
    })
    .filter((item) => item.engagedUsers > 0)
    .sort((a, b) => {
      if (b.completionRate !== a.completionRate) {
        return b.completionRate - a.completionRate;
      }
      if (b.completedUsers !== a.completedUsers) {
        return b.completedUsers - a.completedUsers;
      }
      return b.engagedUsers - a.engagedUsers;
    })
    .slice(0, limit);
}

function formatRelativeDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Recently";
  }

  const diffMs = Date.now() - date.getTime();
  const minutes = Math.max(1, Math.round(diffMs / 60000));

  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }

  const days = Math.round(hours / 24);
  if (days < 7) {
    return `${days}d ago`;
  }

  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

async function getAdminAnalytics(req, res) {
  try {
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [
      readingRows,
      listeningRows,
      recentBookmarks,
      recentNotes,
      recentBooks,
      recentAiLogs,
      recentHighlights,
    ] = await Promise.all([
      prisma.readingProgress.findMany({
        where: {
          book: { status: "PUBLISHED" },
        },
        select: {
          userId: true,
          bookId: true,
          progressPercent: true,
          updatedAt: true,
          book: {
            select: {
              id: true,
              title: true,
              authorName: true,
            },
          },
        },
      }),
      prisma.listeningProgress.findMany({
        where: {
          book: { status: "PUBLISHED" },
        },
        select: {
          userId: true,
          bookId: true,
          currentTimeSeconds: true,
          updatedAt: true,
          book: {
            select: {
              id: true,
              title: true,
              authorName: true,
              audioTracks: {
                select: {
                  id: true,
                  order: true,
                  duration: true,
                },
              },
            },
          },
          audioTrack: {
            select: {
              id: true,
              title: true,
              order: true,
              duration: true,
            },
          },
        },
      }),
      prisma.bookmark.findMany({
        where: {
          book: { status: "PUBLISHED" },
        },
        orderBy: { createdAt: "desc" },
        take: 12,
        select: {
          id: true,
          userId: true,
          createdAt: true,
          book: { select: { title: true, authorName: true } },
        },
      }),
      prisma.note.findMany({
        where: {
          book: { status: "PUBLISHED" },
        },
        orderBy: { createdAt: "desc" },
        take: 12,
        select: {
          id: true,
          userId: true,
          createdAt: true,
          book: { select: { title: true } },
        },
      }),
      prisma.book.findMany({
        where: { status: "PUBLISHED" },
        orderBy: { createdAt: "desc" },
        take: 8,
        select: {
          id: true,
          title: true,
          authorName: true,
          createdAt: true,
        },
      }),
      prisma.aIGenerationLog.findMany({
        orderBy: { createdAt: "desc" },
        take: 8,
        select: {
          id: true,
          type: true,
          createdAt: true,
          admin: { select: { name: true } },
        },
      }),
      prisma.highlight.findMany({
        where: {
          book: { status: "PUBLISHED" },
        },
        orderBy: { createdAt: "desc" },
        take: 12,
        select: {
          id: true,
          userId: true,
          createdAt: true,
          book: { select: { title: true } },
        },
      }),
    ]);

    const bucketMap = new Map(buildDailyBuckets(7).map((bucket) => [bucket.key, bucket]));
    const activeUsersSet = new Set();
    const popularMap = new Map();
    const trackTotals = new Map();
    const completionMap = new Map();

    listeningRows.forEach((row) => {
      if (!trackTotals.has(row.bookId)) {
        const sortedTracks = Array.isArray(row.book.audioTracks)
          ? [...row.book.audioTracks].sort((a, b) => a.order - b.order)
          : [];
        let totalDuration = 0;
        const prefixByOrder = new Map();
        sortedTracks.forEach((track) => {
          prefixByOrder.set(track.order, totalDuration);
          totalDuration += typeof track.duration === "number" && track.duration > 0 ? track.duration : 0;
        });
        trackTotals.set(row.bookId, { totalDuration, prefixByOrder });
      }
    });

    readingRows.forEach((row) => {
      const key = row.updatedAt.toISOString().slice(0, 10);
      const bucket = bucketMap.get(key);
      if (bucket) {
        bucket.reads += 1;
        bucket.activeUsers.add(row.userId);
      }

      if (row.updatedAt >= since24h) {
        activeUsersSet.add(row.userId);
      }

      const popularEntry = popularMap.get(row.bookId) || {
        bookId: row.bookId,
        title: row.book.title,
        authorName: row.book.authorName || "Unknown Author",
        reads: 0,
      };
      popularEntry.reads += 1;
      popularMap.set(row.bookId, popularEntry);

      pushUserProgress(completionMap, row.book, row.userId, Number(row.progressPercent) || 0);
    });

    listeningRows.forEach((row) => {
      const key = row.updatedAt.toISOString().slice(0, 10);
      const bucket = bucketMap.get(key);
      if (bucket) {
        bucket.listeningSeconds += Math.max(Number(row.currentTimeSeconds) || 0, 0);
        bucket.activeUsers.add(row.userId);
      }

      if (row.updatedAt >= since24h) {
        activeUsersSet.add(row.userId);
      }

      const popularEntry = popularMap.get(row.bookId) || {
        bookId: row.bookId,
        title: row.book.title,
        authorName: row.book.authorName || "Unknown Author",
        reads: 0,
      };
      popularEntry.reads += 1;
      popularMap.set(row.bookId, popularEntry);

      const listeningPercent = computeListeningPercent(row, trackTotals);
      if (typeof listeningPercent === "number") {
        pushUserProgress(completionMap, row.book, row.userId, listeningPercent);
      }
    });

    [...recentBookmarks, ...recentNotes, ...recentHighlights].forEach((row) => {
      if (row.createdAt >= since24h) {
        activeUsersSet.add(row.userId);
      }
    });

    const popularBooks = [...popularMap.values()]
      .sort((a, b) => {
        if (b.reads !== a.reads) {
          return b.reads - a.reads;
        }
        return a.title.localeCompare(b.title);
      })
      .slice(0, 5);

    const completedBooks = buildCompletionLeaderboard(completionMap, 5);

    const recentActivity = [
      ...readingRows
        .filter((row) => row.updatedAt >= since7d)
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        .slice(0, 8)
        .map((row) => ({
          id: `read:${row.userId}:${row.bookId}:${row.updatedAt.toISOString()}`,
          title: `Reading progress updated in ${row.book.title}`,
          note: `${Math.round(Number(row.progressPercent) || 0)}% completion recorded for a reader.`,
          type: "reading",
          createdAt: toIso(row.updatedAt),
          dateLabel: formatRelativeDate(row.updatedAt),
        })),
      ...listeningRows
        .filter((row) => row.updatedAt >= since7d)
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        .slice(0, 8)
        .map((row) => ({
          id: `listen:${row.userId}:${row.bookId}:${row.updatedAt.toISOString()}`,
          title: `Listening activity in ${row.book.title}`,
          note: `${Math.floor(Number(row.currentTimeSeconds) || 0)} seconds synced on audiobook progress.`,
          type: "listening",
          createdAt: toIso(row.updatedAt),
          dateLabel: formatRelativeDate(row.updatedAt),
        })),
      ...recentBookmarks.map((row) => ({
        id: `bookmark:${row.id}`,
        title: `Bookmark added in ${row.book.title}`,
        note: `A reader saved this published book for later.`,
        type: "bookmark",
        createdAt: toIso(row.createdAt),
        dateLabel: formatRelativeDate(row.createdAt),
      })),
      ...recentNotes.map((row) => ({
        id: `note:${row.id}`,
        title: `Reader note added in ${row.book.title}`,
        note: `Annotation activity was recorded on a published book.`,
        type: "note",
        createdAt: toIso(row.createdAt),
        dateLabel: formatRelativeDate(row.createdAt),
      })),
      ...recentHighlights.map((row) => ({
        id: `highlight:${row.id}`,
        title: `Highlight created in ${row.book.title}`,
        note: `A reader highlighted part of the text.`,
        type: "highlight",
        createdAt: toIso(row.createdAt),
        dateLabel: formatRelativeDate(row.createdAt),
      })),
      ...recentBooks.map((row) => ({
        id: `book:${row.id}`,
        title: `Published book added: ${row.title}`,
        note: `${row.authorName || "Unknown Author"} is now available in the public catalog.`,
        type: "book",
        createdAt: toIso(row.createdAt),
        dateLabel: formatRelativeDate(row.createdAt),
      })),
      ...recentAiLogs.map((row) => ({
        id: `ai:${row.id}`,
        title: `AI activity: ${String(row.type).replace(/_/g, " ")}`,
        note: `${row.admin && row.admin.name ? row.admin.name : "Admin"} generated new AI output.`,
        type: "ai",
        createdAt: toIso(row.createdAt),
        dateLabel: formatRelativeDate(row.createdAt),
      })),
    ]
      .filter((item) => item.createdAt)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 12);

    const buckets = [...bucketMap.values()];

    return res.json({
      success: true,
      data: {
        stats: {
          totalReads: readingRows.length,
          totalListeningHours: formatHours(
            listeningRows.reduce((sum, row) => sum + Math.max(Number(row.currentTimeSeconds) || 0, 0), 0)
          ),
          activeUsers: activeUsersSet.size,
        },
        popularBooks,
        completedBooks,
        recentActivity,
        trends: {
          totalReads: mapBucketsToSeries(buckets, "reads"),
          totalListeningHours: mapBucketsToSeries(buckets, "listeningHours"),
          activeUsers: mapBucketsToSeries(buckets, "activeUsers"),
        },
        coverage: {
          hasReadingData: readingRows.length > 0,
          hasListeningData: listeningRows.length > 0,
          hasCompletionData: completedBooks.length > 0,
          hasRecentActivity: recentActivity.length > 0,
        },
      },
    });
  } catch (error) {
    console.error("getAdminAnalytics error:", error);
    return res.status(500).json({
      success: false,
      error: "Unable to fetch admin analytics",
    });
  }
}

module.exports = {
  getAdminAnalytics,
};