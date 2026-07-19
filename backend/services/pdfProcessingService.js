/**
 * PDF Processing Service
 * Handles PDF upload, text extraction, and automatic chapter detection
 */

let pdfjsLib = null;

function getPdfjsLib() {
  if (pdfjsLib) {
    return pdfjsLib;
  }

  // Lazy-load pdfjs so optional canvas/polyfill warnings do not fire during server startup.
  pdfjsLib = require('pdfjs-dist/legacy/build/pdf');

  if (typeof window === 'undefined') {
    try {
      const pdfjsWorker = require('pdfjs-dist/legacy/build/pdf.worker.entry');
      pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;
    } catch (error) {
      // Worker setup is optional in this Node flow; pdfjs can still process in-process.
    }
  }

  return pdfjsLib;
}

class PDFProcessingService {
  /**
   * Extract text and metadata from PDF
   * @param {Buffer} pdfBuffer - PDF file buffer
   * @returns {Promise<Object>} - {pages, metadata, detectedChapters}
   */
  async processPDF(pdfBuffer) {
    try {
      const lib = getPdfjsLib();
      const loadingTask = lib.getDocument({ data: pdfBuffer });
      const pdfDoc = await loadingTask.promise;
      
      const numPages = pdfDoc.numPages;
      const pages = [];
      
      // Extract text from each page
      for (let pageNum = 1; pageNum <= numPages; pageNum++) {
        const page = await pdfDoc.getPage(pageNum);
        const textContent = await page.getTextContent();
        
        const pageText = textContent.items
          .map(item => item.str)
          .join(' ')
          .trim();
        
        pages.push({
          pageNumber: pageNum,
          content: pageText,
          wordCount: pageText.split(/\s+/).filter(Boolean).length
        });
      }
      
      // Extract metadata
      const metadata = await pdfDoc.getMetadata();
      const pdfMetadata = {
        title: metadata?.info?.Title || null,
        author: metadata?.info?.Author || null,
        subject: metadata?.info?.Subject || null,
        keywords: metadata?.info?.Keywords || null,
        creator: metadata?.info?.Creator || null,
        producer: metadata?.info?.Producer || null,
        creationDate: metadata?.info?.CreationDate || null,
        modificationDate: metadata?.info?.ModDate || null,
        numPages: numPages
      };
      
      // Try to detect chapters
      const detectedChapters = await this.detectChapters(pages, pdfDoc);
      
      return {
        pages,
        metadata: pdfMetadata,
        detectedChapters,
        totalPages: numPages
      };
    } catch (error) {
      console.error('[PDFProcessingService] Error processing PDF:', error);
      throw new Error(`Failed to process PDF: ${error.message}`);
    }
  }

  /**
   * Detect chapters from PDF pages
   * Uses multiple strategies: headings, bookmarks, table of contents
   * @param {Array} pages - Array of page objects
   * @param {Object} pdfDoc - PDF.js document object
   * @returns {Array|null} - Array of chapters or null if none detected
   */
  async detectChapters(pages, pdfDoc) {
    try {
      // Strategy 1: Try PDF bookmarks/outline
      const outline = await pdfDoc.getOutline();
      if (outline && outline.length > 0) {
        const chapters = await this.extractChaptersFromOutline(outline, pages, pdfDoc);
        if (chapters.length > 0) {
          console.log('[PDFProcessingService] Detected chapters from PDF bookmarks:', chapters.length);
          return chapters;
        }
      }
      
      // Strategy 2: Detect from text patterns (Chapter 1, Chapter I, etc.)
      const textBasedChapters = this.detectChaptersFromText(pages);
      if (textBasedChapters.length >= 2) {
        console.log('[PDFProcessingService] Detected chapters from text patterns:', textBasedChapters.length);
        return textBasedChapters;
      }
      
      // No chapters detected
      console.log('[PDFProcessingService] No chapters detected, will use continuous mode');
      return null;
    } catch (error) {
      console.error('[PDFProcessingService] Error detecting chapters:', error);
      return null;
    }
  }

  /**
   * Extract chapters from PDF outline/bookmarks
   */
  async extractChaptersFromOutline(outline, pages, pdfDoc) {
    const chapters = [];
    
    for (let i = 0; i < outline.length; i++) {
      const item = outline[i];
      
      try {
        // Get the destination page
        let dest = item.dest;
        if (typeof dest === 'string') {
          dest = await pdfDoc.getDestination(dest);
        }
        
        if (dest && dest[0]) {
          const pageRef = dest[0];
          const pageIndex = await pdfDoc.getPageIndex(pageRef);
          const startPage = pageIndex + 1; // 1-indexed
          
          // Find end page (next chapter's start page - 1)
          let endPage = pages.length;
          if (i < outline.length - 1) {
            const nextItem = outline[i + 1];
            let nextDest = nextItem.dest;
            if (typeof nextDest === 'string') {
              nextDest = await pdfDoc.getDestination(nextDest);
            }
            if (nextDest && nextDest[0]) {
              const nextPageRef = nextDest[0];
              const nextPageIndex = await pdfDoc.getPageIndex(nextPageRef);
              endPage = nextPageIndex; // Exclusive
            }
          }
          
          // Extract content from pages
          const content = pages
            .slice(startPage - 1, endPage)
            .map(p => p.content)
            .join('\n\n')
            .trim();
          
          if (content) {
            chapters.push({
              number: i + 1,
              title: item.title || `Chapter ${i + 1}`,
              content: content,
              startPage: startPage,
              endPage: endPage
            });
          }
        }
      } catch (error) {
        console.error(`[PDFProcessingService] Error processing outline item ${i}:`, error);
      }
    }
    
    return chapters;
  }

  /**
   * Detect chapters from text patterns
   */
  detectChaptersFromText(pages) {
    const chapters = [];
    
    // Common chapter heading patterns
    const chapterPatterns = [
      /^(?:Chapter|CHAPTER)\s+(\d+|[IVXLCDM]+)[\s:.\-—]+(.+?)$/im,
      /^(?:Part|PART)\s+(\d+|[IVXLCDM]+)[\s:.\-—]+(.+?)$/im,
      /^(\d+)[\s.]+(.+?)$/m, // "1. Introduction"
      /^([IVXLCDM]+)[\s.]+(.+?)$/m // "I. Introduction"
    ];
    
    let currentChapter = null;
    let chapterNumber = 0;
    
    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      const lines = page.content.split('\n').map(l => l.trim()).filter(Boolean);
      
      for (const line of lines) {
        // Check if line matches any chapter pattern
        for (const pattern of chapterPatterns) {
          const match = line.match(pattern);
          
          if (match && line.length < 100) { // Headings are usually short
            // Save previous chapter
            if (currentChapter) {
              chapters.push(currentChapter);
            }
            
            // Start new chapter
            chapterNumber++;
            currentChapter = {
              number: chapterNumber,
              title: line.trim(),
              content: '',
              startPage: i + 1,
              endPage: i + 1
            };
            
            break; // Found a chapter, stop checking patterns
          }
        }
        
        // Add content to current chapter
        if (currentChapter) {
          currentChapter.content += line + '\n';
          currentChapter.endPage = i + 1;
        }
      }
    }
    
    // Add the last chapter
    if (currentChapter) {
      chapters.push(currentChapter);
    }
    
    // Validate: require at least 2 chapters with reasonable content
    const validChapters = chapters.filter(ch => ch.content.length > 200);
    
    return validChapters.length >= 2 ? validChapters : [];
  }

  /**
   * Determine reading mode based on chapter detection
   */
  determineReadingMode(detectedChapters) {
    return detectedChapters && detectedChapters.length >= 2 ? 'CHAPTER' : 'CONTINUOUS';
  }
}

module.exports = new PDFProcessingService();
