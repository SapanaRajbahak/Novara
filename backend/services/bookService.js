/**
 * Book service layer.
 * All Prisma database logic lives here.
 * Controllers call these functions and never touch Prisma directly.
 */
const prisma = require("../prisma/client");

// ─── Slug helpers ─────────────────────────────────────────────────────────────

/**
 * Convert a title into a URL-safe slug.
 * Example: "My Great Book!" → "my-great-book"
 */
function buildSlug(title) {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "") // remove special characters
    .replace(/\s+/g, "-")          // spaces → hyphens
    .replace(/-+/g, "-")           // collapse multiple hyphens
    .replace(/^-|-$/g, "");        // strip leading/trailing hyphens
}

/**
 * Guarantee a slug is unique in the database.
 * If the base slug is already taken, appends "-2", "-3", etc.
 *
 * @param {string} base      - The base slug to start from
 * @param {string} excludeId - Skip this book id when checking (used on update)
 */
async function uniqueSlug(base, excludeId = null) {
  let candidate = base;
  let counter = 1;

  // Keep trying until we find a free slug
  while (true) {
    const existing = await prisma.book.findUnique({ where: { slug: candidate } });

    // No conflict found, or the conflict belongs to the book we're updating
    if (!existing || existing.id === excludeId) {
      return candidate;
    }

    counter += 1;
    candidate = `${base}-${counter}`;
  }
}

// ─── Sort map ─────────────────────────────────────────────────────────────────

/** Maps the friendly sort param value to a Prisma orderBy object */
const SORT_MAP = {
  newest:     { createdAt: "desc" },
  oldest:     { createdAt: "asc" },
  title_asc:  { title: "asc" },
  title_desc: { title: "desc" },
};

// ─── Shared include shape ─────────────────────────────────────────────────────

/**
 * Fields to include when returning a book object.
 * Using _count instead of loading full relation arrays keeps the response small.
 */
const BOOK_INCLUDE = {
  // Only expose safe creator fields — never the password hash
  createdByUser: {
    select: { id: true, name: true },
  },
  // Full category object when the book has one
  category: true,
  // Chapter and audio track counts for display in the UI
  _count: {
    select: { chapters: true, audioTracks: true },
  },
};

// ─── Service functions ────────────────────────────────────────────────────────

/**
 * Return a paginated list of published books.
 * Supports filtering, full-text-style search, and sorting.
 *
 * @param {object} filters - Parsed query params from the request
 */
async function listBooks(filters) {
  const {
    page  = 1,
    limit = 10,
    sort  = "newest",
    search,
    genre,
    categoryId,
    fileType,
    isAudiobookAvailable,
    isAiGenerated,
  } = filters;

  const skip    = (Number(page) - 1) * Number(limit);
  const take    = Number(limit);
  const orderBy = SORT_MAP[sort] || SORT_MAP.newest;

  // Start with the base where clause — public route always shows published only
  const where = { status: "PUBLISHED" };

  // Exact-match filters (all optional)
  if (genre)      where.genre      = { equals: genre, mode: "insensitive" };
  if (categoryId) where.categoryId = categoryId;
  if (fileType)   where.fileType   = fileType;

  if (isAudiobookAvailable !== undefined) {
    where.isAudiobookAvailable = isAudiobookAvailable === "true";
  }
  if (isAiGenerated !== undefined) {
    where.isAiGenerated = isAiGenerated === "true";
  }

  // Search across text fields and exact tag matches when a search term is given
  if (search) {
    where.OR = [
      { title:       { contains: search, mode: "insensitive" } },
      { authorName:  { contains: search, mode: "insensitive" } },
      { description: { contains: search, mode: "insensitive" } },
      // hasSome checks whether the tags array contains the search term exactly
      { tags: { hasSome: [search] } },
    ];
  }

  // Run the data query and the count query in parallel for performance
  const [books, total] = await Promise.all([
    prisma.book.findMany({ where, orderBy, skip, take, include: BOOK_INCLUDE }),
    prisma.book.count({ where }),
  ]);

  return {
    books,
    pagination: {
      page:       Number(page),
      limit:      Number(limit),
      total,
      totalPages: Math.ceil(total / take),
    },
  };
}

/**
 * Return a single published book by its id OR slug.
 * Returns null when the book doesn't exist or isn't published.
 *
 * @param {string} idOrSlug - The :id URL param (can be a cuid or a slug string)
 */
async function getBookById(idOrSlug) {
  const book = await prisma.book.findFirst({
    where: {
      AND: [
        { status: "PUBLISHED" },
        {
          // Accept either format from the same URL param
          OR: [{ id: idOrSlug }, { slug: idOrSlug }],
        },
      ],
    },
    include: BOOK_INCLUDE,
  });

  return book; // null when not found
}

/**
 * Create a new book in the database.
 * Auto-generates a unique slug from the title when one isn't provided.
 *
 * @param {object} data        - Validated request body
 * @param {object} currentUser - Logged-in admin from req.session.user
 */
async function createBook(data, currentUser) {
  // Build and de-duplicate the slug
  const baseSlug = data.slug ? buildSlug(data.slug) : buildSlug(data.title);
  const slug     = await uniqueSlug(baseSlug);

  const book = await prisma.book.create({
    data: {
      title:                data.title.trim(),
      slug,
      description:          data.description          || null,
      authorName:           data.authorName.trim(),
      coverUrl:             data.coverUrl             || null,
      genre:                data.genre                || null,
      tags:                 data.tags                 || [],
      fileUrl:              data.fileUrl              || null,
      fileType:             data.fileType             || null,
      isAudiobookAvailable: data.isAudiobookAvailable ?? false,
      isAiGenerated:        data.isAiGenerated        ?? false,
      status:               data.status               || "DRAFT",
      categoryId:           data.categoryId           || null,
      // Link to the admin who created the book
      createdBy:            currentUser.id,
    },
    include: BOOK_INCLUDE,
  });

  return book;
}

/**
 * Update an existing book.
 * Only updates the fields that are actually present in the request body.
 * Returns null when the book doesn't exist.
 *
 * @param {string} id   - Book id
 * @param {object} data - Validated partial request body
 */
async function updateBook(id, data) {
  const existing = await prisma.book.findUnique({ where: { id } });
  if (!existing) return null;

  // If the caller sent a new slug, ensure it's unique (skip the current book)
  let slug;
  if (data.slug) {
    slug = await uniqueSlug(buildSlug(data.slug), id);
  }

  // Build the update payload — only include keys that were actually provided
  const updateData = {};
  if (data.title               !== undefined) updateData.title               = data.title.trim();
  if (slug                     !== undefined) updateData.slug                = slug;
  if (data.description         !== undefined) updateData.description         = data.description;
  if (data.authorName          !== undefined) updateData.authorName          = data.authorName.trim();
  if (data.coverUrl            !== undefined) updateData.coverUrl            = data.coverUrl;
  if (data.genre               !== undefined) updateData.genre               = data.genre;
  if (data.tags                !== undefined) updateData.tags                = data.tags;
  if (data.fileUrl             !== undefined) updateData.fileUrl             = data.fileUrl;
  if (data.fileType            !== undefined) updateData.fileType            = data.fileType;
  if (data.isAudiobookAvailable !== undefined) updateData.isAudiobookAvailable = data.isAudiobookAvailable;
  if (data.isAiGenerated       !== undefined) updateData.isAiGenerated       = data.isAiGenerated;
  if (data.status              !== undefined) updateData.status              = data.status;
  if (data.categoryId          !== undefined) updateData.categoryId          = data.categoryId;

  const book = await prisma.book.update({
    where: { id },
    data: updateData,
    include: BOOK_INCLUDE,
  });

  return book;
}

/**
 * Delete a book by id.
 * The Prisma schema uses onDelete: Cascade on all Book relations, so
 * chapters, bookmarks, highlights, notes, and progress records are all
 * removed automatically in the same database transaction.
 * Returns null when the book doesn't exist.
 *
 * @param {string} id - Book id
 */
async function deleteBook(id) {
  const existing = await prisma.book.findUnique({ where: { id } });
  if (!existing) return null;

  await prisma.book.delete({ where: { id } });
  return true;
}

/**
 * Set a book's status to PUBLISHED.
 * Returns null when the book doesn't exist.
 *
 * @param {string} id - Book id
 */
async function publishBook(id) {
  const existing = await prisma.book.findUnique({ where: { id } });
  if (!existing) return null;

  return prisma.book.update({
    where: { id },
    data:  { status: "PUBLISHED" },
    include: BOOK_INCLUDE,
  });
}

/**
 * Set a book's status back to DRAFT (unpublish).
 * Returns null when the book doesn't exist.
 *
 * @param {string} id - Book id
 */
async function unpublishBook(id) {
  const existing = await prisma.book.findUnique({ where: { id } });
  if (!existing) return null;

  return prisma.book.update({
    where: { id },
    data:  { status: "DRAFT" },
    include: BOOK_INCLUDE,
  });
}

module.exports = {
  listBooks,
  getBookById,
  createBook,
  updateBook,
  deleteBook,
  publishBook,
  unpublishBook,
};
