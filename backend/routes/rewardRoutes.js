const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const rewardController = require('../controllers/rewardController');

router.post('/daily-checkin', requireAuth, rewardController.dailyCheckin);
router.post('/chapter-complete', requireAuth, rewardController.chapterComplete);
router.post('/mark-read-today', requireAuth, rewardController.markReadToday);
router.post('/ad-reward', requireAuth, rewardController.adReward);

module.exports = router;
