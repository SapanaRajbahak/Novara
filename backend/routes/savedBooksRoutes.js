const express = require("express");
const { requireAuth } = require("../middleware/auth");
const prisma = require("../prisma/client");

const router = express.Router();

router.use(requireAuth);

// GET /api/profile/saved-books — list all saved books for the current user
router.get("/saved-books", async (req, res) => {
  try {
    const userId = req.session.user.id;

    const rows = await prisma.savedBook.findMany({
      where: { userId },
      include: {
        book: {
          select: {
            id: true,
            title: true,
            slug: true,
            authorName: true,
            coverUrl: true,
            genre: true,
            status: true,
            fileType: true,
            description: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return res.json({
      success: true,
      data: rows.map((row) => ({
        savedBookId: row.id,
        savedAt: row.createdAt,
        ...row.book,
      })),
    });
  } catch (error) {
    console.error("GET saved-books error:", error);
    return res.status(500).json({ success: false, error: "Unable to fetch saved books" });
  }
});

// POST /api/profile/saved-books/:bookId — toggle save/unsave
router.post("/saved-books/:bookId", async (req, res) => {
  try {
    const userId = req.session.user.id;
    const { bookId } = req.params;

    if (!bookId) {
      return res.status(400).json({ success: false, error: "bookId is required" });
    }

    const existing = await prisma.savedBook.findUnique({
      where: { userId_bookId: { userId, bookId } },
    });

    if (existing) {
      await prisma.savedBook.delete({ where: { id: existing.id } });
      return res.json({ success: true, saved: false });
    }

    await prisma.savedBook.create({ data: { userId, bookId } });
    return res.json({ success: true, saved: true });
  } catch (error) {
    console.error("POST saved-books toggle error:", error);
    return res.status(500).json({ success: false, error: "Unable to update saved book" });
  }
});

module.exports = router;
