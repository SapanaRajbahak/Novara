/**
 * Continuous Reader
 * Handles continuous reading mode with lazy loading and progress tracking
 */

class ContinuousReader {
  constructor(bookId, containerId) {
    this.bookId = bookId;
    this.container = document.getElementById(containerId);
    this.currentPage = 1;
    this.pageSize = 10;
    this.isLoading = false;
    this.hasMore = true;
    this.loadedPages = new Map(); // Cache loaded pages
    this.observer = null;
    this.lastScrollPosition = 0;
    this.progressSaveTimeout = null;
    
    this.init();
  }

  async init() {
    try {
      // Load book metadata
      const response = await fetch(`/api/books/${this.bookId}/content`);
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to load book');
      }
      
      if (data.data.content.mode !== 'continuous') {
        throw new Error('This book is not in continuous reading mode');
      }
      
      this.book = data.data.book;
      this.totalPages = data.data.content.pagination.totalPages;
      
      // Load saved progress
      await this.loadProgress();
      
      // Load initial pages
      await this.loadPages(this.currentPage);
      
      // Setup infinite scroll
      this.setupInfiniteScroll();
      
      // Setup progress tracking
      this.setupProgressTracking();
      
      console.log('[ContinuousReader] Initialized successfully');
    } catch (error) {
      console.error('[ContinuousReader] Initialization error:', error);
      this.showError(error.message);
    }
  }

  async loadProgress() {
    try {
      const response = await fetch(`/api/books/${this.bookId}/progress`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      const data = await response.json();
      
      if (data.success && data.data) {
        this.currentPage = data.data.pageNumber || 1;
        this.lastScrollPosition = data.data.scrollPosition || 0;
        console.log(`[ContinuousReader] Resuming from page ${this.currentPage}, scroll ${this.lastScrollPosition}`);
      }
    } catch (error) {
      console.error('[ContinuousReader] Error loading progress:', error);
      // Continue with defaults
    }
  }

  async loadPages(startPage) {
    if (this.isLoading || !this.hasMore) return;
    
    this.isLoading = true;
    this.showLoadingIndicator();
    
    try {
      const response = await fetch(
        `/api/books/${this.bookId}/content?page=${startPage}&limit=${this.pageSize}`
      );
      
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to load pages');
      }
      
      const { pages, pagination } = data.data.content;
      
      // Cache and render pages
      pages.forEach(page => {
        this.loadedPages.set(page.pageNumber, page);
        this.renderPage(page);
      });
      
      this.hasMore = pagination.hasMore;
      
      // If this was the initial load and we have a saved scroll position
      if (startPage === this.currentPage && this.lastScrollPosition > 0) {
        setTimeout(() => {
          window.scrollTo(0, this.lastScrollPosition);
          this.lastScrollPosition = 0; // Clear it so we don't re-scroll
        }, 100);
      }
      
      console.log(`[ContinuousReader] Loaded pages ${startPage}-${startPage + pages.length - 1}`);
    } catch (error) {
      console.error('[ContinuousReader] Error loading pages:', error);
      this.showError('Failed to load pages. Please try again.');
    } finally {
      this.isLoading = false;
      this.hideLoadingIndicator();
    }
  }

  renderPage(page) {
    const pageEl = document.createElement('div');
    pageEl.className = 'continuous-page';
    pageEl.dataset.pageNumber = page.pageNumber;
    pageEl.id = `page-${page.pageNumber}`;
    
    // Add page number indicator
    const pageNumber = document.createElement('div');
    pageNumber.className = 'page-number';
    pageNumber.textContent = `Page ${page.pageNumber}`;
    
    // Add content
    const content = document.createElement('div');
    content.className = 'page-content';
    content.textContent = page.content;
    
    pageEl.appendChild(pageNumber);
    pageEl.appendChild(content);
    
    this.container.appendChild(pageEl);
  }

  setupInfiniteScroll() {
    // Use Intersection Observer to detect when user scrolls near bottom
    const sentinel = document.createElement('div');
    sentinel.id = 'scroll-sentinel';
    sentinel.style.height = '1px';
    this.container.appendChild(sentinel);
    
    this.observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting && this.hasMore && !this.isLoading) {
            const nextPage = Math.floor(this.loadedPages.size / this.pageSize) + 1;
            this.loadPages(nextPage);
          }
        });
      },
      {
        rootMargin: '200px' // Start loading 200px before sentinel is visible
      }
    );
    
    this.observer.observe(sentinel);
  }

  setupProgressTracking() {
    // Save progress on scroll (debounced)
    let scrollTimeout = null;
    window.addEventListener('scroll', () => {
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        this.saveProgress();
      }, 1000); // Save 1 second after user stops scrolling
    });
    
    // Save progress on page visibility change (tab switch, window close)
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.saveProgress(true); // Force immediate save
      }
    });
    
    // Save progress on page unload
    window.addEventListener('beforeunload', () => {
      this.saveProgress(true);
    });
  }

  async saveProgress(immediate = false) {
    const token = localStorage.getItem('token');
    if (!token) return; // User not logged in
    
    // Determine current page based on scroll position
    const currentPageNumber = this.getCurrentPageNumber();
    const scrollPosition = window.scrollY;
    const progressPercent = this.calculateProgressPercent();
    
    const progressData = {
      pageNumber: currentPageNumber,
      scrollPosition: scrollPosition,
      progressPercent: progressPercent
    };
    
    if (immediate) {
      // Use sendBeacon for immediate save on page unload
      const blob = new Blob([JSON.stringify(progressData)], { type: 'application/json' });
      navigator.sendBeacon(`/api/books/${this.bookId}/progress`, blob);
    } else {
      // Debounce regular saves
      clearTimeout(this.progressSaveTimeout);
      this.progressSaveTimeout = setTimeout(async () => {
        try {
          await fetch(`/api/books/${this.bookId}/progress`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(progressData)
          });
          
          console.log(`[ContinuousReader] Progress saved: page ${currentPageNumber}, ${progressPercent}%`);
        } catch (error) {
          console.error('[ContinuousReader] Error saving progress:', error);
        }
      }, 2000); // Save 2 seconds after scroll stops
    }
  }

  getCurrentPageNumber() {
    // Find which page is currently most visible
    const pages = document.querySelectorAll('.continuous-page');
    let mostVisiblePage = null;
    let maxVisibleHeight = 0;
    
    pages.forEach(page => {
      const rect = page.getBoundingClientRect();
      const visibleHeight = Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0);
      
      if (visibleHeight > maxVisibleHeight) {
        maxVisibleHeight = visibleHeight;
        mostVisiblePage = page;
      }
    });
    
    return mostVisiblePage ? parseInt(mostVisiblePage.dataset.pageNumber) : 1;
  }

  calculateProgressPercent() {
    if (!this.totalPages) return 0;
    
    const currentPage = this.getCurrentPageNumber();
    return Math.round((currentPage / this.totalPages) * 100);
  }

  showLoadingIndicator() {
    let loader = document.getElementById('continuous-loader');
    if (!loader) {
      loader = document.createElement('div');
      loader.id = 'continuous-loader';
      loader.className = 'continuous-loader';
      loader.innerHTML = '<div class="spinner"></div><p>Loading more pages...</p>';
      this.container.appendChild(loader);
    }
    loader.style.display = 'block';
  }

  hideLoadingIndicator() {
    const loader = document.getElementById('continuous-loader');
    if (loader) {
      loader.style.display = 'none';
    }
  }

  showError(message) {
    const error = document.createElement('div');
    error.className = 'reader-error';
    error.textContent = message;
    this.container.insertBefore(error, this.container.firstChild);
  }

  // TTS Support - Get current page content
  getCurrentPageContent() {
    const currentPage = this.getCurrentPageNumber();
    const page = this.loadedPages.get(currentPage);
    return page ? page.content : '';
  }

  // TTS Support - Get all loaded content
  getAllLoadedContent() {
    const pages = Array.from(this.loadedPages.values())
      .sort((a, b) => a.pageNumber - b.pageNumber);
    return pages.map(p => p.content).join('\n\n');
  }

  destroy() {
    if (this.observer) {
      this.observer.disconnect();
    }
    clearTimeout(this.progressSaveTimeout);
  }
}

// Export for use in reader.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ContinuousReader;
}
