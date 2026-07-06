# PDF Import System - Migration Guide

## Overview

This redesigned PDF import system allows authors to upload PDF books without manually splitting them into chapters. The system automatically detects chapters or falls back to continuous reading mode.

## Database Changes

### New Fields in `Book` Model
- `readingMode` (ReadingMode enum): CHAPTER | CONTINUOUS
- `totalPages` (Int?): Total number of pages for continuous mode
- `pdfMetadata` (Json?): Stores PDF metadata

### New Model: `BookPage`
Stores individual pages for continuous reading mode:
- `bookId`: Foreign key to Book
- `pageNumber`: Page number (1-indexed)
- `content`: Extracted text content
- `wordCount`: Number of words on the page

### Updated `ReadingProgress` Model
- `chapterId` (String?) - Now optional
- `pageNumber` (Int?) - For continuous mode
- `scrollPosition` (Int) - Scroll position within page

## Installation Steps

### 1. Install Dependencies

```bash
cd backend
npm install pdfjs-dist multer
```

### 2. Create Upload Directory

```bash
mkdir -p uploads/pdfs
```

### 3. Run Database Migration

```bash
npx prisma migrate dev --name add-continuous-reading-mode
npx prisma generate
```

### 4. Update Environment Variables (Optional)

Add to `.env` if needed:
```
MAX_PDF_SIZE_MB=50
PDF_UPLOAD_PATH=uploads/pdfs
```

## API Endpoints

### Upload PDF
```
POST /api/admin/books/upload-pdf
Content-Type: multipart/form-data

Body:
{
  pdf: <PDF file>,
  title: string,
  author: string,
  description?: string,
  genre?: string,
  status?: "DRAFT" | "PUBLISHED"
}

Response:
{
  success: true,
  data: {
    book: {...},
    detectedChapters: number,
    message: string
  }
}
```

### Get Book Content
```
GET /api/books/:id/content?page=1&limit=10

Response (Continuous Mode):
{
  success: true,
  data: {
    book: {...},
    content: {
      mode: "continuous",
      pages: [...],
      pagination: {
        currentPage: 1,
        pageSize: 10,
        totalPages: 500,
        hasMore: true
      }
    }
  }
}

Response (Chapter Mode):
{
  success: true,
  data: {
    book: {...},
    content: {
      mode: "chapter",
      chapters: [...],
      totalChapters: 20
    }
  }
}
```

### Get Specific Page
```
GET /api/books/:id/pages/:pageNumber

Response:
{
  success: true,
  data: {
    pageNumber: 1,
    content: "...",
    wordCount: 250
  }
}
```

### Get Reading Progress
```
GET /api/books/:id/progress
Authorization: Bearer <token>

Response:
{
  success: true,
  data: {
    chapterId?: string,
    pageNumber?: number,
    scrollPosition: number,
    progressPercent: number,
    lastLocation?: string,
    updatedAt: string
  }
}
```

### Update Reading Progress
```
PUT /api/books/:id/progress
Authorization: Bearer <token>

Body (Chapter Mode):
{
  chapterId: string,
  progressPercent: number,
  lastLocation?: string
}

Body (Continuous Mode):
{
  pageNumber: number,
  scrollPosition: number,
  progressPercent: number
}
```

## Chapter Detection Algorithm

The system uses multiple strategies to detect chapters:

1. **PDF Bookmarks/Outline** - Reads PDF table of contents
2. **Text Pattern Matching** - Detects common chapter headings:
   - "Chapter 1", "Chapter I"
   - "Part 1", "Part I"
   - Numbered sections

If 2+ chapters are detected → CHAPTER mode
Otherwise → CONTINUOUS mode

## Frontend Integration

### Check Reading Mode

```javascript
const bookResponse = await fetch(`/api/books/${bookId}/content`);
const { content } = await bookResponse.json();

if (content.mode === 'continuous') {
  // Load continuous reader
} else {
  // Load chapter reader
}
```

### Lazy Loading Pages

```javascript
async function loadMorePages(bookId, page, limit = 10) {
  const response = await fetch(
    `/api/books/${bookId}/content?page=${page}&limit=${limit}`
  );
  const data = await response.json();
  return data.content.pages;
}
```

### Save Progress

```javascript
// Continuous mode
await fetch(`/api/books/${bookId}/progress`, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    pageNumber: currentPage,
    scrollPosition: window.scrollY,
    progressPercent: calculateProgress()
  })
});

// Chapter mode
await fetch(`/api/books/${bookId}/progress`, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    chapterId: currentChapterId,
    progressPercent: calculateProgress()
  })
});
```

## Performance Optimizations

1. **Lazy Loading**: Pages loaded in batches (default: 10 pages)
2. **Caching**: Implement client-side caching for loaded pages
3. **Indexing**: Database indexes on bookId, pageNumber
4. **Pagination**: Limit max pages per request to 50

## Text-to-Speech Integration

Both modes supported. See TTS implementation in next section.

## Testing

### Upload Test PDF
```bash
curl -X POST http://localhost:5002/api/admin/books/upload-pdf \
  -H "Authorization: Bearer <token>" \
  -F "pdf=@test-book.pdf" \
  -F "title=Test Book" \
  -F "author=Test Author"
```

### Fetch Content
```bash
# Continuous mode
curl http://localhost:5002/api/books/<bookId>/content?page=1&limit=5

# Get specific page
curl http://localhost:5002/api/books/<bookId>/pages/10
```

## Backward Compatibility

- Existing books with chapters continue to work unchanged
- New `readingMode` field defaults to "CHAPTER"
- Old progress tracking still works for chapter-based books
- No breaking changes to existing APIs

## Troubleshooting

### "No chapters detected" for book that has chapters
- Check if PDF has bookmarks/outline
- Verify chapter headings follow common patterns
- Manually review first few pages for chapter markers

### Upload fails
- Check file size (max 50MB)
- Verify PDF is not corrupted
- Check uploads/pdfs directory permissions

### Pages not loading
- Verify book.readingMode is "CONTINUOUS"
- Check pagination parameters (page >= 1, limit <= 50)
- Verify BookPage records exist in database

## Next Steps

1. Run migration
2. Test PDF upload with sample book
3. Implement continuous reader UI (see next guide)
4. Add TTS support for continuous mode
5. Test progress tracking and resumption
