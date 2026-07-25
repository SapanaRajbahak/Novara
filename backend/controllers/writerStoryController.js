const prisma = require("../prisma/client");
const { evaluateReferralByBookId } = require("../services/referralService");
const { validateCreateBook, validateUpdateBook } = require("../validators/bookValidator");
const {
  validateId,
  validateCreateChapter,
  validateUpdateChapter,
} = require("../validators/chapterValidator");

function parseTags(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

function parseStatus(value) {
  const normalized = String(value || "DRAFT").toUpperCase();
  return normalized === "PUBLISHED" ? "PUBLISHED" : "DRAFT";
}

function parseFileType(bookType) {
  const normalized = String(bookType || "").toUpperCase();
  if (normalized === "EPUB" || normalized === "PDF" || normalized === "TXT") {
    return normalized;
  }
  return null;
}

function getWriterIdentityCandidates(sessionUser) {
  const candidates = [
    sessionUser?.writerProfile?.penName,
    sessionUser?.penName,
    sessionUser?.name,
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean);

  const seen = new Set();
  return candidates.filter((value) => {
    const key = value.toLowerCase();
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function mapStory(book) {
  return {
    id: book.id,
    title: book.title,
    description: book.description,
    genre: book.genre,
    tags: book.tags,
    status: book.status,
    coverUrl: book.coverUrl,
    fileType: book.fileType,
    updatedAt: book.updatedAt,
    createdAt: book.createdAt,
    chapters: book._count?.chapters || 0,
  };
}

function storyMatchesWriterIdentity(story, sessionUser) {
  const storyAuthor = String(story?.authorName || "").trim().toLowerCase();
  if (!storyAuthor) {
    return false;
  }

  return getWriterIdentityCandidates(sessionUser).some((candidate) => candidate.toLowerCase() === storyAuthor);
}

async function findStoryForRole(storyId, sessionUser) {
  const story = await prisma.book.findUnique({
    where: { id: storyId },
    select: {
      id: true,
      title: true,
      slug: true,
      description: true,
      genre: true,
      tags: true,
      status: true,
      coverUrl: true,
      fileType: true,
      authorName: true,
      createdBy: true,
      createdAt: true,
      updatedAt: true,
      _count: {
        select: {
          chapters: true,
        },
      },
    },
  });

  if (!story) {
    return null;
  }

  if (sessionUser.role === "ADMIN") {
    return story;
  }

  if (story.createdBy === String(sessionUser.id)) {
    return story;
  }

  if (storyMatchesWriterIdentity(story, sessionUser)) {
    return story;
  }

  return null;
}

async function listWriterStories(req, res) {
  try {
    const where = req.session.user.role === "ADMIN"
      ? {}
      : (() => {
        const authorNames = getWriterIdentityCandidates(req.session.user);
        if (authorNames.length > 0) {
          return {
            OR: [
              { createdBy: String(req.session.user.id) },
              { authorName: { in: authorNames } },
            ],
          };
        }
        return { createdBy: String(req.session.user.id) };
      })();

    const stories = await prisma.book.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        title: true,
        slug: true,
        description: true,
        genre: true,
        tags: true,
        status: true,
        coverUrl: true,
        fileType: true,
        authorName: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            chapters: true,
          },
        },
      },
    });

    return res.json({
      success: true,
      data: stories.map((story) => ({
        ...mapStory(story),
        reads: (story._count?.readingProgress || 0) + (story._count?.listeningProgress || 0),
        likes: story._count?.bookmarks || 0,
        comments: story._count?.notes || 0,
      })),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: "Failed to list writer stories",
    });
  }
}

async function createWriterStory(req, res) {
  try {
    const title = typeof req.body.title === "string" ? req.body.title.trim() : "";
    const description = typeof req.body.description === "string" ? req.body.description.trim() : "";
    const genre = typeof req.body.genre === "string" ? req.body.genre.trim() : "";
    const tags = parseTags(req.body.tags);
    const status = parseStatus(req.body.status);
    const fileType = parseFileType(req.body.bookType);
    const coverUrl = typeof req.body.coverUrl === "string" ? req.body.coverUrl.trim() : "";

    const authorName =
      req.session.user.writerProfile && req.session.user.writerProfile.penName
        ? req.session.user.writerProfile.penName
        : req.session.user.name;

    const payload = {
      title,
      description,
      genre,
      tags,
      status,
      fileType,
      coverUrl,
      authorName,
    };

    const errors = validateCreateBook(payload);
    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        error: errors.join(". "),
      });
    }

    const slugBase = title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-") || `story-${Date.now()}`;

    let slug = slugBase;
    let slugCounter = 1;
    while (true) {
      const existing = await prisma.book.findUnique({ where: { slug }, select: { id: true } });
      if (!existing) {
        break;
      }
      slugCounter += 1;
      slug = `${slugBase}-${slugCounter}`;
    }

    const story = await prisma.book.create({
      data: {
        title,
        slug,
        description: description || null,
        authorName,
        coverUrl: coverUrl || null,
        genre: genre || null,
        tags,
        fileType,
        status,
        createdBy: req.session.user.id,
      },
      include: {
        _count: {
          select: {
            chapters: true,
          },
        },
      },
    });

    return res.status(201).json({
      success: true,
      message: "Story created successfully",
      data: mapStory(story),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: "Failed to create story",
    });
  }
}

async function getWriterStoryById(req, res) {
  try {
    const storyId = req.params.id || req.params.bookId;
    const idErrors = validateId(storyId, "story id");
    if (idErrors.length > 0) {
      return res.status(400).json({ success: false, error: idErrors.join(". ") });
    }

    const story = await findStoryForRole(storyId, req.session.user);
    if (!story) {
      return res.status(404).json({ success: false, error: "Story not found" });
    }

    return res.json({
      success: true,
      data: {
        ...mapStory(story),
        reads: (story._count?.readingProgress || 0) + (story._count?.listeningProgress || 0),
        likes: story._count?.bookmarks || 0,
        comments: story._count?.notes || 0,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: "Failed to fetch story" });
  }
}

async function updateWriterStory(req, res) {
  try {
    const idErrors = validateId(req.params.id, "story id");
    const body = {
      ...req.body,
      tags: req.body.tags === undefined ? undefined : parseTags(req.body.tags),
      status: req.body.status === undefined ? undefined : parseStatus(req.body.status),
      coverUrl: req.body.coverUrl === undefined ? undefined : String(req.body.coverUrl).trim(),
      genre: req.body.genre === undefined ? undefined : String(req.body.genre).trim(),
      description: req.body.description === undefined ? undefined : String(req.body.description).trim(),
      fileType: req.body.bookType === undefined ? undefined : parseFileType(req.body.bookType),
    };

    const validationErrors = validateUpdateBook(body);
    const errors = [...idErrors, ...validationErrors];

    if (errors.length > 0) {
      return res.status(400).json({ success: false, error: errors.join(". ") });
    }

    const story = await findStoryForRole(req.params.id, req.session.user);
    if (!story) {
      return res.status(404).json({ success: false, error: "Story not found" });
    }

    const updated = await prisma.book.update({
      where: { id: story.id },
      data: {
        title: body.title,
        description: body.description,
        genre: body.genre,
        tags: body.tags,
        coverUrl: body.coverUrl,
        status: body.status,
        fileType: body.fileType,
      },
      include: {
        _count: {
          select: {
            chapters: true,
          },
        },
      },
    });

    return res.json({
      success: true,
      message: "Story updated successfully",
      data: mapStory(updated),
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: "Failed to update story" });
  }
}

async function deleteWriterStory(req, res) {
  try {
    const idErrors = validateId(req.params.id, "story id");
    if (idErrors.length > 0) {
      return res.status(400).json({ success: false, error: idErrors.join(". ") });
    }

    const story = await findStoryForRole(req.params.id, req.session.user);
    if (!story) {
      return res.status(404).json({ success: false, error: "Story not found" });
    }

    await prisma.book.delete({ where: { id: story.id } });

    return res.json({
      success: true,
      message: "Story deleted successfully",
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: "Failed to delete story" });
  }
}

async function publishWriterStory(req, res) {
  try {
    const story = await findStoryForRole(req.params.id, req.session.user);
    if (!story) {
      return res.status(404).json({ success: false, error: "Story not found" });
    }

    const updated = await prisma.book.update({
      where: { id: story.id },
      data: { status: "PUBLISHED" },
      include: {
        _count: {
          select: {
            chapters: true,
          },
        },
      },
    });

    await evaluateReferralByBookId(updated.id);

    return res.json({
      success: true,
      message: "Story published successfully",
      data: mapStory(updated),
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: "Failed to publish story" });
  }
}

async function unpublishWriterStory(req, res) {
  try {
    const story = await findStoryForRole(req.params.id, req.session.user);
    if (!story) {
      return res.status(404).json({ success: false, error: "Story not found" });
    }

    const updated = await prisma.book.update({
      where: { id: story.id },
      data: { status: "DRAFT" },
      include: {
        _count: {
          select: {
            chapters: true,
          },
        },
      },
    });

    return res.json({
      success: true,
      message: "Story moved to draft",
      data: mapStory(updated),
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: "Failed to unpublish story" });
  }
}

async function listWriterStoryChapters(req, res) {
  try {
    const storyId = req.params.id || req.params.bookId;
    const story = await findStoryForRole(storyId, req.session.user);
    if (!story) {
      return res.status(404).json({ success: false, error: "Story not found" });
    }

    const chapters = await prisma.chapter.findMany({
      where: { bookId: story.id },
      orderBy: { chapterNumber: "asc" },
    });

    return res.json({ success: true, data: chapters });
  } catch (error) {
    console.error("[listWriterStoryChapters] error:", error);
    return res.status(500).json({ success: false, error: "Failed to fetch chapters" });
  }
}

async function createWriterStoryChapter(req, res) {
  try {
    const storyId = req.params.id || req.params.bookId;
    const story = await findStoryForRole(storyId, req.session.user);
    if (!story) {
      return res.status(404).json({ success: false, error: "Story not found" });
    }

    const bodyErrors = validateCreateChapter(req.body);
    if (bodyErrors.length > 0) {
      return res.status(400).json({ success: false, error: bodyErrors.join(". ") });
    }

    const chapter = await prisma.chapter.create({
      data: {
        bookId: story.id,
        chapterNumber: Number(req.body.chapterNumber),
        title: String(req.body.title).trim(),
        content: String(req.body.content),
        isPublished: Boolean(req.body.isPublished),
      },
    });

    if (chapter.isPublished) {
      await evaluateReferralByBookId(chapter.bookId);
    }

    return res.status(201).json({
      success: true,
      message: "Chapter created successfully",
      data: chapter,
    });
  } catch (error) {
    console.error("[createWriterStoryChapter] error:", error);
    if (error.code === "P2002") {
      return res.status(409).json({
        success: false,
        error: "chapterNumber already exists for this story",
      });
    }

    return res.status(500).json({ success: false, error: "Failed to create chapter" });
  }
}

async function getWriterStoryChapterById(req, res) {
  try {
    const idErrors = validateId(req.params.chapterId, "chapter id");
    if (idErrors.length > 0) {
      return res.status(400).json({ success: false, error: idErrors.join(". ") });
    }

    const chapter = await prisma.chapter.findUnique({
      where: { id: req.params.chapterId },
      include: {
        book: {
          include: {
            _count: {
              select: {
                chapters: true,
              },
            },
          },
        },
      },
    });

    if (!chapter) {
      return res.status(404).json({ success: false, error: "Chapter not found" });
    }

    if (
      req.session.user.role !== "ADMIN" &&
      chapter.book.createdBy !== String(req.session.user.id)
    ) {
      return res.status(403).json({ success: false, error: "Access denied" });
    }

    return res.json({
      success: true,
      data: {
        ...chapter,
        book: mapStory(chapter.book),
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: "Failed to fetch chapter" });
  }
}

async function updateWriterStoryChapter(req, res) {
  try {
    const idErrors = validateId(req.params.chapterId, "chapter id");
    const bodyErrors = validateUpdateChapter(req.body);
    const errors = [...idErrors, ...bodyErrors];

    if (errors.length > 0) {
      return res.status(400).json({ success: false, error: errors.join(". ") });
    }

    const chapter = await prisma.chapter.findUnique({
      where: { id: req.params.chapterId },
      include: { book: true },
    });

    if (!chapter) {
      return res.status(404).json({ success: false, error: "Chapter not found" });
    }

    if (
      req.session.user.role !== "ADMIN" &&
      chapter.book.createdBy !== String(req.session.user.id)
    ) {
      return res.status(403).json({ success: false, error: "Access denied" });
    }

    const requestedChapterNumber =
      req.body.chapterNumber === undefined ? chapter.chapterNumber : Number(req.body.chapterNumber);
    const title =
      req.body.title === undefined ? chapter.title : String(req.body.title).trim();
    const content =
      req.body.content === undefined ? chapter.content : String(req.body.content);
    const isPublished =
      req.body.isPublished === undefined ? chapter.isPublished : Boolean(req.body.isPublished);

    const storyChapters = await prisma.chapter.findMany({
      where: { bookId: chapter.bookId },
      select: { id: true, chapterNumber: true },
      orderBy: { chapterNumber: "asc" },
    });

    const maxChapterNumber = storyChapters.length;
    if (requestedChapterNumber < 1 || requestedChapterNumber > maxChapterNumber) {
      return res.status(400).json({
        success: false,
        error: `chapterNumber must be between 1 and ${maxChapterNumber}`,
      });
    }

    let updated;

    if (requestedChapterNumber !== chapter.chapterNumber) {
      const reorderedIds = storyChapters
        .filter((item) => item.id !== chapter.id)
        .map((item) => item.id);

      reorderedIds.splice(requestedChapterNumber - 1, 0, chapter.id);

      await prisma.$transaction(async (tx) => {
        for (let index = 0; index < reorderedIds.length; index += 1) {
          await tx.chapter.update({
            where: { id: reorderedIds[index] },
            data: { chapterNumber: 1000 + index },
          });
        }

        for (let index = 0; index < reorderedIds.length; index += 1) {
          const data = { chapterNumber: index + 1 };
          if (reorderedIds[index] === chapter.id) {
            data.title = title;
            data.content = content;
            data.isPublished = isPublished;
          }

          await tx.chapter.update({
            where: { id: reorderedIds[index] },
            data,
          });
        }
      });

      updated = await prisma.chapter.findUnique({
        where: { id: chapter.id },
      });
    } else {
      updated = await prisma.chapter.update({
        where: { id: chapter.id },
        data: {
          title,
          content,
          isPublished,
        },
      });
    }

    if (updated.isPublished) {
      await evaluateReferralByBookId(updated.bookId);
    }

    return res.json({
      success: true,
      message: "Chapter updated successfully",
      data: updated,
    });
  } catch (error) {
    if (error.code === "P2002") {
      return res.status(409).json({
        success: false,
        error: "chapterNumber already exists for this story",
      });
    }

    return res.status(500).json({ success: false, error: "Failed to update chapter" });
  }
}

async function deleteWriterStoryChapter(req, res) {
  try {
    const idErrors = validateId(req.params.chapterId, "chapter id");
    if (idErrors.length > 0) {
      return res.status(400).json({ success: false, error: idErrors.join(". ") });
    }

    const chapter = await prisma.chapter.findUnique({
      where: { id: req.params.chapterId },
      include: { book: true },
    });

    if (!chapter) {
      return res.status(404).json({ success: false, error: "Chapter not found" });
    }

    if (
      req.session.user.role !== "ADMIN" &&
      chapter.book.createdBy !== String(req.session.user.id)
    ) {
      return res.status(403).json({ success: false, error: "Access denied" });
    }

    await prisma.chapter.delete({ where: { id: chapter.id } });

    return res.json({
      success: true,
      message: "Chapter deleted successfully",
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: "Failed to delete chapter" });
  }
}

async function reorderWriterStoryChapters(req, res) {
  try {
    const story = await findStoryForRole(req.params.bookId, req.session.user);
    if (!story) {
      return res.status(404).json({ success: false, error: "Story not found" });
    }

    const chapterOrder = Array.isArray(req.body.chapterOrder) ? req.body.chapterOrder : [];
    if (!chapterOrder.length) {
      return res.status(400).json({ success: false, error: "chapterOrder is required" });
    }

    const uniqueIds = [...new Set(chapterOrder.map((value) => String(value || "").trim()).filter(Boolean))];
    if (uniqueIds.length !== chapterOrder.length) {
      return res.status(400).json({ success: false, error: "chapterOrder contains duplicate chapter ids" });
    }

    const chapters = await prisma.chapter.findMany({
      where: { bookId: story.id },
      select: { id: true, chapterNumber: true },
      orderBy: { chapterNumber: "asc" },
    });

    if (chapters.length !== uniqueIds.length) {
      return res.status(400).json({ success: false, error: "chapterOrder must include all chapters for this story" });
    }

    const currentIds = chapters.map((chapter) => chapter.id).sort();
    const requestedIds = uniqueIds.slice().sort();
    if (currentIds.join(",") !== requestedIds.join(",")) {
      return res.status(400).json({ success: false, error: "chapterOrder contains chapters outside this story" });
    }

    await prisma.$transaction(async (tx) => {
      for (let index = 0; index < uniqueIds.length; index += 1) {
        await tx.chapter.update({
          where: { id: uniqueIds[index] },
          data: { chapterNumber: 1000 + index },
        });
      }

      for (let index = 0; index < uniqueIds.length; index += 1) {
        await tx.chapter.update({
          where: { id: uniqueIds[index] },
          data: { chapterNumber: index + 1 },
        });
      }
    });

    const ordered = await prisma.chapter.findMany({
      where: { bookId: story.id },
      orderBy: { chapterNumber: "asc" },
    });

    return res.json({
      success: true,
      message: "Chapters reordered successfully",
      data: ordered,
    });
  } catch (error) {
    if (error.code === "P2002") {
      return res.status(409).json({
        success: false,
        error: "Unable to reorder chapters due to a numbering conflict",
      });
    }
    return res.status(500).json({ success: false, error: "Failed to reorder chapters" });
  }
}

async function getWriterStoryAnalytics(req, res) {
  try {
    const story = await findStoryForRole(req.params.id, req.session.user);
    if (!story) {
      return res.status(404).json({ success: false, error: "Story not found" });
    }

    const [readingRows, listeningRows, notesCount, bookmarksCount, chapterCount] = await Promise.all([
      prisma.readingProgress.findMany({
        where: { bookId: story.id },
        select: {
          progressPercent: true,
          updatedAt: true,
        },
      }),
      prisma.listeningProgress.findMany({
        where: { bookId: story.id },
        select: {
          updatedAt: true,
        },
      }),
      prisma.note.count({ where: { bookId: story.id } }),
      prisma.bookmark.count({ where: { bookId: story.id } }),
      prisma.chapter.count({ where: { bookId: story.id } }),
    ]);

    const totalReads = readingRows.length + listeningRows.length;
    const completionRate = readingRows.length
      ? Math.round(
        readingRows.reduce((sum, row) => sum + Number(row.progressPercent || 0), 0) /
        readingRows.length
      )
      : 0;

    return res.json({
      success: true,
      data: {
        storyId: story.id,
        reads: totalReads,
        likes: bookmarksCount,
        comments: notesCount,
        chapters: chapterCount,
        completionRate,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: "Failed to fetch story analytics" });
  }
}

module.exports = {
  listWriterStories,
  createWriterStory,
  getWriterStoryById,
  updateWriterStory,
  deleteWriterStory,
  publishWriterStory,
  unpublishWriterStory,
  listWriterStoryChapters,
  createWriterStoryChapter,
  getWriterStoryChapterById,
  updateWriterStoryChapter,
  deleteWriterStoryChapter,
  reorderWriterStoryChapters,
  getWriterStoryAnalytics,
};
