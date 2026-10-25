/**
 * ComiconReader - Book-Like Realistic Page Flip Controller
 * Powered by St.PageFlip with 3D folding physics, swipe gestures, pinch-to-zoom,
 * interactive bookmark ribbons, magnifier loupe, and reading filters.
 */

class PageFlipController {
  constructor() {
    this.pageFlip = null;
    this.currentBook = null;
    this.pagesData = [];
    this.currentPageIndex = 0;
    this.totalPages = 0;
    this.direction = 'ltr'; // 'ltr' or 'rtl'
    this.spreadMode = 'auto'; // 'auto', 'double', 'single'
    this.readingFilter = 'none';
    
    // Zoom & Pan state
    this.zoomScale = 1.0;
    this.panX = 0;
    this.panY = 0;
    this.isPanning = false;
    this.startPanX = 0;
    this.startPanY = 0;
    this.activePointers = new Map();
    this.initialPinchDistance = 0;
    this.initialZoomScale = 1.0;

    // Magnifier Loupe state
    this.loupeActive = false;
    this.loupeZoom = 2.4;

    // Chrome UI visibility
    this.uiTimeout = null;
    this.zenMode = false;

    // Cache of active bookmarks for this book
    this.currentBookmarks = [];

    this.initDOMRefs();
    this.bindEvents();
  }

  initDOMRefs() {
    this.readerContainer = document.getElementById('reader-view');
    this.bookContainer = document.getElementById('book-container');
    this.zoomViewport = document.getElementById('zoom-viewport');
    this.pageCounter = document.getElementById('page-counter');
    this.pageSlider = document.getElementById('page-slider');
    this.pageSliderProgress = document.getElementById('page-slider-progress');
    this.prevBtn = document.getElementById('btn-prev-page');
    this.nextBtn = document.getElementById('btn-next-page');
    this.bookmarkRibbon = document.getElementById('active-bookmark-ribbon');
    this.bookmarkBtn = document.getElementById('btn-toggle-bookmark');
    this.loupeElement = document.getElementById('comic-loupe');
    this.readerHeader = document.getElementById('reader-header');
    this.readerFooter = document.getElementById('reader-footer');
    this.filterSelector = document.getElementById('reader-filter-select');
    this.directionToggle = document.getElementById('btn-toggle-direction');
    this.spreadToggle = document.getElementById('btn-toggle-spread');
  }

  bindEvents() {
    // Nav buttons
    if (this.prevBtn) this.prevBtn.onclick = () => this.flipPrev();
    if (this.nextBtn) this.nextBtn.onclick = () => this.flipNext();

    // Scrubber slider
    if (this.pageSlider) {
      this.pageSlider.addEventListener('input', (e) => {
        const targetPage = parseInt(e.target.value, 10);
        this.flipTo(targetPage);
      });
    }

    // Bookmark quick toggle
    if (this.bookmarkBtn) {
      this.bookmarkBtn.onclick = () => this.toggleCurrentBookmark();
    }
    if (this.bookmarkRibbon) {
      this.bookmarkRibbon.onclick = () => this.toggleCurrentBookmark();
    }

    // Direction & Spread toggles
    if (this.directionToggle) {
      this.directionToggle.onclick = () => this.toggleDirection();
    }
    if (this.spreadToggle) {
      this.spreadToggle.onclick = () => this.toggleSpreadMode();
    }

    // Filter select
    if (this.filterSelector) {
      this.filterSelector.addEventListener('change', (e) => {
        this.setReadingFilter(e.target.value);
      });
    }

    // Zoom controls
    const btnZoomIn = document.getElementById('btn-zoom-in');
    const btnZoomOut = document.getElementById('btn-zoom-out');
    const btnZoomReset = document.getElementById('btn-zoom-reset');
    const btnToggleLoupe = document.getElementById('btn-toggle-loupe');

    if (btnZoomIn) btnZoomIn.onclick = () => this.adjustZoom(0.25);
    if (btnZoomOut) btnZoomOut.onclick = () => this.adjustZoom(-0.25);
    if (btnZoomReset) btnZoomReset.onclick = () => this.resetZoom();
    if (btnToggleLoupe) btnToggleLoupe.onclick = () => this.toggleLoupe();

    // Gestures: Pinch to zoom & Pan
    this.setupGestureHandlers();

    // Mouse Loupe tracking
    this.setupLoupeHandlers();

    // Keyboard shortcuts
    window.addEventListener('keydown', (e) => this.handleKeydown(e));

    // Fullscreen toggle
    const btnFullscreen = document.getElementById('btn-reader-fullscreen');
    if (btnFullscreen) {
      btnFullscreen.onclick = () => this.toggleFullscreen();
    }

    // Zen Mode auto-hide
    this.setupZenAutoHide();
  }

  setupGestureHandlers() {
    if (!this.zoomViewport) return;

    let touchStartX = 0;
    let touchStartY = 0;
    let touchStartTime = 0;
    let lastTapTime = 0;

    // Track touch start for swipe and edge tap
    this.zoomViewport.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
        touchStartTime = Date.now();
      }
    }, { passive: true });

    // Track touch end for swipe and edge tap
    this.zoomViewport.addEventListener('touchend', (e) => {
      if (this.zoomScale > 1.05) return; // Allow normal panning when zoomed in
      if (!e.changedTouches || e.changedTouches.length !== 1) return;

      const touchEndX = e.changedTouches[0].clientX;
      const touchEndY = e.changedTouches[0].clientY;
      const dx = touchEndX - touchStartX;
      const dy = touchEndY - touchStartY;
      const dt = Date.now() - touchStartTime;
      const now = Date.now();

      // Check double-tap zoom first
      if (now - lastTapTime < 280) {
        lastTapTime = 0;
        if (this.zoomScale > 1.2) {
          this.resetZoom();
        } else {
          this.setZoom(2.2);
        }
        return;
      }
      lastTapTime = now;

      // Check horizontal swipe
      if (Math.abs(dx) > 35 && Math.abs(dy) < 55 && dt < 450) {
        if (dx < 0) {
          this.flipNext();
        } else {
          this.flipPrev();
        }
        return;
      }

      // Check clean single tap (minimal movement)
      if (Math.abs(dx) < 16 && Math.abs(dy) < 16 && dt < 320) {
        const screenW = window.innerWidth;
        const x = touchEndX;

        // Right 28% -> Next Page
        if (x > screenW * 0.72) {
          this.flipNext();
        }
        // Left 28% -> Previous Page
        else if (x < screenW * 0.28) {
          this.flipPrev();
        }
        // Middle 44% -> Toggle Toolbars (Zen mode)
        else {
          this.toggleZenChrome();
        }
      }
    }, { passive: true });

    // Pointer events for pinch zoom & 2D panning
    this.zoomViewport.addEventListener('pointerdown', (e) => {
      this.activePointers.set(e.pointerId, e);
      if (this.activePointers.size === 1 && this.zoomScale > 1.05) {
        this.isPanning = true;
        this.startPanX = e.clientX - this.panX;
        this.startPanY = e.clientY - this.panY;
      } else if (this.activePointers.size === 2) {
        this.isPanning = false;
        const [p1, p2] = Array.from(this.activePointers.values());
        this.initialPinchDistance = Math.hypot(p1.clientX - p2.clientX, p1.clientY - p2.clientY);
        this.initialZoomScale = this.zoomScale;
      }
    });

    this.zoomViewport.addEventListener('pointermove', (e) => {
      if (this.activePointers.has(e.pointerId)) {
        this.activePointers.set(e.pointerId, e);
      }

      // Handle Pinch Zoom
      if (this.activePointers.size === 2) {
        const [p1, p2] = Array.from(this.activePointers.values());
        const dist = Math.hypot(p1.clientX - p2.clientX, p1.clientY - p2.clientY);
        if (this.initialPinchDistance > 10) {
          const ratio = dist / this.initialPinchDistance;
          this.setZoom(this.initialZoomScale * ratio, false);
        }
        return;
      }

      // Handle Pan when zoomed
      if (this.isPanning && this.activePointers.size === 1) {
        this.panX = e.clientX - this.startPanX;
        this.panY = e.clientY - this.startPanY;
        this.applyZoomTransform();
      }
    });

    const endPointer = (e) => {
      this.activePointers.delete(e.pointerId);
      if (this.activePointers.size < 2) {
        this.initialPinchDistance = 0;
      }
      if (this.activePointers.size === 0) {
        this.isPanning = false;
      }
    };

    this.zoomViewport.addEventListener('pointerup', endPointer);
    this.zoomViewport.addEventListener('pointercancel', endPointer);

    // Mouse wheel zoom
    this.zoomViewport.addEventListener('wheel', (e) => {
      if (e.ctrlKey || e.metaKey || this.zoomScale > 1.0) {
        e.preventDefault();
        const delta = e.deltaY < 0 ? 0.15 : -0.15;
        this.adjustZoom(delta);
      }
    }, { passive: false });

    // Double click to zoom on desktop
    this.zoomViewport.addEventListener('dblclick', (e) => {
      if (this.zoomScale > 1.2) {
        this.resetZoom();
      } else {
        this.setZoom(2.0);
      }
    });

    // Window resize / Orientation change auto-adapter
    let orientationDebounce = null;
    window.addEventListener('resize', () => {
      clearTimeout(orientationDebounce);
      orientationDebounce = setTimeout(() => {
        if (this.currentBook && !this.readerContainer.classList.contains('hidden')) {
          this.initStPageFlip();
        }
      }, 200);
    });
  }

  toggleZenChrome() {
    this.zenMode = !this.zenMode;
    const btnZen = document.getElementById('btn-toggle-zen');
    if (btnZen) btnZen.classList.toggle('active', this.zenMode);
    if (this.readerHeader) this.readerHeader.classList.toggle('reader-chrome-hidden', this.zenMode);
    if (this.readerFooter) this.readerFooter.classList.toggle('reader-chrome-hidden', this.zenMode);
  }

  setupLoupeHandlers() {
    if (!this.zoomViewport || !this.loupeElement) return;

    this.zoomViewport.addEventListener('mousemove', (e) => {
      if (!this.loupeActive) return;
      this.updateLoupePosition(e.clientX, e.clientY);
    });

    this.zoomViewport.addEventListener('touchmove', (e) => {
      if (!this.loupeActive || !e.touches[0]) return;
      this.updateLoupePosition(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });
  }

  updateLoupePosition(clientX, clientY) {
    if (!this.loupeActive || !this.loupeElement) return;

    const rect = this.bookContainer.getBoundingClientRect();
    if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) {
      this.loupeElement.style.opacity = '0';
      return;
    }

    this.loupeElement.style.opacity = '1';
    this.loupeElement.style.left = `${clientX}px`;
    this.loupeElement.style.top = `${clientY}px`;

    // Calculate background magnification position
    const relX = ((clientX - rect.left) / rect.width) * 100;
    const relY = ((clientY - rect.top) / rect.height) * 100;

    this.loupeElement.style.backgroundPosition = `${relX}% ${relY}%`;
  }

  toggleLoupe() {
    this.loupeActive = !this.loupeActive;
    const btn = document.getElementById('btn-toggle-loupe');
    if (btn) btn.classList.toggle('active', this.loupeActive);

    if (this.loupeActive) {
      this.loupeElement.style.display = 'block';
      this.loupeElement.style.opacity = '0';
      // Capture current page as snapshot for loupe background
      this.captureLoupeBackground();
    } else {
      this.loupeElement.style.display = 'none';
    }
  }

  captureLoupeBackground() {
    const activePages = this.bookContainer.querySelectorAll('.page-content img, .page-content canvas');
    if (activePages.length > 0) {
      const src = activePages[0].src || (activePages[0].toDataURL ? activePages[0].toDataURL() : '');
      if (src) {
        this.loupeElement.style.backgroundImage = `url("${src}")`;
        this.loupeElement.style.backgroundSize = `${rectWidth(this.bookContainer) * this.loupeZoom}px auto`;
      }
    }
    function rectWidth(el) { return el ? el.offsetWidth : 800; }
  }

  setupZenAutoHide() {
    const showUI = () => {
      if (this.zenMode) return;
      if (this.readerHeader) this.readerHeader.classList.remove('reader-chrome-hidden');
      if (this.readerFooter) this.readerFooter.classList.remove('reader-chrome-hidden');

      clearTimeout(this.uiTimeout);
      this.uiTimeout = setTimeout(() => {
        // Only hide if not hovering over controls
        if (this.zoomScale <= 1.05) {
          if (this.readerHeader) this.readerHeader.classList.add('reader-chrome-hidden');
          if (this.readerFooter) this.readerFooter.classList.add('reader-chrome-hidden');
        }
      }, 4000);
    };

    window.addEventListener('mousemove', showUI);
    window.addEventListener('touchstart', showUI, { passive: true });

    const btnZen = document.getElementById('btn-toggle-zen');
    if (btnZen) {
      btnZen.onclick = () => {
        this.zenMode = !this.zenMode;
        btnZen.classList.toggle('active', this.zenMode);
        if (this.zenMode) {
          if (this.readerHeader) this.readerHeader.classList.add('reader-chrome-hidden');
          if (this.readerFooter) this.readerFooter.classList.add('reader-chrome-hidden');
        } else {
          showUI();
        }
      };
    }
  }

  // --- Zoom logic ---
  adjustZoom(delta) {
    this.setZoom(this.zoomScale + delta);
  }

  setZoom(val, clampPan = true) {
    this.zoomScale = Math.min(4.0, Math.max(1.0, parseFloat(val.toFixed(2))));
    if (this.zoomScale <= 1.0) {
      this.panX = 0;
      this.panY = 0;
    }
    this.applyZoomTransform();
    this.updateZoomPill();
  }

  resetZoom() {
    this.zoomScale = 1.0;
    this.panX = 0;
    this.panY = 0;
    this.applyZoomTransform();
    this.updateZoomPill();
  }

  applyZoomTransform() {
    if (!this.bookContainer) return;
    this.bookContainer.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.zoomScale})`;
  }

  updateZoomPill() {
    const zoomText = document.getElementById('zoom-level-text');
    if (zoomText) {
      zoomText.textContent = `${Math.round(this.zoomScale * 100)}%`;
    }
  }

  // --- Book Initialization ---
  async loadBook(book, initialPage = null) {
    this.currentBook = book;
    this.direction = book.direction || 'ltr';
    this.currentPageIndex = initialPage !== null ? initialPage : (book.currentPage || 0);

    // Update title
    const titleEl = document.getElementById('reader-book-title');
    const infoEl = document.getElementById('reader-book-info');
    if (titleEl) titleEl.textContent = book.title || 'Comic Reader';
    if (infoEl) infoEl.textContent = `${book.author || 'Unknown'} • ${book.genre || 'General'}`;

    // Load bookmarks
    this.currentBookmarks = await window.comicDB.getBookmarksForBook(book.id);

    // Prepare pages
    this.pagesData = book.pages || [];
    this.totalPages = this.pagesData.length;

    // Ensure book-container exists in DOM (recreate if removed by previous destroy)
    let container = document.getElementById('book-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'book-container';
      container.className = 'book-stage-wrap';
      this.zoomViewport.appendChild(container);
    }
    this.bookContainer = container;

    // Safely clear old flip instance without removing the container DOM element
    if (this.pageFlip) {
      try {
        if (this.pageFlip.clear) this.pageFlip.clear();
      } catch (e) {
        console.warn('PageFlip clear issue:', e);
      }
      this.pageFlip = null;
    }

    this.bookContainer.innerHTML = '';
    this.resetZoom();

    // Initialize StPageFlip with direct high-performance canvas page rendering
    await this.initStPageFlip();

    // Update scrubber bounds
    if (this.pageSlider) {
      this.pageSlider.min = 0;
      this.pageSlider.max = Math.max(0, this.totalPages - 1);
      this.pageSlider.value = this.currentPageIndex;
    }

    this.updateScrubberProgress();
    this.updateBookmarkRibbonState();
    this.renderBookmarksDrawer();
  }

  async initStPageFlip() {
    if (!this.pagesData || this.pagesData.length === 0) {
      this.bookContainer.innerHTML = '<div style="color: white; padding: 40px; text-align: center;">No pages found in this comic or PDF.</div>';
      return;
    }

    const isMobile = window.innerWidth <= 768;
    const isSingle = isMobile || this.spreadMode === 'single';
    
    // Viewport dimensions
    const viewW = this.zoomViewport?.clientWidth || window.innerWidth;
    const viewH = this.zoomViewport?.clientHeight || (window.innerHeight - 150);

    const maxW = Math.max(300, viewW - 32);
    const maxH = Math.max(380, viewH - 32);

    // Standard comic/book page ratio: ~1.42 (height = width * 1.42)
    let pageW, pageH;

    if (isSingle) {
      pageH = Math.min(maxH, 940);
      pageW = Math.min(maxW, Math.round(pageH / 1.42));
      pageH = Math.round(pageW * 1.42);
    } else {
      pageH = Math.min(maxH, 860);
      pageW = Math.min(Math.floor((maxW - 40) / 2), Math.round(pageH / 1.42));
      pageH = Math.round(pageW * 1.42);
    }

    const totalW = isSingle ? pageW : pageW * 2;

    // Apply explicit physical sizing to container
    this.bookContainer.style.width = `${totalW}px`;
    this.bookContainer.style.height = `${pageH}px`;
    this.bookContainer.style.minWidth = `${totalW}px`;
    this.bookContainer.style.minHeight = `${pageH}px`;

    // Extract image URLs
    const imageUrls = this.pagesData.map(p => {
      if (typeof p === 'string') return p;
      return p.url || p.src || '';
    }).filter(url => url && url.length > 0);

    if (imageUrls.length === 0) {
      this.bookContainer.innerHTML = '<div style="color: white; padding: 40px;">No readable image pages found.</div>';
      return;
    }

    const options = {
      width: pageW,
      height: pageH,
      size: 'fixed',
      minWidth: pageW,
      maxWidth: pageW,
      minHeight: pageH,
      maxHeight: pageH,
      maxShadowOpacity: 0.65,
      showCover: true,
      usePortrait: isSingle,
      startPage: Math.min(this.currentPageIndex, imageUrls.length - 1),
      flippingTime: 650,
      swipeDistance: 25,
      showPageCorners: true,
      useMouseEvents: true,
      mobileScrollSupport: false
    };

    try {
      if (window.St && window.St.PageFlip) {
        this.pageFlip = new window.St.PageFlip(this.bookContainer, options);
        this.pageFlip.loadFromImages(imageUrls);

        this.pageFlip.on('flip', (e) => {
          this.onPageFlipped(e.data);
        });

        this.pageFlip.on('changeState', (e) => {
          if (e.data === 'flipping') {
            window.flipAudio?.playFlip();
          }
        });
      } else {
        throw new Error('StPageFlip library not loaded');
      }
    } catch (err) {
      console.warn('PageFlip init fallback:', err);
      // Fallback DOM renderer
      this.renderFallbackDOM(imageUrls, pageW, pageH, isSingle);
    }
  }

  renderFallbackDOM(imageUrls, pageW, pageH, isSingle) {
    this.bookContainer.innerHTML = `
      <div style="display: flex; width: 100%; height: 100%; background: #ffffff; border-radius: 4px; overflow: hidden; box-shadow: 0 10px 40px rgba(0,0,0,0.8);">
        <img src="${imageUrls[this.currentPageIndex] || imageUrls[0]}" style="width: 100%; height: 100%; object-fit: contain; background: #ffffff;" alt="Page ${this.currentPageIndex + 1}" />
      </div>
    `;
  }

  onPageFlipped(pageNum) {
    this.currentPageIndex = pageNum;
    if (this.pageSlider) this.pageSlider.value = pageNum;
    this.updateScrubberProgress();
    this.updateBookmarkRibbonState();

    // Auto save progress into IndexedDB
    if (this.currentBook) {
      window.comicDB.updateBookProgress(this.currentBook.id, pageNum, this.totalPages);
      // Broadcast via sync engine
      window.cloudSync.broadcastProgress(this.currentBook.id, pageNum, this.totalPages);
    }
  }

  flipPrev() {
    if (this.direction === 'rtl') {
      this.pageFlip?.flipNext();
    } else {
      this.pageFlip?.flipPrev();
    }
  }

  flipNext() {
    if (this.direction === 'rtl') {
      this.pageFlip?.flipPrev();
    } else {
      this.pageFlip?.flipNext();
    }
  }

  flipTo(pageNum) {
    if (this.pageFlip) {
      this.pageFlip.flip(pageNum);
    }
  }

  updateScrubberProgress() {
    if (this.pageCounter) {
      this.pageCounter.textContent = `${this.currentPageIndex + 1} / ${this.totalPages}`;
    }
    if (this.pageSliderProgress && this.totalPages > 1) {
      const pct = (this.currentPageIndex / (this.totalPages - 1)) * 100;
      this.pageSliderProgress.style.width = `${pct}%`;
    }
  }

  // --- Bookmarking System ---
  async toggleCurrentBookmark() {
    if (!this.currentBook) return;

    const existingIdx = this.currentBookmarks.findIndex(b => b.pageNumber === this.currentPageIndex);

    if (existingIdx !== -1) {
      // Remove bookmark
      const bm = this.currentBookmarks[existingIdx];
      await window.comicDB.deleteBookmark(bm.id);
      window.cloudSync.broadcastBookmark('delete', { bookmarkId: bm.id, bookId: this.currentBook.id });
      this.currentBookmarks.splice(existingIdx, 1);
      this.showToast(`Bookmark removed (Page ${this.currentPageIndex + 1})`);
    } else {
      // Add bookmark
      const newBm = {
        bookId: this.currentBook.id,
        pageNumber: this.currentPageIndex,
        label: `Page ${this.currentPageIndex + 1}`,
        note: `Saved reading point in ${this.currentBook.title}`,
        color: '#ef4444',
        timestamp: Date.now(),
        thumbnail: this.pagesData[this.currentPageIndex]?.url || this.pagesData[this.currentPageIndex] || ''
      };
      await window.comicDB.saveBookmark(newBm);
      window.cloudSync.broadcastBookmark('save', { bookmark: newBm, bookId: this.currentBook.id });
      this.currentBookmarks.push(newBm);
      this.showToast(`Page ${this.currentPageIndex + 1} Bookmarked!`);
    }

    this.updateBookmarkRibbonState();
    this.renderBookmarksDrawer();
  }

  updateBookmarkRibbonState() {
    const isBookmarked = this.currentBookmarks.some(b => b.pageNumber === this.currentPageIndex);
    if (this.bookmarkRibbon) {
      this.bookmarkRibbon.classList.toggle('active', isBookmarked);
    }
    if (this.bookmarkBtn) {
      this.bookmarkBtn.classList.toggle('active', isBookmarked);
    }
  }

  renderBookmarksDrawer() {
    const container = document.getElementById('bookmarks-list-container');
    const badge = document.getElementById('bookmarks-count-badge');
    if (badge) badge.textContent = this.currentBookmarks.length;
    if (!container) return;

    if (this.currentBookmarks.length === 0) {
      container.innerHTML = `
        <div class="empty-bookmarks-state">
          <svg class="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
          </svg>
          <p>No bookmarks saved yet</p>
          <span>Tap the bookmark ribbon or press 'B' on any page to bookmark it!</span>
        </div>
      `;
      return;
    }

    container.innerHTML = this.currentBookmarks.map(bm => `
      <div class="bookmark-item-card" data-page="${bm.pageNumber}">
        <div class="bm-thumb" style="background-image: url('${bm.thumbnail || ''}')">
          <span class="bm-ribbon-tag" style="background: ${bm.color || '#ef4444'}"></span>
        </div>
        <div class="bm-info">
          <div class="bm-header">
            <h4 class="bm-title">${bm.label || `Page ${bm.pageNumber + 1}`}</h4>
            <span class="bm-page-badge">Pg ${bm.pageNumber + 1}</span>
          </div>
          <p class="bm-note">${bm.note || 'No notes'}</p>
          <span class="bm-date">${new Date(bm.timestamp).toLocaleDateString()}</span>
        </div>
        <div class="bm-actions">
          <button class="bm-action-btn bm-jump" title="Jump to page">
            <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none">
              <polygon points="5 3 19 12 5 21 5 3"></polygon>
            </svg>
          </button>
          <button class="bm-action-btn bm-delete" title="Delete bookmark">
            <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
        </div>
      </div>
    `).join('');

    // Attach click handlers
    container.querySelectorAll('.bookmark-item-card').forEach(card => {
      const pageNum = parseInt(card.dataset.page, 10);
      card.querySelector('.bm-jump')?.addEventListener('click', () => {
        this.flipTo(pageNum);
        document.getElementById('bookmarks-drawer')?.classList.remove('open');
      });
      card.querySelector('.bm-delete')?.addEventListener('click', async (e) => {
        e.stopPropagation();
        const bm = this.currentBookmarks.find(b => b.pageNumber === pageNum);
        if (bm) {
          await window.comicDB.deleteBookmark(bm.id);
          this.currentBookmarks = this.currentBookmarks.filter(b => b.id !== bm.id);
          this.renderBookmarksDrawer();
          this.updateBookmarkRibbonState();
          this.showToast('Bookmark deleted');
        }
      });
    });
  }

  // --- Reading direction & spread ---
  toggleDirection() {
    this.direction = this.direction === 'ltr' ? 'rtl' : 'ltr';
    if (this.currentBook) {
      this.currentBook.direction = this.direction;
      window.comicDB.saveBook(this.currentBook);
    }
    const label = document.getElementById('direction-label');
    if (label) label.textContent = this.direction.toUpperCase();
    this.showToast(`Reading direction: ${this.direction === 'rtl' ? 'Right-to-Left (Manga)' : 'Left-to-Right (Western)'}`);
  }

  toggleSpreadMode() {
    this.spreadMode = this.spreadMode === 'double' ? 'single' : 'double';
    const label = document.getElementById('spread-label');
    if (label) label.textContent = this.spreadMode === 'double' ? '2-Page Spread' : '1-Page View';
    this.loadBook(this.currentBook, this.currentPageIndex);
    this.showToast(`Display mode: ${this.spreadMode === 'double' ? 'Two-page book spread' : 'Single page'}`);
  }

  setReadingFilter(filterName) {
    this.readingFilter = filterName;
    if (this.bookContainer) {
      this.bookContainer.dataset.filter = filterName;
    }
  }

  toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }

  handleKeydown(e) {
    // Only handle if in reader view
    if (this.readerContainer.classList.contains('hidden')) return;

    switch (e.key) {
      case 'ArrowLeft':
        e.preventDefault();
        this.flipPrev();
        break;
      case 'ArrowRight':
      case ' ':
        e.preventDefault();
        this.flipNext();
        break;
      case 'b':
      case 'B':
        this.toggleCurrentBookmark();
        break;
      case 'z':
      case 'Z':
        this.toggleLoupe();
        break;
      case 'f':
      case 'F':
        this.toggleFullscreen();
        break;
      case 'Escape':
        if (this.zoomScale > 1.05) {
          this.resetZoom();
        } else if (this.loupeActive) {
          this.toggleLoupe();
        } else {
          window.app.showLibraryView();
        }
        break;
    }
  }

  showToast(msg) {
    if (window.app && window.app.showToast) {
      window.app.showToast(msg);
    }
  }
}

// Global reader controller
window.pageFlipController = new PageFlipController();
