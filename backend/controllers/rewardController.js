const { prisma } = require('../config/db');
const { updateReadingStreak } = require('../services/progressService');
const { applyRewardBoost } = require('../services/subscriptionBenefitsService');

// Helper to add coins and create transaction
async function addCoinsAndTransaction({ userId, amount, type, description, referenceId }) {
  const [user] = await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: { coins: { increment: amount } },
    }),
    prisma.walletTransaction.create({
      data: {
        userId,
        type,
        amount,
        description,
        referenceId,
      },
    }),
  ]);

  return user;
}

exports.dailyCheckin = async (req, res) => {
  try {
    const userId = req.session.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const alreadyClaimed = await prisma.walletTransaction.findFirst({
      where: {
        userId,
        type: 'DAILY_CHECKIN',
        createdAt: { gte: today },
      },
    });

    if (alreadyClaimed) {
      return res.status(400).json({
        success: false,
        message: 'Already claimed daily check-in.',
      });
    }

    const rewardAmount = applyRewardBoost(5, req.session.user);

    const user = await addCoinsAndTransaction({
      userId,
      amount: rewardAmount,
      type: 'DAILY_CHECKIN',
      description: 'Daily check-in reward',
    });

    req.session.user.coins = user.coins;

    return res.json({
      success: true,
      reward: rewardAmount,
      coins: user.coins,
    });
  } catch (err) {
    console.error('dailyCheckin error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

exports.chapterComplete = async (req, res) => {
  try {
    const userId = req.session.user?.id;
    const { bookId, chapterId } = req.body;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    if (!bookId || !chapterId) {
      return res.status(400).json({ success: false, message: 'Missing bookId or chapterId' });
    }

    const referenceId = `${bookId}:${chapterId}`;

    const alreadyClaimed = await prisma.walletTransaction.findFirst({
      where: {
        userId,
        type: 'CHAPTER_REWARD',
        referenceId,
      },
    });

    if (alreadyClaimed) {
      return res.status(400).json({
        success: false,
        message: 'Already claimed for this chapter.',
      });
    }

    const rewardAmount = applyRewardBoost(10, req.session.user);

    const user = await addCoinsAndTransaction({
      userId,
      amount: rewardAmount,
      type: 'CHAPTER_REWARD',
      description: `Completed chapter ${chapterId}`,
      referenceId,
    });

    const streak = await updateReadingStreak(userId);

    req.session.user.coins = user.coins;

    return res.json({
      success: true,
      reward: rewardAmount,
      coins: user.coins,
      streak,
    });
  } catch (err) {
    console.error('chapterComplete error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

exports.markReadToday = async (req, res) => {
  try {
    const userId = req.session.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const streak = await updateReadingStreak(userId);
    if (!streak) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { coins: true },
    });

    if (req.session.user) {
      req.session.user.coins = user?.coins ?? req.session.user.coins;
    }

    return res.json({
      success: true,
      streak,
      coins: user?.coins ?? null,
    });
  } catch (err) {
    console.error('markReadToday error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

exports.adReward = async (req, res) => {
  try {
    const userId = req.session.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const adCount = await prisma.walletTransaction.count({
      where: {
        userId,
        type: 'AD_REWARD',
        createdAt: { gte: today },
      },
    });

    if (adCount >= 3) {
      return res.status(400).json({
        success: false,
        message: 'Ad reward limit reached for today.',
      });
    }

    const rewardAmount = applyRewardBoost(5, req.session.user);

    const user = await addCoinsAndTransaction({
      userId,
      amount: rewardAmount,
      type: 'AD_REWARD',
      description: 'Watched ad',
    });

    req.session.user.coins = user.coins;

    return res.json({
      success: true,
      reward: rewardAmount,
      coins: user.coins,
    });
  } catch (err) {
    console.error('adReward error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};