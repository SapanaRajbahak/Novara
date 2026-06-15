const DEFAULT_DAILY_READ_LIMIT = 5000;
const DEFAULT_READ_SPEED_LIMIT = 60;
const DEFAULT_FAILED_REQUEST_LIMIT = 20;
const DEFAULT_ACTIVE_HOURS_LIMIT = 20;
const DEFAULT_THROTTLE_MINUTES = 10;
const { getDailyChapterLimitForUser } = require("./subscriptionBenefitsService");

const usageByUser = new Map();

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value || ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getLimits() {
  return {
    dailyReadLimit: parsePositiveInt(process.env.USAGE_DAILY_READ_LIMIT, DEFAULT_DAILY_READ_LIMIT),
    readSpeedLimit: parsePositiveInt(process.env.USAGE_READ_SPEED_LIMIT, DEFAULT_READ_SPEED_LIMIT),
    failedRequestLimit: parsePositiveInt(process.env.USAGE_FAILED_REQUEST_LIMIT, DEFAULT_FAILED_REQUEST_LIMIT),
    activeHoursLimit: parsePositiveInt(process.env.USAGE_ACTIVE_HOURS_LIMIT, DEFAULT_ACTIVE_HOURS_LIMIT),
    throttleMinutes: parsePositiveInt(process.env.USAGE_THROTTLE_MINUTES, DEFAULT_THROTTLE_MINUTES),
  };
}

function dayKey(timestampMs) {
  return new Date(timestampMs).toISOString().slice(0, 10);
}

function monthKey(timestampMs) {
  const iso = new Date(timestampMs).toISOString();
  return iso.slice(0, 7);
}

function yearKey(timestampMs) {
  return new Date(timestampMs).toISOString().slice(0, 4);
}

function createState(nowMs) {
  return {
    dayKey: dayKey(nowMs),
    monthKey: monthKey(nowMs),
    yearKey: yearKey(nowMs),
    readsToday: 0,
    failedRequests: 0,
    requestEvents24h: [],
    chapterReadEvents24h: [],
    activeHourKeys24h: [],
    monthlyRequestCount: 0,
    yearlyRequestCount: 0,
    readSpeed: 0,
    rateLimit: "normal",
    blockedUntil: null,
    flagged: false,
  };
}

function resetWindowCounters(state, nowMs) {
  const currentDay = dayKey(nowMs);
  if (state.dayKey !== currentDay) {
    state.dayKey = currentDay;
    state.readsToday = 0;
    state.failedRequests = 0;
  }

  const currentMonth = monthKey(nowMs);
  if (state.monthKey !== currentMonth) {
    state.monthKey = currentMonth;
    state.monthlyRequestCount = 0;
  }

  const currentYear = yearKey(nowMs);
  if (state.yearKey !== currentYear) {
    state.yearKey = currentYear;
    state.yearlyRequestCount = 0;
  }
}

function getState(userId, nowMs) {
  const key = String(userId || "");
  if (!key) {
    return null;
  }

  let state = usageByUser.get(key);
  if (!state) {
    state = createState(nowMs);
    usageByUser.set(key, state);
  }

  resetWindowCounters(state, nowMs);
  return state;
}

function pruneOldEvents(state, nowMs) {
  const cutoff = nowMs - 24 * 60 * 60 * 1000;
  state.requestEvents24h = state.requestEvents24h.filter((ts) => ts >= cutoff);
  state.chapterReadEvents24h = state.chapterReadEvents24h.filter((ts) => ts >= cutoff);
  state.activeHourKeys24h = state.activeHourKeys24h.filter((entry) => entry.ts >= cutoff);
}

function computeReadSpeed(state, nowMs) {
  const minuteCutoff = nowMs - 60 * 1000;
  const recentReads = state.chapterReadEvents24h.filter((ts) => ts >= minuteCutoff).length;
  return recentReads;
}

function computeActiveHours(state) {
  const uniqueHours = new Set(state.activeHourKeys24h.map((entry) => entry.hourKey));
  return uniqueHours.size;
}

function isAbnormalPattern(user, limits = getLimits()) {
  return (
    Number(user.readSpeed || 0) > limits.readSpeedLimit ||
    Number(user.failedRequests || 0) > limits.failedRequestLimit ||
    Number(user.activeHours || 0) > limits.activeHoursLimit
  );
}

function throttleUser(userId, nowMs = Date.now(), limits = getLimits()) {
  const state = getState(userId, nowMs);
  if (!state) {
    return null;
  }

  state.rateLimit = "slow";
  state.blockedUntil = nowMs + limits.throttleMinutes * 60 * 1000;
  state.flagged = true;

  return {
    blockedUntil: state.blockedUntil,
    flagged: state.flagged,
    rateLimit: state.rateLimit,
  };
}

function checkUserUsage(user, limits = getLimits()) {
  if (Number(user.readsToday || 0) > limits.dailyReadLimit && isAbnormalPattern(user, limits)) {
    throttleUser(user.id, Date.now(), limits);
    return {
      allowed: false,
      reason: "Suspicious activity detected",
    };
  }

  return {
    allowed: true,
  };
}

function canAccess(userId, nowMs = Date.now()) {
  const state = getState(userId, nowMs);
  if (!state || !state.blockedUntil) {
    return { allowed: true };
  }

  if (state.blockedUntil <= nowMs) {
    state.blockedUntil = null;
    state.rateLimit = "normal";
    return { allowed: true };
  }

  return {
    allowed: false,
    reason: "Suspicious activity detected",
    blockedUntil: state.blockedUntil,
    retryAfterSec: Math.max(1, Math.ceil((state.blockedUntil - nowMs) / 1000)),
  };
}

function secondsUntilUtcDayReset(nowMs = Date.now()) {
  const now = new Date(nowMs);
  const nextUtcDay = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return Math.max(1, Math.ceil((nextUtcDay - nowMs) / 1000));
}

function canReadChapter(user, nowMs = Date.now()) {
  const state = getState(user.id, nowMs);
  if (!state) {
    return { allowed: true };
  }

  const dailyChapterLimit = getDailyChapterLimitForUser(user);
  if (!dailyChapterLimit) {
    return { allowed: true };
  }

  if (Number(state.readsToday || 0) >= dailyChapterLimit) {
    return {
      allowed: false,
      reason: `Daily chapter limit reached for your ${String(user.subscriptionPlan || "pro")} plan`,
      code: "DAILY_CHAPTER_LIMIT_REACHED",
      dailyChapterLimit,
      readsToday: Number(state.readsToday || 0),
      retryAfterSec: secondsUntilUtcDayReset(nowMs),
    };
  }

  return {
    allowed: true,
    dailyChapterLimit,
    readsToday: Number(state.readsToday || 0),
    remainingToday: Math.max(0, dailyChapterLimit - Number(state.readsToday || 0)),
  };
}

function trackUsageEvent({ userId, isPro = false, success = true, chapterRead = false, nowMs = Date.now() }) {
  const state = getState(userId, nowMs);
  if (!state) {
    return null;
  }

  state.requestEvents24h.push(nowMs);
  state.monthlyRequestCount += 1;
  state.yearlyRequestCount += 1;

  if (!success) {
    state.failedRequests += 1;
  }

  if (chapterRead && success) {
    state.readsToday += 1;
    state.chapterReadEvents24h.push(nowMs);
  }

  const hourKeyValue = Math.floor(nowMs / (60 * 60 * 1000));
  state.activeHourKeys24h.push({ hourKey: hourKeyValue, ts: nowMs });

  pruneOldEvents(state, nowMs);

  const limits = getLimits();
  state.readSpeed = computeReadSpeed(state, nowMs);

  const usageSnapshot = {
    id: String(userId),
    readsToday: state.readsToday,
    readSpeed: state.readSpeed,
    failedRequests: state.failedRequests,
    activeHours: computeActiveHours(state),
  };

  const decision = checkUserUsage(usageSnapshot, limits);

  return {
    ...decision,
    userId: String(userId),
    isPro: Boolean(isPro),
    flagged: state.flagged,
    rateLimit: state.rateLimit,
    blockedUntil: state.blockedUntil,
    metrics: {
      readsToday: state.readsToday,
      readSpeed: state.readSpeed,
      failedRequests: state.failedRequests,
      activeHours: usageSnapshot.activeHours,
      monthlyRequestCount: isPro ? state.monthlyRequestCount : undefined,
      yearlyRequestCount: isPro ? state.yearlyRequestCount : undefined,
    },
  };
}

module.exports = {
  checkUserUsage,
  isAbnormalPattern,
  throttleUser,
  canAccess,
  canReadChapter,
  trackUsageEvent,
};