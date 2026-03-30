const prisma = require("../prisma/client");

function toIso(value) {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.toISOString();
}

function toDisplayStatus(status) {
  if (String(status).toUpperCase() === "PUBLISHED") {
    return "Published";
  }
  return "Draft";
}

async function getAdminStats(req, res) {
  try {
    const [
      totalBooks,
      totalChapters,
      totalUsers,
      drafts,
      publishedBooks,
      totalAudiobooks,
    ] = await Promise.all([
      prisma.book.count(),
      prisma.chapter.count(),
      prisma.user.count(),
      prisma.book.count({ where: { status: "DRAFT" } }),
      prisma.book.count({ where: { status: "PUBLISHED" } }),
      prisma.book.count({
        where: {
          OR: [
            { isAudiobookAvailable: true },
            { audioTracks: { some: {} } },
          ],
        },
      }),
    ]);

    return res.json({
      success: true,
      data: {
        totalBooks,
        totalChapters,
        totalAudiobooks,
        totalUsers,
        drafts,
        publishedBooks,
      },
    });
  } catch (error) {
    console.error("getAdminStats error:", error);
    return res.status(500).json({
      success: false,
      error: "Unable to fetch admin stats",
    });
  }
}

async function getRecentUploads(req, res) {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 12, 1), 30);

    const [books, chapters, audioTracks] = await Promise.all([
      prisma.book.findMany({
        orderBy: { createdAt: "desc" },
        take: limit,
        select: {
          id: true,
          title: true,
          authorName: true,
          status: true,
          createdAt: true,
        },
      }),
      prisma.chapter.findMany({
        orderBy: { createdAt: "desc" },
        take: limit,
        select: {
          id: true,
          title: true,
          isPublished: true,
          createdAt: true,
          book: {
            select: {
              title: true,
              authorName: true,
              status: true,
            },
          },
        },
      }),
      prisma.audioTrack.findMany({
        orderBy: { createdAt: "desc" },
        take: limit,
        select: {
          id: true,
          title: true,
          createdAt: true,
          book: {
            select: {
              authorName: true,
              status: true,
            },
          },
        },
      }),
    ]);

    const normalizedRows = [
      ...books.map((book) => ({
        id: `book:${book.id}`,
        title: book.title,
        type: "Book",
        author: book.authorName || "Unknown",
        status: toDisplayStatus(book.status),
        uploadedAt: toIso(book.createdAt),
      })),
      ...chapters.map((chapter) => ({
        id: `chapter:${chapter.id}`,
        title: chapter.title || chapter.book.title,
        type: "Chapter",
        author: chapter.book.authorName || "Unknown",
        status: chapter.isPublished ? "Published" : "Draft",
        uploadedAt: toIso(chapter.createdAt),
      })),
      ...audioTracks.map((track) => ({
        id: `audio:${track.id}`,
        title: track.title,
        type: "Audiobook",
        author: track.book.authorName || "Unknown",
        status: toDisplayStatus(track.book.status),
        uploadedAt: toIso(track.createdAt),
      })),
    ]
      .filter((row) => row.uploadedAt)
      .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime())
      .slice(0, limit);

    return res.json({
      success: true,
      data: normalizedRows,
    });
  } catch (error) {
    console.error("getRecentUploads error:", error);
    return res.status(500).json({
      success: false,
      error: "Unable to fetch recent uploads",
    });
  }
}

async function getRecentAiContent(req, res) {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 6, 1), 20);

    const logs = await prisma.aIGenerationLog.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        type: true,
        output: true,
        createdAt: true,
        admin: {
          select: {
            name: true,
          },
        },
      },
    });

    const items = logs.map((log) => ({
      id: log.id,
      title: log.output && String(log.output).trim() ? String(log.output).slice(0, 120) : String(log.type).replace(/_/g, " "),
      type: String(log.type).replace(/_/g, " "),
      createdAt: toIso(log.createdAt),
      createdBy: log.admin && log.admin.name ? log.admin.name : "Admin",
    }));

    return res.json({
      success: true,
      data: items,
    });
  } catch (error) {
    console.error("getRecentAiContent error:", error);
    return res.status(500).json({
      success: false,
      error: "Unable to fetch AI generation history",
    });
  }
}

module.exports = {
  getAdminStats,
  getRecentUploads,
  getRecentAiContent,
};
