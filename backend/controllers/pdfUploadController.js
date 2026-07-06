/**
 * PDF Upload Controller
 * Handles PDF book uploads with automatic chapter detection
 */

const { PrismaClient } = require('@prisma/client');
const pdfProcessingService = require('../services/pdfProcessingService');
const path = require('path');
const fs = require('fs').promises;

const prisma = new PrismaClient();

/**
 * Upload and process PDF book
 * POST /api/admin/books/upload-pdf
 */
async function uploadPDF(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No PDF file provided'
      });
    }

    const { title, author, description, genre, status = 'DRAFT', coverUrl, tags } = req.body;
    const userId = req.session.user.id;

    // Validate required fields
    if (!title || !author) {
      return res.status(400).json({
        success: false,
        error: 'Title and author are required'
      });
    }

    console.log('[PDF Upload] Processing PDF:', req.file.originalname);

    // Process PDF
    const pdfBuffer = await fs.readFile(req.file.path);
    const { pages, metadata, detectedChapters, totalPages } = await pdfProcessingService.processPDF(pdfBuffer);

    // Determine reading mode
    const readingMode = pdfProcessingService.determineReadingMode(detectedChapters);
    
    console.log('[PDF Upload] Reading mode:', readingMode);
    console.log('[PDF Upload] Total pages:', totalPages);
    console.log('[PDF Upload] Detected chapters:', detectedChapters ? detectedChapters.length : 0);

    // Generate unique slug
    const baseSlug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    let slug = baseSlug;
    let counter = 1;
    while (await prisma.book.findUnique({ where: { slug } })) {
      slug = `${baseSlug}-${counter++}`;
    }

    // Use PDF metadata if available
    const finalTitle = title || metadata.title || req.file.originalname;
    const finalAuthor = author || metadata.author || 'Unknown Author';
    const finalDescription = description || metadata.subject || '';
    
    // Parse tags if sent as JSON string
    let parsedTags = [];
    if (tags) {
      try {
        parsedTags = typeof tags === 'string' ? JSON.parse(tags) : tags;
      } catch (e) {
        parsedTags = [];
      }
    }

    // Create book record
    const book = await prisma.book.create({
      data: {
        title: finalTitle,
        slug,
        authorName: finalAuthor,
        description: finalDescription,
        genre: genre || 'General',
        fileType: 'PDF',
        fileUrl: `/uploads/pdfs/${req.file.filename}`,
        coverUrl: coverUrl || null,
        readingMode,
        totalPages,
        pdfMetadata: metadata,
        status: status === 'PUBLISHED' ? 'PUBLISHED' : 'DRAFT',
        createdBy: userId,
        tags: Array.isArray(parsedTags) ? parsedTags : []
      }
    });

    console.log('[PDF Upload] Created book:', book.id);

    // Save content based on reading mode
    if (readingMode === 'CHAPTER' && detectedChapters) {
      // Save as chapters
      await prisma.chapter.createMany({
        data: detectedChapters.map(ch => ({
          bookId: book.id,
          chapterNumber: ch.number,
          title: ch.title,
          content: ch.content,
          isPublished: status === 'PUBLISHED'
        }))
      });
      
      console.log('[PDF Upload] Created chapters:', detectedChapters.length);
    } else {
      // Save as pages for continuous mode
      await prisma.bookPage.createMany({
        data: pages.map(page => ({
          bookId: book.id,
          pageNumber: page.pageNumber,
          content: page.content,
          wordCount: page.wordCount
        }))
      });
      
      console.log('[PDF Upload] Created pages:', pages.length);
    }

    res.status(201).json({
      success: true,
      message: readingMode === 'CHAPTER' 
        ? `Book imported with ${detectedChapters.length} chapters`
        : `Book imported in continuous reading mode with ${totalPages} pages`,
      data: {
        id: book.id,
        title: book.title,
        slug: book.slug,
        authorName: book.authorName,
        readingMode: book.readingMode,
        totalPages: book.totalPages,
        status: book.status,
        detectedChapters: readingMode === 'CHAPTER' ? detectedChapters.length : 0
      }
    });

  } catch (error) {
    console.error('[PDF Upload] Error:', error);
    
    // Clean up uploaded file on error
    if (req.file) {
      try {
        await fs.unlink(req.file.path);
      } catch (unlinkError) {
        console.error('[PDF Upload] Error deleting file:', unlinkError);
      }
    }

    res.status(500).json({
      success: false,
      error: 'Failed to process PDF',
      details: error.message
    });
  }
}

module.exports = {
  uploadPDF
};
