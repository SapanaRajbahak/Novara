/**
 * Book Content Controller
 * Handles content delivery for both chapter and continuous reading modes
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * Get book content (supports both modes)
 * GET /api/books/:id/content?page=1&limit=10
 */
async function getBookContent(req, res) {
  try {
    const { id } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 10, 50); // Max 50 pages at once
    
    // Get book info
    const book = await prisma.book.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        authorName: true,
        readingMode: true,
        totalPages: true,
        status: true
      }
    });

    if (!book) {
      return res.status(404).json({
        success: false,
        error: 'Book not found'
      });
    }

    // Check if book is published (unless user is the author/admin)
    if (book.status !== 'PUBLISHED' && req.user?.id !== book.createdBy && req.user?.role !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        error: 'Book is not published'
      });
    }

    let content;
    let totalItems;
    let hasMore;

    if (book.readingMode === 'CONTINUOUS') {
      // Fetch pages
      const skip = (page - 1) * limit;
      
      const pages = await prisma.bookPage.findMany({
        where: { bookId: id },
        orderBy: { pageNumber: 'asc' },
        skip,
        take: limit,
        select: {
          pageNumber: true,
          content: true,
          wordCount: true
        }
      });

      totalItems = book.totalPages;
      hasMore = skip + pages.length < totalItems;

      content = {
        mode: 'continuous',
        pages,
        pagination: {
          currentPage: page,
          pageSize: limit,
          totalPages: totalItems,
          hasMore
        }
      };

    } else {
      // Fetch chapters
      const chapters = await prisma.chapter.findMany({
        where: {
          bookId: id,
          isPublished: true
        },
        orderBy: { chapterNumber: 'asc' },
        select: {
          id: true,
          chapterNumber: true,
          title: true
        }
      });

      totalItems = chapters.length;

      content = {
        mode: 'chapter',
        chapters,
        totalChapters: totalItems
      };
    }

    res.json({
      success: true,
      data: {
        book: {
          id: book.id,
          title: book.title,
          authorName: book.authorName,
          readingMode: book.readingMode
        },
        content
      }
    });

  } catch (error) {
    console.error('[Book Content] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch book content'
    });
  }
}

/**
 * Get specific page content
 * GET /api/books/:id/pages/:pageNumber
 */
async function getPageContent(req, res) {
  try {
    const { id, pageNumber } = req.params;
    const pageNum = parseInt(pageNumber);

    if (isNaN(pageNum) || pageNum < 1) {
      return res.status(400).json({
        success: false,
        error: 'Invalid page number'
      });
    }

    const book = await prisma.book.findUnique({
      where: { id },
      select: { readingMode: true, status: true, createdBy: true }
    });

    if (!book) {
      return res.status(404).json({
        success: false,
        error: 'Book not found'
      });
    }

    if (book.readingMode !== 'CONTINUOUS') {
      return res.status(400).json({
        success: false,
        error: 'This book uses chapter mode, not page mode'
      });
    }

    const page = await prisma.bookPage.findUnique({
      where: {
        bookId_pageNumber: {
          bookId: id,
          pageNumber: pageNum
        }
      },
      select: {
        pageNumber: true,
        content: true,
        wordCount: true
      }
    });

    if (!page) {
      return res.status(404).json({
        success: false,
        error: 'Page not found'
      });
    }

    res.json({
      success: true,
      data: page
    });

  } catch (error) {
    console.error('[Get Page] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch page'
    });
  }
}

/**
 * Get reading progress
 * GET /api/books/:id/progress
 */
async function getReadingProgress(req, res) {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const progress = await prisma.readingProgress.findUnique({
      where: {
        userId_bookId: {
          userId,
          bookId: id
        }
      },
      select: {
        chapterId: true,
        pageNumber: true,
        scrollPosition: true,
        progressPercent: true,
        lastLocation: true,
        updatedAt: true
      }
    });

    if (!progress) {
      return res.json({
        success: true,
        data: null
      });
    }

    res.json({
      success: true,
      data: progress
    });

  } catch (error) {
    console.error('[Get Progress] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch reading progress'
    });
  }
}

/**
 * Update reading progress
 * PUT /api/books/:id/progress
 */
async function updateReadingProgress(req, res) {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const { chapterId, pageNumber, scrollPosition, progressPercent, lastLocation } = req.body;

    // Validate book exists
    const book = await prisma.book.findUnique({
      where: { id },
      select: { id: true, readingMode: true }
    });

    if (!book) {
      return res.status(404).json({
        success: false,
        error: 'Book not found'
      });
    }

    // Validate progress data based on reading mode
    if (book.readingMode === 'CHAPTER' && !chapterId) {
      return res.status(400).json({
        success: false,
        error: 'chapterId is required for chapter mode'
      });
    }

    if (book.readingMode === 'CONTINUOUS' && !pageNumber) {
      return res.status(400).json({
        success: false,
        error: 'pageNumber is required for continuous mode'
      });
    }

    // Upsert progress
    const progress = await prisma.readingProgress.upsert({
      where: {
        userId_bookId: {
          userId,
          bookId: id
        }
      },
      create: {
        userId,
        bookId: id,
        chapterId,
        pageNumber,
        scrollPosition: scrollPosition || 0,
        progressPercent: progressPercent || 0,
        lastLocation
      },
      update: {
        chapterId,
        pageNumber,
        scrollPosition: scrollPosition || 0,
        progressPercent: progressPercent || 0,
        lastLocation
      }
    });

    res.json({
      success: true,
      data: progress
    });

  } catch (error) {
    console.error('[Update Progress] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update reading progress'
    });
  }
}

module.exports = {
  getBookContent,
  getPageContent,
  getReadingProgress,
  updateReadingProgress
};
