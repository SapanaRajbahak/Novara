const prisma = require("../prisma/client");
const chapterService = require("../services/chapterService");
const chapterTranslationService = require("../services/chapterTranslationService");
const {
  validateId,
  validateCreateChapter,
  validateUpdateChapter,
} = require("../validators/chapterValidator");

// Fetch monetization settings once; fall back to safe defaults if unavailable
async function getMonetizationSettings() {
  try {
    const s = await prisma.monetizationSettings.findUnique({ where: { id: "global" } });
    return s || {};
  } catch {
    return {};
  }
}

function isFreeChapter(chapterNumber, settings) {
  const freeChapters = settings.freeChapters ?? 3;
  const paidFrom     = settings.paidFrom     ?? 4;
  return chapterNumber <= freeChapters || chapterNumber < paidFrom;
}

function isPublicDomainBook(book) {
  const tags = Array.isArray(book?.tags) ? book.tags.map((tag) => String(tag || "").toLowerCase()) : [];
  return tags.includes("public-domain") || tags.includes("project-gutenberg");
}

function isEarlyAccessLocked(chapter, settings, isSubscriber, publicDomainBook) {
  if (publicDomainBook) {
    return false;
  }
  if (isSubscriber) {
    return false;
  }
  if (settings.earlyAccess !== true) {
    return false;
  }

  const hours = Number(settings.earlyAccessHours ?? 24);
  if (!Number.isFinite(hours) || hours <= 0) {
    return false;
  }

  const createdAtMs = new Date(chapter?.createdAt).getTime();
  if (!Number.isFinite(createdAtMs)) {
    return false;
  }

  const lockUntil = createdAtMs + hours * 60 * 60 * 1000;
  return Date.now() < lockUntil;
}

function chapterUnlockReference(chapterId) {
  return `chapter_unlock:${chapterId}`;
}

async function getUnlockedChapterIdSet(userId, chapterIds) {
  if (!userId || !Array.isArray(chapterIds) || !chapterIds.length) {
    return new Set();
  }

  const refs = chapterIds.map((chapterId) => chapterUnlockReference(chapterId));
  const rows = await prisma.walletTransaction.findMany({
    where: {
      userId: String(userId),
      type: "CHAPTER_UNLOCK",
      referenceId: { in: refs },
    },
    select: { referenceId: true },
  });

  const unlockedIds = rows
    .map((row) => String(row.referenceId || ""))
    .map((referenceId) => referenceId.replace(/^chapter_unlock:/, ""))
    .filter(Boolean);

  return new Set(unlockedIds);
}

async function hasUserUnlockedChapter(userId, chapterId) {
  if (!userId || !chapterId) {
    return false;
  }

  const unlockTx = await prisma.walletTransaction.findFirst({
    where: {
      userId: String(userId),
      type: "CHAPTER_UNLOCK",
      referenceId: chapterUnlockReference(chapterId),
    },
    select: { id: true },
  });

  return Boolean(unlockTx);
}

async function getBookChapters(req, res) {
  try {
    const idErrors = validateId(req.params.bookId, "bookId");
    if (idErrors.length) {
      return res.status(400).json({ success: false, error: idErrors.join(". ") });
    }

    const [book, chapters, settings] = await Promise.all([
      prisma.book.findUnique({
        where: { id: req.params.bookId },
        select: { id: true, status: true, tags: true },
      }),
      chapterService.listPublishedChapters(req.params.bookId),
      getMonetizationSettings(),
    ]);

    const publicDomainBook = isPublicDomainBook(book);

    if (settings.monetizationMaintMode && !publicDomainBook) {
      return res.status(503).json({
        success: false,
        error: "Monetization is temporarily under maintenance. Please try again shortly.",
        code: "MAINTENANCE",
      });
    }

    const user           = req.session && req.session.user;
    const isAuthenticated = Boolean(user);
    const isSubscriber    = isAuthenticated && Boolean(user.isSubscribed);
    const unlockedChapterIds = isAuthenticated
      ? await getUnlockedChapterIdSet(user.id, chapters.map((chapter) => chapter.id))
      : new Set();

    const chapterPayload = chapters.map((chapter) => {
      const chNum  = Number(chapter.chapterNumber);
      const isFree = publicDomainBook || isFreeChapter(chNum, settings);
      const isUnlocked = isAuthenticated && unlockedChapterIds.has(chapter.id);
      const earlyAccessLocked = isEarlyAccessLocked(chapter, settings, isSubscriber, publicDomainBook);

      let locked = false;
      if (earlyAccessLocked) {
        locked = true;
      } else if (!isFree) {
        if (isSubscriber && settings.subUnlimited !== false) {
          locked = false; // subscribers bypass locks
        } else if (!isAuthenticated) {
          locked = true;  // guests must log in
        } else {
          locked = !isUnlocked; // authenticated but not subscriber — unlocked chapters are accessible
        }
      }

      return {
        ...chapter,
        isLocked:       locked,
        isFree,
        isUnlocked,
        isEarlyAccessLocked: earlyAccessLocked,
        isLockedForGuest: !isAuthenticated && !isFree,
        unlockCost:     locked ? (settings.chapterUnlockCost ?? 10) : 0,
      };
    });

    return res.json({
      success: true,
      message: "Chapters fetched successfully",
      data: chapterPayload,
      monetization: {
        freeChapters:      settings.freeChapters      ?? 3,
        paidFrom:          settings.paidFrom          ?? 4,
        chapterUnlockCost: settings.chapterUnlockCost ?? 10,
        subUnlimited:      settings.subUnlimited      ?? true,
        coinSystemEnabled: settings.coinSystemEnabled  ?? true,
      },
    });
  } catch (error) {
    console.error("getBookChapters error:", error);
    return res.status(500).json({ success: false, error: "Failed to fetch chapters" });
  }
}

async function getChapterById(req, res) {
  try {
    const idErrors = validateId(req.params.id, "chapter id");
    if (idErrors.length) {
      return res.status(400).json({ success: false, error: idErrors.join(". ") });
    }

    const [chapter, settings] = await Promise.all([
      chapterService.getChapterById(req.params.id),
      getMonetizationSettings(),
    ]);

    if (!chapter) {
      return res.status(404).json({ success: false, error: "Chapter not found" });
    }

    const publicDomainBook = isPublicDomainBook(chapter.book);

    if (settings.monetizationMaintMode && !publicDomainBook) {
      return res.status(503).json({
        success: false,
        error: "Monetization is temporarily under maintenance. Please try again shortly.",
        code: "MAINTENANCE",
      });
    }

    const user           = req.session && req.session.user;
    const isAuthenticated = Boolean(user);
    const isSubscriber    = isAuthenticated && Boolean(user.isSubscribed);
    const chNum           = Number(chapter.chapterNumber);
    const isFree          = publicDomainBook || isFreeChapter(chNum, settings);
    const earlyAccessLocked = isEarlyAccessLocked(chapter, settings, isSubscriber, publicDomainBook);

    if (earlyAccessLocked) {
      return res.status(403).json({
        success: false,
        error: "This chapter is in early access for Pro members.",
        code: "EARLY_ACCESS_PRO_ONLY",
        proRequired: true,
      });
    }

    if (!isFree) {
      if (!isAuthenticated) {
        return res.status(403).json({
          success: false,
          error: "Login is required to access this chapter",
          code: "CHAPTER_LOCKED",
          loginRequired: true,
        });
      }
      if (!isSubscriber || settings.subUnlimited === false) {
        const unlockedByCoin = await hasUserUnlockedChapter(user.id, chapter.id);
        if (unlockedByCoin) {
          return res.json({
            success: true,
            message: "Chapter fetched successfully",
            data: chapter,
          });
        }

        // Subscriber-unlimited bypasses lock; otherwise coins required
        const coinCost = settings.chapterUnlockCost ?? 10;
        if (!(settings.coinSystemEnabled ?? true)) {
          return res.status(403).json({
            success: false,
            error: "Coin purchases are currently disabled. Please try again later.",
            code: "COIN_SYSTEM_DISABLED",
          });
        }
        // The unlock-via-coins is handled by a dedicated wallet endpoint.
        // Here we just gate access — the frontend must verify the user has
        // previously unlocked this chapter before calling this endpoint.
        return res.status(403).json({
          success: false,
          error: "This chapter requires coins to unlock",
          code: "CHAPTER_LOCKED",
          coinCost,
          chapterUnlockCost: coinCost,
        });
      }
    }

    return res.json({
      success: true,
      message: "Chapter fetched successfully",
      data: chapter,
    });
  } catch (error) {
    console.error("getChapterById error:", error);
    return res.status(500).json({ success: false, error: "Failed to fetch chapter" });
  }
}

async function createChapter(req, res) {
  try {
    const idErrors = validateId(req.params.bookId, "bookId");
    const bodyErrors = validateCreateChapter(req.body);
    const errors = [...idErrors, ...bodyErrors];

    if (errors.length) {
      return res.status(400).json({ success: false, error: errors.join(". ") });
    }

    // Apply autoLock: if enabled, new chapters default to unpublished (locked)
    const settings = await getMonetizationSettings();
    const payload  = { ...req.body };
    if (settings.autoLock && payload.isPublished === undefined) {
      payload.isPublished = false;
    }

    const chapter = await chapterService.createChapter(req.params.bookId, payload);
    if (!chapter) {
      return res.status(404).json({ success: false, error: "Book not found" });
    }

    return res.status(201).json({
      success: true,
      message: "Chapter created successfully",
      data: chapter,
    });
  } catch (error) {
    if (error.code === "P2002") {
      return res.status(409).json({
        success: false,
        error: "chapterNumber already exists for this book",
      });
    }

    console.error("createChapter error:", error);
    return res.status(500).json({ success: false, error: "Failed to create chapter" });
  }
}

async function updateChapter(req, res) {
  try {
    const idErrors = validateId(req.params.id, "chapter id");
    const bodyErrors = validateUpdateChapter(req.body);
    const errors = [...idErrors, ...bodyErrors];

    if (errors.length) {
      return res.status(400).json({ success: false, error: errors.join(". ") });
    }

    const chapter = await chapterService.updateChapter(req.params.id, req.body);
    if (!chapter) {
      return res.status(404).json({ success: false, error: "Chapter not found" });
    }

    return res.json({
      success: true,
      message: "Chapter updated successfully",
      data: chapter,
    });
  } catch (error) {
    if (error.code === "P2002") {
      return res.status(409).json({
        success: false,
        error: "chapterNumber already exists for this book",
      });
    }

    console.error("updateChapter error:", error);
    return res.status(500).json({ success: false, error: "Failed to update chapter" });
  }
}

async function deleteChapter(req, res) {
  try {
    const idErrors = validateId(req.params.id, "chapter id");
    if (idErrors.length) {
      return res.status(400).json({ success: false, error: idErrors.join(". ") });
    }

    const deleted = await chapterService.deleteChapter(req.params.id);
    if (!deleted) {
      return res.status(404).json({ success: false, error: "Chapter not found" });
    }

    return res.json({
      success: true,
      message: "Chapter deleted successfully",
    });
  } catch (error) {
    console.error("deleteChapter error:", error);
    return res.status(500).json({ success: false, error: "Failed to delete chapter" });
  }
}

async function translateChapter(req, res) {
  try {
    const idErrors = validateId(req.params.id, "chapter id");
    if (idErrors.length) {
      return res.status(400).json({ success: false, error: idErrors.join(". ") });
    }

    const requestedLanguage = chapterTranslationService.normalizeLanguage(req.body?.language);
    if (!requestedLanguage) {
      return res.status(400).json({
        success: false,
        error: "language is required",
      });
    }

    const [chapter, settings] = await Promise.all([
      chapterService.getChapterById(req.params.id),
      getMonetizationSettings(),
    ]);

    if (!chapter) {
      return res.status(404).json({ success: false, error: "Chapter not found" });
    }

    const publicDomainBook = isPublicDomainBook(chapter.book);

    if (settings.monetizationMaintMode && !publicDomainBook) {
      return res.status(503).json({
        success: false,
        error: "Monetization is temporarily under maintenance. Please try again shortly.",
        code: "MAINTENANCE",
      });
    }

    const user = req.session && req.session.user;
    const isAuthenticated = Boolean(user);
    const isSubscriber = isAuthenticated && Boolean(user.isSubscribed);
    const chNum = Number(chapter.chapterNumber);
    const isFree = publicDomainBook || isFreeChapter(chNum, settings);
    const earlyAccessLocked = isEarlyAccessLocked(chapter, settings, isSubscriber, publicDomainBook);

    if (earlyAccessLocked) {
      return res.status(403).json({
        success: false,
        error: "This chapter is in early access for Pro members.",
        code: "EARLY_ACCESS_PRO_ONLY",
        proRequired: true,
      });
    }

    if (!isFree) {
      if (!isAuthenticated) {
        return res.status(403).json({
          success: false,
          error: "Login is required to translate this chapter",
          code: "CHAPTER_LOCKED",
          loginRequired: true,
        });
      }

      if (!isSubscriber || settings.subUnlimited === false) {
        const unlockedByCoin = await hasUserUnlockedChapter(user.id, chapter.id);
        if (!unlockedByCoin) {
          const coinCost = settings.chapterUnlockCost ?? 10;
          return res.status(403).json({
            success: false,
            error: "This chapter requires coins to unlock",
            code: "CHAPTER_LOCKED",
            coinCost,
            chapterUnlockCost: coinCost,
          });
        }
      }
    }

    const translated = await chapterTranslationService.getOrCreateChapterTranslation({
      chapterId: chapter.id,
      language: requestedLanguage,
      sourceText: chapter.content,
    });

    return res.json({
      success: true,
      message: translated.cached ? "Translation loaded from cache" : "Translation generated",
      data: {
        chapterId: chapter.id,
        bookId: chapter.bookId,
        language: translated.language,
        languageLabel: chapterTranslationService.displayLanguage(translated.language),
        content: translated.content,
        cached: translated.cached,
        provider: translated.provider,
      },
    });
  } catch (error) {
    console.error("translateChapter error:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Failed to translate chapter",
    });
  }
}

async function saveUserTranslation(req, res) {
  try {
    if (!req.session || !req.session.user) {
      return res.status(401).json({ success: false, error: "Authentication required" });
    }

    const idErrors = validateId(req.params.bookId, "bookId");
    if (idErrors.length) {
      return res.status(400).json({ success: false, error: idErrors.join(". ") });
    }

    const language = chapterTranslationService.normalizeLanguage(req.body?.language);
    if (!language) {
      return res.status(400).json({ success: false, error: "language is required" });
    }

    const book = await prisma.book.findFirst({
      where: {
        id: req.params.bookId,
        status: "PUBLISHED",
      },
      select: { id: true, title: true },
    });

    if (!book) {
      return res.status(404).json({ success: false, error: "Book not found" });
    }

    await chapterTranslationService.saveUserTranslationPreference({
      userId: req.session.user.id,
      bookId: book.id,
      language,
    });

    return res.json({
      success: true,
      message: "Translation saved to your library preferences",
      data: {
        bookId: book.id,
        language,
        languageLabel: chapterTranslationService.displayLanguage(language),
      },
    });
  } catch (error) {
    console.error("saveUserTranslation error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to save translation preference",
    });
  }
}

module.exports = {
  getBookChapters,
  getChapterById,
  createChapter,
  updateChapter,
  deleteChapter,
  translateChapter,
  saveUserTranslation,
};
