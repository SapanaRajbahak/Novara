const prisma = require("../prisma/client");

const SETTINGS_ID = "global";

// ── Helpers ────────────────────────────────────────────────────────────────────

function parseBody(body) {
  const intFields = [
    "freeChapters", "paidFrom", "chapterUnlockCost", "audiobookUnlockCost",
    "referralRewardCoins", "dailyStreakReward", "adWatchReward", "welcomeBonusCoins",
    "freeReadLimit", "earlyAccessHours", "writerRevenueShare",
    "minPublishedChapters", "minReadCount", "newWriterProbationDays",
  ];
  const floatFields = ["minPayoutThreshold", "perfBonusThreshold", "perfBonusAmount"];
  const boolFields = [
    "autoLock", "schedUnlock", "subUnlimited", "aiPremiumOnly", "offlinePremiumOnly",
    "publicDomainFree", "subOnlyBooks", "earlyAccess", "requireIdVerify", "requireTaxInfo",
    "coinSystemEnabled", "subscriptionsEnabled", "referralProgramEnabled",
    "adRewardEnabled", "writerPayoutsEnabled", "monetizationMaintMode",
  ];
  const stringFields = ["schedUnlockFrequency", "payoutSchedule"];

  const data = {};
  for (const f of intFields) {
    if (f in body) data[f] = parseInt(body[f], 10) || 0;
  }
  for (const f of floatFields) {
    if (f in body) data[f] = parseFloat(body[f]) || 0;
  }
  for (const f of boolFields) {
    if (f in body) data[f] = Boolean(body[f]);
  }
  for (const f of stringFields) {
    if (f in body && typeof body[f] === "string") data[f] = body[f];
  }
  return data;
}

// ── GET /api/admin/monetization/settings ────────────────────────────────────────

async function getSettings(req, res) {
  try {
    let settings = await prisma.monetizationSettings.findUnique({
      where: { id: SETTINGS_ID },
    });

    if (!settings) {
      // Seed defaults on first load
      settings = await prisma.monetizationSettings.create({
        data: { id: SETTINGS_ID },
      });
    }

    return res.json({ success: true, data: settings });
  } catch (error) {
    console.error("getSettings error:", error);
    return res.status(500).json({ success: false, error: "Failed to fetch monetization settings" });
  }
}

// ── PUT /api/admin/monetization/settings ────────────────────────────────────────

async function upsertSettings(req, res) {
  try {
    const data = parseBody(req.body);
    if (!Object.keys(data).length) {
      return res.status(400).json({ success: false, error: "No valid fields provided" });
    }

    const settings = await prisma.monetizationSettings.upsert({
      where: { id: SETTINGS_ID },
      update: data,
      create: { id: SETTINGS_ID, ...data },
    });

    return res.json({ success: true, data: settings });
  } catch (error) {
    console.error("upsertSettings error:", error);
    return res.status(500).json({ success: false, error: "Failed to save monetization settings" });
  }
}

// ── POST /api/admin/monetization/quick-action ────────────────────────────────────

async function quickAction(req, res) {
  try {
    const { action } = req.body;
    if (!["lock-all", "unlock-all", "first-free", "emergency-lock"].includes(action)) {
      return res.status(400).json({ success: false, error: "Unknown action" });
    }

    if (action === "lock-all") {
      await prisma.chapter.updateMany({ data: { isPublished: false } });
      return res.json({ success: true, message: "All chapters locked" });
    }

    if (action === "unlock-all") {
      await prisma.chapter.updateMany({ data: { isPublished: true } });
      return res.json({ success: true, message: "All chapters unlocked" });
    }

    if (action === "first-free") {
      // Set freeChapters = 1 and paidFrom = 2 in settings
      await prisma.monetizationSettings.upsert({
        where: { id: SETTINGS_ID },
        update: { freeChapters: 1, paidFrom: 2 },
        create: { id: SETTINGS_ID, freeChapters: 1, paidFrom: 2 },
      });
      return res.json({ success: true, message: "First chapter set to free across all books" });
    }

    if (action === "emergency-lock") {
      // Lock all chapters AND disable coin system and subscriptions
      await prisma.chapter.updateMany({ data: { isPublished: false } });
      await prisma.monetizationSettings.upsert({
        where: { id: SETTINGS_ID },
        update: { monetizationMaintMode: true, coinSystemEnabled: false },
        create: { id: SETTINGS_ID, monetizationMaintMode: true, coinSystemEnabled: false },
      });
      return res.json({ success: true, message: "Emergency lock activated" });
    }
  } catch (error) {
    console.error("quickAction error:", error);
    return res.status(500).json({ success: false, error: "Quick action failed" });
  }
}

// ── GET /api/monetization/settings  (public — safe subset for reader/writer) ────

async function getPublicSettings(req, res) {
  try {
    let settings = await prisma.monetizationSettings.findUnique({
      where: { id: SETTINGS_ID },
    });

    if (!settings) {
      settings = await prisma.monetizationSettings.create({
        data: { id: SETTINGS_ID },
      });
    }

    // Return only fields that reader/writer UIs need
    const publicData = {
      freeChapters:          settings.freeChapters,
      paidFrom:              settings.paidFrom,
      chapterUnlockCost:     settings.chapterUnlockCost,
      audiobookUnlockCost:   settings.audiobookUnlockCost,
      dailyStreakReward:      settings.dailyStreakReward,
      adWatchReward:         settings.adWatchReward,
      welcomeBonusCoins:     settings.welcomeBonusCoins,
      freeReadLimit:         settings.freeReadLimit,
      subUnlimited:          settings.subUnlimited,
      aiPremiumOnly:         settings.aiPremiumOnly,
      offlinePremiumOnly:    settings.offlinePremiumOnly,
      publicDomainFree:      settings.publicDomainFree,
      subOnlyBooks:          settings.subOnlyBooks,
      earlyAccess:           settings.earlyAccess,
      earlyAccessHours:      settings.earlyAccessHours,
      writerRevenueShare:    settings.writerRevenueShare,
      minPayoutThreshold:    settings.minPayoutThreshold,
      payoutSchedule:        settings.payoutSchedule,
      minPublishedChapters:  settings.minPublishedChapters,
      minReadCount:          settings.minReadCount,
      requireIdVerify:       settings.requireIdVerify,
      coinSystemEnabled:     settings.coinSystemEnabled,
      subscriptionsEnabled:  settings.subscriptionsEnabled,
      referralProgramEnabled:settings.referralProgramEnabled,
      adRewardEnabled:       settings.adRewardEnabled,
      writerPayoutsEnabled:  settings.writerPayoutsEnabled,
      monetizationMaintMode: settings.monetizationMaintMode,
    };

    return res.json({ success: true, data: publicData });
  } catch (error) {
    console.error("getPublicSettings error:", error);
    return res.status(500).json({ success: false, error: "Failed to fetch settings" });
  }
}

module.exports = { getSettings, upsertSettings, quickAction, getPublicSettings };
