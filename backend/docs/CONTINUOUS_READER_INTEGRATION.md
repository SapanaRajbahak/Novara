# Continuous Reader Integration Guide

This guide explains how to integrate the continuous reading mode into the existing Novara reader.

## Overview

The continuous reader allows users to read books page-by-page with infinite scroll, instead of the traditional chapter-based navigation. It automatically loads pages as the user scrolls and tracks reading progress.

## Files Created

1. **`backend/public/js/reader/continuous-reader.js`** - Core continuous reader class
2. **`backend/public/css/continuous-reader.css`** - Styling for continuous mode
3. **`backend/controllers/bookContentController.js`** - API endpoints for content delivery
4. **`backend/controllers/pdfUploadController.js`** - PDF upload and processing
5. **`backend/routes/bookContentRoutes.js`** - Routes for content APIs
6. **`backend/routes/pdfUploadRoutes.js`** - Routes for PDF upload
7. **`backend/services/pdfProcessingService.js`** - PDF text extraction and chapter detection

## Integration Steps

### Step 1: Add Scripts to reader.html

Add these script tags **before** the closing `</body>` tag in `backend/public/reader/reader.html`:

```html
<!-- Continuous Reader (load before reader.js) -->
<script src="/js/reader/continuous-reader.js"></script>

<!-- Add continuous reader CSS in <head> -->
<link rel="stylesheet" href="/css/continuous-reader.css">
```

### Step 2: Modify reader.js Bootstrap Function

In `backend/public/js/reader/reader.js`, find the `bootstrap()` function around line 2950. After loading the book, check if it's in continuous mode:

```javascript
async function bootstrap() {
  // ... existing code to load book ...
  
  // After loading book metadata:
  if (book && book.readingMode === 'CONTINUOUS') {
    console.log('[reader] Initializing continuous reader mode');
    
    // Initialize continuous reader
    const continuousReader = new ContinuousReader(
      book.id,
      'readerContent' // ID of the container element
    );
    
    // Store reference for TTS integration
    state.continuousReader = continuousReader;
    
    // Hide chapter navigation for continuous mode
    elements.chapterDrawer.classList.add('hidden');
    elements.prevBtn.style.display = 'none';
    elements.nextBtn.style.display = 'none';
    
    // Update toolbar
    elements.toolbarBookTitle.textContent = book.title;
    elements.toolbarChapterTitle.textContent = `${book.totalPages} pages`;
    
    // Skip normal chapter loading
    return;
  }
  
  // ... rest of existing chapter-based loading code ...
}
```

### Step 3: Update TTS for Continuous Mode

Modify the `handleListen()` function to support continuous mode:

```javascript
function handleListen() {
  if (!state.currentChapter && !state.continuousReader) {
    return;
  }

  if (state.listen.isPlaying) {
    pausePlayback();
    return;
  }

  if (state.listen.mode === "audiobook" || state.listen.mode === "tts") {
    resumePlayback();
    return;
  }

  // For continuous mode, get current page content
  if (state.continuousReader) {
    const currentPageContent = state.continuousReader.getCurrentPageContent();
    if (currentPageContent) {
      startTTS(currentPageContent);
    } else {
      showToast("No content available on current page");
    }
    return;
  }

  // Existing chapter-based TTS code
  const audioUrl = getCurrentChapterAudioUrl();
  if (audioUrl) {
    startAudiobook(audioUrl);
    return;
  }

  startTTS(state.currentChapter.content || "");
}
```

### Step 4: Fetch Book Reading Mode from API

Update `fetchBookMetadata()` to include readingMode:

```javascript
async function fetchBookMetadata(bookId) {
  const response = await fetch(`${API_BASE_URL}/api/books/${encodeURIComponent(bookId)}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch book metadata (HTTP ${response.status})`);
  }

  const payload = await response.json();
  if (!payload.success || !payload.data) {
    throw new Error("Book metadata response is invalid");
  }

  const book = payload.data;
  return {
    id: book.id,
    title: book.title,
    readingMode: book.readingMode || 'CHAPTER', // NEW: Reading mode
    totalPages: book.totalPages || null,        // NEW: Total pages
    hasAudiobook: Boolean(book.isAudiobookAvailable),
    audiobookTracks: [],
  };
}
```

### Step 5: Update Book API to Return Reading Mode

In `backend/controllers/bookController.js`, ensure the book detail endpoint returns `readingMode`:

```javascript
// In the book detail function
res.json({
  success: true,
  data: {
    id: book.id,
    title: book.title,
    authorName: book.authorName,
    description: book.description,
    readingMode: book.readingMode,      // Include this
    totalPages: book.totalPages,         // Include this
    // ... other fields
  }
});
```

### Step 6: Add State to reader.js

Add continuous reader state to the `state` object at the top of reader.js:

```javascript
const state = {
  currentBook: null,
  currentUser: null,
  chapterCache: {},
  currentChapter: null,
  currentChapterIndex: 0,
  bookSource: 'api',
  continuousReader: null,  // NEW: Reference to continuous reader instance
  // ... rest of existing state
};
```

### Step 7: Clean Up on Page Unload

Update the `beforeunload` event listener to clean up the continuous reader:

```javascript
window.addEventListener("beforeunload", () => {
  saveProgress();
  saveListenProgress();
  syncListeningProgressToApi({ force: true, keepalive: true });
  stopPlayback();
  
  // Clean up continuous reader
  if (state.continuousReader) {
    state.continuousReader.destroy();
  }
  
  if (state.localFileUrl) {
    URL.revokeObjectURL(state.localFileUrl);
  }
});
```

## Testing the Integration

### 1. Install Dependencies

```bash
cd backend
npm install pdfjs-dist multer
```

### 2. Run Setup Script

```bash
node scripts/setup-pdf-import.js
```

### 3. Run Database Migration

```bash
npx prisma migrate dev --name add-continuous-reading-mode
npx prisma generate
```

### 4. Test PDF Upload

Upload a PDF via the admin interface using the new endpoint:

```
POST /api/admin/books/upload-pdf
```

The system will automatically detect chapters or create a continuous reading mode book.

### 5. Open Book in Reader

Navigate to the book in the reader. If it's in continuous mode, you should see:
- Pages loading incrementally
- Infinite scroll
- Progress tracking
- Page numbers instead of chapter titles

## API Endpoints Reference

### Get Book Content
```
GET /api/books/:id/content?page=1&limit=10
```

Returns pages for continuous mode or chapter list for chapter mode.

### Get Specific Page
```
GET /api/books/:id/pages/:pageNumber
```

Returns content for a specific page (continuous mode only).

### Get Reading Progress
```
GET /api/books/:id/progress
```

Returns user's reading progress (authenticated).

### Update Reading Progress
```
PUT /api/books/:id/progress

Body:
{
  "pageNumber": 10,
  "scrollPosition": 1200,
  "progressPercent": 45
}
```

## Troubleshooting

### Books Always Load in Chapter Mode

**Cause**: Book's `readingMode` field is not being fetched or is NULL.

**Solution**: Ensure the book API returns `readingMode` field and it's set to `'CONTINUOUS'`.

### Pages Not Loading

**Cause**: Content endpoint not returning pages.

**Solution**: Verify `BookPage` records exist in database for the book. Check browser console for API errors.

### TTS Not Working

**Cause**: `getCurrentPageContent()` returning empty string.

**Solution**: Ensure pages are loaded before clicking Listen. Check that `loadedPages` Map is populated.

### Progress Not Saving

**Cause**: User not authenticated or progress endpoint failing.

**Solution**: Ensure user is logged in. Check network tab for API errors.

## Next Steps

1. **Styling Customization**: Modify `continuous-reader.css` to match your design
2. **Performance Optimization**: Add caching layer for frequently accessed pages
3. **Analytics**: Track reading patterns (pages per session, completion rate)
4. **Enhanced UX**: Add page jump feature, minimap, or progress visualization

## Full Documentation

See `backend/docs/PDF_IMPORT_MIGRATION_GUIDE.md` for complete system documentation.
