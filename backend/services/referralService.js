const prisma = require("../prisma/client");

const DEFAULT_REWARD_AMOUNT = Number(process.env.REFERRAL_REWARD_AMOUNT || 5);
const DEFAULT_REWARD_COINS = Number(process.env.REFERRAL_REWARD_COINS || 50);
const DEFAULT_REWARD_CREDITS = Number(process.env.REFERRAL_REWARD_AI_CREDITS || 500);
const DEFAULT_UNIQUE_READER_THRESHOLD = Number(process.env.REFERRAL_UNIQUE_READER_THRESHOLD || 5);
const DEFAULT_REFERRAL_BASE_URL = String(process.env.PUBLIC_APP_URL || "https://novara.app").replace(/\/+$/, "");

function sanitizeReferralToken(value) {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
}

function buildReferralLink(referralCode) {
  const safeCode = sanitizeReferralToken(referralCode);
  return safeCode ? `${DEFAULT_REFERRAL_BASE_URL}/signup?ref=${encodeURIComponent(safeCode)}` : "";
}

function buildReferralCodeCandidates(name = "") {
  const base = String(name || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 8);
  const year = new Date().getFullYear();
  const prefix = base || "NOVARA";
  return [
    `${prefix}${year}`,
    `${prefix}${year}${Math.floor(100 + Math.random() * 900)}`,
    `${prefix}${Math.floor(1000 + Math.random() * 9000)}`,
    `${prefix}${Date.now().toString().slice(-6)}`,
  ];
}

async function ensureReferralCode(userId, name) {
  const existing = await prisma.user.findUnique({
    where: { id: String(userId) },
    select: { id: true, referralCode: true },
  });

  if (!existing) {
    return null;
  }

  if (existing.referralCode) {
    return existing.referralCode;
  }

  const candidates = buildReferralCodeCandidates(name);
  for (const candidate of candidates) {
    const found = await prisma.user.findUnique({
      where: { referralCode: candidate },
      select: { id: true },
    });
    if (!found) {
      const updated = await prisma.user.update({
        where: { id: String(userId) },
        data: { referralCode: candidate },
        select: { referralCode: true },
      });
      return updated.referralCode;
    }
  }

  const fallback = `NOV${Date.now().toString().slice(-8)}`;
  const updated = await prisma.user.update({
    where: { id: String(userId) },
    data: { referralCode: fallback },
    select: { referralCode: true },
  });
  return updated.referralCode;
}

async function resolveReferrer(refToken) {
  const token = sanitizeReferralToken(refToken);
  if (!token) {
    return null;
  }

  const byId = await prisma.user.findUnique({
    where: { id: token },
    select: { id: true, email: true, signupIp: true },
  });

  if (byId) {
    return byId;
  }

  const byCode = await prisma.user.findUnique({
    where: { referralCode: token.toUpperCase() },
    select: { id: true, email: true, signupIp: true },
  });

  return byCode || null;
}

async function attachReferralToSignup({
  refToken,
  referredUserId,
  referredEmail,
  signupIp,
}) {
  const referrer = await resolveReferrer(refToken);
  if (!referrer) {
    return null;
  }

  const isSelfReferral =
    String(referrer.id) === String(referredUserId) ||
    String(referrer.email).toLowerCase() === String(referredEmail).toLowerCase();

  const sameIpDetected = Boolean(signupIp && referrer.signupIp && signupIp === referrer.signupIp);

  const status = isSelfReferral || sameIpDetected ? "REJECTED" : "PENDING";
  const rejectionReason = isSelfReferral
    ? "self_referral_blocked"
    : (sameIpDetected ? "same_ip_blocked" : null);

  const referral = await prisma.$transaction(async (tx) => {
    const existingReferral = await tx.referral.findUnique({
      where: { referredUserId: String(referredUserId) },
      select: { id: true, referrerId: true, status: true },
    });

    if (existingReferral) {
      return {
        referrerId: String(existingReferral.referrerId),
        status: existingReferral.status,
        rejectionReason: existingReferral.status === "REJECTED" ? "existing_rejection" : null,
      };
    }

    const updatedUser = await tx.user.update({
      where: { id: String(referredUserId) },
      data: {
        referredBy: String(referrer.id),
      },
      select: { id: true },
    });

    await tx.referral.create({
      data: {
        referrerId: String(referrer.id),
        referredUserId: updatedUser.id,
        status,
        rewardGiven: false,
        rewardAmount: 0,
        rewardCredits: 0,
        referredUniqueReaders: 0,
        rejectionReason,
      },
    });

    return {
      referrerId: String(referrer.id),
      status,
      rejectionReason,
    };
  });

  return referral;
}

async function computeUniqueReadersForWriter(writerUserId) {
  const [readingRows, listeningRows] = await Promise.all([
    prisma.readingProgress.findMany({
      where: { book: { createdBy: String(writerUserId) } },
      select: { userId: true },
      distinct: ["userId"],
    }),
    prisma.listeningProgress.findMany({
      where: { book: { createdBy: String(writerUserId) } },
      select: { userId: true },
      distinct: ["userId"],
    }),
  ]);

  const readers = new Set();
  readingRows.forEach((row) => {
    if (row.userId && row.userId !== String(writerUserId)) {
      readers.add(row.userId);
    }
  });
  listeningRows.forEach((row) => {
    if (row.userId && row.userId !== String(writerUserId)) {
      readers.add(row.userId);
    }
  });
  return readers.size;
}

async function hasPublishedFirstChapter(writerUserId) {
  const firstPublished = await prisma.chapter.findFirst({
    where: {
      book: { createdBy: String(writerUserId) },
      isPublished: true,
    },
    select: { id: true },
  });

  return Boolean(firstPublished);
}

async function hasPublishedFirstBook(writerUserId) {
  const firstPublishedBook = await prisma.book.findFirst({
    where: {
      createdBy: String(writerUserId),
      status: "PUBLISHED",
    },
    select: { id: true },
  });

  return Boolean(firstPublishedBook);
}

async function evaluateReferralForReferredUser(referredUserId) {
  const referral = await prisma.referral.findUnique({
    where: { referredUserId: String(referredUserId) },
    select: {
      id: true,
      referrerId: true,
      referredUserId: true,
      status: true,
      rewardGiven: true,
    },
  });

  if (!referral || referral.status === "REJECTED") {
    return null;
  }

  const [referredUser, publishedChapter, publishedBook, uniqueReaders] = await Promise.all([
    prisma.user.findUnique({
      where: { id: String(referredUserId) },
      select: {
        id: true,
        isWriter: true,
      },
    }),
    hasPublishedFirstChapter(referredUserId),
    hasPublishedFirstBook(referredUserId),
    computeUniqueReadersForWriter(referredUserId),
  ]);

  if (!referredUser) {
    return null;
  }

  const engagementQualified = uniqueReaders >= DEFAULT_UNIQUE_READER_THRESHOLD;
  const qualifiesForReward = Boolean(
    referredUser.isWriter || publishedBook || publishedChapter || engagementQualified
  );
  const shouldComplete = Boolean(publishedBook || publishedChapter || engagementQualified);
  const nextStatus = shouldComplete ? "COMPLETED" : (qualifiesForReward ? "ACTIVE" : "PENDING");
  const rewardAmount = qualifiesForReward ? DEFAULT_REWARD_AMOUNT : 0;
  const rewardCoins = qualifiesForReward ? DEFAULT_REWARD_COINS : 0;
  const rewardCredits = qualifiesForReward ? DEFAULT_REWARD_CREDITS : 0;

  if (!qualifiesForReward && referral.status === "PENDING") {
    await prisma.referral.update({
      where: { id: referral.id },
      data: {
        referredUniqueReaders: uniqueReaders,
      },
    });
    return {
      qualifies: false,
      uniqueReaders,
      published: publishedBook || publishedChapter,
      isWriter: referredUser.isWriter,
    };
  }

  await prisma.$transaction(async (tx) => {
    const current = await tx.referral.findUnique({
      where: { id: referral.id },
      select: { rewardGiven: true, status: true, referrerId: true },
    });

    if (!current || current.status === "REJECTED") {
      return;
    }

    const alreadyRewarded = Boolean(current.rewardGiven);
    const updateData = {
      status: nextStatus,
      referredUniqueReaders: uniqueReaders,
      completedAt: nextStatus === "COMPLETED" ? new Date() : null,
    };

    if (!alreadyRewarded && qualifiesForReward) {
      updateData.rewardGiven = true;
      updateData.rewardAmount = rewardAmount;
      updateData.rewardCoins = rewardCoins;
      updateData.rewardCredits = rewardCredits;
    }

    await tx.referral.update({
      where: { id: referral.id },
      data: updateData,
    });

    if (!alreadyRewarded && qualifiesForReward) {
      await tx.user.update({
        where: { id: current.referrerId },
        data: {
          referralCashEarned: { increment: rewardAmount },
          coins: { increment: rewardCoins },
          aiCredits: { increment: rewardCredits },
        },
      });
    }
  });

  return {
    qualifies: qualifiesForReward,
    uniqueReaders,
    published: publishedBook || publishedChapter,
    publishedBook,
    publishedChapter,
    isWriter: referredUser.isWriter,
    status: nextStatus,
    rewardAmount,
    rewardCoins,
    rewardCredits,
  };
}

async function evaluateReferralByBookId(bookId) {
  const book = await prisma.book.findUnique({
    where: { id: String(bookId) },
    select: { createdBy: true },
  });

  if (!book || !book.createdBy) {
    return null;
  }

  return evaluateReferralForReferredUser(book.createdBy);
}

async function getReferrerSummary(referrerId) {
  const [user, referrals, aggregateCompleted] = await Promise.all([
    prisma.user.findUnique({
      where: { id: String(referrerId) },
      select: {
        id: true,
        referralCode: true,
        referralCashEarned: true,
        coins: true,
        aiCredits: true,
      },
    }),
    prisma.referral.findMany({
      where: { referrerId: String(referrerId) },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        status: true,
        rewardGiven: true,
        rewardAmount: true,
        rewardCoins: true,
        rewardCredits: true,
        referredUniqueReaders: true,
        rejectionReason: true,
        createdAt: true,
        completedAt: true,
        referredUser: {
          select: {
            id: true,
            name: true,
            email: true,
            isWriter: true,
          },
        },
      },
    }),
    prisma.referral.aggregate({
      where: {
        referrerId: String(referrerId),
        rewardGiven: true,
      },
      _sum: { rewardAmount: true, rewardCoins: true, rewardCredits: true },
    }),
  ]);

  if (!user) {
    return null;
  }

  const total = referrals.length;
  const active = referrals.filter((row) => row.status === "ACTIVE" || row.status === "COMPLETED").length;
  const completed = referrals.filter((row) => row.status === "COMPLETED").length;
  const pending = referrals.filter((row) => row.status === "PENDING").length;
  const rejected = referrals.filter((row) => row.status === "REJECTED").length;
  const totalEarned = Number(aggregateCompleted._sum.rewardAmount || 0);
  const totalCoinsEarned = Number(aggregateCompleted._sum.rewardCoins || 0);
  const totalCreditsEarned = Number(aggregateCompleted._sum.rewardCredits || 0);
  const conversionRate = total > 0 ? Math.round((active / total) * 100) : 0;

  return {
    referralCode: user.referralCode,
    referralLink: buildReferralLink(user.referralCode),
    rewards: {
      cashAmount: totalEarned,
      coins: totalCoinsEarned,
      aiCredits: totalCreditsEarned,
    },
    stats: {
      total,
      active,
      completed,
      pending,
      rejected,
      totalEarned,
      totalCoinsEarned,
      totalCreditsEarned,
      conversionRate,
    },
    records: referrals,
  };
}

module.exports = {
  ensureReferralCode,
  buildReferralLink,
  attachReferralToSignup,
  evaluateReferralForReferredUser,
  evaluateReferralByBookId,
  getReferrerSummary,
  DEFAULT_REWARD_AMOUNT,
  DEFAULT_REWARD_COINS,
  DEFAULT_REWARD_CREDITS,
  DEFAULT_UNIQUE_READER_THRESHOLD,
};
