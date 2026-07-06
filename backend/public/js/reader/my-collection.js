/**
 * My Collection — Controller
 * Handles upload, metadata extraction, rendering, search, delete, and navigation to reader.
 */
(function () {
  'use strict';

  const DB = window.MyCollectionDB;
  const EP = window.EpubParser;
  if (!DB || !EP) {
    console.error('[MyCollection] Required modules not loaded');
    return;
  }

  // Check for external libraries
  if (typeof JSZip === 'undefined') {
    console.warn('[MyCollection] JSZip not loaded - EPUB upload will not work');
  }
  if (typeof pdfjsLib === 'undefined') {
    console.error('[MyCollection] PDF.js not loaded - PDF uploads will fail');
  } else {
    console.log('[MyCollection] PDF.js loaded successfully');
  }

  // ─── Elements ──────────────────────────────────────────────────
  const els = {
    searchInput: document.getElementById('collectionSearchInput'),
    uploadBtn: document.getElementById('uploadBtn'),
    fileInput: document.getElementById('fileInput'),
    recentRow: document.getElementById('recentRow'),
    collectionGrid: document.getElementById('collectionGrid'),
    collectionHeading: document.getElementById('collectionHeading'),
    collectionCount: document.getElementById('collectionCount'),
    recentSection: document.getElementById('recentSection'),
    emptyState: document.getElementById('emptyState'),
    emptyUploadBtn: document.getElementById('emptyUploadBtn'),
    uploadProgressModal: document.getElementById('uploadProgressModal'),
    uploadProgressList: document.getElementById('uploadProgressList'),
    uploadProgressBar: document.getElementById('uploadProgressBar'),
    uploadProgressText: document.getElementById('uploadProgressText'),
    deleteModal: document.getElementById('deleteModal'),
    deleteBookTitle: document.getElementById('deleteBookTitle'),
    deleteConfirmBtn: document.getElementById('deleteConfirmBtn'),
    deleteCancelBtn: document.getElementById('deleteCancelBtn'),
    deleteModalClose: document.getElementById('deleteModalClose'),
  };

  let allBooks = [];
  let searchQuery = '';
  let pendingDeleteBookId = null;

  // ─── Helpers ──────────────────────────────────────────────────

  function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  }

  function getCoverOrDefault(book) {
    if (book.coverDataUri) return book.coverDataUri;
    return createCoverSvgLocal(book.title, book.genre);
  }

  function createCoverSvgLocal(title, genre) {
    var initials = String(title || 'Book')
      .split(' ')
      .map(function (w) { return w[0]; })
      .slice(0, 2)
      .join('')
      .toUpperCase();

    var palette = {
      Romance: ['#6a3047', '#bf6e91'],
      Fantasy: ['#553458', '#9d6aa6'],
      Mystery: ['#23323f', '#46667b'],
      Thriller: ['#3f2a1b', '#ab6a3a'],
      'Sci-Fi': ['#1f3d55', '#53a2d8'],
      Historical: ['#4f412d', '#a58a5a'],
      Drama: ['#3f3348', '#8672a1'],
      default: ['#2d3b3a', '#608982'],
    };
    var p = palette[genre] || palette.default;
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400">' +
      '<defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1">' +
      '<stop offset="0%" stop-color="' + p[0] + '"/>' +
      '<stop offset="100%" stop-color="' + p[1] + '"/>' +
      '</linearGradient></defs>' +
      '<rect width="100%" height="100%" rx="22" fill="url(#g)"/>' +
      '<rect x="22" y="24" width="256" height="352" rx="16" fill="rgba(255,255,255,0.10)"/>' +
      '<text x="50%" y="55%" dominant-baseline="middle" text-anchor="middle" fill="rgba(255,255,255,0.9)" font-family="Arial" font-size="62" font-weight="700">' + initials + '</text>' +
      '</svg>';
    return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
  }

  function showToast(msg) {
    var root = document.getElementById('toastRoot');
    if (!root) {
      root = document.createElement('div');
      root.id = 'toastRoot';
      root.className = 'toast-root';
      document.body.appendChild(root);
    }
    var t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    root.appendChild(t);
    setTimeout(function () {
      t.classList.add('hide');
      setTimeout(function () { t.remove(); }, 200);
    }, 1800);
  }

  // ─── Render ───────────────────────────────────────────────────

  function createCollectionCard(book) {
    var progressPct = 0;
    var progressText = '';
    // Progress will be loaded async later
    var card = document.createElement('article');
    card.className = 'collection-card';
    card.dataset.bookId = book.id;

    var formatLabel = (book.format || 'txt').toUpperCase();
    var coverSrc = getCoverOrDefault(book);

    card.innerHTML =
      '<div class="collection-card__cover-wrap">' +
        '<img class="collection-card__cover" src="' + coverSrc + '" alt="' + escHtml(book.title) + ' cover" loading="lazy" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'grid\'" />' +
        '<div class="collection-card__cover-placeholder" style="display:none">' + escHtml(formatLabel) + '</div>' +
        '<div class="collection-card__private-badge">Private</div>' +
      '</div>' +
      '<div class="collection-card__body">' +
        '<p class="collection-card__title">' + escHtml(book.title) + '</p>' +
        '<p class="collection-card__author">' + escHtml(book.author) + '</p>' +
        '<div class="collection-card__meta">' +
          '<span class="collection-card__format-tag">' + formatLabel + '</span>' +
          '<span style="font-size:0.68rem;color:var(--muted)">' + formatFileSize(book.fileSize) + '</span>' +
        '</div>' +
        '<div class="collection-card__progress-wrap">' +
          '<div class="collection-card__progress-track">' +
            '<div class="collection-card__progress-fill" style="width:0%"></div>' +
          '</div>' +
          '<p class="collection-card__progress-text">0%</p>' +
        '</div>' +
      '</div>' +
      '<div class="collection-card__actions">' +
        '<a href="' + getReaderUrl(book) + '">Read</a>' +
        '<button type="button" class="delete-book-btn" data-book-id="' + book.id + '">Delete</button>' +
      '</div>';

    // Load progress async
    loadCardProgress(card, book);

    return card;
  }

  function escHtml(str) {
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(String(str)));
    return div.innerHTML;
  }

  function getReaderUrl(book) {
    var params = new URLSearchParams();
    params.set('bookId', book.id);
    params.set('source', 'collection');
    return '/reader/reader.html?' + params.toString();
  }

  function loadCardProgress(card, book) {
    DB.getBookProgressPercent(book.id).then(function (pct) {
      var fill = card.querySelector('.collection-card__progress-fill');
      var text = card.querySelector('.collection-card__progress-text');
      if (fill) fill.style.width = pct + '%';
      if (text) text.textContent = pct + '%';
    }).catch(function () {});
  }

  function renderCollection(books) {
    var el = els.collectionGrid;
    el.innerHTML = '';

    if (books.length === 0) {
      els.emptyState.hidden = false;
      els.recentSection.hidden = true;
      els.collectionCount.textContent = '';
      return;
    }

    els.emptyState.hidden = true;
    els.recentSection.hidden = false;
    els.collectionCount.textContent = books.length + ' book' + (books.length !== 1 ? 's' : '');

    books.forEach(function (book) {
      el.appendChild(createCollectionCard(book));
    });
  }

  function renderRecent(books) {
    var el = els.recentRow;
    el.innerHTML = '';
    var recent = books.slice().sort(function (a, b) {
      return b.uploadedAt.localeCompare(a.uploadedAt);
    }).slice(0, 8);

    if (recent.length === 0) {
      el.innerHTML = '<div class="empty-state"><div><strong>Nothing here yet</strong><p>Upload books to see them here.</p></div></div>';
      return;
    }

    recent.forEach(function (book) {
      var card = document.createElement('article');
      card.className = 'collection-rail-card';
      var coverSrc = getCoverOrDefault(book);
      card.innerHTML =
        '<img class="cover" src="' + coverSrc + '" alt="' + escHtml(book.title) + ' cover" loading="lazy" />' +
        '<p class="collection-rail-card__title">' + escHtml(book.title) + '</p>' +
        '<p class="collection-rail-card__meta">' + escHtml(book.author) + '</p>' +
        '<a class="solid-btn" href="' + getReaderUrl(book) + '" style="margin-top:auto;text-align:center;font-size:0.75rem;padding:0.4rem 0.6rem">Read</a>';
      el.appendChild(card);
    });
  }

  function refresh() {
    var query = searchQuery.trim().toLowerCase();
    var filter = query
      ? allBooks.filter(function (b) {
          return (b.title && b.title.toLowerCase().includes(query)) ||
                 (b.author && b.author.toLowerCase().includes(query)) ||
                 (b.genre && b.genre.toLowerCase().includes(query));
        })
      : allBooks;

    renderRecent(filter);
    renderCollection(filter);
  }

  function loadAll() {
    DB.getAllBooks().then(function (books) {
      allBooks = books || [];
      refresh();
    }).catch(function (err) {
      console.error('[MyCollection] Failed to load books:', err);
      showToast('Failed to load your collection');
    });
  }

  // ─── Upload ───────────────────────────────────────────────────

  function handleFiles(files) {
    if (!files || files.length === 0) return;
    var fileArray = Array.from(files);
    showUploadModal(fileArray.length);

    var results = [];
    var completed = 0;
    var errors = 0;

    function updateProgress() {
      var pct = Math.round((completed / fileArray.length) * 100);
      els.uploadProgressBar.style.width = pct + '%';
      els.uploadProgressText.textContent = completed + ' of ' + fileArray.length + ' processed' + (errors > 0 ? ' (' + errors + ' errors)' : '');
    }

    function addProgressItem(fileName, status, extra) {
      var item = document.createElement('div');
      item.className = 'upload-progress-item';
      var icon = status === 'done' ? '✓' : status === 'error' ? '✗' : '⋯';
      item.innerHTML =
        '<span class="status-icon ' + status + '">' + icon + '</span>' +
        '<span class="file-name">' + escHtml(fileName) + '</span>' +
        '<span class="file-status">' + escHtml(extra || '') + '</span>';
      els.uploadProgressList.appendChild(item);
    }

    fileArray.forEach(function (file) {
      addProgressItem(file.name, 'processing', 'Extracting...');

      processFile(file).then(function (result) {
        if (result) {
          addProgressItem(file.name, 'done', 'Imported ✓');
          results.push(result);
        } else {
          errors++;
          addProgressItem(file.name, 'error', 'Skipped');
        }
      }).catch(function (err) {
        errors++;
        addProgressItem(file.name, 'error', err.message || 'Error');
      }).finally(function () {
        completed++;
        updateProgress();
        if (completed === fileArray.length) {
          finishUpload(results);
        }
      });
    });
  }

  async function processFile(file) {
    var ext = file.name.split('.').pop().toLowerCase();
    
    try {
      var arrayBuffer = await EP.readAsArrayBuffer(file);
    } catch (err) {
      console.error('[MyCollection] Failed to read file:', file.name, err);
      throw new Error('Failed to read file: ' + (err.message || 'Unknown error'));
    }

    if (ext === 'epub') {
      var parsed = await EP.parseEpub(arrayBuffer);
      var bookMeta = {
        title: parsed.title || file.name.replace(/\.[^.]+$/, ''),
        author: parsed.author || 'Unknown Author',
        coverDataUri: parsed.coverDataUri || '',
        format: 'epub',
        genre: parsed.genre || 'General',
        fileSize: file.size,
        fileName: file.name,
        description: parsed.description || '',
        chapterCount: parsed.chapters.length,
        fileData: arrayBuffer, // keep raw for PDF rendering
      };
      var book = await DB.addBook(bookMeta);
      await DB.addChapters(book.id, parsed.chapters);
      return book;
    }

    if (ext === 'txt') {
      var txtParsed = await EP.parseTxt(arrayBuffer);
      // Try to extract title from first line
      var firstLine = txtParsed.chapters[0]?.content.split('\n')[0] || '';
      var title = firstLine.replace(/^[#*\s]+/, '').trim() || file.name.replace(/\.[^.]+$/, '');
      var txtBookMeta = {
        title: title,
        author: txtParsed.author || 'Unknown Author',
        coverDataUri: '',
        format: 'txt',
        genre: 'General',
        fileSize: file.size,
        fileName: file.name,
        chapterCount: txtParsed.chapters.length,
      };
      var txtBook = await DB.addBook(txtBookMeta);
      await DB.addChapters(txtBook.id, txtParsed.chapters);
      return txtBook;
    }

    if (ext === 'pdf') {
      try {
        var pdfParsed = await EP.parsePdf(arrayBuffer);
        var pdfTitle = pdfParsed.title || file.name.replace(/\.[^.]+$/, '');
        var pdfAuthor = pdfParsed.author || 'Unknown Author';
        var pdfBookMeta = {
          title: pdfTitle,
          author: pdfAuthor,
          coverDataUri: '',
          format: 'pdf',
          genre: 'General',
          fileSize: file.size,
          fileName: file.name,
          chapterCount: pdfParsed.chapters.length,
          fileData: arrayBuffer,
        };
        var pdfBook = await DB.addBook(pdfBookMeta);
        await DB.addChapters(pdfBook.id, pdfParsed.chapters);
        return pdfBook;
      } catch (pdfErr) {
        console.error('[MyCollection] PDF parsing failed:', file.name, pdfErr);
        throw new Error('PDF parsing failed: ' + (pdfErr.message || 'Unknown error'));
      }
    }

    return null;
  }

  function finishUpload(results) {
    setTimeout(function () {
      closeUploadModal();
      if (results.length > 0) {
        showToast(results.length + ' book' + (results.length !== 1 ? 's' : '') + ' imported successfully');
      }
      loadAll();
    }, 600);
  }

  function showUploadModal(count) {
    els.uploadProgressList.innerHTML = '';
    els.uploadProgressBar.style.width = '0%';
    els.uploadProgressText.textContent = 'Processing 0 of ' + count + '...';
    els.uploadProgressModal.setAttribute('aria-hidden', 'false');
  }

  function closeUploadModal() {
    els.uploadProgressModal.setAttribute('aria-hidden', 'true');
  }

  // ─── Delete ───────────────────────────────────────────────────

  function confirmDelete(bookId) {
    pendingDeleteBookId = bookId;
    var book = allBooks.find(function (b) { return b.id === bookId; });
    els.deleteBookTitle.textContent = book ? '"' + book.title + '"' : 'this book';
    els.deleteModal.setAttribute('aria-hidden', 'false');
  }

  function executeDelete() {
    if (!pendingDeleteBookId) return;
    var id = pendingDeleteBookId;
    pendingDeleteBookId = null;
    els.deleteModal.setAttribute('aria-hidden', 'true');

    DB.deleteBook(id).then(function () {
      showToast('Book deleted');
      loadAll();
    }).catch(function (err) {
      console.error('[MyCollection] Delete failed:', err);
      showToast('Failed to delete book');
    });
  }

  function closeDeleteModal() {
    pendingDeleteBookId = null;
    els.deleteModal.setAttribute('aria-hidden', 'true');
  }

  // ─── Events ───────────────────────────────────────────────────

  function bindEvents() {
    // Upload trigger
    els.uploadBtn.addEventListener('click', function () {
      els.fileInput.click();
    });
    els.emptyUploadBtn.addEventListener('click', function () {
      els.fileInput.click();
    });

    els.fileInput.addEventListener('change', function () {
      handleFiles(els.fileInput.files);
      els.fileInput.value = '';
    });

    // Search
    els.searchInput.addEventListener('input', function () {
      searchQuery = els.searchInput.value;
      refresh();
    });

    // Delete via delegation on grid
    els.collectionGrid.addEventListener('click', function (e) {
      var btn = e.target.closest('.delete-book-btn');
      if (btn) {
        e.preventDefault();
        confirmDelete(btn.dataset.bookId);
      }
    });

    // Delete modal
    els.deleteConfirmBtn.addEventListener('click', executeDelete);
    els.deleteCancelBtn.addEventListener('click', closeDeleteModal);
    els.deleteModalClose.addEventListener('click', closeDeleteModal);
    els.deleteModal.addEventListener('click', function (e) {
      if (e.target === els.deleteModal) closeDeleteModal();
    });

    // Upload progress modal overlay (don't close when clicking overlay during upload)
    els.uploadProgressModal.addEventListener('click', function (e) {
      if (e.target === els.uploadProgressModal && !document.querySelector('#uploadProgressList .status-icon.error')) {
        // Only allow closing if no errors in current batch
      }
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        if (els.deleteModal.getAttribute('aria-hidden') === 'false') closeDeleteModal();
        if (els.uploadProgressModal.getAttribute('aria-hidden') === 'false') closeUploadModal();
      }
    });

    // Drag and drop on the page
    document.addEventListener('dragover', function (e) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    });
    document.addEventListener('drop', function (e) {
      e.preventDefault();
      var droppedFiles = e.dataTransfer.files;
      if (droppedFiles && droppedFiles.length > 0) {
        var validFiles = Array.from(droppedFiles).filter(function (f) {
          var ext = f.name.split('.').pop().toLowerCase();
          return ['epub', 'pdf', 'txt'].indexOf(ext) >= 0;
        });
        if (validFiles.length > 0) {
          handleFiles(validFiles);
        } else {
          showToast('Only EPUB, PDF, and TXT files are supported');
        }
      }
    });
  }

  // ─── Init ─────────────────────────────────────────────────────

  function init() {
    bindEvents();
    loadAll();
  }

  // Wait for DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
