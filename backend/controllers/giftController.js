const { prisma } = require('../config/db');

exports.sendGift = async (req, res) => {
  try {
    const senderId = req.session.user?.id;
    if (!senderId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { bookId, chapterId, amount, message } = req.body;

    // Validate inputs
    if (!bookId || typeof bookId !== 'string') {
      return res.status(400).json({ error: 'Invalid book reference' });
    }

    if (!Number.isFinite(amount) || amount < 1 || amount > 10000) {
      return res.status(400).json({ error: 'Amount must be between 1 and 10,000 coins' });
    }

    const messageStr = message ? String(message).trim().substring(0, 500) : '';

    // Get sender (already in session)
    const sender = await prisma.user.findUnique({
      where: { id: senderId },
      select: { id: true, coins: true, email: true }
    });

    if (!sender) {
      return res.status(401).json({ error: 'Sender not found' });
    }

    // Check if sender has enough coins
    if (sender.coins < amount) {
      return res.status(400).json({ error: 'Insufficient coins. You need ' + amount + ' coins to send this gift.' });
    }

    // Resolve the author from the current book context.
    const book = await prisma.book.findFirst({
      where: {
        OR: [
          { id: bookId },
          { slug: bookId }
        ]
      },
      select: {
        id: true,
        title: true,
        createdByUser: {
          select: { id: true, email: true, name: true, penName: true }
        }
      }
    });

    if (!book || !book.createdByUser) {
      return res.status(404).json({ error: 'Book author not found' });
    }

    const recipient = book.createdByUser;

    if (recipient.id === senderId) {
      return res.status(400).json({ error: 'You cannot send a gift to yourself' });
    }

    // Create unique reference ID for this gift
    const referenceId = `gift:${senderId}:${recipient.id}:${book.id}${chapterId ? `:${chapterId}` : ''}:${Date.now()}`;

    // Perform transaction: deduct from sender, add to recipient, create transactions
    const result = await prisma.$transaction([
      // Deduct from sender
      prisma.user.update({
        where: { id: senderId },
        data: { coins: { decrement: amount } }
      }),
      // Add to recipient
      prisma.user.update({
        where: { id: recipient.id },
        data: { coins: { increment: amount } }
      }),
      // Create Gift record for social tracking
      prisma.gift.create({
        data: {
          fromUserId: senderId,
          toAuthorId: recipient.id,
          novelId: book.id,
          chapterId: chapterId ? String(chapterId) : null,
          amount,
          message: messageStr || null
        }
      }),
      // Create sender transaction (outgoing gift)
      prisma.walletTransaction.create({
        data: {
          userId: senderId,
          type: 'GIFT_SENT',
          amount: -amount,
          description: `Sent ${amount} coins to the author of ${book.title}${messageStr ? ': ' + messageStr : ''}`,
          referenceId
        }
      }),
      // Create recipient transaction (incoming gift)
      prisma.walletTransaction.create({
        data: {
          userId: recipient.id,
          type: 'GIFT_RECEIVED',
          amount,
          description: `Received ${amount} coins from ${sender.email}${messageStr ? ': ' + messageStr : ''}`,
          referenceId
        }
      })
    ]);

    // Update session with new coin balance
    req.session.user.coins = result[0].coins;

    return res.json({
      success: true,
      message: `Gift of ${amount} coins sent to the author`,
      coinsRemaining: result[0].coins
    });

  } catch (error) {
    console.error('sendGift error:', error);
    return res.status(500).json({ error: 'Failed to send gift. Please try again.' });
  }
};

exports.getGiftHistory = async (req, res) => {
  try {
    const userId = req.session.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const gifts = await prisma.walletTransaction.findMany({
      where: {
        userId,
        type: { in: ['GIFT_SENT', 'GIFT_RECEIVED'] }
      },
      orderBy: { createdAt: 'desc' },
      take: 50
    });

    return res.json({
      success: true,
      gifts
    });

  } catch (error) {
    console.error('getGiftHistory error:', error);
    return res.status(500).json({ error: 'Failed to fetch gift history' });
  }
};

/// Get received gifts for author (Gift Wallet Dashboard)
exports.getReceivedGifts = async (req, res) => {
  try {
    const userId = req.session.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Get total balance of coins from gifts
    const totalCoinsFromGifts = await prisma.walletTransaction.aggregate({
      where: {
        userId,
        type: 'GIFT_RECEIVED'
      },
      _sum: {
        amount: true
      }
    });

    // Get recent gifts received
    const recentGifts = await prisma.gift.findMany({
      where: { toAuthorId: userId },
      select: {
        id: true,
        fromUserId: true,
        amount: true,
        message: true,
        createdAt: true,
        fromUser: {
          select: { id: true, name: true, email: true, avatarUrl: true }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 20
    });

    return res.json({
      success: true,
      totalCoinsFromGifts: totalCoinsFromGifts._sum.amount || 0,
      recentGifts
    });

  } catch (error) {
    console.error('getReceivedGifts error:', error);
    return res.status(500).json({ error: 'Failed to fetch received gifts' });
  }
};

/// Get wallet transactions for reader (Reader Wallet Dashboard)
exports.getWalletTransactions = async (req, res) => {
  try {
    const userId = req.session.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const transactions = await prisma.walletTransaction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 30
    });

    // Calculate total coins and breakdown by type
    const totalCoins = await prisma.user.findUnique({
      where: { id: userId },
      select: { coins: true }
    });

    return res.json({
      success: true,
      currentBalance: totalCoins?.coins || 0,
      transactions
    });

  } catch (error) {
    console.error('getWalletTransactions error:', error);
    return res.status(500).json({ error: 'Failed to fetch wallet transactions' });
  }
};
