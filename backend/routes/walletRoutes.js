const express = require("express");
const { requireAuth } = require("../middleware/auth");
const prisma = require("../prisma/client");
const router = express.Router();

function isPublicDomainBook(book) {
  const tags = Array.isArray(book?.tags) ? book.tags.map((tag) => String(tag || "").toLowerCase()) : [];
  return tags.includes("public-domain") || tags.includes("project-gutenberg");
}

function isFreeChapter(chapterNumber, settings) {
  const freeChapters = settings.freeChapters ?? 3;
  const paidFrom = settings.paidFrom ?? 4;
  return chapterNumber <= freeChapters || chapterNumber < paidFrom;
}

function chapterUnlockReference(chapterId) {
  return `chapter_unlock:${chapterId}`;
}

async function getMonetizationSettings() {
  try {
    return (await prisma.monetizationSettings.findUnique({ where: { id: "global" } })) || {};
  } catch {
    return {};
  }
}

// GET /api/wallet/me - Get wallet for current user
router.get("/me", requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const [user, recentTransactions] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId }, select: { id: true, coins: true } }),
      prisma.walletTransaction.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
    ]);

    return res.json({
      success: true,
      wallet: {
        userId,
        coins: user ? user.coins : 0,
        recentTransactions,
      },
    });
  } catch (error) {
    console.error("wallet /me error:", error);
    return res.status(500).json({ success: false, error: "Failed to fetch wallet" });
  }
});

// POST /api/wallet/unlock-chapter - Spend coins to unlock a paid chapter
router.post("/unlock-chapter", requireAuth, async (req, res) => {
  try {
    const chapterId = String(req.body?.chapterId || "").trim();
    if (!chapterId) {
      return res.status(400).json({ success: false, error: "chapterId is required" });
    }

    const [chapter, settings] = await Promise.all([
      prisma.chapter.findFirst({
        where: {
          id: chapterId,
          isPublished: true,
          book: { status: "PUBLISHED" },
        },
        include: {
          book: {
            select: {
              id: true,
              title: true,
              tags: true,
            },
          },
        },
      }),
      getMonetizationSettings(),
    ]);

    if (!chapter) {
      return res.status(404).json({ success: false, error: "Chapter not found" });
    }

    const userId = String(req.session.user.id);
    const isSubscriber = Boolean(req.session.user.isSubscribed);
    const isFree = isPublicDomainBook(chapter.book) || isFreeChapter(Number(chapter.chapterNumber), settings);

    if (isFree || (isSubscriber && settings.subUnlimited !== false)) {
      const user = await prisma.user.findUnique({ where: { id: userId }, select: { coins: true } });
      return res.json({
        success: true,
        message: "Chapter is already accessible",
        data: {
          chapterId: chapter.id,
          unlocked: true,
          alreadyUnlocked: true,
          coins: user?.coins ?? 0,
          coinCost: 0,
        },
      });
    }

    if (!(settings.coinSystemEnabled ?? true)) {
      return res.status(403).json({
        success: false,
        error: "Coin purchases are currently disabled. Please try again later.",
        code: "COIN_SYSTEM_DISABLED",
      });
    }

    const coinCost = Number(settings.chapterUnlockCost ?? 10);
    const unlockRef = chapterUnlockReference(chapter.id);

    const existingUnlock = await prisma.walletTransaction.findFirst({
      where: {
        userId,
        type: "CHAPTER_UNLOCK",
        referenceId: unlockRef,
      },
      select: { id: true },
    });

    if (existingUnlock) {
      const user = await prisma.user.findUnique({ where: { id: userId }, select: { coins: true } });
      return res.json({
        success: true,
        message: "Chapter already unlocked",
        data: {
          chapterId: chapter.id,
          unlocked: true,
          alreadyUnlocked: true,
          coins: user?.coins ?? 0,
          coinCost,
        },
      });
    }

    let updatedUser;
    try {
      updatedUser = await prisma.$transaction(async (tx) => {
        const user = await tx.user.findUnique({ where: { id: userId }, select: { id: true, coins: true } });
        if (!user) {
          throw new Error("USER_NOT_FOUND");
        }
        if (Number(user.coins || 0) < coinCost) {
          throw new Error("INSUFFICIENT_COINS");
        }

        const updated = await tx.user.update({
          where: { id: userId },
          data: { coins: { decrement: coinCost } },
          select: { id: true, coins: true },
        });

        await tx.walletTransaction.create({
          data: {
            userId,
            type: "CHAPTER_UNLOCK",
            amount: -coinCost,
            coins: -coinCost,
            source: "reader",
            description: `Unlocked chapter ${chapter.chapterNumber} in ${chapter.book.title}`,
            referenceId: unlockRef,
          },
        });

        return updated;
      });
    } catch (error) {
      if (error.message === "INSUFFICIENT_COINS") {
        const user = await prisma.user.findUnique({ where: { id: userId }, select: { coins: true } });
        return res.status(400).json({
          success: false,
          error: "Not enough coins to unlock this chapter",
          code: "INSUFFICIENT_COINS",
          coins: user?.coins ?? 0,
          coinCost,
        });
      }
      if (error.message === "USER_NOT_FOUND") {
        return res.status(404).json({ success: false, error: "User not found" });
      }
      throw error;
    }

    req.session.user.coins = Number(updatedUser.coins || 0);

    return res.json({
      success: true,
      message: "Chapter unlocked",
      data: {
        chapterId: chapter.id,
        unlocked: true,
        coins: updatedUser.coins,
        coinCost,
      },
    });
  } catch (error) {
    console.error("wallet /unlock-chapter error:", error);
    return res.status(500).json({ success: false, error: "Failed to unlock chapter" });
  }
});

module.exports = router;
