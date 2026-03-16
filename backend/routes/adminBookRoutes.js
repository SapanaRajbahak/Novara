/**
 * Admin book routes.
 * All routes require the user to be signed in as an ADMIN.
 * The requireAdmin middleware enforces this on every request.
 *
 * Mounted at: /api/admin/books
 */
const express = require("express");
const { requireAdmin } = require("../middleware/auth");
const {
  getAdminBooks,
  createBook,
  updateBook,
  deleteBook,
  publishBook,
  unpublishBook,
} = require("../controllers/bookController");

const router = express.Router();

// Protect every route in this file with the admin check
router.use(requireAdmin);

// GET    /api/admin/books             – list all books (draft + published)
router.get("/", getAdminBooks);

// POST   /api/admin/books             – create a new book
router.post("/", createBook);

// PUT    /api/admin/books/:id         – update an existing book
router.put("/:id", updateBook);

// DELETE /api/admin/books/:id         – delete a book (cascades to all relations)
router.delete("/:id", deleteBook);

// POST   /api/admin/books/:id/publish   – publish a book
router.post("/:id/publish", publishBook);

// POST   /api/admin/books/:id/unpublish – unpublish a book (back to DRAFT)
router.post("/:id/unpublish", unpublishBook);

module.exports = router;
