const { canAccess, canReadChapter, trackUsageEvent } = require("../services/usageGuardService");

function usageGuard(req, res, next) {
  const sessionUser = req.session && req.session.user;
  if (!sessionUser || !sessionUser.id) {
    return next();
  }

  const access = canAccess(sessionUser.id);
  if (!access.allowed) {
    return res.status(429).json({
      success: false,
      error: access.reason || "Suspicious activity detected",
      code: "USAGE_THROTTLED",
      retryAfterSec: access.retryAfterSec,
      blockedUntil: access.blockedUntil,
    });
  }

  const isChapterReadRoute = req.method === "GET" && /^\/chapters\/[^/]+$/.test(req.path);
  if (isChapterReadRoute) {
    const chapterAccess = canReadChapter(sessionUser);
    if (!chapterAccess.allowed) {
      return res.status(429).json({
        success: false,
        error: chapterAccess.reason,
        code: chapterAccess.code || "DAILY_CHAPTER_LIMIT_REACHED",
        retryAfterSec: chapterAccess.retryAfterSec,
        dailyChapterLimit: chapterAccess.dailyChapterLimit,
        readsToday: chapterAccess.readsToday,
      });
    }
  }

  res.on("finish", () => {
    const success = res.statusCode < 400;

    trackUsageEvent({
      userId: sessionUser.id,
      isPro: Boolean(sessionUser.isSubscribed),
      success,
      chapterRead: isChapterReadRoute,
    });
  });

  return next();
}

module.exports = {
  usageGuard,
};