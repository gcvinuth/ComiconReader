/**
 * ComiconReader - Library View & Comic File Importer
 * Handles library shelf organization, genres, search, sorting,
 * PDF rendering (pdf.js), CBZ/ZIP extraction (JSZip), and multiple import methods:
 * - Local files (PDF, CBZ, ZIP, Images)
 * - Drag & drop anywhere
 * - Direct URL link pasting (PDF, CBZ, ZIP, or Images)
 * - Multi-page Image URLs list pasting (one URL per line)
 * - One-click curated sample comic books
 */

class ComicLibrary {
  constructor() {
    this.books = [];
    this.folders = [];
    this.activeFolderId = 'folder_all';
    this.activeGenre = 'all';
    this.searchQuery = '';
    this.sortMode = 'lastRead';
    this.viewLayout = 'grid';

    this.initDOMRefs();
    this.bindEvents();
  }

  initDOMRefs() {
    this.gridContainer = document.getElementById('comic-books-grid');
    this.foldersContainer = document.getElementById('library-shelves-list');
    this.genreFilterContainer = document.getElementById('genre-filters');
    this.searchInput = document.getElementById('global-search-input');
    this.sortSelect = document.getElementById('library-sort-select');
    this.viewToggleBtn = document.getElementById('btn-toggle-view-mode');
    this.fileDropZone = document.getElementById('library-dropzone');
    this.statsTotalBooks = document.getElementById('stat-total-books');
    this.statsPagesRead = document.getElementById('stat-pages-read');
    this.statsCompleted = document.getElementById('stat-completed-books');
  }

  bindEvents() {
    // Search (Desktop & Mobile)
    if (this.searchInput) {
      this.searchInput.addEventListener('input', (e) => {
        this.searchQuery = e.target.value.toLowerCase().trim();
        const mobileInput = document.getElementById('mobile-search-input');
        if (mobileInput && mobileInput.value !== e.target.value) mobileInput.value = e.target.value;
        this.renderBooks();
      });
    }

    const mobileSearchInput = document.getElementById('mobile-search-input');
    if (mobileSearchInput) {
      mobileSearchInput.addEventListener('input', (e) => {
        this.searchQuery = e.target.value.toLowerCase().trim();
        if (this.searchInput && this.searchInput.value !== e.target.value) this.searchInput.value = e.target.value;
        this.renderBooks();
      });
    }

    // Sort
    if (this.sortSelect) {
      this.sortSelect.addEventListener('change', (e) => {
        this.sortMode = e.target.value;
        this.renderBooks();
      });
    }

    // View toggle (Grid / List)
    if (this.viewToggleBtn) {
      this.viewToggleBtn.onclick = () => {
        this.viewLayout = this.viewLayout === 'grid' ? 'list' : 'grid';
        this.gridContainer.className = this.viewLayout === 'grid' ? 'comic-grid' : 'comic-list';
        const span = this.viewToggleBtn.querySelector('span');
        if (span) span.textContent = this.viewLayout === 'grid' ? 'Grid' : 'List';
      };
    }

    // Drag and drop import zone
    this.setupDragAndDrop();

    // Setup file pickers & URL import handlers
    this.setupFilePickers();
    this.setupURLImportHandlers();

    // Create New Shelf button
    const btnNewShelf = document.getElementById('btn-create-shelf');
    if (btnNewShelf) {
      btnNewShelf.onclick = () => this.promptCreateFolder();
    }
  }

  setupDragAndDrop() {
    const dropTarget = document.body;
    let dragCounter = 0;

    dropTarget.addEventListener('dragenter', (e) => {
      e.preventDefault();
      dragCounter++;
      if (this.fileDropZone) this.fileDropZone.classList.add('active');
    });

    dropTarget.addEventListener('dragleave', (e) => {
      e.preventDefault();
      dragCounter--;
      if (dragCounter <= 0 && this.fileDropZone) {
        this.fileDropZone.classList.remove('active');
      }
    });

    dropTarget.addEventListener('dragover', (e) => {
      e.preventDefault();
    });

    dropTarget.addEventListener('drop', async (e) => {
      e.preventDefault();
      dragCounter = 0;
      if (this.fileDropZone) this.fileDropZone.classList.remove('active');

      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0) {
        await this.handleImportedFiles(files);
      }
    });
  }

  setupFilePickers() {
    const fileInputs = [
      document.getElementById('input-comic-file'),
      document.getElementById('input-comic-file-pdf'),
      document.getElementById('input-comic-file-cbz'),
      document.getElementById('input-comic-file-img'),
      document.getElementById('input-comic-file-folder')
    ];

    fileInputs.forEach(fileInput => {
      if (!fileInput) return;
      fileInput.addEventListener('change', async (e) => {
        const files = Array.from(e.target.files);
        if (files.length > 0) {
          window.app.closeModal('modal-add-comic');
          await this.handleImportedFiles(files);
          fileInput.value = '';
        }
      });
    });
  }

  setupURLImportHandlers() {
    // Single direct URL import form
    const formDirectUrl = document.getElementById('form-import-direct-url');
    if (formDirectUrl) {
      formDirectUrl.addEventListener('submit', async (e) => {
        e.preventDefault();
        const urlInput = document.getElementById('input-direct-url');
        const titleInput = document.getElementById('input-url-title');
        const genreInput = document.getElementById('input-url-genre');
        const url = urlInput?.value.trim();
        const customTitle = titleInput?.value.trim();
        const genre = genreInput?.value.trim() || 'Comic';

        if (!url) return;
        window.app.closeModal('modal-add-comic');
        await this.importFromURL(url, { customTitle, genre });
      });
    }

    // Batch Multi-Page Image URLs import form
    const formBatchUrls = document.getElementById('form-import-batch-urls');
    if (formBatchUrls) {
      formBatchUrls.addEventListener('submit', async (e) => {
        e.preventDefault();
        const textarea = document.getElementById('input-batch-image-urls');
        const titleInput = document.getElementById('input-batch-title');
        const authorInput = document.getElementById('input-batch-author');
        const genreInput = document.getElementById('input-batch-genre');
        const directionSelect = document.getElementById('select-batch-direction');

        const rawText = textarea?.value.trim() || '';
        const urls = rawText.split('\n').map(u => u.trim()).filter(u => u.startsWith('http') || u.startsWith('data:'));
        
        if (urls.length === 0) {
          window.app.showToast('Please paste at least one valid image URL');
          return;
        }

        const title = titleInput?.value.trim() || `Comic Issue (${urls.length} Pages)`;
        const author = authorInput?.value.trim() || 'Web Creator';
        const genre = genreInput?.value.trim() || 'Manga';
        const direction = directionSelect?.value || 'ltr';

        window.app.closeModal('modal-add-comic');
        await this.importFromImageUrlsList(urls, { title, author, genre, direction });
      });
    }
  }

  async refresh() {
    this.books = await window.comicDB.getAllBooks();
    this.folders = await window.comicDB.getAllFolders();
    this.updateStats();
    this.renderFolders();
    this.renderGenreFilters();
    this.renderBooks();
  }

  updateStats() {
    if (this.statsTotalBooks) this.statsTotalBooks.textContent = this.books.length;
    
    let totalPagesFlipped = 0;
    let completedCount = 0;

    this.books.forEach(b => {
      totalPagesFlipped += (b.currentPage || 0);
      if (b.progress >= 98) completedCount++;
    });

    if (this.statsPagesRead) this.statsPagesRead.textContent = totalPagesFlipped;
    if (this.statsCompleted) this.statsCompleted.textContent = completedCount;
  }

  renderFolders() {
    if (!this.foldersContainer) return;

    this.foldersContainer.innerHTML = this.folders.map(f => {
      const count = f.id === 'folder_all' 
        ? this.books.length 
        : f.id === 'folder_favorites'
          ? this.books.filter(b => b.isFavorite).length
          : this.books.filter(b => b.folderId === f.id).length;

      const isActive = this.activeFolderId === f.id;
      return `
        <button class="shelf-pill-btn ${isActive ? 'active' : ''}" data-folder-id="${f.id}">
          <span class="shelf-dot" style="background-color: ${f.color || '#6366f1'}"></span>
          <span class="shelf-name">${f.name}</span>
          <span class="shelf-count">${count}</span>
        </button>
      `;
    }).join('');

    this.foldersContainer.querySelectorAll('.shelf-pill-btn').forEach(btn => {
      btn.onclick = () => {
        this.activeFolderId = btn.dataset.folderId;
        this.renderFolders();
        this.renderBooks();
      };
    });
  }

  renderGenreFilters() {
    if (!this.genreFilterContainer) return;

    const genres = ['all', 'Sci-Fi', 'Superhero', 'Manga', 'Action', 'Fantasy', 'Graphic Novel', 'Cyberpunk'];

    this.genreFilterContainer.innerHTML = genres.map(g => `
      <button class="genre-tag-chip ${this.activeGenre === g ? 'active' : ''}" data-genre="${g}">
        ${g === 'all' ? '✨ All Genres' : g}
      </button>
    `).join('');

    this.genreFilterContainer.querySelectorAll('.genre-tag-chip').forEach(chip => {
      chip.onclick = () => {
        this.activeGenre = chip.dataset.genre;
        this.renderGenreFilters();
        this.renderBooks();
      };
    });
  }

  renderBooks() {
    if (!this.gridContainer) return;

    // Filter by Folder
    let filtered = this.books;
    if (this.activeFolderId === 'folder_favorites') {
      filtered = filtered.filter(b => b.isFavorite);
    } else if (this.activeFolderId !== 'folder_all') {
      filtered = filtered.filter(b => b.folderId === this.activeFolderId);
    }

    // Filter by Genre
    if (this.activeGenre !== 'all') {
      filtered = filtered.filter(b => (b.genre || '').toLowerCase() === this.activeGenre.toLowerCase());
    }

    // Filter by Search Query
    if (this.searchQuery) {
      filtered = filtered.filter(b => 
        (b.title || '').toLowerCase().includes(this.searchQuery) ||
        (b.author || '').toLowerCase().includes(this.searchQuery) ||
        (b.genre || '').toLowerCase().includes(this.searchQuery)
      );
    }

    // Sort
    filtered.sort((a, b) => {
      if (this.sortMode === 'lastRead') return (b.lastRead || 0) - (a.lastRead || 0);
      if (this.sortMode === 'dateAdded') return (b.dateAdded || 0) - (a.dateAdded || 0);
      if (this.sortMode === 'progress') return (b.progress || 0) - (a.progress || 0);
      if (this.sortMode === 'title') return (a.title || '').localeCompare(b.title || '');
      return 0;
    });

    if (filtered.length === 0) {
      this.gridContainer.innerHTML = `
        <div class="empty-library-state">
          <div class="empty-comic-stack">
            <div class="empty-card c3"></div>
            <div class="empty-card c2"></div>
            <div class="empty-card c1">
              <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
              </svg>
            </div>
          </div>
          <h3>No comics in this view</h3>
          <p>Drag & drop any PDF or CBZ here, paste a comic URL, or explore sample comics!</p>
          <div style="display: flex; gap: 12px; margin-top: 10px;">
            <button class="btn btn-primary" id="btn-load-samples-empty">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                <polygon points="5 3 19 12 5 21 5 3"></polygon>
              </svg>
              Load Sample Comics
            </button>
            <button class="btn btn-ghost" id="btn-import-url-empty">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
              </svg>
              Import by URL
            </button>
          </div>
        </div>
      `;

      document.getElementById('btn-load-samples-empty')?.addEventListener('click', () => {
        window.app.preloadSampleComics();
      });
      document.getElementById('btn-import-url-empty')?.addEventListener('click', () => {
        window.app.openModal('modal-add-comic');
        window.app.switchAddModalTab('tab-url-import');
      });
      return;
    }

    this.gridContainer.innerHTML = filtered.map(book => {
      const coverUrl = book.coverUrl || (book.pages && book.pages[0]?.url) || (book.pages && book.pages[0]) || '';
      const progress = book.progress || 0;
      const isFav = !!book.isFavorite;
      const folder = this.folders.find(f => f.id === book.folderId) || { name: 'Comics' };

      return `
        <div class="comic-card" data-book-id="${book.id}">
          <div class="comic-cover-wrap">
            <img class="comic-cover-img" src="${coverUrl}" alt="${book.title}" loading="lazy" />
            
            <!-- Book Spine Visual Accent -->
            <div class="card-spine-accent"></div>
            
            <!-- Genre Badge -->
            <span class="comic-genre-pill">${book.genre || 'Comic'}</span>

            <!-- Favorite Ribbon -->
            <button class="card-fav-btn ${isFav ? 'active' : ''}" title="Favorite">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="${isFav ? '#ec4899' : 'none'}" stroke="currentColor" stroke-width="2">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
              </svg>
            </button>

            <!-- Quick Read Overlay -->
            <div class="cover-hover-overlay">
              <button class="btn btn-primary btn-sm btn-read-action">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                  <polygon points="5 3 19 12 5 21 5 3"></polygon>
                </svg>
                ${progress > 0 ? 'Resume' : 'Read'}
              </button>
            </div>
          </div>

          <!-- Progress bar -->
          <div class="comic-progress-track">
            <div class="comic-progress-fill" style="width: ${progress}%"></div>
          </div>

          <!-- Card Info -->
          <div class="comic-card-info">
            <h3 class="comic-title" title="${book.title}">${book.title}</h3>
            <div class="comic-meta-row">
              <span class="comic-author">${book.author || 'Author'}</span>
              <span class="comic-pages-tag">${book.pageCount || (book.pages ? book.pages.length : 0)} pgs</span>
            </div>
            <div class="comic-footer-row">
              <span class="comic-shelf-badge">📁 ${folder.name}</span>
              <span class="comic-pct-text">${progress}%</span>
            </div>
          </div>

          <!-- Action menu button -->
          <div class="card-menu-anchor">
            <button class="btn-card-menu" title="Options">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="1"></circle>
                <circle cx="12" cy="5" r="1"></circle>
                <circle cx="12" cy="19" r="1"></circle>
              </svg>
            </button>
          </div>
        </div>
      `;
    }).join('');

    // Attach card event listeners
    this.gridContainer.querySelectorAll('.comic-card').forEach(card => {
      const bookId = card.dataset.bookId;
      const book = this.books.find(b => b.id === bookId);

      card.querySelector('.comic-cover-wrap')?.addEventListener('click', () => {
        window.app.openBookInReader(book);
      });
      card.querySelector('.btn-read-action')?.addEventListener('click', (e) => {
        e.stopPropagation();
        window.app.openBookInReader(book);
      });

      card.querySelector('.card-fav-btn')?.addEventListener('click', async (e) => {
        e.stopPropagation();
        book.isFavorite = !book.isFavorite;
        await window.comicDB.saveBook(book);
        this.refresh();
      });

      card.querySelector('.btn-card-menu')?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.openBookActionModal(book);
      });
    });
  }

  // --- URL IMPORT ENGINE ---
  async importFromURL(url, meta = {}) {
    window.app.showLoadingModal(`Connecting to URL...`);

    try {
      const cleanUrl = url.trim();
      let response;
      try {
        response = await fetch(cleanUrl);
      } catch (corsErr) {
        console.warn('Direct fetch failed, trying CORS proxy fallback...', corsErr);
        const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(cleanUrl)}`;
        response = await fetch(proxyUrl);
      }

      if (!response.ok) {
        throw new Error(`HTTP Error ${response.status}: ${response.statusText}`);
      }

      window.app.updateLoadingProgress('Downloading data...', 35);
      const arrayBuffer = await response.arrayBuffer();
      const contentType = response.headers.get('content-type') || '';

      let pathname = '';
      try {
        pathname = new URL(cleanUrl).pathname;
      } catch (e) {
        pathname = cleanUrl;
      }
      const ext = pathname.split('.').pop().toLowerCase();
      const rawName = pathname.split('/').pop() || 'Comic';
      const cleanName = decodeURIComponent(rawName.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ')) || 'Comic';
      const title = meta.customTitle || cleanName;

      // Inspect binary magic bytes to guarantee accurate format identification
      const u8 = new Uint8Array(arrayBuffer.slice(0, 16));
      const isPdf = (u8[0] === 0x25 && u8[1] === 0x50 && u8[2] === 0x44 && u8[3] === 0x46) || ext === 'pdf' || contentType.includes('application/pdf');
      const isZip = (u8[0] === 0x50 && u8[1] === 0x4B) || ext === 'cbz' || ext === 'zip' || contentType.includes('zip');
      const isImage = (u8[0] === 0xFF && u8[1] === 0xD8) || // JPEG
                      (u8[0] === 0x89 && u8[1] === 0x50 && u8[2] === 0x4E && u8[3] === 0x47) || // PNG
                      (u8[0] === 0x52 && u8[1] === 0x49 && u8[2] === 0x46 && u8[3] === 0x46) || // WEBP
                      ['jpg', 'jpeg', 'png', 'webp', 'avif', 'gif'].includes(ext) || contentType.startsWith('image/');

      // 1. PDF URL
      if (isPdf) {
        window.app.updateLoadingProgress('Parsing PDF document...', 50);
        const blob = new Blob([arrayBuffer], { type: 'application/pdf' });
        const file = new File([blob], `${title}.pdf`, { type: 'application/pdf' });
        await this.importPDFFile(file);
        return;
      }

      // 2. CBZ / ZIP URL
      if (isZip) {
        window.app.updateLoadingProgress('Unpacking comic archive...', 50);
        const blob = new Blob([arrayBuffer], { type: 'application/zip' });
        const file = new File([blob], `${title}.cbz`, { type: 'application/zip' });
        await this.importCBZFile(file);
        return;
      }

      // 3. Image URL
      if (isImage) {
        window.app.updateLoadingProgress('Processing artwork...', 60);
        const blob = new Blob([arrayBuffer]);
        const dataUrl = await this.blobToDataURL(blob);

        const newBook = {
          title: title,
          author: meta.author || 'Web Illustration',
          genre: meta.genre || 'Illustration',
          folderId: this.activeFolderId === 'folder_all' ? 'folder_scifi' : this.activeFolderId,
          fileType: 'images',
          pageCount: 1,
          currentPage: 0,
          progress: 0,
          coverUrl: dataUrl,
          direction: 'ltr',
          pages: [dataUrl],
          dateAdded: Date.now(),
          lastRead: Date.now()
        };

        await window.comicDB.saveBook(newBook);
        window.app.hideLoadingModal();
        window.app.showToast(`Imported "${title}"`);
        await this.refresh();
        window.app.openBookInReader(newBook);
        return;
      }

      throw new Error(`Unable to determine comic format from URL. Supported: .pdf, .cbz, .zip, or image links.`);

    } catch (err) {
      console.error('URL Import error:', err);
      window.app.hideLoadingModal();
      window.app.showToast(`Import failed: ${err.message}`);
    }
  }

  // --- Multi-Page Image URLs List Import ---
  async importFromImageUrlsList(urls, meta = {}) {
    window.app.showLoadingModal(`Assembling comic from ${urls.length} page URLs...`);

    try {
      const pages = [];
      const total = urls.length;

      for (let i = 0; i < total; i++) {
        const u = urls[i];
        window.app.updateLoadingProgress(`Caching page ${i + 1} of ${total}...`, Math.round(((i + 1) / total) * 100));
        pages.push({ url: u, pageIndex: i });
      }

      const newBook = {
        title: meta.title || `Web Comic (${urls.length} Pages)`,
        author: meta.author || 'Web Release',
        genre: meta.genre || 'Manga',
        folderId: this.activeFolderId === 'folder_all' ? 'folder_manga' : this.activeFolderId,
        fileType: 'images',
        pageCount: pages.length,
        currentPage: 0,
        progress: 0,
        coverUrl: pages[0]?.url,
        direction: meta.direction || 'ltr',
        pages: pages,
        dateAdded: Date.now(),
        lastRead: Date.now()
      };

      await window.comicDB.saveBook(newBook);
      window.app.hideLoadingModal();
      window.app.showToast(`Imported "${newBook.title}" (${pages.length} pages)`);
      await this.refresh();
      window.app.openBookInReader(newBook);

    } catch (err) {
      console.error('Batch URLs import error:', err);
      window.app.hideLoadingModal();
      window.app.showToast(`Failed to assemble comic: ${err.message}`);
    }
  }

  // --- File Import Handling ---
  async handleImportedFiles(files) {
    const imageFiles = [];
    for (const file of files) {
      const ext = file.name.split('.').pop().toLowerCase();

      if (ext === 'pdf') {
        await this.importPDFFile(file);
      } else if (ext === 'cbz' || ext === 'zip') {
        await this.importCBZFile(file);
      } else if (['jpg', 'jpeg', 'png', 'webp', 'avif', 'gif'].includes(ext)) {
        imageFiles.push(file);
      } else {
        window.app.showToast(`Unsupported file type: .${ext}`);
      }
    }

    if (imageFiles.length > 0) {
      imageFiles.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
      await this.importImages(imageFiles);
    }
  }

  async importPDFFile(file) {
    window.app.showLoadingModal(`Processing PDF: ${file.name}...`);
    try {
      if (!window.pdfjsLib) throw new Error('PDF.js library not loaded');

      window.pdfjsLib.GlobalWorkerOptions.workerSrc = './vendor/pdf.worker.min.js';
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const totalPages = pdf.numPages;

      const pages = [];
      const scale = 1.8; // High-DPI crisp rendering for text & diagrams

      for (let i = 1; i <= totalPages; i++) {
        window.app.updateLoadingProgress(`Rendering PDF page ${i} of ${totalPages}...`, Math.round((i / totalPages) * 100));
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale });

        const canvas = document.createElement('canvas');
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        const ctx = canvas.getContext('2d');

        // CRITICAL: Fill with solid white paper background so transparent PDF text is 100% visible
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        await page.render({ canvasContext: ctx, viewport }).promise;
        const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
        pages.push({ url: dataUrl, pageIndex: i - 1 });
      }

      const title = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');

      const newBook = {
        title: title,
        author: 'PDF Document',
        genre: 'Graphic Novel',
        folderId: this.activeFolderId === 'folder_all' ? 'folder_scifi' : this.activeFolderId,
        fileType: 'pdf',
        pageCount: pages.length,
        currentPage: 0,
        progress: 0,
        coverUrl: pages[0]?.url,
        direction: 'ltr',
        pages: pages,
        dateAdded: Date.now(),
        lastRead: Date.now()
      };

      await window.comicDB.saveBook(newBook);
      window.app.hideLoadingModal();
      window.app.showToast(`Imported "${title}" (${pages.length} pages)`);
      await this.refresh();
      window.app.openBookInReader(newBook);

    } catch (err) {
      console.error('PDF Import error:', err);
      window.app.hideLoadingModal();
      window.app.showToast(`Failed to parse PDF: ${err.message}`);
    }
  }

  async importCBZFile(file) {
    window.app.showLoadingModal(`Extracting comic archive: ${file.name}...`);
    try {
      if (!window.JSZip) throw new Error('JSZip library not loaded');

      const zip = await window.JSZip.loadAsync(file);
      const imageEntries = [];

      zip.forEach((relativePath, zipEntry) => {
        if (!zipEntry.dir) {
          const ext = relativePath.split('.').pop().toLowerCase();
          if (['jpg', 'jpeg', 'png', 'webp', 'avif', 'gif'].includes(ext)) {
            imageEntries.push(zipEntry);
          }
        }
      });

      imageEntries.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

      if (imageEntries.length === 0) {
        throw new Error('No supported image files found inside CBZ/ZIP archive');
      }

      const pages = [];
      const total = imageEntries.length;

      for (let i = 0; i < total; i++) {
        window.app.updateLoadingProgress(`Extracting page ${i + 1} of ${total}...`, Math.round(((i + 1) / total) * 100));
        const entry = imageEntries[i];
        const blob = await entry.async('blob');
        const dataUrl = await this.blobToDataURL(blob);
        pages.push({ url: dataUrl, pageIndex: i });
      }

      const title = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');

      const newBook = {
        title: title,
        author: 'Comic Artist',
        genre: 'Comic',
        folderId: this.activeFolderId === 'folder_all' ? 'folder_scifi' : this.activeFolderId,
        fileType: 'cbz',
        pageCount: pages.length,
        currentPage: 0,
        progress: 0,
        coverUrl: pages[0]?.url,
        direction: 'ltr',
        pages: pages,
        dateAdded: Date.now(),
        lastRead: Date.now()
      };

      await window.comicDB.saveBook(newBook);
      window.app.hideLoadingModal();
      window.app.showToast(`Imported "${title}" (${pages.length} pages)`);
      await this.refresh();
      window.app.openBookInReader(newBook);

    } catch (err) {
      console.error('CBZ Import error:', err);
      window.app.hideLoadingModal();
      window.app.showToast(`Failed to parse comic archive: ${err.message}`);
    }
  }

  async importImages(files) {
    window.app.showLoadingModal(`Importing ${files.length} images...`);
    try {
      const pages = [];
      for (let i = 0; i < files.length; i++) {
        const dataUrl = await this.blobToDataURL(files[i]);
        pages.push({ url: dataUrl, pageIndex: i });
      }

      const title = files[0].name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ') || 'New Comic Issue';

      const newBook = {
        title: title,
        author: 'Independent Creator',
        genre: 'Indie',
        folderId: 'folder_all',
        fileType: 'images',
        pageCount: pages.length,
        currentPage: 0,
        progress: 0,
        coverUrl: pages[0]?.url,
        direction: 'ltr',
        pages: pages,
        dateAdded: Date.now(),
        lastRead: Date.now()
      };

      await window.comicDB.saveBook(newBook);
      window.app.hideLoadingModal();
      window.app.showToast(`Created issue with ${pages.length} pages`);
      await this.refresh();
      window.app.openBookInReader(newBook);
    } catch (err) {
      window.app.hideLoadingModal();
      window.app.showToast(`Image import failed: ${err.message}`);
    }
  }

  blobToDataURL(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  }

  // --- Folder Management ---
  async promptCreateFolder() {
    const name = prompt('Enter new Shelf / Folder name:');
    if (!name || !name.trim()) return;

    const colors = ['#6366f1', '#ec4899', '#06b6d4', '#10b981', '#f59e0b', '#8b5cf6'];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];

    const newFolder = {
      name: name.trim(),
      icon: 'folder',
      color: randomColor,
      order: this.folders.length
    };

    await window.comicDB.saveFolder(newFolder);
    await this.refresh();
    window.app.showToast(`Created folder "${newFolder.name}"`);
  }

  openBookActionModal(book) {
    window.app.openEditBookModal(book);
  }
}

// Global library instance
window.comicLibrary = new ComicLibrary();
