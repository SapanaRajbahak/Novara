/**
 * Book controller layer.
 * Thin functions that parse the request, call the service, and return JSON.
 * No Prisma logic lives here — that all lives in bookService.js.
 */
const bookService = require("../services/bookService");
const {
  validateCreateBook,
  validateUpdateBook,
  validateListQuery,
  validateAdminListQuery,
  validateDiscoverQuery,
  validateDiscoverSectionQuery,
} = require("../validators/bookValidator");

// ─── Public controllers ───────────────────────────────────────────────────────

/**
 * GET /api/books
 * Return a paginated, filterable list of published books.
 *
 * Query params:
 *   page, limit, sort, search, genre, categoryId,
 *   fileType, isAudiobookAvailable, isAiGenerated
 */
async function getBooks(req, res) {
  try {
    console.log("=== GET /api/books DEBUG ===");
    console.log("DATABASE_URL:", process.env.DATABASE_URL ? "SET" : "NOT SET");
    console.log("NODE_ENV:", process.env.NODE_ENV);
    console.log("Query params:", req.query);

    const queryErrors = validateListQuery(req.query);
    if (queryErrors.length > 0) {
      console.log("Query validation errors:", queryErrors);
      return res.status(400).json({ success: false, error: queryErrors.join(". ") });
    }

    const result = await bookService.listBooks(req.query);

    console.log("Books returned:", result.books.length);
    console.log("Pagination:", result.pagination);
    console.log("Book IDs:", result.books.map(b => b.id));
    console.log("Book statuses:", result.books.map(b => b.status));

    return res.json({
      success:    true,
      message:    "Books fetched successfully",
      data:       result.books,
      pagination: result.pagination,
    });
  } catch (error) {
    console.error("getBooks error:", error);
    return res.status(500).json({ success: false, error: "Failed to fetch books" });
  }
}

async function getDiscoverBooks(req, res) {
  try {
    const queryErrors = validateDiscoverQuery(req.query);
    if (queryErrors.length > 0) {
      return res.status(400).json({ success: false, error: queryErrors.join(". ") });
    }

    const result = await bookService.listDiscoverBooks(req.query);

    return res.json({
      success: true,
      message: "Discover feed fetched successfully",
      data: result.books,
      sections: result.sections,
      filterOptions: result.filterOptions,
      meta: result.meta,
      pagination: result.pagination,
    });
  } catch (error) {
    console.error("getDiscoverBooks error:", error);
    return res.status(500).json({ success: false, error: "Failed to fetch discover feed" });
  }
}

async function getFeaturedBooks(req, res) {
  try {
    const queryErrors = validateDiscoverSectionQuery(req.query);
    if (queryErrors.length > 0) {
      return res.status(400).json({ success: false, error: queryErrors.join(". ") });
    }

    const books = await bookService.listFeaturedBooks(req.query.limit);

    return res.json({
      success: true,
      message: "Featured books fetched successfully",
      data: books,
    });
  } catch (error) {
    console.error("getFeaturedBooks error:", error);
    return res.status(500).json({ success: false, error: "Failed to fetch featured books" });
  }
}

async function getTrendingBooks(req, res) {
  try {
    const queryErrors = validateDiscoverSectionQuery(req.query);
    if (queryErrors.length > 0) {
      return res.status(400).json({ success: false, error: queryErrors.join(". ") });
    }

    const books = await bookService.listTrendingBooks(req.query.limit);

    return res.json({
      success: true,
      message: "Trending books fetched successfully",
      data: books,
    });
  } catch (error) {
    console.error("getTrendingBooks error:", error);
    return res.status(500).json({ success: false, error: "Failed to fetch trending books" });
  }
}

async function getRecentBooks(req, res) {
  try {
    const queryErrors = validateDiscoverSectionQuery(req.query);
    if (queryErrors.length > 0) {
      return res.status(400).json({ success: false, error: queryErrors.join(". ") });
    }

    const books = await bookService.listRecentBooks(req.query.limit);

    return res.json({
      success: true,
      message: "Recent books fetched successfully",
      data: books,
    });
  } catch (error) {
    console.error("getRecentBooks error:", error);
    return res.status(500).json({ success: false, error: "Failed to fetch recent books" });
  }
}

/**
 * GET /api/books/:id
 * Return a single published book.
 * The :id param accepts either a book id (cuid) or a slug.
 */
async function getBookById(req, res) {
  try {
    const book = await bookService.getBookById(req.params.id);

    if (!book) {
      return res.status(404).json({ success: false, error: "Book not found" });
    }

    return res.json({
      success: true,
      message: "Book fetched successfully",
      data:    book,
    });
  } catch (error) {
    console.error("getBookById error:", error);
    return res.status(500).json({ success: false, error: "Failed to fetch book" });
  }
}

/**
 * GET /api/admin/books
 * Return a paginated, filterable list of all books for admin screens.
 * Includes both DRAFT and PUBLISHED unless status is explicitly filtered.
 */
async function getAdminBooks(req, res) {
  try {
    const queryErrors = validateAdminListQuery(req.query);
    if (queryErrors.length > 0) {
      return res.status(400).json({ success: false, error: queryErrors.join(". ") });
    }

    const result = await bookService.listAdminBooks(req.query);

    return res.json({
      success: true,
      message: "Admin books fetched successfully",
      data: result.books,
      pagination: result.pagination,
    });
  } catch (error) {
    console.error("getAdminBooks error:", error);
    return res.status(500).json({ success: false, error: "Failed to fetch admin books" });
  }
}

// ─── Admin controllers ────────────────────────────────────────────────────────

/**
 * POST /api/admin/books
 * Create a new book.
 * req.session.user is set by the auth middleware and holds the admin's id.
 */
async function createBook(req, res) {
  try {
    const validationErrors = validateCreateBook(req.body);
    if (validationErrors.length > 0) {
      return res.status(400).json({ success: false, error: validationErrors.join(". ") });
    }

    const book = await bookService.createBook(req.body, req.session.user);

    return res.status(201).json({
      success: true,
      message: "Book created successfully",
      data:    book,
    });
  } catch (error) {
    console.error("createBook error:", error);
    return res.status(500).json({ success: false, error: "Failed to create book" });
  }
}

/**
 * PUT /api/admin/books/:id
 * Update an existing book.
 * Only fields present in the request body are changed.
 */
async function updateBook(req, res) {
  try {
    const validationErrors = validateUpdateBook(req.body);
    if (validationErrors.length > 0) {
      return res.status(400).json({ success: false, error: validationErrors.join(". ") });
    }

    const book = await bookService.updateBook(req.params.id, req.body);

    if (!book) {
      return res.status(404).json({ success: false, error: "Book not found" });
    }

    return res.json({
      success: true,
      message: "Book updated successfully",
      data:    book,
    });
  } catch (error) {
    console.error("updateBook error:", error);
    return res.status(500).json({ success: false, error: "Failed to update book" });
  }
}

/**
 * DELETE /api/admin/books/:id
 * Delete a book and all its associated records (chapters, bookmarks, etc.)
 * Cascade deletes are handled automatically by Prisma / PostgreSQL.
 */
async function deleteBook(req, res) {
  try {
    const result = await bookService.deleteBook(req.params.id);

    if (!result) {
      return res.status(404).json({ success: false, error: "Book not found" });
    }

    return res.json({
      success: true,
      message: "Book deleted successfully",
    });
  } catch (error) {
    console.error("deleteBook error:", error);
    return res.status(500).json({ success: false, error: "Failed to delete book" });
  }
}

/**
 * POST /api/admin/books/:id/publish
 * Set a book's status to PUBLISHED so it appears in the public API.
 */
async function publishBook(req, res) {
  try {
    const book = await bookService.publishBook(req.params.id);

    if (!book) {
      return res.status(404).json({ success: false, error: "Book not found" });
    }

    return res.json({
      success: true,
      message: "Book published successfully",
      data:    book,
    });
  } catch (error) {
    console.error("publishBook error:", error);
    return res.status(500).json({ success: false, error: "Failed to publish book" });
  }
}

/**
 * POST /api/admin/books/:id/unpublish
 * Set a book's status back to DRAFT so it's hidden from the public API.
 */
async function unpublishBook(req, res) {
  try {
    const book = await bookService.unpublishBook(req.params.id);

    if (!book) {
      return res.status(404).json({ success: false, error: "Book not found" });
    }

    return res.json({
      success: true,
      message: "Book unpublished successfully",
      data:    book,
    });
  } catch (error) {
    console.error("unpublishBook error:", error);
    return res.status(500).json({ success: false, error: "Failed to unpublish book" });
  }
}

async function restoreLocalBooks(req, res) {
  try {
    if (!req.body || !Array.isArray(req.body.books)) {
      return res.status(400).json({ success: false, error: "books array is required" });
    }

    if (req.body.books.length > 500) {
      return res.status(400).json({ success: false, error: "books array cannot exceed 500 items" });
    }

    const result = await bookService.restoreLocalBooks(req.body.books, req.session.user);

    return res.json({
      success: true,
      message: "Local books processed successfully",
      data: result,
    });
  } catch (error) {
    console.error("restoreLocalBooks error:", error);
    return res.status(500).json({ success: false, error: "Failed to restore local books" });
  }
}

module.exports = {
  getBooks,
  getDiscoverBooks,
  getFeaturedBooks,
  getTrendingBooks,
  getRecentBooks,
  getBookById,
  getAdminBooks,
  createBook,
  updateBook,
  deleteBook,
  publishBook,
  unpublishBook,
  restoreLocalBooks,
};
