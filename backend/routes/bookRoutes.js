/**
 * Public book routes.
 * No authentication required — these endpoints return published books only.
 *
 * Mounted at: /api/books
 */
const express = require("express");
const { getBooks, getBookById } = require("../controllers/bookController");

const router = express.Router();

// GET /api/books         – list published books (filters, search, pagination)
router.get("/", getBooks);

// GET /api/books/:id     – get a single published book by id or slug
router.get("/:id", getBookById);

module.exports = router;
