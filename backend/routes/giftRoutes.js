const express = require('express');
const giftController = require('../controllers/giftController');

const router = express.Router();

// Send a gift
router.post('/send', giftController.sendGift);

// Get gift history
router.get('/history', giftController.getGiftHistory);

// Get received gifts for author (Gift Wallet Dashboard)
router.get('/received', giftController.getReceivedGifts);

// Get wallet transactions for reader (Reader Wallet Dashboard)
router.get('/wallet', giftController.getWalletTransactions);

module.exports = router;
