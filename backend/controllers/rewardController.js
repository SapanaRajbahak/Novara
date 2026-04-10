const { prisma } = require('../config/db');

// Helper to add coins and create transaction
async function addCoinsAndTransaction({ userId, amount, type, description, referenceId }) {
  // Update coins and create transaction atomically
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
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    // Prevent duplicate: Only one per day
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
      return res.status(400).json({ success: false, message: 'Already claimed daily check-in.' });
    }

    const rewardAmount = 5; // Or dynamic logic
    const user = await addCoinsAndTransaction({
      userId,
      amount: rewardAmount,
      type: 'DAILY_CHECKIN',
      description: 'Daily check-in reward',
    });

    req.session.user.coins = user.coins;
    return res.json({ success: true, coins: user.coins });
  } catch (err) {
    console.error('dailyCheckin error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

exports.chapterComplete = async (req, res) => {
  try {
    const userId = req.session.user?.id;
    const { chapterId } = req.body;
    if (!userId || !chapterId) return res.status(400).json({ success: false, message: 'Missing data' });

    // Prevent duplicate: Only one per chapter
    const alreadyClaimed = await prisma.walletTransaction.findFirst({
      where: {
        userId,
        type: 'CHAPTER_REWARD',
        referenceId: String(chapterId),
      },
    });
    if (alreadyClaimed) {
      return res.status(400).json({ success: false, message: 'Already claimed for this chapter.' });
    }

    const rewardAmount = 10; // Or dynamic logic
    const user = await addCoinsAndTransaction({
      userId,
      amount: rewardAmount,
      type: 'CHAPTER_REWARD',
      description: `Completed chapter ${chapterId}`,
      referenceId: String(chapterId),
    });

    req.session.user.coins = user.coins;
    return res.json({ success: true, coins: user.coins });
  } catch (err) {
    console.error('chapterComplete error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

exports.adReward = async (req, res) => {
  try {
    const userId = req.session.user?.id;
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    // Prevent abuse: Limit to N per day (e.g., 3)
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
      return res.status(400).json({ success: false, message: 'Ad reward limit reached for today.' });
    }

    const rewardAmount = 5; // Or dynamic logic
    const user = await addCoinsAndTransaction({
      userId,
      amount: rewardAmount,
      type: 'AD_REWARD',
      description: 'Watched ad',
    });

    req.session.user.coins = user.coins;
    return res.json({ success: true, coins: user.coins });
  } catch (err) {
    console.error('adReward error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};
