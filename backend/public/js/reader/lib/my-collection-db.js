/**
 * My Collection — IndexedDB storage layer
 * Private, local-first book storage. Zero server sync.
 * Schema designed for future cloud sync without rewriting the reader.
 */
(function () {
  'use strict';

  const DB_NAME = 'NovaraMyCollection';
  const DB_VERSION = 1;
  const STORE_BOOKS = 'books';
  const STORE_CHAPTERS = 'chapters';
  const STORE_PROGRESS = 'progress';
  const STORE_BOOKMARKS = 'bookmarks';

  let dbPromise = null;

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = function (e) {
        const db = e.target.result;

        if (!db.objectStoreNames.contains(STORE_BOOKS)) {
          const store = db.createObjectStore(STORE_BOOKS, { keyPath: 'id' });
          store.createIndex('title', 'title', { unique: false });
          store.createIndex('uploadedAt', 'uploadedAt', { unique: false });
          store.createIndex('format', 'format', { unique: false });
        }

        if (!db.objectStoreNames.contains(STORE_CHAPTERS)) {
          const store = db.createObjectStore(STORE_CHAPTERS, { keyPath: 'id' });
          store.createIndex('bookId', 'bookId', { unique: false });
          store.createIndex('number', ['bookId', 'number'], { unique: true });
        }

        if (!db.objectStoreNames.contains(STORE_PROGRESS)) {
          const store = db.createObjectStore(STORE_PROGRESS, { keyPath: 'id' });
          store.createIndex('bookId', 'bookId', { unique: false });
        }

        if (!db.objectStoreNames.contains(STORE_BOOKMARKS)) {
          const store = db.createObjectStore(STORE_BOOKMARKS, { keyPath: 'id' });
          store.createIndex('bookId', 'bookId', { unique: false });
        }
      };
      request.onsuccess = function (e) {
        resolve(e.target.result);
      };
      request.onerror = function (e) {
        console.error('[MyCollectionDB] Open failed:', e.target.error);
        reject(e.target.error);
      };
    });
    return dbPromise;
  }

  function withStore(storeName, mode, callback) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        const tx = db.transaction(storeName, mode);
        const store = tx.objectStore(storeName);
        let settled = false;

        function resolveOnce(value) {
          if (settled) return;
          settled = true;
          resolve(value);
        }

        function rejectOnce(error) {
          if (settled) return;
          settled = true;
          reject(error);
        }

        let result;
        try {
          result = callback(store);
        } catch (err) {
          rejectOnce(err);
          return;
        }

        // If callback returned an IDBRequest, resolve with request.result instead of request object.
        if (result && typeof result === 'object' && 'onsuccess' in result && 'onerror' in result && 'result' in result) {
          result.onsuccess = function (e) {
            resolveOnce(e.target.result);
          };
          result.onerror = function (e) {
            rejectOnce(e.target.error);
          };
        }

        tx.oncomplete = function () {
          if (result && typeof result === 'object' && 'result' in result) {
            resolveOnce(result.result);
            return;
          }
          resolveOnce(result);
        };
        tx.onerror = function (e) {
          rejectOnce(e.target.error);
        };
        if (result && typeof result.then === 'function') {
          result.then(resolveOnce).catch(rejectOnce);
        }
      });
    });
  }

  function generateId() {
    return 'local_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  // ─── Book CRUD ────────────────────────────────────────────────

  function addBook(meta) {
    return withStore(STORE_BOOKS, 'readwrite', function (store) {
      const book = {
        id: generateId(),
        title: meta.title || 'Untitled',
        author: meta.author || 'Unknown Author',
        coverDataUri: meta.coverDataUri || '',
        format: meta.format || 'txt',
        genre: meta.genre || 'General',
        fileSize: meta.fileSize || 0,
        fileName: meta.fileName || '',
        description: meta.description || '',
        pageCount: meta.pageCount || 0,
        chapterCount: meta.chapterCount || 0,
        uploadedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastReadAt: null,
        fileData: meta.fileData || null, // stored as ArrayBuffer for PDF/EPUB
      };
      store.add(book);
      return book;
    });
  }

  function getBook(bookId) {
    return withStore(STORE_BOOKS, 'readonly', function (store) {
      return store.get(bookId);
    });
  }

  function getAllBooks() {
    return withStore(STORE_BOOKS, 'readonly', function (store) {
      return store.getAll();
    });
  }

  function deleteBook(bookId) {
    return Promise.all([
      withStore(STORE_BOOKS, 'readwrite', function (store) { store.delete(bookId); }),
      withStore(STORE_CHAPTERS, 'readwrite', function (store) {
        const index = store.index('bookId');
        const req = index.openCursor(IDBKeyRange.only(bookId));
        req.onsuccess = function (e) {
          const cursor = e.target.result;
          if (cursor) {
            store.delete(cursor.primaryKey);
            cursor.continue();
          }
        };
      }),
      withStore(STORE_PROGRESS, 'readwrite', function (store) {
        const index = store.index('bookId');
        const req = index.openCursor(IDBKeyRange.only(bookId));
        req.onsuccess = function (e) {
          const cursor = e.target.result;
          if (cursor) {
            store.delete(cursor.primaryKey);
            cursor.continue();
          }
        };
      }),
      withStore(STORE_BOOKMARKS, 'readwrite', function (store) {
        const index = store.index('bookId');
        const req = index.openCursor(IDBKeyRange.only(bookId));
        req.onsuccess = function (e) {
          const cursor = e.target.result;
          if (cursor) {
            store.delete(cursor.primaryKey);
            cursor.continue();
          }
        };
      }),
    ]);
  }

  function updateBookMeta(bookId, updates) {
    return getBook(bookId).then(function (book) {
      if (!book) throw new Error('Book not found: ' + bookId);
      Object.assign(book, updates, { updatedAt: new Date().toISOString() });
      return withStore(STORE_BOOKS, 'readwrite', function (store) {
        store.put(book);
        return book;
      });
    });
  }

  // ─── Chapters ─────────────────────────────────────────────────

  function addChapters(bookId, chapters) {
    return withStore(STORE_CHAPTERS, 'readwrite', function (store) {
      chapters.forEach(function (ch, i) {
        store.put({
          id: generateId(),
          bookId: bookId,
          number: ch.number || i + 1,
          title: ch.title || 'Chapter ' + (i + 1),
          content: ch.content || '',
          createdAt: new Date().toISOString(),
        });
      });
    });
  }

  function getChapters(bookId) {
    return withStore(STORE_CHAPTERS, 'readonly', function (store) {
      const items = [];
      const index = store.index('bookId');
      const req = index.openCursor(IDBKeyRange.only(bookId));
      req.onsuccess = function (e) {
        const cursor = e.target.result;
        if (cursor) {
          items.push(cursor.value);
          cursor.continue();
        }
      };
      return items;
    }).then(function (items) {
      items.sort(function (a, b) { return a.number - b.number; });
      return items;
    });
  }

  function getChapterCount(bookId) {
    return getChapters(bookId).then(function (chapters) { return chapters.length; });
  }

  // ─── Reading Progress ──────────────────────────────────────────

  function saveProgress(bookId, chapterId, data) {
    return withStore(STORE_PROGRESS, 'readwrite', function (store) {
      const entry = {
        id: bookId + '_' + chapterId,
        bookId: bookId,
        chapterId: chapterId,
        scrollTop: data.scrollTop || 0,
        percent: data.percent || 0,
        updatedAt: new Date().toISOString(),
      };
      store.put(entry);
      return entry;
    }).then(function () {
      // Touch lastReadAt on the book
      return updateBookMeta(bookId, { lastReadAt: new Date().toISOString() });
    });
  }

  function getProgress(bookId, chapterId) {
    return withStore(STORE_PROGRESS, 'readonly', function (store) {
      return store.get(bookId + '_' + chapterId);
    });
  }

  function getAllProgress(bookId) {
    return withStore(STORE_PROGRESS, 'readonly', function (store) {
      const items = [];
      const index = store.index('bookId');
      const req = index.openCursor(IDBKeyRange.only(bookId));
      req.onsuccess = function (e) {
        const cursor = e.target.result;
        if (cursor) {
          items.push(cursor.value);
          cursor.continue();
        }
      };
      return items;
    });
  }

  function getBookProgressPercent(bookId) {
    return Promise.all([
      getChapterCount(bookId),
      getAllProgress(bookId),
    ]).then(function (results) {
      var chapterCount = results[0] || 1;
      var entries = results[1] || [];
      var maxProgress = 0;
      var chapterWeight = 1 / chapterCount;
      entries.forEach(function (entry) {
        var chapterScore = (entry.percent || 0) / 100 * chapterWeight;
        var baseScore = ((entry.chapterId ? parseInt(entry.chapterId.replace(/\D/g, ''), 10) || 0 : 0) - 1) * chapterWeight;
        maxProgress = Math.max(maxProgress, baseScore + chapterScore);
      });
      return Math.min(100, Math.round(maxProgress * 100));
    });
  }

  // ─── Bookmarks ────────────────────────────────────────────────

  function addBookmark(bookId, chapterId, note, chapterTitle) {
    return withStore(STORE_BOOKMARKS, 'readwrite', function (store) {
      store.add({
        id: generateId(),
        bookId: bookId,
        chapterId: chapterId,
        chapterTitle: chapterTitle || '',
        note: note || '',
        createdAt: new Date().toISOString(),
      });
    });
  }

  function getBookmarks(bookId) {
    return withStore(STORE_BOOKMARKS, 'readonly', function (store) {
      const items = [];
      const index = store.index('bookId');
      const req = index.openCursor(IDBKeyRange.only(bookId));
      req.onsuccess = function (e) {
        const cursor = e.target.result;
        if (cursor) {
          items.push(cursor.value);
          cursor.continue();
        }
      };
      return items;
    });
  }

  // ─── Search ────────────────────────────────────────────────────

  function searchBooks(query) {
    query = query.trim().toLowerCase();
    if (!query) return getAllBooks();
    return getAllBooks().then(function (books) {
      return books.filter(function (b) {
        return (b.title && b.title.toLowerCase().includes(query)) ||
               (b.author && b.author.toLowerCase().includes(query)) ||
               (b.genre && b.genre.toLowerCase().includes(query)) ||
               (b.description && b.description.toLowerCase().includes(query));
      });
    });
  }

  // ─── Public API ────────────────────────────────────────────────

  window.MyCollectionDB = {
    addBook: addBook,
    getBook: getBook,
    getAllBooks: getAllBooks,
    deleteBook: deleteBook,
    updateBookMeta: updateBookMeta,
    addChapters: addChapters,
    getChapters: getChapters,
    getChapterCount: getChapterCount,
    saveProgress: saveProgress,
    getProgress: getProgress,
    getAllProgress: getAllProgress,
    getBookProgressPercent: getBookProgressPercent,
    addBookmark: addBookmark,
    getBookmarks: getBookmarks,
    searchBooks: searchBooks,
    generateId: generateId,
  };
})();
