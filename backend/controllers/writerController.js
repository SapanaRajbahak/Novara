const prisma = require("../prisma/client");
const {
  getReferrerSummary,
  ensureReferralCode,
  buildReferralLink,
  DEFAULT_REWARD_AMOUNT,
  DEFAULT_REWARD_COINS,
  DEFAULT_REWARD_CREDITS,
} = require("../services/referralService");

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

function buildFallbackWriterDashboardData(user) {
  const profile = {
    name: user?.name || "Writer",
    penName: user?.writerProfile?.penName || user?.penName || user?.name || "Writer",
    bio: user?.writerProfile?.bio || user?.bio || "",
    preferredGenres: user?.writerProfile?.preferredGenres || user?.preferredGenres || [],
  };

  return {
    profile,
    stats: {
      totalBooks: 0,
      publishedBooks: 0,
      drafts: 0,
      totalChapters: 0,
      totalReads: 0,
      totalFavorites: 0,
      totalComments: 0,
      totalGenres: 0,
    },
    tools: {
      wordCountToday: 0,
      weeklyWritingStreak: 0,
      draftCompletionPercent: 0,
      autoSaveStatus: "Active - unavailable right now",
    },
    analytics: {
      readsOverTime: [],
      engagementTrend: 0,
      mostPopularBook: "No story published yet",
      recentReaderActivity: 0,
      completionRate: "0%",
    },
    monetization: {
      coinsEarned: 0,
      estimatedRevenue: 0,
      giftCoinsEarned: 0,
      giftCount: 0,
      coinsByType: {
        gifts: 0,
        chapterUnlocks: 0,
        referrals: 0,
        ads: 0,
        other: 0,
      },
      paidChaptersUnlocked: 0,
      subscriptionReaders: 0,
      isActive: false,
      referrals: {
        total: 0,
        active: 0,
        completed: 0,
        pending: 0,
        rejected: 0,
        totalEarned: 0,
        totalCoinsEarned: 0,
        totalCreditsEarned: 0,
        conversionRate: 0,
      },
    },
    recentActivity: [],
    books: [],
  };
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

    const [giftSummaryResult, giftRowsResult, referralSummaryResult, coinEarningsResult, earningsByTypeResult] =
      await Promise.allSettled([
        prisma.gift.aggregate({
          where: { toAuthorId: String(userId) },
          _sum: { amount: true },
          _count: { id: true },
        }),
        prisma.gift.findMany({
          where: { toAuthorId: String(userId) },
          orderBy: { createdAt: "desc" },
          take: 8,
          select: {
            id: true,
            amount: true,
            message: true,
            createdAt: true,
            novelId: true,
            chapterId: true,
            fromUser: {
              select: { id: true, name: true, penName: true, email: true },
            },
          },
        }),
        getReferrerSummary(userId),
        prisma.walletTransaction.aggregate({
          where: {
            userId: String(userId),
            amount: { gt: 0 },
          },
          _sum: {
            amount: true,
          },
          _count: {
            id: true,
          },
        }),
        prisma.walletTransaction.groupBy({
          by: ["type"],
          where: {
            userId: String(userId),
            amount: { gt: 0 },
          },
          _sum: {
            amount: true,
          },
          _count: {
            id: true,
          },
        }),
      ]);

    const optionalDashboardErrors = [
      giftSummaryResult.status === "rejected" ? `giftSummary: ${giftSummaryResult.reason?.message || giftSummaryResult.reason}` : null,
      giftRowsResult.status === "rejected" ? `giftRows: ${giftRowsResult.reason?.message || giftRowsResult.reason}` : null,
      referralSummaryResult.status === "rejected" ? `referralSummary: ${referralSummaryResult.reason?.message || referralSummaryResult.reason}` : null,
      coinEarningsResult.status === "rejected" ? `coinEarnings: ${coinEarningsResult.reason?.message || coinEarningsResult.reason}` : null,
      earningsByTypeResult.status === "rejected" ? `earningsByType: ${earningsByTypeResult.reason?.message || earningsByTypeResult.reason}` : null,
    ].filter(Boolean);

    if (optionalDashboardErrors.length > 0) {
      console.warn("getWriterDashboard optional data failed:", optionalDashboardErrors);
    }

    const giftSummary = giftSummaryResult.status === "fulfilled"
      ? giftSummaryResult.value
      : { _sum: { amount: 0 }, _count: { id: 0 } };
    const giftRows = giftRowsResult.status === "fulfilled" ? giftRowsResult.value : [];
    const referralSummary = referralSummaryResult.status === "fulfilled" ? referralSummaryResult.value : null;
    const coinEarningsBreakdown = coinEarningsResult.status === "fulfilled"
      ? coinEarningsResult.value
      : { _sum: { amount: 0 }, _count: { id: 0 } };
    const earningsByType = earningsByTypeResult.status === "fulfilled" ? earningsByTypeResult.value : [];

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
      ...(Array.isArray(req.session.user.writerProfile?.preferredGenres)
        ? req.session.user.writerProfile.preferredGenres
        : Array.isArray(req.session.user.preferredGenres)
        ? req.session.user.preferredGenres
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

    const giftCoinsEarned = Number(giftSummary?._sum?.amount || 0);
    const giftCount = Number(giftSummary?._count?.id || 0);
    const bookTitleById = new Map(books.map((book) => [book.id, book.title]));

    // Calculate coin earnings breakdown by type
    const totalCoinsEarned = Number(coinEarningsBreakdown._sum?.amount || 0);

    const coinsByType = {
      gifts: 0,
      chapterUnlocks: 0,
      referrals: 0,
      ads: 0,
      other: 0,
    };

    earningsByType.forEach((item) => {
      if (item.type === 'GIFT_RECEIVED') {
        coinsByType.gifts = Number(item._sum.amount || 0);
      } else if (item.type === 'CHAPTER_UNLOCK_EARNINGS') {
        coinsByType.chapterUnlocks = Number(item._sum.amount || 0);
      } else if (item.type === 'REFERRAL_REWARD') {
        coinsByType.referrals = Number(item._sum.amount || 0);
      } else if (item.type === 'AD_REWARD') {
        coinsByType.ads = Number(item._sum.amount || 0);
      } else {
        coinsByType.other += Number(item._sum.amount || 0);
      }
    });

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
      ...giftRows.map((gift) => ({
        title: `Gift received from ${gift.fromUser?.penName || gift.fromUser?.name || gift.fromUser?.email || "a reader"}`,
        note: `+${Number(gift.amount || 0)} coins for ${bookTitleById.get(gift.novelId) || "your story"}${gift.message ? ` · ${gift.message}` : ""}`,
        date: gift.createdAt,
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
          penName: req.session.user.writerProfile?.penName || req.session.user.penName || req.session.user.name,
          bio: req.session.user.writerProfile?.bio || req.session.user.bio || "",
          preferredGenres: req.session.user.writerProfile?.preferredGenres || req.session.user.preferredGenres || [],
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
          coinsEarned: totalCoinsEarned,
          estimatedRevenue: referralSummary ? referralSummary.stats.totalEarned : 0,
          giftCoinsEarned,
          giftCount,
          coinsByType,
          paidChaptersUnlocked: 0,
          subscriptionReaders: 0,
          isActive: false,
          referrals: referralSummary
            ? {
              total: referralSummary.stats.total,
              active: referralSummary.stats.active,
              completed: referralSummary.stats.completed,
              pending: referralSummary.stats.pending,
              rejected: referralSummary.stats.rejected,
              totalEarned: referralSummary.stats.totalEarned,
              totalCoinsEarned: referralSummary.stats.totalCoinsEarned,
              totalCreditsEarned: referralSummary.stats.totalCreditsEarned,
              conversionRate: referralSummary.stats.conversionRate,
            }
            : {
              total: 0,
              active: 0,
              completed: 0,
              pending: 0,
              rejected: 0,
              totalEarned: 0,
              totalCoinsEarned: 0,
              totalCreditsEarned: 0,
              conversionRate: 0,
            },
        },
        recentActivity: mergedActivity,
        books: booksPayload,
      },
    });
  } catch (error) {
    console.error("getWriterDashboard error:", error);
    return res.status(200).json({
      success: true,
      warning: "Writer dashboard loaded in fallback mode.",
      data: buildFallbackWriterDashboardData(req.session.user),
    });
  }
}

async function getWriterReferrals(req, res) {
  try {
    const userId = req.session.user.id;
    const referralCode = await ensureReferralCode(userId, req.session.user.name);
    const summary = await getReferrerSummary(userId);

    const safeSummary = summary || {
      referralCode,
      referralLink: buildReferralLink(referralCode),
      rewards: { cashAmount: 0, coins: 0, aiCredits: 0 },
      stats: {
        total: 0,
        active: 0,
        completed: 0,
        pending: 0,
        rejected: 0,
        totalEarned: 0,
        totalCoinsEarned: 0,
        totalCreditsEarned: 0,
        conversionRate: 0,
      },
      records: [],
    };

    return res.json({
      success: true,
      data: {
        referralCode: safeSummary.referralCode || referralCode || "",
        referralLink: safeSummary.referralLink || buildReferralLink(safeSummary.referralCode || referralCode || ""),
        rewardConfig: {
          cashAmount: DEFAULT_REWARD_AMOUNT,
          coins: DEFAULT_REWARD_COINS,
          aiCredits: DEFAULT_REWARD_CREDITS,
        },
        milestones: [
          { target: 5, reached: (safeSummary.stats.completed || 0) >= 5, bonusCash: 10, bonusCredits: 1000 },
          { target: 10, reached: (safeSummary.stats.completed || 0) >= 10, bonusCash: 25, bonusCredits: 2500 },
        ],
        stats: safeSummary.stats,
        rewards: safeSummary.rewards,
        records: safeSummary.records.map((item) => ({
          id: item.id,
          status: item.status,
          rewardGiven: item.rewardGiven,
          rewardAmount: Number(item.rewardAmount || 0),
          rewardCoins: Number(item.rewardCoins || 0),
          rewardCredits: Number(item.rewardCredits || 0),
          referredUniqueReaders: Number(item.referredUniqueReaders || 0),
          createdAt: item.createdAt,
          completedAt: item.completedAt,
          referredUser: item.referredUser
            ? {
              id: item.referredUser.id,
              name: item.referredUser.name,
              email: item.referredUser.email,
            }
            : null,
        })),
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: "Failed to load referral summary",
    });
  }
}

module.exports = {
  getWriterDashboard,
  getWriterReferrals,
};
