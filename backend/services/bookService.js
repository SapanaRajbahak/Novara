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
    select: { id: true, name: true, penName: true },
  },
  // Full category object when the book has one
  category: true,
  // Chapter and audio track counts for display in the UI
  _count: {
    select: {
      chapters: true,
      audioTracks: true,
      bookmarks: true,
      readingProgress: true,
      listeningProgress: true,
    },
  },
};

function buildPublishedWhere(filters = {}) {
  const where = { status: "PUBLISHED" };

  if (filters.genre) {
    where.genre = { equals: filters.genre, mode: "insensitive" };
  }

  if (filters.search) {
    where.OR = [
      { title: { contains: filters.search, mode: "insensitive" } },
      { authorName: { contains: filters.search, mode: "insensitive" } },
      { description: { contains: filters.search, mode: "insensitive" } },
      { tags: { hasSome: [filters.search] } },
    ];
  }

  return where;
}

function normalizeLimit(limit, fallback = 6, max = 24) {
  const parsed = Number(limit);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return fallback;
  }
  return Math.min(parsed, max);
}

function getBookType(book) {
  const hasAudio = Boolean(book.isAudiobookAvailable || (book._count && book._count.audioTracks > 0));
  const hasText = Boolean(book.fileUrl);

  if (hasText && hasAudio) {
    return "both";
  }
  if (hasAudio) {
    return "audiobook";
  }
  return "ebook";
}

function getDisplayAuthor(book) {
  if (typeof book.authorName === "string" && book.authorName.trim()) {
    return book.authorName.trim();
  }
  if (book.createdByUser && typeof book.createdByUser.penName === "string" && book.createdByUser.penName.trim()) {
    return book.createdByUser.penName.trim();
  }
  if (book.createdByUser && typeof book.createdByUser.name === "string" && book.createdByUser.name.trim()) {
    return book.createdByUser.name.trim();
  }
  return "Unknown Author";
}

function mapDiscoverBook(book) {
  const reads = (book._count && book._count.readingProgress ? book._count.readingProgress : 0)
    + (book._count && book._count.listeningProgress ? book._count.listeningProgress : 0);
  const likes = book._count && book._count.bookmarks ? book._count.bookmarks : 0;

  return {
    id: book.id,
    slug: book.slug,
    title: book.title,
    authorName: getDisplayAuthor(book),
    creatorName: book.createdByUser && book.createdByUser.name ? book.createdByUser.name : null,
    description: book.description || null,
    coverUrl: book.coverUrl || null,
    genre: book.genre || (book.category && book.category.name ? book.category.name : null),
    category: book.category ? { id: book.category.id, name: book.category.name, slug: book.category.slug } : null,
    tags: Array.isArray(book.tags) ? book.tags : [],
    status: book.status,
    fileType: book.fileType || null,
    type: getBookType(book),
    hasAudiobook: Boolean(book.isAudiobookAvailable || (book._count && book._count.audioTracks > 0)),
    chapterCount: book._count && typeof book._count.chapters === "number" ? book._count.chapters : 0,
    audioTrackCount: book._count && typeof book._count.audioTracks === "number" ? book._count.audioTracks : 0,
    reads,
    likes,
    popularity: reads + likes,
    createdAt: book.createdAt,
    updatedAt: book.updatedAt,
  };
}

function sortDiscoverBooks(books, sort = "newest") {
  const sorted = [...books];

  if (sort === "title_asc") {
    sorted.sort((a, b) => String(a.title || "").localeCompare(String(b.title || "")));
    return sorted;
  }

  if (sort === "popular") {
    sorted.sort((a, b) => {
      if (b.popularity !== a.popularity) {
        return b.popularity - a.popularity;
      }
      if (b.reads !== a.reads) {
        return b.reads - a.reads;
      }
      if (b.likes !== a.likes) {
        return b.likes - a.likes;
      }
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
    return sorted;
  }

  sorted.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return sorted;
}

function filterDiscoverBooks(books, filters = {}) {
  return books.filter((book) => {
    if (filters.type && book.type !== filters.type) {
      return false;
    }

    return true;
  });
}

function buildFilterOptions(books) {
  const genres = [...new Set(books.map((book) => book.genre).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const types = [...new Set(books.map((book) => book.type).filter(Boolean))];
  const tagCounts = new Map();

  books.forEach((book) => {
    (book.tags || []).forEach((tag) => {
      const normalized = String(tag || "").trim();
      if (!normalized) {
        return;
      }
      tagCounts.set(normalized, (tagCounts.get(normalized) || 0) + 1);
    });
  });

  const highlightedTags = [...tagCounts.entries()]
    .sort((a, b) => {
      if (b[1] !== a[1]) {
        return b[1] - a[1];
      }
      return a[0].localeCompare(b[0]);
    })
    .slice(0, 10)
    .map(([tag]) => tag);

  return { genres, types, highlightedTags };
}

function pickFeaturedBooks(books, limit = 6) {
  return sortDiscoverBooks(
    books.filter((book) => book.coverUrl && book.description && String(book.description).trim()),
    "popular"
  ).slice(0, limit);
}

function pickTrendingBooks(books, limit = 6) {
  return sortDiscoverBooks(
    books.filter((book) => book.popularity > 0),
    "popular"
  ).slice(0, limit);
}

function pickRecentBooks(books, limit = 6) {
  return sortDiscoverBooks(books, "newest").slice(0, limit);
}

async function getPublishedDiscoverCatalog(filters = {}) {
  const rows = await prisma.book.findMany({
    where: buildPublishedWhere(filters),
    include: BOOK_INCLUDE,
  });

  return rows.map(mapDiscoverBook);
}

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

async function listDiscoverBooks(filters = {}) {
  const page = Math.max(1, Number(filters.page) || 1);
  const limit = normalizeLimit(filters.limit, 24, 200);
  const sort = typeof filters.sort === "string" ? filters.sort : "newest";
  const type = typeof filters.type === "string" ? filters.type : "";
  const search = typeof filters.search === "string" ? filters.search.trim() : "";
  const genre = typeof filters.genre === "string" ? filters.genre.trim() : "";

  const allPublished = await getPublishedDiscoverCatalog();
  const scopedPublished = await getPublishedDiscoverCatalog({ search, genre });
  const filtered = filterDiscoverBooks(scopedPublished, { type });
  const sorted = sortDiscoverBooks(filtered, sort);

  const total = sorted.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * limit;
  const books = sorted.slice(start, start + limit);

  return {
    books,
    sections: {
      featured: pickFeaturedBooks(allPublished, 6),
      trending: pickTrendingBooks(allPublished, 6),
      recent: pickRecentBooks(allPublished, 6),
    },
    filterOptions: buildFilterOptions(allPublished),
    meta: {
      totalPublished: allPublished.length,
      matchingBooks: total,
    },
    pagination: {
      page: safePage,
      limit,
      total,
      totalPages,
    },
  };
}

async function listFeaturedBooks(limit) {
  const catalog = await getPublishedDiscoverCatalog();
  return pickFeaturedBooks(catalog, normalizeLimit(limit, 6, 24));
}

async function listTrendingBooks(limit) {
  const catalog = await getPublishedDiscoverCatalog();
  return pickTrendingBooks(catalog, normalizeLimit(limit, 6, 24));
}

async function listRecentBooks(limit) {
  const catalog = await getPublishedDiscoverCatalog();
  return pickRecentBooks(catalog, normalizeLimit(limit, 6, 24));
}

/**
 * Return a paginated list of all books for admin screens.
 * Includes both DRAFT and PUBLISHED by default, with optional status filter.
 *
 * @param {object} filters - Parsed query params from the request
 */
async function listAdminBooks(filters) {
  const {
    page = 1,
    limit = 10,
    sort = "newest",
    search,
    status,
    genre,
    categoryId,
    fileType,
    isAudiobookAvailable,
    isAiGenerated,
  } = filters;

  const skip = (Number(page) - 1) * Number(limit);
  const take = Number(limit);
  const orderBy = SORT_MAP[sort] || SORT_MAP.newest;

  const where = {};

  if (status) where.status = status;
  if (genre) where.genre = { equals: genre, mode: "insensitive" };
  if (categoryId) where.categoryId = categoryId;
  if (fileType) where.fileType = fileType;

  if (isAudiobookAvailable !== undefined) {
    where.isAudiobookAvailable = isAudiobookAvailable === "true";
  }
  if (isAiGenerated !== undefined) {
    where.isAiGenerated = isAiGenerated === "true";
  }

  if (search) {
    where.OR = [
      { title: { contains: search, mode: "insensitive" } },
      { authorName: { contains: search, mode: "insensitive" } },
      { description: { contains: search, mode: "insensitive" } },
      { tags: { hasSome: [search] } },
    ];
  }

  const [books, total] = await Promise.all([
    prisma.book.findMany({ where, orderBy, skip, take, include: BOOK_INCLUDE }),
    prisma.book.count({ where }),
  ]);

  return {
    books,
    pagination: {
      page: Number(page),
      limit: Number(limit),
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

async function listBooksByAuthor(userId) {
  const books = await prisma.book.findMany({
    where: {
      createdBy: String(userId),
    },
    orderBy: {
      updatedAt: "desc",
    },
    include: BOOK_INCLUDE,
  });

  return books;
}

async function restoreLocalBooks(books, currentUser) {
  const summary = {
    total: Array.isArray(books) ? books.length : 0,
    created: 0,
    skipped: 0,
  };

  if (!Array.isArray(books) || books.length === 0) {
    return summary;
  }

  const allowedStatuses = new Set(["DRAFT", "PUBLISHED"]);

  for (const item of books) {
    const title = typeof item.title === "string" ? item.title.trim() : "";
    const authorName = typeof (item.authorName || item.author) === "string"
      ? String(item.authorName || item.author).trim()
      : "";

    if (!title || !authorName) {
      summary.skipped += 1;
      continue;
    }

    const baseSlug = buildSlug(typeof item.slug === "string" && item.slug.trim() ? item.slug : title);
    if (!baseSlug) {
      summary.skipped += 1;
      continue;
    }

    const existing = await prisma.book.findUnique({ where: { slug: baseSlug }, select: { id: true } });
    if (existing) {
      summary.skipped += 1;
      continue;
    }

    const slug = await uniqueSlug(baseSlug);
    const status = typeof item.status === "string" ? item.status.toUpperCase() : "PUBLISHED";

    await prisma.book.create({
      data: {
        title,
        slug,
        description: typeof item.description === "string" ? item.description : null,
        authorName,
        coverUrl: typeof item.coverUrl === "string" ? item.coverUrl : null,
        genre: typeof item.genre === "string" ? item.genre : null,
        tags: Array.isArray(item.tags)
          ? item.tags.filter((tag) => typeof tag === "string" && tag.trim()).map((tag) => tag.trim())
          : [],
        fileUrl: typeof item.fileUrl === "string" ? item.fileUrl : null,
        fileType: ["EPUB", "PDF", "TXT"].includes(item.fileType) ? item.fileType : null,
        isAudiobookAvailable: Boolean(item.isAudiobookAvailable),
        isAiGenerated: Boolean(item.isAiGenerated),
        status: allowedStatuses.has(status) ? status : "PUBLISHED",
        categoryId: typeof item.categoryId === "string" ? item.categoryId : null,
        createdBy: currentUser.id,
      },
    });

    summary.created += 1;
  }

  return summary;
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
  listDiscoverBooks,
  listFeaturedBooks,
  listTrendingBooks,
  listRecentBooks,
  listAdminBooks,
  listBooksByAuthor,
  restoreLocalBooks,
  getBookById,
  createBook,
  updateBook,
  deleteBook,
  publishBook,
  unpublishBook,
};
