function normalizePlan(plan) {
  const value = String(plan || "").trim().toLowerCase();
  if (value === "monthly" || value === "yearly") {
    return value;
  }
  return "";
}

function parsePositiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getPlanBenefits(plan) {
  const normalizedPlan = normalizePlan(plan);

  if (normalizedPlan === "yearly") {
    return {
      plan: "yearly",
      dailyChapterLimit: parsePositiveNumber(process.env.PRO_YEARLY_DAILY_CHAPTER_LIMIT, 150),
      rewardBoostMultiplier: parsePositiveNumber(process.env.PRO_REWARD_BOOST_MULTIPLIER, 1.5),
      signupBonusCoins: parsePositiveNumber(process.env.PRO_YEARLY_SIGNUP_BONUS_COINS, 1200),
      earlyAccess: true,
    };
  }

  if (normalizedPlan === "monthly") {
    return {
      plan: "monthly",
      dailyChapterLimit: parsePositiveNumber(process.env.PRO_MONTHLY_DAILY_CHAPTER_LIMIT, 100),
      rewardBoostMultiplier: parsePositiveNumber(process.env.PRO_REWARD_BOOST_MULTIPLIER, 1.5),
      signupBonusCoins: parsePositiveNumber(process.env.PRO_MONTHLY_SIGNUP_BONUS_COINS, 100),
      earlyAccess: true,
    };
  }

  return null;
}

function isProUser(user) {
  if (!user) {
    return false;
  }

  const active = user.isSubscribed === true || String(user.subscriptionStatus || "").toLowerCase() === "active";
  return active && Boolean(getPlanBenefits(user.subscriptionPlan));
}

function applyRewardBoost(baseAmount, user) {
  const base = Number(baseAmount || 0);
  if (!Number.isFinite(base) || base <= 0) {
    return 0;
  }

  if (!isProUser(user)) {
    return Math.round(base);
  }

  const benefits = getPlanBenefits(user.subscriptionPlan);
  return Math.ceil(base * benefits.rewardBoostMultiplier);
}

function getDailyChapterLimitForUser(user) {
  if (!isProUser(user)) {
    return null;
  }

  const benefits = getPlanBenefits(user.subscriptionPlan);
  return benefits ? benefits.dailyChapterLimit : null;
}

function getSignupBonusForPlan(plan) {
  const benefits = getPlanBenefits(plan);
  return benefits ? benefits.signupBonusCoins : 0;
}

module.exports = {
  normalizePlan,
  getPlanBenefits,
  isProUser,
  applyRewardBoost,
  getDailyChapterLimitForUser,
  getSignupBonusForPlan,
};