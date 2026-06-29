const prisma = require("../prisma/client");

const MAX_PREFERRED_GENRES = 8;

function buildSessionUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    avatarUrl: user.avatarUrl || "",
    role: user.role,
    isWriter: Boolean(user.isWriter),
    isSubscribed: Boolean(user.isSubscribed),
    subscriptionPlan: user.subscriptionPlan || "",
    subscriptionStatus: user.subscriptionStatus || "",
    writerProfile: {
      penName: user.penName || "",
      bio: user.bio || "",
      preferredGenres: Array.isArray(user.preferredGenres) ? user.preferredGenres : [],
    },
  };
}

function normalizePreferredGenres(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item || "").trim())
      .filter(Boolean)
      .slice(0, MAX_PREFERRED_GENRES);
  }

  if (typeof value !== "string") {
    return [];
  }

  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, MAX_PREFERRED_GENRES);
}

function buildRoles(user) {
  if (user.role === "ADMIN") {
    return ["admin"];
  }

  const roles = ["reader"];
  if (user.isWriter) {
    roles.push("writer");
  }
  return roles;
}

function formatRelativeDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Recently";
  }

  const diffMs = Date.now() - date.getTime();
  const minutes = Math.max(1, Math.round(diffMs / 60000));
  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }

  const days = Math.round(hours / 24);
  if (days < 7) {
    return `${days}d ago`;
  }

  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function getFavoriteGenre(genres) {
  const counts = new Map();
  genres.filter(Boolean).forEach((genre) => {
    counts.set(genre, (counts.get(genre) || 0) + 1);
  });

  const top = [...counts.entries()].sort((a, b) => {
    if (b[1] !== a[1]) {
      return b[1] - a[1];
    }
    return a[0].localeCompare(b[0]);
  })[0];

  return top ? top[0] : null;
}

function buildTrackTotals(listeningRows) {
  const totals = new Map();

  listeningRows.forEach((row) => {
    if (totals.has(row.bookId)) {
      return;
    }

    const sortedTracks = Array.isArray(row.book.audioTracks)
      ? [...row.book.audioTracks].sort((a, b) => a.order - b.order)
      : [];

    let totalDuration = 0;
    const prefixByOrder = new Map();
    sortedTracks.forEach((track) => {
      prefixByOrder.set(track.order, totalDuration);
      totalDuration += typeof track.duration === "number" && track.duration > 0 ? track.duration : 0;
    });

    totals.set(row.bookId, { totalDuration, prefixByOrder });
  });

  return totals;
}

function computeListeningPercent(row, trackTotals) {
  const totals = trackTotals.get(row.bookId);
  if (!totals || !totals.totalDuration || !totals.prefixByOrder.has(row.audioTrack.order)) {
    return null;
  }

  const currentDuration = typeof row.audioTrack.duration === "number" && row.audioTrack.duration > 0
    ? row.audioTrack.duration
    : Math.max(Number(row.currentTimeSeconds) || 0, 0);
  const previousDuration = totals.prefixByOrder.get(row.audioTrack.order) || 0;
  const listenedSeconds = previousDuration + Math.min(Math.max(Number(row.currentTimeSeconds) || 0, 0), currentDuration);

  return Math.max(0, Math.min(100, Math.round((listenedSeconds / totals.totalDuration) * 100)));
}

function buildProfilePayload(user) {
  return {
    id: user.id,
    fullName: user.name,
    email: user.email,
    avatarUrl: user.avatarUrl || null,
    bio: user.bio || "",
    penName: user.isWriter ? (user.penName || "") : "",
    roles: buildRoles(user),
    isWriter: Boolean(user.isWriter),
    isAdmin: user.role === "ADMIN",
    joinedAt: user.createdAt,
    updatedAt: user.updatedAt,
    preferences: {
      preferredGenres: Array.isArray(user.preferredGenres) ? user.preferredGenres : [],
    },
    capabilities: {
      canEditProfile: true,
      canEditPenName: Boolean(user.isWriter && user.role !== "ADMIN"),
      supportsPreferences: true,
      supportsAvatarUpload: true,
    },
  };
}

async function getFreshUser(userId) {
  return prisma.user.findUnique({
    where: { id: String(userId) },
    select: {
      id: true,
      name: true,
      email: true,
      avatarUrl: true,
      role: true,
      isWriter: true,
      penName: true,
      bio: true,
      preferredGenres: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

async function getProfile(req, res) {
  try {
    const user = await getFreshUser(req.session.user.id);
    if (!user) {
      return res.status(404).json({ success: false, error: "Profile not found" });
    }

    return res.json({
      success: true,
      data: buildProfilePayload(user),
    });
  } catch (error) {
    console.error("getProfile error:", error);
    return res.status(500).json({ success: false, error: "Unable to fetch profile" });
  }
}

async function patchProfile(req, res) {
  try {
    const existing = await getFreshUser(req.session.user.id);
    if (!existing) {
      return res.status(404).json({ success: false, error: "Profile not found" });
    }

    const updateData = {};

    if (req.body.name !== undefined) {
      if (typeof req.body.name !== "string" || !req.body.name.trim()) {
        return res.status(400).json({ success: false, error: "Display name must be a non-empty string" });
      }
      updateData.name = req.body.name.trim();
    }

    if (req.body.bio !== undefined) {
      if (typeof req.body.bio !== "string") {
        return res.status(400).json({ success: false, error: "Bio must be a string" });
      }
      updateData.bio = req.body.bio.trim() || null;
    }

    if (req.body.preferredGenres !== undefined) {
      updateData.preferredGenres = normalizePreferredGenres(req.body.preferredGenres);
    }

    if (req.body.penName !== undefined && existing.isWriter && existing.role !== "ADMIN") {
      if (typeof req.body.penName !== "string") {
        return res.status(400).json({ success: false, error: "Pen name must be a string" });
      }
      const newPenName = req.body.penName.trim() || null;
      updateData.penName = newPenName;

      // Update authorName on all books created by this user when pen name changes
      if (newPenName && newPenName !== existing.penName) {
        await prisma.book.updateMany({
          where: { createdBy: String(req.session.user.id) },
          data: { authorName: newPenName },
        });
      }
    }

    if (req.body.avatarUrl !== undefined) {
      if (req.body.avatarUrl === null || req.body.avatarUrl === "") {
        updateData.avatarUrl = null;
      } else if (typeof req.body.avatarUrl !== "string") {
        return res.status(400).json({ success: false, error: "avatarUrl must be a string" });
      } else {
        const normalizedAvatar = req.body.avatarUrl.trim();
        const isHttpAvatar = normalizedAvatar.startsWith("https://") || normalizedAvatar.startsWith("http://");
        const isDataAvatar = /^data:image\/(png|jpe?g|webp|gif);base64,/i.test(normalizedAvatar);

        if (!isHttpAvatar && !isDataAvatar) {
          return res.status(400).json({ success: false, error: "avatarUrl must be an image URL or data:image base64 string" });
        }

        if (normalizedAvatar.length > 2_000_000) {
          return res.status(400).json({ success: false, error: "avatarUrl is too large" });
        }

        updateData.avatarUrl = normalizedAvatar;
      }
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ success: false, error: "No supported profile fields were provided" });
    }

    const updated = await prisma.user.update({
      where: { id: String(req.session.user.id) },
      data: updateData,
      select: {
        id: true,
        name: true,
        email: true,
        avatarUrl: true,
        role: true,
        isWriter: true,
        penName: true,
        bio: true,
        preferredGenres: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    req.session.user = buildSessionUser(updated);

    return res.json({
      success: true,
      message: "Profile updated successfully",
      data: buildProfilePayload(updated),
    });
  } catch (error) {
    console.error("patchProfile error:", error);
    return res.status(500).json({ success: false, error: "Unable to update profile" });
  }
}

async function getProfileStats(req, res) {
  try {
    const userId = String(req.session.user.id);
    const user = await getFreshUser(userId);
    if (!user) {
      return res.status(404).json({ success: false, error: "Profile not found" });
    }

    const [readingRows, listeningRows, bookmarksCount, notesCount, highlightsCount, writerBooks] = await Promise.all([
      prisma.readingProgress.findMany({
        where: {
          userId,
          book: { status: "PUBLISHED" },
        },
        select: {
          bookId: true,
          progressPercent: true,
          updatedAt: true,
          book: { select: { id: true, genre: true } },
        },
      }),
      prisma.listeningProgress.findMany({
        where: {
          userId,
          book: { status: "PUBLISHED" },
        },
        select: {
          bookId: true,
          currentTimeSeconds: true,
          updatedAt: true,
          book: {
            select: {
              id: true,
              genre: true,
              title: true,
              audioTracks: {
                select: {
                  order: true,
                  duration: true,
                },
              },
            },
          },
          audioTrack: {
            select: {
              order: true,
              duration: true,
            },
          },
        },
      }),
      prisma.bookmark.count({ where: { userId, book: { status: "PUBLISHED" } } }),
      prisma.note.count({ where: { userId, book: { status: "PUBLISHED" } } }),
      prisma.highlight.count({ where: { userId, book: { status: "PUBLISHED" } } }),
      user.isWriter && user.role !== "ADMIN"
        ? prisma.book.findMany({
          where: { createdBy: userId },
          include: {
            _count: {
              select: {
                chapters: true,
                readingProgress: true,
                listeningProgress: true,
                bookmarks: true,
              },
            },
          },
        })
        : Promise.resolve([]),
    ]);

    const trackTotals = buildTrackTotals(listeningRows);
    const completionByBook = new Map();

    readingRows.forEach((row) => {
      completionByBook.set(row.bookId, Math.max(completionByBook.get(row.bookId) || 0, Number(row.progressPercent) || 0));
    });
    listeningRows.forEach((row) => {
      const percent = computeListeningPercent(row, trackTotals);
      if (typeof percent === "number") {
        completionByBook.set(row.bookId, Math.max(completionByBook.get(row.bookId) || 0, percent));
      }
    });

    const completedBooks = [...completionByBook.values()].filter((value) => value >= 100).length;
    const inProgressBooks = [...completionByBook.values()].filter((value) => value > 0 && value < 100).length;
    const favoriteGenre = getFavoriteGenre([
      ...readingRows.map((row) => row.book.genre),
      ...listeningRows.map((row) => row.book.genre),
    ]);

    const readerStats = {
      booksCompleted: completedBooks,
      booksInProgress: inProgressBooks,
      hoursListened: Math.round((listeningRows.reduce((sum, row) => sum + Math.max(Number(row.currentTimeSeconds) || 0, 0), 0) / 3600) * 10) / 10,
      savedBookmarks: bookmarksCount,
      notesCount,
      highlightsCount,
      favoriteGenre,
    };

    const writerStats = user.isWriter && user.role !== "ADMIN"
      ? {
        totalBooks: writerBooks.length,
        publishedBooks: writerBooks.filter((book) => book.status === "PUBLISHED").length,
        draftBooks: writerBooks.filter((book) => book.status === "DRAFT").length,
        totalReads: writerBooks.reduce((sum, book) => sum + (book._count?.readingProgress || 0) + (book._count?.listeningProgress || 0), 0),
        totalFavorites: writerBooks.reduce((sum, book) => sum + (book._count?.bookmarks || 0), 0),
        totalChapters: writerBooks.reduce((sum, book) => sum + (book._count?.chapters || 0), 0),
      }
      : null;

    return res.json({
      success: true,
      data: {
        reader: readerStats,
        writer: writerStats,
      },
    });
  } catch (error) {
    console.error("getProfileStats error:", error);
    return res.status(500).json({ success: false, error: "Unable to fetch profile stats" });
  }
}

async function getProfileLibrary(req, res) {
  try {
    const userId = String(req.session.user.id);
    const [bookmarks, readingRows, listeningRows] = await Promise.all([
      prisma.bookmark.findMany({
        where: { userId, book: { status: "PUBLISHED" } },
        orderBy: { createdAt: "desc" },
        take: 24,
        select: {
          createdAt: true,
          book: {
            select: {
              id: true,
              title: true,
              authorName: true,
              coverUrl: true,
              genre: true,
              description: true,
            },
          },
        },
      }),
      prisma.readingProgress.findMany({
        where: { userId, book: { status: "PUBLISHED" } },
        orderBy: { updatedAt: "desc" },
        take: 24,
        select: {
          progressPercent: true,
          updatedAt: true,
          book: {
            select: {
              id: true,
              title: true,
              authorName: true,
              coverUrl: true,
              genre: true,
              description: true,
            },
          },
        },
      }),
      prisma.listeningProgress.findMany({
        where: { userId, book: { status: "PUBLISHED" } },
        orderBy: { updatedAt: "desc" },
        take: 24,
        select: {
          currentTimeSeconds: true,
          updatedAt: true,
          book: {
            select: {
              id: true,
              title: true,
              authorName: true,
              coverUrl: true,
              genre: true,
              description: true,
              isAudiobookAvailable: true,
            },
          },
        },
      }),
    ]);

    const libraryMap = new Map();
    const upsertBook = (book, activityType, activityDate, extra = {}) => {
      if (!book || !book.id) {
        return;
      }

      const existing = libraryMap.get(book.id);
      if (existing && new Date(existing.lastInteractionAt).getTime() >= new Date(activityDate).getTime()) {
        return;
      }

      libraryMap.set(book.id, {
        id: book.id,
        title: book.title,
        authorName: book.authorName || "Unknown Author",
        coverUrl: book.coverUrl || null,
        genre: book.genre || null,
        description: book.description || null,
        lastInteractionAt: activityDate,
        activityType,
        ...extra,
      });
    };

    bookmarks.forEach((row) => {
      upsertBook(row.book, "bookmark", row.createdAt.toISOString());
    });
    readingRows.forEach((row) => {
      upsertBook(row.book, "reading", row.updatedAt.toISOString(), {
        progressPercent: Math.round(Number(row.progressPercent) || 0),
      });
    });
    listeningRows.forEach((row) => {
      upsertBook(row.book, "listening", row.updatedAt.toISOString(), {
        currentTimeSeconds: Math.floor(Number(row.currentTimeSeconds) || 0),
      });
    });

    const items = [...libraryMap.values()]
      .sort((a, b) => new Date(b.lastInteractionAt).getTime() - new Date(a.lastInteractionAt).getTime())
      .slice(0, 12);

    return res.json({
      success: true,
      data: items,
    });
  } catch (error) {
    console.error("getProfileLibrary error:", error);
    return res.status(500).json({ success: false, error: "Unable to fetch profile library" });
  }
}

async function getProfileActivity(req, res) {
  try {
    const userId = String(req.session.user.id);
    const user = await getFreshUser(userId);
    if (!user) {
      return res.status(404).json({ success: false, error: "Profile not found" });
    }

    const [readingRows, listeningRows, bookmarkRows, noteRows, highlightRows, writerBooks, writerChapters] = await Promise.all([
      prisma.readingProgress.findMany({
        where: { userId, book: { status: "PUBLISHED" } },
        orderBy: { updatedAt: "desc" },
        take: 8,
        select: {
          progressPercent: true,
          updatedAt: true,
          book: { select: { title: true } },
        },
      }),
      prisma.listeningProgress.findMany({
        where: { userId, book: { status: "PUBLISHED" } },
        orderBy: { updatedAt: "desc" },
        take: 8,
        select: {
          currentTimeSeconds: true,
          updatedAt: true,
          book: { select: { title: true } },
        },
      }),
      prisma.bookmark.findMany({
        where: { userId, book: { status: "PUBLISHED" } },
        orderBy: { createdAt: "desc" },
        take: 8,
        select: {
          createdAt: true,
          book: { select: { title: true } },
        },
      }),
      prisma.note.findMany({
        where: { userId, book: { status: "PUBLISHED" } },
        orderBy: { createdAt: "desc" },
        take: 8,
        select: {
          createdAt: true,
          book: { select: { title: true } },
        },
      }),
      prisma.highlight.findMany({
        where: { userId, book: { status: "PUBLISHED" } },
        orderBy: { createdAt: "desc" },
        take: 8,
        select: {
          createdAt: true,
          book: { select: { title: true } },
        },
      }),
      user.isWriter && user.role !== "ADMIN"
        ? prisma.book.findMany({
          where: { createdBy: userId },
          orderBy: { updatedAt: "desc" },
          take: 6,
          select: {
            title: true,
            status: true,
            updatedAt: true,
          },
        })
        : Promise.resolve([]),
      user.isWriter && user.role !== "ADMIN"
        ? prisma.chapter.findMany({
          where: { book: { createdBy: userId } },
          orderBy: { updatedAt: "desc" },
          take: 6,
          select: {
            title: true,
            updatedAt: true,
            book: { select: { title: true } },
          },
        })
        : Promise.resolve([]),
    ]);

    const items = [
      ...readingRows.map((row) => ({
        title: `Reading progress updated in ${row.book.title}`,
        note: `${Math.round(Number(row.progressPercent) || 0)}% complete.`,
        type: "reading",
        createdAt: row.updatedAt,
      })),
      ...listeningRows.map((row) => ({
        title: `Listening progress updated in ${row.book.title}`,
        note: `${Math.floor(Number(row.currentTimeSeconds) || 0)} seconds saved.`,
        type: "listening",
        createdAt: row.updatedAt,
      })),
      ...bookmarkRows.map((row) => ({
        title: `Bookmarked ${row.book.title}`,
        note: "Saved for later reading.",
        type: "bookmark",
        createdAt: row.createdAt,
      })),
      ...noteRows.map((row) => ({
        title: `Added a note in ${row.book.title}`,
        note: "Annotation activity recorded.",
        type: "note",
        createdAt: row.createdAt,
      })),
      ...highlightRows.map((row) => ({
        title: `Highlighted text in ${row.book.title}`,
        note: "Reading highlight saved.",
        type: "highlight",
        createdAt: row.createdAt,
      })),
      ...writerBooks.map((row) => ({
        title: `Updated ${row.title}`,
        note: row.status === "PUBLISHED" ? "Published story remains live." : "Draft updated in writer workspace.",
        type: "writer-book",
        createdAt: row.updatedAt,
      })),
      ...writerChapters.map((row) => ({
        title: `Edited ${row.title || row.book.title}`,
        note: `Chapter changes saved for ${row.book.title}.`,
        type: "writer-chapter",
        createdAt: row.updatedAt,
      })),
    ]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 12)
      .map((item, index) => ({
        id: `${item.type}:${index}:${new Date(item.createdAt).getTime()}`,
        title: item.title,
        note: item.note,
        type: item.type,
        createdAt: item.createdAt.toISOString(),
        dateLabel: formatRelativeDate(item.createdAt),
      }));

    return res.json({
      success: true,
      data: items,
    });
  } catch (error) {
    console.error("getProfileActivity error:", error);
    return res.status(500).json({ success: false, error: "Unable to fetch profile activity" });
  }
}

async function getProfileAnnotations(req, res) {
  try {
    const userId = String(req.session.user.id);

    const [bookmarks, highlights, notes] = await Promise.all([
      prisma.bookmark.findMany({
        where: {
          userId,
          book: { status: "PUBLISHED" },
        },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          createdAt: true,
          location: true,
          label: true,
          bookId: true,
          chapterId: true,
          book: {
            select: {
              id: true,
              title: true,
              authorName: true,
              coverUrl: true,
              genre: true,
            },
          },
          chapter: {
            select: {
              id: true,
              chapterNumber: true,
              title: true,
            },
          },
        },
      }),
      prisma.highlight.findMany({
        where: {
          userId,
          book: { status: "PUBLISHED" },
        },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          createdAt: true,
          selectedText: true,
          startOffset: true,
          endOffset: true,
          bookId: true,
          chapterId: true,
          book: {
            select: {
              id: true,
              title: true,
              authorName: true,
              coverUrl: true,
              genre: true,
            },
          },
          chapter: {
            select: {
              id: true,
              chapterNumber: true,
              title: true,
            },
          },
          linkedNotes: {
            select: {
              id: true,
              content: true,
              createdAt: true,
            },
            orderBy: {
              createdAt: "desc",
            },
            take: 1,
          },
        },
      }),
      prisma.note.findMany({
        where: {
          userId,
          book: { status: "PUBLISHED" },
        },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          createdAt: true,
          content: true,
          linkedHighlightId: true,
          bookId: true,
          chapterId: true,
          book: {
            select: {
              id: true,
              title: true,
              authorName: true,
              coverUrl: true,
              genre: true,
            },
          },
          chapter: {
            select: {
              id: true,
              chapterNumber: true,
              title: true,
            },
          },
          linkedHighlight: {
            select: {
              selectedText: true,
            },
          },
        },
      }),
    ]);

    const mapBook = (book) => ({
      id: book.id,
      title: book.title,
      authorName: book.authorName || "Unknown Author",
      coverUrl: book.coverUrl || null,
      genre: book.genre || null,
    });

    const mappedBookmarks = bookmarks.map((item) => ({
      id: item.id,
      bookId: item.bookId,
      chapterId: item.chapterId,
      chapterNumber: item.chapter && typeof item.chapter.chapterNumber === "number" ? item.chapter.chapterNumber : null,
      chapterTitle: item.chapter && item.chapter.title ? item.chapter.title : null,
      snippet: item.label || item.location || "Bookmark saved at this chapter position.",
      note: "-",
      location: item.location || null,
      dateSaved: item.createdAt.toISOString(),
      jumpUrl: `reader.html?bookId=${encodeURIComponent(item.bookId)}${item.chapterId ? `&chapterId=${encodeURIComponent(item.chapterId)}` : ""}`,
      book: mapBook(item.book),
    }));

    const mappedHighlights = highlights.map((item) => {
      const linkedNote = Array.isArray(item.linkedNotes) && item.linkedNotes.length ? item.linkedNotes[0] : null;
      return {
        id: item.id,
        bookId: item.bookId,
        chapterId: item.chapterId,
        chapterNumber: item.chapter && typeof item.chapter.chapterNumber === "number" ? item.chapter.chapterNumber : null,
        chapterTitle: item.chapter && item.chapter.title ? item.chapter.title : null,
        snippet: item.selectedText || "No highlighted text",
        note: linkedNote && linkedNote.content ? linkedNote.content : "-",
        startOffset: item.startOffset,
        endOffset: item.endOffset,
        dateSaved: item.createdAt.toISOString(),
        jumpUrl: `reader.html?bookId=${encodeURIComponent(item.bookId)}${item.chapterId ? `&chapterId=${encodeURIComponent(item.chapterId)}` : ""}`,
        book: mapBook(item.book),
      };
    });

    const mappedNotes = notes.map((item) => ({
      id: item.id,
      bookId: item.bookId,
      chapterId: item.chapterId,
      chapterNumber: item.chapter && typeof item.chapter.chapterNumber === "number" ? item.chapter.chapterNumber : null,
      chapterTitle: item.chapter && item.chapter.title ? item.chapter.title : null,
      snippet: item.linkedHighlight && item.linkedHighlight.selectedText
        ? item.linkedHighlight.selectedText
        : "No linked highlight",
      note: item.content || "-",
      linkedHighlightId: item.linkedHighlightId || null,
      dateSaved: item.createdAt.toISOString(),
      jumpUrl: `reader.html?bookId=${encodeURIComponent(item.bookId)}${item.chapterId ? `&chapterId=${encodeURIComponent(item.chapterId)}` : ""}`,
      book: mapBook(item.book),
    }));

    return res.json({
      success: true,
      data: {
        bookmarks: mappedBookmarks,
        highlights: mappedHighlights,
        notes: mappedNotes,
      },
    });
  } catch (error) {
    console.error("getProfileAnnotations error:", error);
    return res.status(500).json({ success: false, error: "Unable to fetch profile annotations" });
  }
}

async function patchBookmarkAnnotation(req, res) {
  try {
    const userId = String(req.session.user.id);
    const annotationId = String(req.params.id || "").trim();
    if (!annotationId) {
      return res.status(400).json({ success: false, error: "Bookmark id is required" });
    }

    const payload = req.body || {};
    if (payload.label === undefined) {
      return res.status(400).json({ success: false, error: "label is required" });
    }

    if (payload.label !== null && typeof payload.label !== "string") {
      return res.status(400).json({ success: false, error: "label must be a string or null" });
    }

    const normalizedLabel = payload.label === null ? null : (payload.label.trim() || null);

    const updated = await prisma.bookmark.updateMany({
      where: { id: annotationId, userId },
      data: { label: normalizedLabel },
    });

    if (!updated.count) {
      return res.status(404).json({ success: false, error: "Bookmark not found" });
    }

    return res.json({ success: true, message: "Bookmark updated" });
  } catch (error) {
    console.error("patchBookmarkAnnotation error:", error);
    return res.status(500).json({ success: false, error: "Unable to update bookmark" });
  }
}

async function removeBookmarkAnnotation(req, res) {
  try {
    const userId = String(req.session.user.id);
    const annotationId = String(req.params.id || "").trim();
    if (!annotationId) {
      return res.status(400).json({ success: false, error: "Bookmark id is required" });
    }

    const deleted = await prisma.bookmark.deleteMany({
      where: { id: annotationId, userId },
    });

    if (!deleted.count) {
      return res.status(404).json({ success: false, error: "Bookmark not found" });
    }

    return res.json({ success: true, message: "Bookmark deleted" });
  } catch (error) {
    console.error("removeBookmarkAnnotation error:", error);
    return res.status(500).json({ success: false, error: "Unable to delete bookmark" });
  }
}

async function patchHighlightAnnotation(req, res) {
  try {
    const userId = String(req.session.user.id);
    const annotationId = String(req.params.id || "").trim();
    if (!annotationId) {
      return res.status(400).json({ success: false, error: "Highlight id is required" });
    }

    const payload = req.body || {};
    if (payload.note === undefined) {
      return res.status(400).json({ success: false, error: "note is required" });
    }
    if (payload.note !== null && typeof payload.note !== "string") {
      return res.status(400).json({ success: false, error: "note must be a string or null" });
    }

    const highlight = await prisma.highlight.findFirst({
      where: { id: annotationId, userId },
      select: { id: true },
    });
    if (!highlight) {
      return res.status(404).json({ success: false, error: "Highlight not found" });
    }

    const normalizedNote = payload.note === null ? "" : payload.note.trim();

    if (!normalizedNote) {
      await prisma.note.deleteMany({
        where: {
          userId,
          linkedHighlightId: annotationId,
        },
      });
    } else {
      const existingLinked = await prisma.note.findFirst({
        where: { userId, linkedHighlightId: annotationId },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          bookId: true,
          chapterId: true,
        },
      });

      if (existingLinked) {
        await prisma.note.update({
          where: { id: existingLinked.id },
          data: { content: normalizedNote },
        });
      } else {
        const ownerNoteSource = await prisma.highlight.findFirst({
          where: { id: annotationId, userId },
          select: {
            bookId: true,
            chapterId: true,
          },
        });

        if (!ownerNoteSource) {
          return res.status(404).json({ success: false, error: "Highlight not found" });
        }

        await prisma.note.create({
          data: {
            userId,
            bookId: ownerNoteSource.bookId,
            chapterId: ownerNoteSource.chapterId,
            linkedHighlightId: annotationId,
            content: normalizedNote,
          },
        });
      }
    }

    return res.json({ success: true, message: "Highlight note updated" });
  } catch (error) {
    console.error("patchHighlightAnnotation error:", error);
    return res.status(500).json({ success: false, error: "Unable to update highlight" });
  }
}

async function removeHighlightAnnotation(req, res) {
  try {
    const userId = String(req.session.user.id);
    const annotationId = String(req.params.id || "").trim();
    if (!annotationId) {
      return res.status(400).json({ success: false, error: "Highlight id is required" });
    }

    const [, deletedHighlights] = await prisma.$transaction([
      prisma.note.deleteMany({
        where: {
          userId,
          linkedHighlightId: annotationId,
        },
      }),
      prisma.highlight.deleteMany({
        where: { id: annotationId, userId },
      }),
    ]);

    if (!deletedHighlights.count) {
      return res.status(404).json({ success: false, error: "Highlight not found" });
    }

    return res.json({ success: true, message: "Highlight deleted" });
  } catch (error) {
    console.error("removeHighlightAnnotation error:", error);
    return res.status(500).json({ success: false, error: "Unable to delete highlight" });
  }
}

async function patchNoteAnnotation(req, res) {
  try {
    const userId = String(req.session.user.id);
    const annotationId = String(req.params.id || "").trim();
    if (!annotationId) {
      return res.status(400).json({ success: false, error: "Note id is required" });
    }

    const payload = req.body || {};
    if (payload.content === undefined || typeof payload.content !== "string") {
      return res.status(400).json({ success: false, error: "content is required" });
    }

    const normalizedContent = payload.content.trim();
    if (!normalizedContent) {
      return res.status(400).json({ success: false, error: "content cannot be empty" });
    }

    const updated = await prisma.note.updateMany({
      where: { id: annotationId, userId },
      data: { content: normalizedContent },
    });

    if (!updated.count) {
      return res.status(404).json({ success: false, error: "Note not found" });
    }

    return res.json({ success: true, message: "Note updated" });
  } catch (error) {
    console.error("patchNoteAnnotation error:", error);
    return res.status(500).json({ success: false, error: "Unable to update note" });
  }
}

async function removeNoteAnnotation(req, res) {
  try {
    const userId = String(req.session.user.id);
    const annotationId = String(req.params.id || "").trim();
    if (!annotationId) {
      return res.status(400).json({ success: false, error: "Note id is required" });
    }

    const deleted = await prisma.note.deleteMany({
      where: { id: annotationId, userId },
    });

    if (!deleted.count) {
      return res.status(404).json({ success: false, error: "Note not found" });
    }

    return res.json({ success: true, message: "Note deleted" });
  } catch (error) {
    console.error("removeNoteAnnotation error:", error);
    return res.status(500).json({ success: false, error: "Unable to delete note" });
  }
}

module.exports = {
  getProfile,
  patchProfile,
  getProfileStats,
  getProfileLibrary,
  getProfileActivity,
  getProfileAnnotations,
  patchBookmarkAnnotation,
  removeBookmarkAnnotation,
  patchHighlightAnnotation,
  removeHighlightAnnotation,
  patchNoteAnnotation,
  removeNoteAnnotation,
};