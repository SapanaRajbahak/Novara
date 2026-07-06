/**
 * Book Content Routes
 * Routes for fetching book content and managing reading progress
 */

const express = require('express');
const {
  getBookContent,
  getPageContent,
  getReadingProgress,
  updateReadingProgress
} = require('../controllers/bookContentController');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// GET /api/books/:id/content - Get book content (paginated for continuous mode)
router.get('/:id/content', getBookContent);

// GET /api/books/:id/pages/:pageNumber - Get specific page content
router.get('/:id/pages/:pageNumber', getPageContent);

// GET /api/books/:id/progress - Get reading progress
router.get('/:id/progress', requireAuth, getReadingProgress);

// PUT /api/books/:id/progress - Update reading progress
router.put('/:id/progress', requireAuth, updateReadingProgress);

module.exports = router;
