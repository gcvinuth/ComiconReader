/**
 * ComiconReader - Main Application Coordinator
 * Handles view routing, PWA service worker registration, theme switching,
 * sample comics bootstrap, cloud sync UI, modal interactions, and multi-source imports.
 */

class ComiconApp {
  constructor() {
    this.currentView = 'library';
    this.currentTheme = 'dark';
    this.deferredInstallPrompt = null;

    this.init();
  }

  async init() {
    this.initTheme();
    this.registerServiceWorker();
    this.setupPWAInstall();
    this.bindGlobalEvents();

    // Initialize DB
    await window.comicDB.init();

    // Check if initial sample comics need to be loaded
    const books = await window.comicDB.getAllBooks();
    if (books.length === 0) {
      await this.preloadSampleComics(true);
    }

    // Refresh Library
    await window.comicLibrary.refresh();

    // Check URL route
    this.handleRoute();
    window.addEventListener('hashchange', () => this.handleRoute());

    // Update Cloud Sync status indicator
    this.setupSyncStatusIndicator();
  }

  initTheme() {
    const savedTheme = localStorage.getItem('comicon_theme') || 'dark';
    this.setTheme(savedTheme);

    const themeToggleBtn = document.getElementById('btn-toggle-theme');
    if (themeToggleBtn) {
      themeToggleBtn.onclick = () => {
        const nextTheme = this.currentTheme === 'dark' ? 'oled' : this.currentTheme === 'oled' ? 'sepia' : this.currentTheme === 'sepia' ? 'light' : 'dark';
        this.setTheme(nextTheme);
      };
    }
  }

  setTheme(theme) {
    this.currentTheme = theme;
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('comicon_theme', theme);
    window.comicDB?.setSetting('theme', theme);

    const label = document.getElementById('theme-indicator-label');
    if (label) {
      const names = { dark: '🌙 Dark', oled: '🖤 OLED Black', sepia: '📜 Sepia', light: '☀️ Light' };
      label.textContent = names[theme] || theme;
    }
  }

  registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
          .then(reg => console.log('[PWA] Service Worker registered:', reg.scope))
          .catch(err => console.warn('[PWA] Service Worker registration failed:', err));
      });
    }
  }

  setupPWAInstall() {
    const installBtn = document.getElementById('btn-pwa-install');
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferredInstallPrompt = e;
      if (installBtn) installBtn.classList.remove('hidden');
    });

    if (installBtn) {
      installBtn.onclick = async () => {
        if (!this.deferredInstallPrompt) return;
        this.deferredInstallPrompt.prompt();
        const { outcome } = await this.deferredInstallPrompt.userChoice;
        if (outcome === 'accepted') {
          installBtn.classList.add('hidden');
        }
        this.deferredInstallPrompt = null;
      };
    }
  }

  bindGlobalEvents() {
    // Navigation to library
    const backBtn = document.getElementById('btn-back-to-library');
    if (backBtn) {
      backBtn.onclick = () => this.showLibraryView();
    }

    // Add comic modal triggers (both desktop header button and M3 Expressive mobile FAB)
    const btnAddComic = document.getElementById('btn-open-add-modal');
    const fabAddComic = document.getElementById('m3-fab-add-comic');
    if (btnAddComic) {
      btnAddComic.onclick = () => this.openModal('modal-add-comic');
    }
    if (fabAddComic) {
      fabAddComic.onclick = () => this.openModal('modal-add-comic');
    }

    // Modal Tabs & Source Cards switcher for Add Comic
    document.querySelectorAll('.modal-tab-btn, .m3-source-card').forEach(tabBtn => {
      tabBtn.addEventListener('click', () => {
        const targetTabId = tabBtn.dataset.tab;
        if (targetTabId) this.switchAddModalTab(targetTabId);
      });
    });

    // Material 3 Mobile Bottom Navigation Bar
    const bottomNavItems = document.querySelectorAll('.m3-bottom-nav .m3-nav-item');
    bottomNavItems.forEach(item => {
      item.addEventListener('click', () => {
        const navType = item.dataset.nav;
        bottomNavItems.forEach(i => i.classList.remove('active'));
        item.classList.add('active');

        if (navType === 'library') {
          window.comicLibrary.activeFolderId = 'folder_all';
          window.comicLibrary.activeGenre = 'all';
          this.showLibraryView();
        } else if (navType === 'favorites') {
          window.comicLibrary.activeFolderId = 'folder_favorites';
          this.showLibraryView();
        } else if (navType === 'recent') {
          window.comicLibrary.sortMode = 'lastRead';
          const sortSelect = document.getElementById('library-sort-select');
          if (sortSelect) sortSelect.value = 'lastRead';
          this.showLibraryView();
        } else if (navType === 'sync') {
          this.openCloudSyncModal();
        }
      });
    });

    // Cloud sync modal trigger
    const btnCloudSync = document.getElementById('btn-open-cloud-sync');
    if (btnCloudSync) {
      btnCloudSync.onclick = () => this.openCloudSyncModal();
    }

    // Bookmarks drawer toggle
    const btnToggleBookmarks = document.getElementById('btn-toggle-bookmarks-drawer');
    const drawerBookmarks = document.getElementById('bookmarks-drawer');
    const closeDrawerBtn = document.getElementById('btn-close-bookmarks-drawer');

    if (btnToggleBookmarks && drawerBookmarks) {
      btnToggleBookmarks.onclick = () => drawerBookmarks.classList.toggle('open');
    }
    if (closeDrawerBtn && drawerBookmarks) {
      closeDrawerBtn.onclick = () => drawerBookmarks.classList.remove('open');
    }

    // Modal & Bottom Sheet close handlers
    document.querySelectorAll('.modal-overlay .btn-close-modal, .modal-backdrop, .m3-bottom-sheet-overlay .btn-close-modal, .m3-sheet-backdrop').forEach(el => {
      el.addEventListener('click', () => {
        const modal = el.closest('.modal-overlay, .m3-bottom-sheet-overlay');
        if (modal) modal.classList.remove('active');
      });
    });

    // Sound toggle in reader footer
    const btnSound = document.getElementById('btn-toggle-sound');
    if (btnSound) {
      btnSound.onclick = () => {
        window.flipAudio.enabled = !window.flipAudio.enabled;
        btnSound.classList.toggle('active', window.flipAudio.enabled);
        this.showToast(`Page flip sound ${window.flipAudio.enabled ? 'Enabled' : 'Muted'}`);
      };
    }

    // Keyboard shortcut helper '?'
    const btnHelp = document.getElementById('btn-keyboard-help');
    if (btnHelp) {
      btnHelp.onclick = () => this.openModal('modal-keyboard-shortcuts');
    }
  }

  switchAddModalTab(tabId) {
    document.querySelectorAll('.modal-tab-btn, .m3-source-card').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tabId);
    });
    document.querySelectorAll('.modal-tab-pane').forEach(pane => {
      pane.classList.toggle('active', pane.id === tabId);
    });
  }

  setupSyncStatusIndicator() {
    const statusPill = document.getElementById('cloud-sync-status-pill');
    if (!statusPill) return;

    window.cloudSync.onStatusChange((status, detail) => {
      statusPill.className = `sync-status-pill sync-${status}`;
      const text = statusPill.querySelector('.sync-text');
      if (text) {
        if (status === 'synced') text.textContent = 'Synced';
        else if (status === 'syncing') text.textContent = 'Syncing...';
        else if (status === 'offline') text.textContent = 'Offline';
        else text.textContent = 'Cloud Sync';
      }
      if (detail) {
        statusPill.title = detail;
      }
    });
  }

  handleRoute() {
    const hash = window.location.hash;
    if (hash.startsWith('#reader')) {
      const params = new URLSearchParams(hash.split('?')[1]);
      const bookId = params.get('id');
      if (bookId) {
        window.comicDB.getBook(bookId).then(book => {
          if (book) this.openBookInReader(book, false);
          else this.showLibraryView();
        });
      }
    } else {
      this.showLibraryView(false);
    }
  }

  showLibraryView(updateHash = true) {
    this.currentView = 'library';
    document.getElementById('library-view')?.classList.remove('hidden');
    document.getElementById('reader-view')?.classList.add('hidden');
    document.getElementById('bookmarks-drawer')?.classList.remove('open');
    if (updateHash) window.location.hash = '#library';
    window.comicLibrary.refresh();
  }

  async openBookInReader(book, updateHash = true) {
    this.currentView = 'reader';
    document.getElementById('library-view')?.classList.add('hidden');
    document.getElementById('reader-view')?.classList.remove('hidden');

    if (updateHash) {
      window.location.hash = `#reader?id=${book.id}`;
    }

    await window.pageFlipController.loadBook(book);
  }

  // --- Preload Samples ---
  async preloadSampleComics(isSilent = false) {
    if (!isSilent) this.showLoadingModal('Loading sample comics bundle...');

    try {
      // 1. Echoes of Nebula (Sci-Fi Cyberpunk Comic)
      const nebulaBook = {
        id: 'sample_nebula_01',
        title: 'Echoes of Nebula: Issue #1',
        author: 'Stellar Studios',
        genre: 'Sci-Fi',
        folderId: 'folder_scifi',
        fileType: 'images',
        pageCount: 3,
        currentPage: 0,
        progress: 0,
        coverUrl: 'assets/samples/nebula_cover.jpg',
        direction: 'ltr',
        isFavorite: true,
        pages: [
          'assets/samples/nebula_cover.jpg',
          'assets/samples/nebula_p1.jpg',
          'assets/samples/nebula_p2.jpg'
        ],
        dateAdded: Date.now() - 3600000,
        lastRead: Date.now()
      };

      // 2. Shadow Samurai (Manga Action RTL)
      const samuraiBook = {
        id: 'sample_samurai_01',
        title: 'Shadow Samurai: Issue #1',
        author: 'Kanjiro Tanaka',
        genre: 'Manga',
        folderId: 'folder_manga',
        fileType: 'images',
        pageCount: 2,
        currentPage: 0,
        progress: 0,
        coverUrl: 'assets/samples/samurai_cover.jpg',
        direction: 'rtl',
        isFavorite: false,
        pages: [
          'assets/samples/samurai_cover.jpg',
          'assets/samples/samurai_p1.jpg'
        ],
        dateAdded: Date.now() - 7200000,
        lastRead: Date.now() - 1800000
      };

      await window.comicDB.saveBook(nebulaBook);
      await window.comicDB.saveBook(samuraiBook);

      // Seed a sample bookmark on page 2 of Nebula
      await window.comicDB.saveBookmark({
        id: 'bm_sample_1',
        bookId: nebulaBook.id,
        pageNumber: 1,
        label: 'Quantum Breach Alarm',
        note: 'Epic battle panel start!',
        color: '#38bdf8',
        timestamp: Date.now(),
        thumbnail: 'assets/samples/nebula_p1.jpg'
      });

      if (!isSilent) {
        this.hideLoadingModal();
        this.showToast('Sample comics ready to read!');
        await window.comicLibrary.refresh();
      }
    } catch (e) {
      console.error('Error preloading samples:', e);
      if (!isSilent) this.hideLoadingModal();
    }
  }

  // --- Cloud Sync Modal UI ---
  async openCloudSyncModal() {
    this.openModal('modal-cloud-sync');
    const qrCanvas = document.getElementById('sync-qr-canvas');
    const syncTokenInput = document.getElementById('sync-token-output');
    const btnGenerateToken = document.getElementById('btn-generate-p2p-token');
    const btnAcceptToken = document.getElementById('btn-accept-p2p-token');
    const remoteInput = document.getElementById('input-remote-sync-token');
    const btnExportJSON = document.getElementById('btn-export-sync-json');
    const btnImportJSON = document.getElementById('btn-import-sync-json');
    const fileImportJSON = document.getElementById('file-sync-json-import');

    if (btnGenerateToken) {
      btnGenerateToken.onclick = async () => {
        btnGenerateToken.textContent = 'Generating connection...';
        try {
          const offer = await window.cloudSync.createP2PHostSession();
          if (syncTokenInput) syncTokenInput.value = offer;
          if (qrCanvas) window.cloudSync.renderSyncQR(qrCanvas, offer);
          btnGenerateToken.textContent = 'Session Ready!';
          this.showToast('Connection code generated. Share or scan on second device!');
        } catch (e) {
          console.error(e);
          btnGenerateToken.textContent = 'Generate Pairing Code';
          this.showToast('Failed to generate session');
        }
      };
    }

    if (btnAcceptToken) {
      btnAcceptToken.onclick = async () => {
        const token = remoteInput.value.trim();
        if (!token) return alert('Please paste the pairing code from device 1');
        try {
          const answer = await window.cloudSync.acceptP2POffer(token);
          if (syncTokenInput) syncTokenInput.value = answer;
          if (qrCanvas) window.cloudSync.renderSyncQR(qrCanvas, answer);
          this.showToast('Pairing accepted! Send answer back to device 1 to finalize.');
        } catch (e) {
          alert('Invalid pairing code: ' + e.message);
        }
      };
    }

    if (btnExportJSON) {
      btnExportJSON.onclick = async () => {
        const payload = await window.comicDB.exportSyncPayload();
        const jsonStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(payload, null, 2));
        const downloadAnchor = document.createElement('a');
        downloadAnchor.setAttribute("href", jsonStr);
        downloadAnchor.setAttribute("download", `comicon_cloud_backup_${new Date().toISOString().slice(0,10)}.json`);
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        downloadAnchor.remove();
        this.showToast('Sync backup JSON exported!');
      };
    }

    if (btnImportJSON && fileImportJSON) {
      btnImportJSON.onclick = () => fileImportJSON.click();
      fileImportJSON.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const text = await file.text();
        try {
          const data = JSON.parse(text);
          const res = await window.comicDB.importSyncPayload(data);
          this.showToast(`Imported progress: ${res.updatedBooksCount} books, ${res.updatedBookmarksCount} bookmarks!`);
          await window.comicLibrary.refresh();
          this.closeModal('modal-cloud-sync');
        } catch (err) {
          alert('Failed to parse backup file: ' + err.message);
        }
      };
    }
  }

  // --- Edit Book Metadata Modal ---
  openEditBookModal(book) {
    this.openModal('modal-edit-book');
    const form = document.getElementById('form-edit-book');
    if (!form) return;

    form.elements['title'].value = book.title || '';
    form.elements['author'].value = book.author || '';
    form.elements['genre'].value = book.genre || 'Comic';
    form.elements['direction'].value = book.direction || 'ltr';

    const shelfSelect = form.elements['folderId'];
    shelfSelect.innerHTML = window.comicLibrary.folders
      .filter(f => f.id !== 'folder_favorites')
      .map(f => `<option value="${f.id}" ${book.folderId === f.id ? 'selected' : ''}>${f.name}</option>`)
      .join('');

    form.onsubmit = async (e) => {
      e.preventDefault();
      book.title = form.elements['title'].value;
      book.author = form.elements['author'].value;
      book.genre = form.elements['genre'].value;
      book.folderId = form.elements['folderId'].value;
      book.direction = form.elements['direction'].value;

      await window.comicDB.saveBook(book);
      this.closeModal('modal-edit-book');
      this.showToast(`Updated "${book.title}"`);
      await window.comicLibrary.refresh();
    };

    const btnDelete = document.getElementById('btn-delete-book');
    if (btnDelete) {
      btnDelete.onclick = async () => {
        if (confirm(`Are you sure you want to delete "${book.title}"?`)) {
          await window.comicDB.deleteBook(book.id);
          this.closeModal('modal-edit-book');
          this.showToast(`Deleted "${book.title}"`);
          await window.comicLibrary.refresh();
        }
      };
    }
  }

  // --- Modals & Toasts ---
  openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.add('active');
  }

  closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.remove('active');
  }

  showLoadingModal(text = 'Loading...') {
    const modal = document.getElementById('modal-loading');
    const textEl = document.getElementById('loading-modal-text');
    const barEl = document.getElementById('loading-progress-bar');
    if (textEl) textEl.textContent = text;
    if (barEl) barEl.style.width = '20%';
    if (modal) modal.classList.add('active');
  }

  updateLoadingProgress(text, pct) {
    const textEl = document.getElementById('loading-modal-text');
    const barEl = document.getElementById('loading-progress-bar');
    if (textEl) textEl.textContent = text;
    if (barEl) barEl.style.width = `${pct}%`;
  }

  hideLoadingModal() {
    this.closeModal('modal-loading');
  }

  showToast(message) {
    let toast = document.getElementById('global-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'global-toast';
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.className = 'comicon-toast show';
    clearTimeout(this.toastTimeout);
    this.toastTimeout = setTimeout(() => {
      toast.className = 'comicon-toast';
    }, 2800);
  }
}

// Instantiate global app
window.app = new ComiconApp();
