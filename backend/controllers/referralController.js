const {
  ensureReferralCode,
  getReferrerSummary,
  buildReferralLink,
  DEFAULT_REWARD_AMOUNT,
  DEFAULT_REWARD_COINS,
  DEFAULT_REWARD_CREDITS,
} = require("../services/referralService");

function buildEmptySummary(referralCode) {
  return {
    referralCode: referralCode || "",
    referralLink: buildReferralLink(referralCode),
    rewards: {
      cashAmount: 0,
      coins: 0,
      aiCredits: 0,
    },
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
}

async function getReferralSummary(req, res) {
  try {
    const userId = req.session.user.id;
    const referralCode = await ensureReferralCode(userId, req.session.user.name);
    const summary = await getReferrerSummary(userId) || buildEmptySummary(referralCode);

    return res.json({
      success: true,
      data: {
        referralCode: summary.referralCode || referralCode || "",
        referralLink: summary.referralLink || buildReferralLink(summary.referralCode || referralCode || ""),
        rewardConfig: {
          cashAmount: DEFAULT_REWARD_AMOUNT,
          coins: DEFAULT_REWARD_COINS,
          aiCredits: DEFAULT_REWARD_CREDITS,
        },
        stats: summary.stats,
        rewards: summary.rewards,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: "Failed to load referral summary",
    });
  }
}

async function getReferralList(req, res) {
  try {
    const userId = req.session.user.id;
    const referralCode = await ensureReferralCode(userId, req.session.user.name);
    const summary = await getReferrerSummary(userId) || buildEmptySummary(referralCode);

    return res.json({
      success: true,
      data: summary.records.map((item) => ({
        id: item.id,
        status: item.status,
        rewardGiven: Boolean(item.rewardGiven),
        rewardAmount: Number(item.rewardAmount || 0),
        rewardCoins: Number(item.rewardCoins || 0),
        rewardCredits: Number(item.rewardCredits || 0),
        referredUniqueReaders: Number(item.referredUniqueReaders || 0),
        rejectionReason: item.rejectionReason || "",
        createdAt: item.createdAt,
        completedAt: item.completedAt,
        referredUser: item.referredUser
          ? {
            id: item.referredUser.id,
            name: item.referredUser.name,
            email: item.referredUser.email,
            isWriter: Boolean(item.referredUser.isWriter),
          }
          : null,
      })),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: "Failed to load referral list",
    });
  }
}

module.exports = {
  getReferralSummary,
  getReferralList,
};
