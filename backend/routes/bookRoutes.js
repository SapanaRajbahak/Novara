/**
 * Public book routes.
 * No authentication required — these endpoints return published books only.
 *
 * Mounted at: /api/books
 */
const express = require("express");
const {
	getBooks,
	getDiscoverBooks,
	getFeaturedBooks,
	getTrendingBooks,
	getRecentBooks,
	getBookById,
	restoreLocalBooks,
} = require("../controllers/bookController");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

// GET /api/books         – list published books (filters, search, pagination)
router.get("/", getBooks);

// GET /api/books/discover – discover feed for published books only
router.get("/discover", getDiscoverBooks);

// GET /api/books/featured – featured published books when real candidates exist
router.get("/featured", getFeaturedBooks);

// GET /api/books/trending – trending published books ranked by real engagement
router.get("/trending", getTrendingBooks);

// GET /api/books/recent – recently added published books
router.get("/recent", getRecentBooks);

// POST /api/books/restore-local – import local browser-stored books into DB
router.post("/restore-local", requireAuth, restoreLocalBooks);

// GET /api/books/:id     – get a single published book by id or slug
router.get("/:id", getBookById);

module.exports = router;
