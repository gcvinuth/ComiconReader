/**
 * ComiconReader - IndexedDB Data Store
 * Provides persistent offline storage for books, pages, bookmarks, shelves, and sync logs.
 */

const DB_NAME = 'ComiconReaderDB';
const DB_VERSION = 1;

class ComicDB {
  constructor() {
    this.db = null;
    this.initPromise = null;
    this.isSeeded = false;
  }

  async init() {
    if (this.db) return this.db;
    if (this.initPromise) return this.initPromise;

    this.initPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // Books store
        if (!db.objectStoreNames.contains('books')) {
          const bookStore = db.createObjectStore('books', { keyPath: 'id' });
          bookStore.createIndex('folderId', 'folderId', { unique: false });
          bookStore.createIndex('genre', 'genre', { unique: false });
          bookStore.createIndex('lastRead', 'lastRead', { unique: false });
          bookStore.createIndex('dateAdded', 'dateAdded', { unique: false });
        }

        // Bookmarks store
        if (!db.objectStoreNames.contains('bookmarks')) {
          const bookmarkStore = db.createObjectStore('bookmarks', { keyPath: 'id' });
          bookmarkStore.createIndex('bookId', 'bookId', { unique: false });
          bookmarkStore.createIndex('pageNumber', ['bookId', 'pageNumber'], { unique: false });
        }

        // Folders / Shelves store
        if (!db.objectStoreNames.contains('folders')) {
          db.createObjectStore('folders', { keyPath: 'id' });
        }

        // Settings store
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }

        // Sync journal store
        if (!db.objectStoreNames.contains('sync_log')) {
          const syncStore = db.createObjectStore('sync_log', { keyPath: 'id', autoIncrement: true });
          syncStore.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };

      request.onsuccess = (event) => {
        this.db = event.target.result;
        resolve(this.db);
      };

      request.onerror = (event) => {
        console.error('IndexedDB open error:', event.target.error);
        reject(event.target.error);
      };
    });

    await this.initPromise;
    if (!this.isSeeded) {
      this.isSeeded = true;
      await this._seedInitialData();
    }
    return this.db;
  }

  async _seedInitialData() {
    try {
      const folders = await new Promise((res) => {
        const tx = this.db.transaction('folders', 'readonly');
        const req = tx.objectStore('folders').getAll();
        req.onsuccess = () => res(req.result || []);
        req.onerror = () => res([]);
      });

      if (!folders || folders.length === 0) {
        const defaultFolders = [
          { id: 'folder_all', name: 'All Comics', icon: 'layers', color: '#6366f1', order: 0 },
          { id: 'folder_favorites', name: 'Favorites', icon: 'heart', color: '#ec4899', order: 1 },
          { id: 'folder_scifi', name: 'Sci-Fi & Cyberpunk', icon: 'zap', color: '#06b6d4', order: 2 },
          { id: 'folder_manga', name: 'Manga (RTL)', icon: 'book-open', color: '#f59e0b', order: 3 },
          { id: 'folder_graphic_novels', name: 'Graphic Novels', icon: 'feather', color: '#10b981', order: 4 }
        ];

        const tx = this.db.transaction('folders', 'readwrite');
        const store = tx.objectStore('folders');
        for (const f of defaultFolders) {
          store.put(f);
        }
      }

      // Default settings
      const defaultSettings = [
        { key: 'theme', value: 'dark' },
        { key: 'pageTurnSound', value: true },
        { key: 'soundVolume', value: 0.65 },
        { key: 'readingFilter', value: 'none' },
        { key: 'defaultSpread', value: 'auto' },
        { key: 'readingDirection', value: 'ltr' },
        { key: 'autoSync', value: true }
      ];

      const sTx = this.db.transaction('settings', 'readwrite');
      const sStore = sTx.objectStore('settings');
      for (const s of defaultSettings) {
        sStore.put(s);
      }
    } catch (e) {
      console.warn('Seeding issue:', e);
    }
  }

  // --- Books operations ---
  async getAllBooks() {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('books', 'readonly');
      const store = tx.objectStore('books');
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  async getBook(id) {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('books', 'readonly');
      const store = tx.objectStore('books');
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async saveBook(book) {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['books', 'sync_log'], 'readwrite');
      const store = tx.objectStore('books');
      const syncStore = tx.objectStore('sync_log');

      if (!book.id) book.id = 'book_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
      if (!book.dateAdded) book.dateAdded = Date.now();
      if (!book.lastRead) book.lastRead = Date.now();
      if (book.progress === undefined) book.progress = 0;
      if (book.currentPage === undefined) book.currentPage = 0;

      store.put(book);
      syncStore.add({
        timestamp: Date.now(),
        action: 'book_updated',
        bookId: book.id,
        summary: {
          id: book.id,
          title: book.title,
          currentPage: book.currentPage,
          progress: book.progress,
          lastRead: book.lastRead,
          folderId: book.folderId,
          genre: book.genre,
          isFavorite: book.isFavorite
        }
      });

      tx.oncomplete = () => resolve(book);
      tx.onerror = () => reject(tx.error);
    });
  }

  async updateBookProgress(bookId, currentPage, totalPages) {
    await this.init();
    const book = await this.getBook(bookId);
    if (!book) return;

    book.currentPage = currentPage;
    const progress = totalPages > 1 ? Math.round((currentPage / (totalPages - 1)) * 100) : 0;
    book.progress = Math.min(100, Math.max(0, progress));
    book.lastRead = Date.now();

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['books', 'sync_log'], 'readwrite');
      tx.objectStore('books').put(book);
      tx.objectStore('sync_log').add({
        timestamp: Date.now(),
        action: 'progress_updated',
        bookId: book.id,
        currentPage: book.currentPage,
        progress: book.progress,
        lastRead: book.lastRead
      });
      tx.oncomplete = () => resolve(book);
      tx.onerror = () => reject(tx.error);
    });
  }

  async deleteBook(id) {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['books', 'bookmarks', 'sync_log'], 'readwrite');
      tx.objectStore('books').delete(id);

      // Delete associated bookmarks
      const bookmarkIndex = tx.objectStore('bookmarks').index('bookId');
      const bReq = bookmarkIndex.getAllKeys(id);
      bReq.onsuccess = () => {
        bReq.result.forEach(bId => tx.objectStore('bookmarks').delete(bId));
      };

      tx.objectStore('sync_log').add({
        timestamp: Date.now(),
        action: 'book_deleted',
        bookId: id
      });

      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  }

  // --- Bookmarks operations ---
  async getBookmarksForBook(bookId) {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('bookmarks', 'readonly');
      const index = tx.objectStore('bookmarks').index('bookId');
      const req = index.getAll(bookId);
      req.onsuccess = () => {
        const sorted = (req.result || []).sort((a, b) => a.pageNumber - b.pageNumber);
        resolve(sorted);
      };
      req.onerror = () => reject(req.error);
    });
  }

  async saveBookmark(bookmark) {
    await this.init();
    if (!bookmark.id) {
      bookmark.id = 'bm_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
    }
    if (!bookmark.timestamp) bookmark.timestamp = Date.now();
    if (!bookmark.color) bookmark.color = '#ef4444';

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['bookmarks', 'sync_log'], 'readwrite');
      tx.objectStore('bookmarks').put(bookmark);
      tx.objectStore('sync_log').add({
        timestamp: Date.now(),
        action: 'bookmark_saved',
        bookmark: bookmark
      });
      tx.oncomplete = () => resolve(bookmark);
      tx.onerror = () => reject(tx.error);
    });
  }

  async deleteBookmark(bookmarkId) {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['bookmarks', 'sync_log'], 'readwrite');
      tx.objectStore('bookmarks').delete(bookmarkId);
      tx.objectStore('sync_log').add({
        timestamp: Date.now(),
        action: 'bookmark_deleted',
        bookmarkId: bookmarkId
      });
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  }

  // --- Folders / Shelves ---
  async getAllFolders() {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('folders', 'readonly');
      const req = tx.objectStore('folders').getAll();
      req.onsuccess = () => {
        const sorted = (req.result || []).sort((a, b) => (a.order || 0) - (b.order || 0));
        resolve(sorted);
      };
      req.onerror = () => reject(req.error);
    });
  }

  async saveFolder(folder) {
    await this.init();
    if (!folder.id) folder.id = 'folder_' + Date.now();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('folders', 'readwrite');
      tx.objectStore('folders').put(folder);
      tx.oncomplete = () => resolve(folder);
      tx.onerror = () => reject(tx.error);
    });
  }

  async deleteFolder(folderId) {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['folders', 'books'], 'readwrite');
      tx.objectStore('folders').delete(folderId);
      
      const bookIndex = tx.objectStore('books').index('folderId');
      const req = bookIndex.getAll(folderId);
      req.onsuccess = () => {
        (req.result || []).forEach(b => {
          b.folderId = 'folder_all';
          tx.objectStore('books').put(b);
        });
      };

      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  }

  // --- Settings ---
  async getSetting(key, defaultValue = undefined) {
    await this.init();
    return new Promise((resolve) => {
      const tx = this.db.transaction('settings', 'readonly');
      const req = tx.objectStore('settings').get(key);
      req.onsuccess = () => {
        resolve(req.result !== undefined ? req.result.value : defaultValue);
      };
      req.onerror = () => resolve(defaultValue);
    });
  }

  async setSetting(key, value) {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('settings', 'readwrite');
      tx.objectStore('settings').put({ key, value });
      tx.oncomplete = () => resolve(value);
      tx.onerror = () => reject(tx.error);
    });
  }

  // --- Sync Export / Import Snapshots ---
  async exportSyncPayload() {
    await this.init();
    const books = await this.getAllBooks();
    const bookmarks = await new Promise((res) => {
      const tx = this.db.transaction('bookmarks', 'readonly');
      const req = tx.objectStore('bookmarks').getAll();
      req.onsuccess = () => res(req.result || []);
    });
    const folders = await this.getAllFolders();

    const bookProgressList = books.map(b => ({
      id: b.id,
      title: b.title,
      author: b.author,
      genre: b.genre,
      folderId: b.folderId,
      currentPage: b.currentPage,
      progress: b.progress,
      lastRead: b.lastRead,
      isFavorite: b.isFavorite,
      rating: b.rating,
      direction: b.direction
    }));

    return {
      version: 1,
      exportedAt: Date.now(),
      deviceId: await this.getSetting('cloudSyncDeviceId', 'device_' + Math.random().toString(36).substr(2, 6)),
      books: bookProgressList,
      bookmarks: bookmarks,
      folders: folders
    };
  }

  async importSyncPayload(payload) {
    await this.init();
    if (!payload || !payload.books) throw new Error('Invalid sync payload format');

    let updatedBooksCount = 0;
    let updatedBookmarksCount = 0;

    for (const remoteBook of payload.books) {
      const localBook = await this.getBook(remoteBook.id);
      if (localBook) {
        if (!localBook.lastRead || remoteBook.lastRead > localBook.lastRead) {
          localBook.currentPage = remoteBook.currentPage;
          localBook.progress = remoteBook.progress;
          localBook.lastRead = remoteBook.lastRead;
          if (remoteBook.folderId) localBook.folderId = remoteBook.folderId;
          if (remoteBook.genre) localBook.genre = remoteBook.genre;
          if (remoteBook.isFavorite !== undefined) localBook.isFavorite = remoteBook.isFavorite;
          await this.saveBook(localBook);
          updatedBooksCount++;
        }
      }
    }

    if (payload.bookmarks && Array.isArray(payload.bookmarks)) {
      for (const bm of payload.bookmarks) {
        await this.saveBookmark(bm);
        updatedBookmarksCount++;
      }
    }

    if (payload.folders && Array.isArray(payload.folders)) {
      for (const f of payload.folders) {
        await this.saveFolder(f);
      }
    }

    return { updatedBooksCount, updatedBookmarksCount };
  }
}

// Export singleton instance
window.comicDB = new ComicDB();
