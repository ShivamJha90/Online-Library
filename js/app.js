/*
 * Lumina application controller
 * -----------------------------
 * Owns authentication, local state, SPA routing, live Gutendex UI state, and
 * coordination with the independent reader and API modules.
 */
(() => {
  "use strict";

  const Config = window.LibraryConfig;
  const ApiModule = window.LibraryApi;
  const ReaderModule = window.LibraryReaders;
  if (!Config || !ApiModule || !ReaderModule) throw new Error("Lumina modules loaded in the wrong order.");

  const ENTITIES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" };
  const escapeHTML = (value = "") => String(value).replace(/[&<>"']/g, (character) => ENTITIES[character]);
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const normalizeText = (value) => String(value ?? "").trim().replace(/\s+/g, " ");
  const pluralize = (count, singular, plural = `${singular}s`) => count === 1 ? singular : plural;
  const createId = (prefix) => `${prefix}-${window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;

  /**
   * Delay an expensive callback until input has been quiet for `delay` ms.
   * Every keystroke clears the previous timer, so rapid typing produces one
   * Gutendex request instead of one request per character.
   */
  const debounce = (callback, delay = 300) => {
    let timeoutId;
    const debounced = function (...args) {
      const context = this;
      window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(() => callback.apply(context, args), delay);
    };
    debounced.cancel = () => {
      window.clearTimeout(timeoutId);
      timeoutId = null;
    };
    return debounced;
  };

  const safeUrl = (value) => {
    try {
      const url = new URL(String(value));
      return url.protocol === "https:" ? url.href : "";
    } catch {
      return "";
    }
  };

  const dateValue = (value) => {
    const timestamp = new Date(value).getTime();
    return Number.isFinite(timestamp) ? timestamp : null;
  };

  const formatDate = (value) => {
    const timestamp = dateValue(value);
    if (timestamp === null) return "Not available";
    return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(timestamp);
  };

  const compactNumber = (value) => new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(Number(value) || 0);

  /** Persistent application state. Remote catalog data is recorded only after interaction. */
  class LibraryStateStore {
    constructor(config) {
      this.config = config;
      this.state = this.load();
    }

    load() {
      try {
        const current = window.localStorage.getItem(this.config.STATE_KEY);
        if (current) return this.normalize(JSON.parse(current));

        for (const legacyKey of this.config.LEGACY_STATE_KEYS) {
          const legacy = window.localStorage.getItem(legacyKey);
          if (legacy) {
            const migrated = this.migrateLegacy(JSON.parse(legacy));
            window.localStorage.setItem(this.config.STATE_KEY, JSON.stringify(migrated));
            return migrated;
          }
        }
      } catch (error) {
        console.warn("Lumina could not restore local state.", error);
        this.persistenceAvailable = false;
        return this.config.createInitialState();
      }

      const initial = this.config.createInitialState();
      this.persistenceAvailable = true;
      try {
        window.localStorage.setItem(this.config.STATE_KEY, JSON.stringify(initial));
      } catch {
        this.persistenceAvailable = false;
      }
      return initial;
    }

    normalize(candidate) {
      if (!candidate || candidate.schemaVersion !== this.config.SCHEMA_VERSION) return this.config.createInitialState();
      const initial = this.config.createInitialState();
      const validUser = this.config.users.some((user) => user.id === candidate.session?.currentUserId);
      this.persistenceAvailable = true;
      return {
        schemaVersion: this.config.SCHEMA_VERSION,
        session: {
          currentUserId: validUser ? candidate.session.currentUserId : null,
          authenticatedAt: validUser ? candidate.session.authenticatedAt || null : null
        },
        catalogRecords: candidate.catalogRecords && typeof candidate.catalogRecords === "object" ? clone(candidate.catalogRecords) : {},
        customBooks: Array.isArray(candidate.customBooks) ? candidate.customBooks.map((book) => ({ ...book })) : [],
        readingActivity: this.normalizePerUserObject(candidate.readingActivity, initial.readingActivity),
        readerState: candidate.readerState && typeof candidate.readerState === "object" ? clone(candidate.readerState) : {},
        savedBooks: this.normalizePerUserObject(candidate.savedBooks, initial.savedBooks),
        achievements: Array.isArray(candidate.achievements) ? candidate.achievements.map((item) => ({ ...item })) : [],
        preferences: { searchQuery: String(candidate.preferences?.searchQuery || "") }
      };
    }

    normalizePerUserObject(value, fallback) {
      const normalized = {};
      this.config.users.forEach((user) => {
        const candidate = value?.[user.id];
        normalized[user.id] = candidate && typeof candidate === "object" ? clone(candidate) : clone(fallback[user.id] || {});
      });
      return normalized;
    }

    migrateLegacy(legacy) {
      const state = this.config.createInitialState();
      state.preferences.searchQuery = String(legacy?.preferences?.searchQuery || "");

      // A static dashboard session is intentionally signed out during upgrade
      // so the new public/authenticated route boundary is explicit.
      state.session = { currentUserId: null, authenticatedAt: null };
      const legacyMap = {
        "book-pride-prejudice": "gutenberg-1342",
        "book-frankenstein": "gutenberg-84",
        "book-time-machine": "gutenberg-35"
      };
      const oldReader = legacy?.readerState?.["student-maya"] || {};
      Object.entries(oldReader).forEach(([oldKey, record]) => {
        const newKey = legacyMap[oldKey];
        if (!newKey) return;
        state.readerState["student-maya"] ||= {};
        state.readerState["student-maya"][newKey] = {
          engine: "text",
          lastVisitedPage: Math.max(1, Number(record.lastVisitedPage) || 1),
          lastScrollPercent: 0,
          bookmarks: Array.isArray(record.bookmarks) ? [...record.bookmarks] : [],
          notes: record.notes && typeof record.notes === "object" ? { ...record.notes } : {}
        };
      });
      return state;
    }

    save() {
      try {
        window.localStorage.setItem(this.config.STATE_KEY, JSON.stringify(this.state));
        this.persistenceAvailable = true;
      } catch (error) {
        console.warn("Lumina state is temporary because localStorage failed.", error);
        this.persistenceAvailable = false;
      }
    }

    commit(mutator) {
      const draft = clone(this.state);
      const result = mutator(draft);
      this.state = draft;
      this.save();
      return result;
    }

    reload() {
      try {
        const raw = window.localStorage.getItem(this.config.STATE_KEY);
        if (!raw) return false;
        this.state = this.normalize(JSON.parse(raw));
        return true;
      } catch {
        return false;
      }
    }

    reset() {
      this.state = this.config.createInitialState();
      this.save();
    }

    get currentUser() {
      return this.config.users.find((user) => user.id === this.state.session.currentUserId) || null;
    }

    setSession(userId) {
      this.commit((state) => {
        state.session.currentUserId = userId;
        state.session.authenticatedAt = userId ? new Date().toISOString() : null;
      });
    }

    setSearchQuery(query) {
      this.commit((state) => {
        state.preferences.searchQuery = String(query || "");
      });
    }

    rememberBooks(books) {
      if (!books.length) return;
      this.commit((state) => {
        books.filter((book) => book.source === "gutendex").forEach((book) => {
          state.catalogRecords[book.key] = clone(book);
        });
      });
    }

    getBook(key) {
      return this.state.catalogRecords[key]
        || this.state.customBooks.find((book) => book.key === key)
        || null;
    }

    addCustomBook(book) {
      this.commit((state) => {
        state.customBooks.unshift(clone(book));
      });
    }

    touchReading(book) {
      const userId = this.currentUser?.id;
      if (!userId) return;
      this.commit((state) => {
        if (book.source === "gutendex") state.catalogRecords[book.key] = clone(book);
        state.readingActivity[userId] ||= {};
        const activity = state.readingActivity[userId][book.key] || {
          source: book.source,
          sourceId: book.id,
          startedAt: new Date().toISOString(),
          completedAt: null
        };
        activity.lastReadAt = new Date().toISOString();
        state.readingActivity[userId][book.key] = activity;
      });
    }

    previousBooks(userId = this.currentUser?.id) {
      const activity = this.state.readingActivity[userId] || {};
      return Object.entries(activity)
        .map(([key, entry]) => ({ book: this.getBook(key), activity: entry }))
        .filter((item) => item.book)
        .sort((a, b) => dateValue(b.activity.lastReadAt) - dateValue(a.activity.lastReadAt));
    }

    getReaderRecord(bookKey, userId = this.currentUser?.id) {
      const record = this.state.readerState?.[userId]?.[bookKey];
      return record
        ? clone(record)
        : { engine: null, lastVisitedPage: 1, lastScrollPercent: 0, bookmarks: [], notes: {} };
    }

    ensureReaderRecord(state, userId, bookKey, engine = null) {
      state.readerState[userId] ||= {};
      state.readerState[userId][bookKey] ||= {
        engine,
        lastVisitedPage: 1,
        lastScrollPercent: 0,
        bookmarks: [],
        notes: {}
      };
      return state.readerState[userId][bookKey];
    }

    saveReaderLocation(book, location) {
      const userId = this.currentUser.id;
      this.commit((state) => {
        const record = this.ensureReaderRecord(state, userId, book.key, location.engine);
        record.engine = location.engine;
        record.lastVisitedPage = Math.max(1, Number(location.page) || 1);
        if (Number.isFinite(location.scrollPercent)) {
          record.lastScrollPercent = Math.max(0, Math.min(100, location.scrollPercent));
        }
        state.readingActivity[userId] ||= {};
        const activity = state.readingActivity[userId][book.key] || {
          source: book.source,
          sourceId: book.id,
          startedAt: new Date().toISOString(),
          completedAt: null
        };
        activity.lastReadAt = new Date().toISOString();
        activity.progress = location.engine === "text"
          ? Math.round(location.scrollPercent || 0)
          : Math.min(99, Math.round((location.page / Math.max(1, location.totalPages)) * 100));
        state.readingActivity[userId][book.key] = activity;
      });
    }

    toggleReaderBookmark(bookKey, page) {
      const userId = this.currentUser.id;
      const pageNumber = Math.max(1, Number.parseInt(page, 10) || 1);
      let added = false;
      this.commit((state) => {
        const record = this.ensureReaderRecord(state, userId, bookKey);
        if (record.bookmarks.includes(pageNumber)) {
          record.bookmarks = record.bookmarks.filter((savedPage) => savedPage !== pageNumber);
        } else {
          record.bookmarks.push(pageNumber);
          record.bookmarks.sort((a, b) => a - b);
          added = true;
        }
      });
      return added;
    }

    saveReaderNote(bookKey, page, text) {
      const userId = this.currentUser.id;
      const pageNumber = Math.max(1, Number.parseInt(page, 10) || 1);
      const note = String(text || "").slice(0, 10000);
      this.commit((state) => {
        const record = this.ensureReaderRecord(state, userId, bookKey);
        if (note.trim()) record.notes[pageNumber] = note;
        else delete record.notes[pageNumber];
      });
    }

    savedKeys(userId = this.currentUser?.id) {
      return Array.isArray(this.state.savedBooks[userId]) ? this.state.savedBooks[userId] : [];
    }

    isSaved(bookKey) {
      return this.savedKeys().includes(bookKey);
    }

    toggleSaved(book) {
      const userId = this.currentUser.id;
      const wasSaved = this.isSaved(book.key);
      this.commit((state) => {
        if (book.source === "gutendex") state.catalogRecords[book.key] = clone(book);
        state.savedBooks[userId] ||= [];
        state.savedBooks[userId] = wasSaved
          ? state.savedBooks[userId].filter((key) => key !== book.key)
          : [...state.savedBooks[userId], book.key];
      });
      return !wasSaved;
    }

    markComplete(book) {
      const userId = this.currentUser.id;
      const now = new Date().toISOString();
      let isNewAchievement = false;
      this.commit((state) => {
        if (book.source === "gutendex") state.catalogRecords[book.key] = clone(book);
        state.readingActivity[userId] ||= {};
        const activity = state.readingActivity[userId][book.key] || {
          source: book.source,
          sourceId: book.id,
          startedAt: now
        };
        activity.lastReadAt = now;
        activity.completedAt ||= now;
        activity.progress = 100;
        state.readingActivity[userId][book.key] = activity;

        const existing = state.achievements.find((item) => item.userId === userId && item.type === "avid-reader");
        const cutoff = Date.now() - (Config.AVID_READER_WINDOW_DAYS * Config.DAY_IN_MS);
        const qualifying = Object.values(state.readingActivity[userId]).filter((entry) => {
          const completedAt = dateValue(entry.completedAt);
          return completedAt !== null && completedAt >= cutoff;
        });
        if (!existing && qualifying.length >= Config.AVID_READER_TARGET) {
          state.achievements.push({
            id: createId("achievement"),
            userId,
            type: "avid-reader",
            unlockedAt: now,
            evidenceBookKeys: Object.entries(state.readingActivity[userId])
              .filter(([, entry]) => dateValue(entry.completedAt) >= cutoff)
              .map(([key]) => key)
          });
          isNewAchievement = true;
        }
      });
      return { isNewAchievement };
    }

    challenge(userId = this.currentUser?.id) {
      const cutoff = Date.now() - (Config.AVID_READER_WINDOW_DAYS * Config.DAY_IN_MS);
      const activities = this.state.readingActivity[userId] || {};
      const completed = Object.entries(activities)
        .filter(([, entry]) => {
          const timestamp = dateValue(entry.completedAt);
          return timestamp !== null && timestamp >= cutoff;
        });
      const achievement = this.state.achievements.find((item) => item.userId === userId && item.type === "avid-reader") || null;
      return { count: completed.length, achievement };
    }
  }

  /** Demo-only client authentication boundary. */
  class AuthenticationService {
    constructor(store) {
      this.store = store;
      this.failures = 0;
      this.lockedUntil = 0;
    }

    async hash(value) {
      if (!window.crypto?.subtle) throw new Error("Secure browser hashing is unavailable.");
      const bytes = new TextEncoder().encode(String(value));
      const digest = await window.crypto.subtle.digest("SHA-256", bytes);
      return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
    }

    async signIn(email, password) {
      if (Date.now() < this.lockedUntil) throw new Error("Too many failed attempts. Wait a few seconds and retry.");
      const user = Config.users.find((candidate) => candidate.email.toLowerCase() === String(email).trim().toLowerCase());
      const passwordHash = await this.hash(password);
      if (!user || passwordHash !== user.passwordHash) {
        this.failures += 1;
        if (this.failures >= 5) {
          this.lockedUntil = Date.now() + 10000;
          this.failures = 0;
        }
        throw new Error("The email or password is incorrect.");
      }
      this.failures = 0;
      this.store.setSession(user.id);
      return user;
    }

    signOut() {
      this.store.setSession(null);
    }
  }

  class HashRouter {
    constructor(onRoute) {
      this.onRoute = onRoute;
      this.resolve = this.resolve.bind(this);
    }

    start(defaultRoute) {
      window.addEventListener("hashchange", this.resolve);
      if (!window.location.hash) this.navigate(defaultRoute, true);
      else this.resolve();
    }

    current() {
      return window.location.hash.replace(/^#\/?/, "").trim() || "store";
    }

    navigate(route, replace = false) {
      const hash = `#${route}`;
      if (window.location.hash === hash) this.resolve();
      else if (replace && window.history?.replaceState) {
        window.history.replaceState(null, "", hash);
        this.resolve();
      } else window.location.hash = hash;
    }

    resolve() {
      this.onRoute(this.current());
    }
  }

  class ModalController {
    constructor(dialog, content) {
      this.dialog = dialog;
      this.content = content;
      dialog.addEventListener("click", (event) => {
        if (event.target === dialog) this.close();
      });
      dialog.addEventListener("cancel", (event) => {
        event.preventDefault();
        this.close();
      });
    }

    open(markup, focusSelector = null) {
      this.content.innerHTML = markup;
      if (typeof this.dialog.showModal === "function") {
        if (!this.dialog.open) this.dialog.showModal();
      } else this.dialog.setAttribute("open", "");
      window.requestAnimationFrame(() => (focusSelector ? this.dialog.querySelector(focusSelector) : this.dialog.querySelector("button, input"))?.focus());
    }

    close() {
      if (typeof this.dialog.close === "function" && this.dialog.open) this.dialog.close();
      else this.dialog.removeAttribute("open");
      this.content.innerHTML = "";
    }
  }

  class ToastController {
    constructor(region) { this.region = region; }

    show(message, type = "info", duration = 3600) {
      const toast = document.createElement("div");
      const icons = { success: "✓", error: "!", warning: "!", info: "i" };
      toast.className = `toast toast-${type}`;
      toast.setAttribute("role", type === "error" ? "alert" : "status");
      toast.innerHTML = `<span class="toast-icon">${icons[type] || "i"}</span><span class="toast-message"></span><button class="toast-dismiss" type="button" aria-label="Dismiss">×</button>`;
      toast.querySelector(".toast-message").textContent = message;
      const remove = () => {
        if (!toast.isConnected) return;
        toast.classList.add("is-leaving");
        window.setTimeout(() => toast.remove(), 160);
      };
      toast.querySelector("button").addEventListener("click", remove);
      this.region.append(toast);
      window.setTimeout(remove, duration);
    }
  }

  class LuminaLiveApp {
    constructor() {
      this.store = new LibraryStateStore(Config);
      this.auth = new AuthenticationService(this.store);
      this.api = new ApiModule.GutendexClient();
      this.cache = new ReaderModule.DocumentCacheService();
      this.router = new HashRouter((route) => this.renderRoute(route));
      this.modal = new ModalController(document.querySelector("#app-dialog"), document.querySelector("#dialog-content"));
      this.toast = new ToastController(document.querySelector("#toast-region"));
      this.reader = null;
      this.readerReturnRoute = "catalog";
      this.pendingReadKey = null;
      this.searchController = null;
      this.debouncedApiSearch = debounce((query) => this.runSearch(query), 300);
      this.autocompleteItems = [];
      this.autocompleteIndex = -1;
      this.searchHasFocus = false;
      this.bookIndex = new Map();
      this.catalog = {
        popular: [],
        newest: [],
        searchResults: [],
        totalCount: 0,
        searchCount: 0,
        loadingPopular: true,
        loadingNewest: true,
        loadingSearch: false,
        popularError: null,
        newestError: null,
        searchError: null
      };

      this.elements = {
        routeView: document.querySelector("#route-view"),
        search: document.querySelector("#global-search"),
        authControl: document.querySelector("#auth-control"),
        storageDot: document.querySelector("#storage-dot"),
        apiStatusDot: document.querySelector("#api-status-dot")
      };

      this.routes = {
        store: { title: "Lumina · Live Public Library", public: true, sidebar: null, header: "store", render: () => this.renderStorefront() },
        catalog: { title: "Live Catalog · Lumina", public: true, sidebar: "catalog", header: "catalog", render: () => this.renderCatalog() },
        dashboard: { title: "My Library · Lumina", auth: true, role: "student", sidebar: "dashboard", header: "dashboard", render: () => this.renderDashboard() },
        bookmarks: { title: "Saved Books · Lumina", auth: true, sidebar: "bookmarks", header: null, render: () => this.renderBookmarks() },
        settings: { title: "Settings · Lumina", auth: true, sidebar: "settings", header: null, render: () => this.renderSettings() },
        admin: { title: "PDF Administration · Lumina", auth: true, role: "admin", sidebar: "dashboard", header: "dashboard", render: () => this.renderAdmin() }
      };
    }

    init() {
      this.setupAutocomplete();
      this.elements.search.value = this.store.state.preferences.searchQuery;
      document.addEventListener("click", (event) => this.handleClick(event));
      document.addEventListener("submit", (event) => this.handleSubmit(event));
      document.addEventListener("input", (event) => this.handleSearchInput(event));
      document.addEventListener("keydown", (event) => this.handleKeyboard(event));
      document.addEventListener("error", (event) => this.handleImageError(event), true);
      window.addEventListener("storage", (event) => this.handleStorageChange(event));

      this.renderChrome();
      const user = this.store.currentUser;
      this.router.start(window.location.hash ? this.router.current() : user ? (user.role === "admin" ? "admin" : "dashboard") : "store");
      this.loadLiveShelves();
      if (user) this.hydrateUserRecords();
    }

    setupAutocomplete() {
      const searchBar = this.elements.search.closest(".global-search");
      if (!searchBar || searchBar.parentElement?.classList.contains("search-combobox")) return;

      const wrapper = document.createElement("div");
      wrapper.className = "search-combobox";
      searchBar.parentElement.insertBefore(wrapper, searchBar);
      wrapper.append(searchBar);

      const suggestions = document.createElement("ul");
      suggestions.className = "search-suggestions";
      suggestions.id = "search-suggestions";
      suggestions.setAttribute("role", "listbox");
      suggestions.setAttribute("aria-label", "Predictive book suggestions");
      suggestions.hidden = true;
      wrapper.append(suggestions);

      this.elements.suggestions = suggestions;
      this.elements.search.setAttribute("role", "combobox");
      this.elements.search.setAttribute("aria-autocomplete", "list");
      this.elements.search.setAttribute("aria-controls", suggestions.id);
      this.elements.search.setAttribute("aria-expanded", "false");

      this.elements.search.addEventListener("focus", () => {
        this.searchHasFocus = true;
        this.updateAutocomplete(this.elements.search.value);
      });
      this.elements.search.addEventListener("blur", () => {
        window.setTimeout(() => {
          this.searchHasFocus = false;
          this.closeAutocomplete();
        }, 100);
      });
      this.elements.search.addEventListener("keydown", (event) => this.handleAutocompleteKeyboard(event));

      // Keep focus in the input long enough for delegated suggestion clicks to
      // run before the input's blur handler closes the listbox.
      suggestions.addEventListener("pointerdown", (event) => {
        if (event.target.closest("[data-action='select-suggestion']")) event.preventDefault();
      });
    }

    /**
     * Blend local reading history first and live API books second. The two
     * arrays are filtered with lowercase `includes()` matching, deduplicated,
     * and capped at six rows so predictive results remain quick to scan.
     */
    hybridSuggestions(query) {
      const normalizedQuery = String(query).toLowerCase();
      if (!normalizedQuery) return [];

      // previousBooks() is reconstructed from readingActivity and catalogRecords
      // loaded from localStorage, so a member's own history has top priority.
      const historyBooks = this.store.currentUser
        ? this.store.previousBooks().map((item) => item.book)
        : [];
      const historyKeys = new Set(historyBooks.map((book) => book.key));
      const globalCatalog = this.uniqueBooks([
        ...this.catalog.popular,
        ...this.catalog.searchResults,
        ...this.catalog.newest
      ]);
      const combined = [...historyBooks, ...globalCatalog];
      const seen = new Set();

      return combined
        .filter((book) => (
          book.title.toLowerCase().includes(normalizedQuery)
          || book.author.toLowerCase().includes(normalizedQuery)
        ))
        .filter((book) => {
          if (seen.has(book.key)) return false;
          seen.add(book.key);
          return true;
        })
        .slice(0, 6)
        .map((book) => ({ book, source: historyKeys.has(book.key) ? "History" : "Catalog" }));
    }

    updateAutocomplete(query = this.elements.search.value) {
      const hasValue = String(query).length > 0;
      this.autocompleteItems = this.hybridSuggestions(query);
      this.autocompleteIndex = -1;

      if (!this.searchHasFocus || !hasValue || !this.autocompleteItems.length) {
        this.closeAutocomplete();
        return;
      }

      this.elements.suggestions.innerHTML = this.autocompleteItems.map(({ book, source }, index) => {
        const cover = safeUrl(book.coverUrl);
        return `
          <li id="search-suggestion-${index}" role="option" aria-selected="false">
            <button type="button" data-action="select-suggestion" data-book-key="${escapeHTML(book.key)}">
              <span class="suggestion-cover">
                ${cover ? `<img data-cover-image src="${escapeHTML(cover)}" alt="" loading="lazy">` : ""}
                <i data-cover-fallback ${cover ? "hidden" : ""}>${escapeHTML(book.title.charAt(0))}</i>
              </span>
              <span class="suggestion-copy"><strong>${escapeHTML(book.title)}</strong><small>${escapeHTML(book.author)}</small></span>
              <span class="suggestion-source">${source}</span>
            </button>
          </li>
        `;
      }).join("");
      this.elements.suggestions.hidden = false;
      this.elements.search.setAttribute("aria-expanded", "true");
      this.elements.search.removeAttribute("aria-activedescendant");
    }

    closeAutocomplete() {
      if (!this.elements.suggestions) return;
      this.elements.suggestions.hidden = true;
      this.autocompleteIndex = -1;
      this.elements.search.setAttribute("aria-expanded", "false");
      this.elements.search.removeAttribute("aria-activedescendant");
    }

    setAutocompleteIndex(index) {
      if (!this.autocompleteItems.length) return;
      this.autocompleteIndex = (index + this.autocompleteItems.length) % this.autocompleteItems.length;
      this.elements.suggestions.querySelectorAll("li").forEach((item, itemIndex) => {
        const active = itemIndex === this.autocompleteIndex;
        item.classList.toggle("active", active);
        item.setAttribute("aria-selected", String(active));
      });
      const activeId = `search-suggestion-${this.autocompleteIndex}`;
      this.elements.search.setAttribute("aria-activedescendant", activeId);
      document.querySelector(`#${activeId}`)?.scrollIntoView({ block: "nearest" });
    }

    handleAutocompleteKeyboard(event) {
      if (this.elements.suggestions?.hidden) return;
      if (event.key === "ArrowDown") {
        event.preventDefault();
        this.setAutocompleteIndex(this.autocompleteIndex + 1);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        this.setAutocompleteIndex(this.autocompleteIndex - 1);
      } else if (event.key === "Enter" && this.autocompleteItems.length) {
        event.preventDefault();
        const selected = this.autocompleteItems[Math.max(0, this.autocompleteIndex)];
        this.selectSuggestion(selected.book.key);
      } else if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        this.closeAutocomplete();
      }
    }

    selectSuggestion(bookKey) {
      const book = this.findBook(bookKey);
      if (!book) return;
      this.elements.search.value = book.title;
      this.store.setSearchQuery(book.title);
      this.closeAutocomplete();
      this.scheduleSearch(book.title);
      this.openBookDetails(book.key);
    }

    renderChrome() {
      const user = this.store.currentUser;
      const readerMode = document.body.classList.contains("reader-mode");
      document.body.classList.toggle("public-mode", !user && !readerMode);
      document.body.classList.toggle("authenticated-mode", Boolean(user) && !readerMode);
      document.body.classList.toggle("admin-mode", user?.role === "admin" && !readerMode);
      this.elements.storageDot.classList.toggle("unavailable", this.store.persistenceAvailable === false);
      this.elements.storageDot.dataset.tooltip = this.store.persistenceAvailable === false ? "Temporary state" : "Saved locally";

      this.elements.authControl.innerHTML = user ? `
        <a class="user-profile" href="#settings" data-route-link aria-label="Open profile settings">
          <span class="profile-copy"><strong>${escapeHTML(user.name)}</strong><small>${escapeHTML(user.role)}</small></span>
          <span class="profile-avatar" aria-hidden="true">${escapeHTML(user.initials)}</span>
        </a>
        <button class="logout-button" type="button" data-action="logout">Log out</button>
      ` : '<button class="button button-small" type="button" data-action="open-login">Sign in</button>';
    }

    renderRoute(requestedRoute) {
      if (requestedRoute.startsWith("reader/")) {
        this.renderReaderRoute(decodeURIComponent(requestedRoute.slice(7)));
        return;
      }

      const routeName = this.routes[requestedRoute] ? requestedRoute : "store";
      if (routeName !== requestedRoute) return this.router.navigate(routeName, true);
      const route = this.routes[routeName];
      const user = this.store.currentUser;

      if (route.auth && !user) {
        this.router.navigate("store", true);
        this.openLogin();
        return;
      }
      if (route.role && user?.role !== route.role) {
        this.router.navigate(user?.role === "admin" ? "admin" : "dashboard", true);
        return;
      }

      this.reader?.destroy();
      this.reader = null;
      document.body.classList.remove("reader-mode");
      this.modal.close();
      this.renderChrome();
      this.elements.routeView.innerHTML = route.render();
      this.setNavigation(route);
      document.title = route.title;
      window.scrollTo({ top: 0, behavior: "auto" });
    }

    refreshView() {
      const current = this.router.current();
      if (current.startsWith("reader/")) return;
      const route = this.routes[current] || this.routes.store;
      this.elements.routeView.innerHTML = route.render();
      this.setNavigation(route);
    }

    refreshCatalogView() {
      if (["store", "catalog", "dashboard", "bookmarks"].includes(this.router.current())) {
        this.refreshView();
      }
    }

    setNavigation(route) {
      document.querySelectorAll("[data-route-group]").forEach((link) => link.classList.toggle("active", link.dataset.routeGroup === route.sidebar));
      document.querySelectorAll("[data-header-route]").forEach((link) => link.classList.toggle("active", link.dataset.headerRoute === route.header));
    }

    indexBooks(books) {
      books.forEach((book) => this.bookIndex.set(book.key, book));
    }

    findBook(key) {
      return this.bookIndex.get(key) || this.store.getBook(key);
    }

    async loadLiveShelves() {
      this.catalog.loadingPopular = true;
      this.catalog.loadingNewest = true;
      this.refreshCatalogView();

      const popularController = new AbortController();
      const newestController = new AbortController();
      const [popular, newest] = await Promise.allSettled([
        this.api.popular(popularController.signal),
        this.api.newest(newestController.signal)
      ]);

      if (popular.status === "fulfilled") {
        this.catalog.popular = popular.value.books;
        this.catalog.totalCount = popular.value.count;
        this.catalog.popularError = null;
        this.indexBooks(popular.value.books);
      } else {
        this.catalog.popularError = popular.reason?.message || "Popular books could not be loaded.";
      }
      if (newest.status === "fulfilled") {
        this.catalog.newest = newest.value.books;
        this.catalog.totalCount ||= newest.value.count;
        this.catalog.newestError = null;
        this.indexBooks(newest.value.books);
      } else {
        this.catalog.newestError = newest.reason?.message || "New books could not be loaded.";
      }
      this.catalog.loadingPopular = false;
      this.catalog.loadingNewest = false;
      this.setApiStatus(popular.status === "fulfilled" || newest.status === "fulfilled");
      this.updateAutocomplete(this.elements.search.value);
      this.refreshCatalogView();

      const currentQuery = this.store.state.preferences.searchQuery.trim();
      if (currentQuery && !this.catalog.loadingSearch) this.runSearch(currentQuery);
    }

    async hydrateUserRecords() {
      const user = this.store.currentUser;
      if (!user) return;
      const activities = this.store.state.readingActivity[user.id] || {};
      const missingIds = Object.entries(activities)
        .filter(([key, entry]) => key.startsWith("gutenberg-") && !this.store.state.catalogRecords[key])
        .map(([, entry]) => entry.sourceId);
      if (!missingIds.length) return;

      try {
        const result = await this.api.byIds(missingIds);
        this.indexBooks(result.books);
        this.store.rememberBooks(result.books);
        this.updateAutocomplete(this.elements.search.value);
        this.refreshCatalogView();
      } catch (error) {
        console.warn("Reading history metadata could not be hydrated.", error);
      }
    }

    scheduleSearch(query) {
      this.debouncedApiSearch.cancel();
      this.searchController?.abort();
      if (!query.trim()) {
        this.catalog.searchResults = [];
        this.catalog.searchCount = 0;
        this.catalog.loadingSearch = false;
        this.catalog.searchError = null;
        this.refreshView();
        return;
      }

      this.catalog.loadingSearch = true;
      this.catalog.searchError = null;
      this.refreshView();
      this.debouncedApiSearch(query);
    }

    async runSearch(query) {
      const trimmedQuery = query.trim();
      if (!trimmedQuery) return;
      this.searchController?.abort();
      const requestController = new AbortController();
      this.searchController = requestController;
      this.catalog.loadingSearch = true;
      this.refreshView();

      try {
        const result = await this.api.search(trimmedQuery, 1, requestController.signal);
        if (requestController !== this.searchController || this.store.state.preferences.searchQuery.trim() !== trimmedQuery) return;
        this.catalog.searchResults = result.books;
        this.catalog.searchCount = result.count;
        this.catalog.searchError = null;
        this.indexBooks(result.books);
        this.updateAutocomplete(trimmedQuery);
        this.setApiStatus(true);
      } catch (error) {
        if (error.name === "AbortError" || requestController !== this.searchController) return;
        this.catalog.searchError = error.message;
        this.setApiStatus(false);
      } finally {
        if (requestController === this.searchController && this.store.state.preferences.searchQuery.trim() === trimmedQuery) {
          this.catalog.loadingSearch = false;
          this.refreshView();
        }
      }
    }

    setApiStatus(online) {
      this.elements.apiStatusDot.classList.toggle("offline", !online);
      this.elements.apiStatusDot.dataset.tooltip = online ? "Gutendex connected" : "Gutendex unavailable";
    }

    handleSearchInput(event) {
      if (event.target !== this.elements.search) return;
      this.store.setSearchQuery(event.target.value);
      this.updateAutocomplete(event.target.value);
      if (!["store", "catalog", "dashboard", "bookmarks"].includes(this.router.current())) {
        this.router.navigate("catalog");
      }
      this.scheduleSearch(event.target.value);
    }

    handleKeyboard(event) {
      if (document.body.classList.contains("reader-mode")) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        this.elements.search.focus();
      }
      if (event.key === "Escape" && document.activeElement === this.elements.search && this.elements.search.value) this.clearSearch();
    }

    handleImageError(event) {
      const image = event.target;
      if (!(image instanceof HTMLImageElement) || !image.matches("[data-cover-image]")) return;
      image.hidden = true;
      if (image.nextElementSibling?.matches("[data-cover-fallback]")) image.nextElementSibling.hidden = false;
    }

    handleStorageChange(event) {
      if (event.key !== Config.STATE_KEY || !this.store.reload()) return;
      this.elements.search.value = this.store.state.preferences.searchQuery;
      this.renderChrome();
      if (!this.router.current().startsWith("reader/")) this.refreshView();
    }

    handleClick(event) {
      if (!event.target.closest(".search-combobox")) this.closeAutocomplete();
      const trigger = event.target.closest("[data-action]");
      if (!trigger) return;
      event.preventDefault();
      const actions = {
        "open-login": () => this.openLogin(),
        "select-suggestion": () => this.selectSuggestion(trigger.dataset.bookKey),
        "close-modal": () => this.modal.close(),
        "logout": () => this.logout(),
        "read-book": () => this.requestRead(trigger.dataset.bookKey),
        "view-book": () => this.openBookDetails(trigger.dataset.bookKey),
        "toggle-save": () => this.toggleSaved(trigger.dataset.bookKey),
        "retry-api": () => this.loadLiveShelves(),
        "clear-search": () => this.clearSearch(),
        "view-certificate": () => this.openCertificate(),
        "print-certificate": () => window.print(),
        "request-reset": () => this.requestReset(),
        "confirm-reset": () => this.confirmReset()
      };
      actions[trigger.dataset.action]?.();
    }

    async handleSubmit(event) {
      const form = event.target;
      if (!(form instanceof HTMLFormElement)) return;
      if (form.dataset.form === "login") {
        event.preventDefault();
        await this.submitLogin(form);
      }
      if (form.dataset.form === "pdf-upload") {
        event.preventDefault();
        await this.uploadPdf(form);
      }
    }

    clearSearch() {
      this.elements.search.value = "";
      this.store.setSearchQuery("");
      this.debouncedApiSearch.cancel();
      this.searchController?.abort();
      this.catalog.searchResults = [];
      this.catalog.searchCount = 0;
      this.catalog.loadingSearch = false;
      this.catalog.searchError = null;
      this.closeAutocomplete();
      this.refreshView();
      this.elements.search.focus();
    }

    openLogin() {
      this.modal.open(`
        <div class="login-layout">
          <div class="login-intro"><span class="login-mark">L</span><p class="page-kicker">Member access</p><h2 id="dialog-title">Continue your reading</h2><p>Sign in to open protected books, save progress, write notes, and use offline reading.</p></div>
          <form class="auth-form" data-form="login">
            <label>Email address<input class="form-control" name="email" type="email" autocomplete="username" placeholder="maya@lumina.local" required></label>
            <label>Password<input class="form-control" name="password" type="password" autocomplete="current-password" placeholder="Enter password" required></label>
            <p class="form-error" id="login-error" role="alert"></p>
            <button class="button" type="submit">Sign in</button>
            <div class="demo-credentials"><strong>Academic demo accounts</strong><span>Student: maya@lumina.local / reader2026</span><span>Admin: elena@lumina.local / admin2026</span></div>
          </form>
        </div>
      `, "input[name='email']");
    }

    async submitLogin(form) {
      const submit = form.querySelector("button[type='submit']");
      const error = form.querySelector("#login-error");
      submit.disabled = true;
      submit.textContent = "Verifying…";
      error.textContent = "";
      try {
        const data = new FormData(form);
        const user = await this.auth.signIn(data.get("email"), data.get("password"));
        this.modal.close();
        this.renderChrome();
        this.hydrateUserRecords();
        const pendingBook = this.pendingReadKey ? this.findBook(this.pendingReadKey) : null;
        this.pendingReadKey = null;
        if (pendingBook) this.startReader(pendingBook);
        else this.router.navigate(user.role === "admin" ? "admin" : "dashboard");
        this.toast.show(`Welcome back, ${user.name.split(" ")[0]}.`, "success");
      } catch (loginError) {
        error.textContent = loginError.message;
        submit.disabled = false;
        submit.textContent = "Sign in";
      }
    }

    logout() {
      this.reader?.destroy();
      this.reader = null;
      this.auth.signOut();
      document.body.classList.remove("reader-mode");
      this.renderChrome();
      this.router.navigate("store");
      this.toast.show("You have been signed out.", "info");
    }

    requestRead(bookKey) {
      const book = this.findBook(bookKey);
      if (!book?.reader) return this.toast.show("This title has no browser-readable format.", "warning");
      if (!this.store.currentUser) {
        this.pendingReadKey = book.key;
        this.openLogin();
        return;
      }
      this.startReader(book);
    }

    startReader(book) {
      this.store.touchReading(book);
      this.readerReturnRoute = this.router.current().startsWith("reader/") ? "catalog" : this.router.current();
      this.router.navigate(`reader/${encodeURIComponent(book.key)}`);
    }

    closeReader() {
      this.reader?.destroy();
      this.reader = null;
      document.body.classList.remove("reader-mode");
      this.renderChrome();
      this.router.navigate(this.routes[this.readerReturnRoute] ? this.readerReturnRoute : "catalog");
    }

    async renderReaderRoute(bookKey) {
      if (!this.store.currentUser) {
        this.pendingReadKey = bookKey;
        this.router.navigate("store", true);
        this.openLogin();
        return;
      }

      let book = this.findBook(bookKey);
      if (!book && bookKey.startsWith("gutenberg-")) {
        this.elements.routeView.innerHTML = this.loadingState("Restoring the live book record…");
        try {
          const result = await this.api.byIds([Number(bookKey.replace("gutenberg-", ""))]);
          book = result.books[0];
          if (book) {
            this.indexBooks([book]);
            this.store.rememberBooks([book]);
          }
        } catch (error) {
          this.toast.show(error.message, "error");
        }
      }
      if (!book?.reader) {
        this.router.navigate("catalog", true);
        this.toast.show("The reader format for this book is unavailable.", "error");
        return;
      }

      this.reader?.destroy();
      this.modal.close();
      this.reader = new ReaderModule.ReaderManager({
        container: this.elements.routeView,
        cache: this.cache,
        state: {
          getRecord: (key) => this.store.getReaderRecord(key),
          saveLocation: (activeBook, location) => this.store.saveReaderLocation(activeBook, location),
          toggleBookmark: (key, page) => this.store.toggleReaderBookmark(key, page),
          saveNote: (key, page, text) => this.store.saveReaderNote(key, page, text),
          markComplete: (activeBook) => this.store.markComplete(activeBook)
        },
        onClose: () => this.closeReader(),
        notify: (message, type, duration) => this.toast.show(message, type, duration)
      });
      this.reader.open(book);
      this.renderChrome();
      document.title = `${book.title} · Lumina Reader`;
    }

    openBookDetails(bookKey) {
      const book = this.findBook(bookKey);
      if (!book) return;
      const saved = this.store.currentUser ? this.store.isSaved(book.key) : false;
      this.modal.open(`
        <div class="live-book-detail">
          <div class="detail-cover-wrap">${this.coverMarkup(book, "detail-live-cover")}</div>
          <div><p class="page-kicker">${escapeHTML(book.category || "Public-domain collection")}</p><h2 id="dialog-title">${escapeHTML(book.title)}</h2><p class="detail-byline">${escapeHTML(book.author)}</p><p class="detail-summary">${escapeHTML(book.summary || "No description is available for this edition.")}</p><div class="detail-stats"><span><strong>${compactNumber(book.downloadCount)}</strong> downloads</span><span><strong>${book.reader?.engine === "pdf" ? "PDF.js" : "Protected text"}</strong> reader</span></div><div class="button-row"><button class="button" type="button" data-action="read-book" data-book-key="${escapeHTML(book.key)}" ${book.reader ? "" : "disabled"}>${this.store.currentUser ? "Read now" : "Sign in to read"}</button>${this.store.currentUser ? `<button class="button button-secondary" type="button" data-action="toggle-save" data-book-key="${escapeHTML(book.key)}">${saved ? "Remove saved book" : "Save for later"}</button>` : ""}</div></div>
        </div>
      `);
    }

    toggleSaved(bookKey) {
      if (!this.store.currentUser) return this.openLogin();
      const book = this.findBook(bookKey);
      if (!book) return;
      const saved = this.store.toggleSaved(book);
      this.modal.close();
      this.refreshView();
      this.toast.show(saved ? `${book.title} saved.` : `${book.title} removed from saved books.`, "success");
    }

    async uploadPdf(form) {
      const user = this.store.currentUser;
      if (user?.role !== "admin") return;
      const data = new FormData(form);
      const file = data.get("pdf");
      const title = normalizeText(data.get("title"));
      const author = normalizeText(data.get("author")) || "Local author";
      const status = form.querySelector("[data-upload-status]");
      const submit = form.querySelector("button[type='submit']");

      try {
        if (!title) throw new Error("Enter a title for the uploaded PDF.");
        if (!(file instanceof File) || !file.name.toLowerCase().endsWith(".pdf")) throw new Error("Choose a PDF file.");
        if (!file.size || file.size > Config.MAX_PDF_BYTES) throw new Error("PDF files must be between 1 byte and 50 MB.");
        submit.disabled = true;
        status.textContent = "Validating and saving PDF bytes…";
        const bytes = await file.arrayBuffer();
        const signature = String.fromCharCode(...new Uint8Array(bytes, 0, Math.min(5, bytes.byteLength)));
        if (signature !== "%PDF-") throw new Error("The selected file does not contain a valid PDF signature.");

        const key = createId("custom-pdf");
        const book = {
          key,
          id: key,
          source: "custom",
          title,
          author,
          category: "Secure uploads",
          summary: normalizeText(data.get("description")) || "A private PDF supplied by a Lumina administrator.",
          coverUrl: "",
          downloadCount: 0,
          uploadedAt: new Date().toISOString(),
          reader: { engine: "pdf", sourceIdentity: `custom:${key}`, mimeType: "application/pdf" }
        };
        await this.cache.put({
          key,
          sourceIdentity: `custom:${key}`,
          engine: "pdf",
          mimeType: "application/pdf",
          title,
          bytes
        });
        this.store.addCustomBook(book);
        this.bookIndex.set(book.key, book);
        form.reset();
        status.textContent = "PDF stored in browser IndexedDB.";
        this.refreshView();
        this.toast.show(`${title} is ready in the PDF.js reader.`, "success");
      } catch (error) {
        status.textContent = error.message;
        this.toast.show(error.message, "error");
      } finally {
        submit.disabled = false;
      }
    }

    requestReset() {
      this.modal.open(`<div class="confirm-icon">!</div><div class="modal-heading"><p class="page-kicker">Reset local state</p><h2 id="dialog-title">Clear profiles and reading history?</h2><p>This resets authentication, saved metadata, notes, and achievements. IndexedDB document caches remain available until individually removed.</p></div><div class="modal-actions"><button class="button button-secondary" type="button" data-action="close-modal">Cancel</button><button class="button button-danger" type="button" data-action="confirm-reset">Reset local state</button></div>`, "[data-action='confirm-reset']");
    }

    confirmReset() {
      this.store.reset();
      this.elements.search.value = "";
      this.modal.close();
      this.renderChrome();
      this.router.navigate("store");
      this.toast.show("Local profiles and reading activity were reset.", "success");
    }

    renderStorefront() {
      const query = this.store.state.preferences.searchQuery.trim();
      return `
        <section class="storefront-page">
          <div class="storefront-hero">
            <div><span class="hero-eyebrow">Project Gutenberg · Live catalog</span><h1>Classics, discoveries,<br><em>and 79,000+ free books.</em></h1><p>Search the full Gutendex collection in real time. Create a member session to read securely, keep notes, and save progress across visits.</p><div class="hero-actions"><button class="button" type="button" data-action="open-login">Member sign in</button><a class="button button-secondary" href="#catalog" data-route-link>Browse live catalog</a></div></div><div class="hero-library-stat"><strong>${this.catalog.totalCount ? this.catalog.totalCount.toLocaleString() : "79,000+"}</strong><span>public-domain editions</span><small>Metadata updates directly from Gutendex</small></div>
          </div>
          ${query ? this.renderSearchSection(query) : `
            ${this.liveSection("Most read this week", "Ranked by Project Gutenberg downloads", this.catalog.popular, this.catalog.loadingPopular, this.catalog.popularError, "popular")}
            ${this.liveSection("New to the archive", "Latest Gutenberg catalog additions", this.catalog.newest, this.catalog.loadingNewest, this.catalog.newestError, "new")}
          `}
        </section>
      `;
    }

    renderCatalog() {
      const query = this.store.state.preferences.searchQuery.trim();
      const customBooks = this.store.currentUser ? this.store.state.customBooks : [];
      const combined = this.uniqueBooks([...customBooks, ...this.catalog.popular, ...this.catalog.newest]);
      return `
        <section class="content-page live-catalog-page">
          <header class="page-intro"><div><p class="page-kicker">Live Gutendex database</p><h1>${query ? `Search results for “${escapeHTML(query)}”` : "Browse public-domain books"}</h1><p>${this.catalog.totalCount ? `${this.catalog.totalCount.toLocaleString()} records available through the public API.` : "Real-time metadata from Project Gutenberg."}</p></div>${query ? '<button class="button button-secondary button-small" type="button" data-action="clear-search">Clear search</button>' : ""}</header>
          ${query ? this.renderSearchGrid() : `<div class="live-book-grid">${combined.length ? combined.map((book) => this.liveBookCard(book)).join("") : this.loadingCards(12)}</div>`}
        </section>
      `;
    }

    renderSearchSection(query) {
      return `<section class="store-section"><header class="store-section-heading"><div><span>Live search</span><h2>Results for “${escapeHTML(query)}”</h2></div><button type="button" data-action="clear-search">Clear</button></header>${this.renderSearchGrid()}</section>`;
    }

    renderSearchGrid() {
      if (this.catalog.loadingSearch) return this.loadingState("Searching the full Gutendex catalog…");
      if (this.catalog.searchError) return this.errorState(this.catalog.searchError);
      return `<div class="search-summary">${this.catalog.searchCount.toLocaleString()} matching ${pluralize(this.catalog.searchCount, "record")}</div><div class="live-book-grid">${this.catalog.searchResults.length ? this.catalog.searchResults.map((book) => this.liveBookCard(book)).join("") : this.emptyState("No books matched this search.")}</div>`;
    }

    liveSection(title, subtitle, books, loading, error, variant) {
      return `<section class="store-section"><header class="store-section-heading"><div><span>${variant === "popular" ? "Reader favorites" : "Freshly catalogued"}</span><h2>${escapeHTML(title)}</h2><p>${escapeHTML(subtitle)}</p></div><a href="#catalog" data-route-link>View all →</a></header>${error ? this.errorState(error) : `<div class="live-book-grid ${variant}">${loading ? this.loadingCards(8) : books.slice(0, 8).map((book) => this.liveBookCard(book)).join("")}</div>`}</section>`;
    }

    liveBookCard(book) {
      const saved = this.store.currentUser && this.store.isSaved(book.key);
      return `
        <article class="live-book-card">
          <div class="live-cover-stage">
            <button class="live-cover-button" type="button" data-action="view-book" data-book-key="${escapeHTML(book.key)}" aria-label="View ${escapeHTML(book.title)}">${this.coverMarkup(book, "live-cover")}</button>
            ${this.store.currentUser ? `<button class="bookmark-button ${saved ? "active" : ""}" type="button" data-action="toggle-save" data-book-key="${escapeHTML(book.key)}" aria-label="${saved ? "Remove" : "Save"} ${escapeHTML(book.title)}"><svg viewBox="0 0 24 24"><path d="M6 3h12v18l-6-4-6 4V3Z"></path></svg></button>` : ""}
            <span class="reader-format ${book.reader ? "ready" : ""}">${book.reader?.engine === "pdf" ? "PDF" : book.reader ? "TEXT" : "METADATA"}</span>
          </div>
          <div class="live-book-copy"><span>${escapeHTML(book.category || "General")}</span><h3>${escapeHTML(book.title)}</h3><p>${escapeHTML(book.author)}</p><div><small>${book.source === "custom" ? "Private upload" : `${compactNumber(book.downloadCount)} downloads`}</small><button type="button" data-action="read-book" data-book-key="${escapeHTML(book.key)}" ${book.reader ? "" : "disabled"}>${this.store.currentUser ? "Read" : "Sign in to read"}</button></div></div>
        </article>
      `;
    }

    coverMarkup(book, className) {
      const cover = safeUrl(book.coverUrl);
      const fallbackText = escapeHTML(book.title.split(/\s+/).slice(0, 3).join(" "));
      return `${cover ? `<img class="${className}" data-cover-image src="${escapeHTML(cover)}" alt="Cover of ${escapeHTML(book.title)}" loading="lazy">` : ""}<span class="live-cover-fallback" data-cover-fallback ${cover ? "hidden" : ""}>${fallbackText}</span>`;
    }

    renderDashboard() {
      const query = this.store.state.preferences.searchQuery.trim();
      const previous = this.store.previousBooks();
      const challenge = this.store.challenge();
      const recommendations = query ? this.catalog.searchResults : this.catalog.popular;
      return `
        <section class="dashboard-page auth-dashboard">
          <header class="dashboard-welcome"><div><span>${formatDate(new Date())}</span><h1>Welcome back, ${escapeHTML(this.store.currentUser.name.split(" ")[0])}</h1><p>Your live recommendations and reading state are ready.</p></div><a class="button" href="#catalog" data-route-link>Explore books</a></header>
          <div class="dashboard-layout">
            <div class="primary-column">
              <section class="dashboard-section"><header class="section-heading"><h2>Previous Reading</h2><span>${previous.length} titles</span></header><div class="reading-row">${previous.length ? previous.slice(0, 4).map((item) => this.previousReadingCard(item)).join("") : this.emptyState("Start a book and it will appear here.")}</div></section>
              ${query ? `<section class="dashboard-section"><header class="section-heading"><h2>Live search results</h2><span>${this.catalog.searchCount.toLocaleString()} matches</span></header>${this.renderSearchGrid()}</section>` : ""}
              <section class="dashboard-section"><header class="section-heading"><h2>${query ? "More from your search" : "Recommended from Gutendex"}</h2><a href="#catalog" data-route-link>View all</a></header><div class="new-books-row">${this.catalog.loadingPopular ? this.loadingCards(5) : recommendations.slice(0, 5).map((book) => this.compactBookCard(book)).join("")}</div></section>
            </div>
            <aside class="discovery-column">
              ${this.challengeCard(challenge)}
              <section class="dashboard-section"><header class="section-heading"><h2>New public-domain books</h2><span>Live</span></header><div class="special-list">${this.catalog.loadingNewest ? this.loadingCards(3) : this.catalog.newest.slice(0, 4).map((book) => this.listBookCard(book)).join("")}</div></section>
              <section class="dashboard-section"><header class="section-heading"><h2>Your saved books</h2><a href="#bookmarks" data-route-link>Open</a></header><p class="dashboard-note">${this.store.savedKeys().length} saved ${pluralize(this.store.savedKeys().length, "title")} · Notes and reader positions sync locally.</p></section>
            </aside>
          </div>
        </section>
      `;
    }

    previousReadingCard({ book, activity }) {
      const progress = Math.max(0, Math.min(100, Number(activity.progress) || (activity.completedAt ? 100 : 0)));
      return `<article class="reading-card"><button class="cover-button" type="button" data-action="read-book" data-book-key="${escapeHTML(book.key)}">${this.coverMarkup(book, "reading-cover")}</button><div class="reading-copy"><span class="book-category">${escapeHTML(book.category || "Library")}</span><strong class="book-name">${escapeHTML(book.title)}</strong><span class="book-author">${escapeHTML(book.author)}</span><div class="reading-progress"><div class="progress-label"><span>${activity.completedAt ? "Completed" : "In progress"}</span><span>${progress}%</span></div><div class="progress-track"><div class="progress-fill" style="--progress:${progress}%"></div></div></div></div></article>`;
    }

    compactBookCard(book) {
      return `<article class="new-book-card"><div class="new-cover-stage"><button class="cover-button" type="button" data-action="view-book" data-book-key="${escapeHTML(book.key)}">${this.coverMarkup(book, "new-cover")}</button></div><strong class="book-name">${escapeHTML(book.title)}</strong><span class="book-author">${escapeHTML(book.author)}</span></article>`;
    }

    listBookCard(book) {
      return `<article class="special-card"><button class="cover-button" type="button" data-action="view-book" data-book-key="${escapeHTML(book.key)}">${this.coverMarkup(book, "special-cover")}</button><div class="special-copy"><span>New archive entry</span><strong>${escapeHTML(book.title)}</strong><small>${escapeHTML(book.author)}</small></div><button class="round-action" type="button" data-action="read-book" data-book-key="${escapeHTML(book.key)}" ${book.reader ? "" : "disabled"}>→</button></article>`;
    }

    challengeCard(challenge) {
      const progress = Math.min(100, Math.round((challenge.count / Config.AVID_READER_TARGET) * 100));
      return `<section class="challenge-panel dashboard-challenge"><span class="badge badge-gold">7-day reading goal</span><h2>${challenge.achievement ? "Avid Reader unlocked" : `${challenge.count} of ${Config.AVID_READER_TARGET} books complete`}</h2><p>${challenge.achievement ? `Certificate earned ${formatDate(challenge.achievement.unlockedAt)}.` : "Finish one more public-domain book to earn your badge."}</p><div class="progress-track"><div class="progress-fill" style="--progress:${progress}%"></div></div>${challenge.achievement ? '<button class="button button-small" type="button" data-action="view-certificate">View certificate</button>' : ""}</section>`;
    }

    renderBookmarks() {
      const books = this.store.savedKeys().map((key) => this.findBook(key)).filter(Boolean);
      return `<section class="content-page"><header class="page-intro"><div><p class="page-kicker">Personal collection</p><h1>Saved books</h1><p>Metadata and reading shortcuts stored for ${escapeHTML(this.store.currentUser.name)}.</p></div></header><div class="live-book-grid">${books.length ? books.map((book) => this.liveBookCard(book)).join("") : this.emptyState("Save books from the live catalog to find them here.")}</div></section>`;
    }

    renderSettings() {
      const user = this.store.currentUser;
      const challenge = this.store.challenge();
      return `<section class="content-page"><header class="page-intro"><div><p class="page-kicker">Account</p><h1>Profile and local data</h1><p>Authentication and reader state are scoped to this browser profile.</p></div></header><div class="settings-layout"><section class="settings-card"><h2>${escapeHTML(user.name)}</h2><p>${escapeHTML(user.email)} · ${escapeHTML(user.role)}</p><div class="profile-summary"><span class="profile-avatar">${escapeHTML(user.initials)}</span><div><strong>${this.store.previousBooks().length} reading records</strong><small>${this.store.savedKeys().length} saved books</small></div></div></section><section class="settings-card"><h2>Storage architecture</h2><p>Metadata, notes, and authentication use localStorage. Offline documents use IndexedDB.</p><div class="settings-actions"><button class="button button-danger" type="button" data-action="request-reset">Reset local state</button><button class="button button-secondary" type="button" data-action="logout">Log out</button></div></section></div><div class="settings-achievement">${this.challengeCard(challenge)}</div></section>`;
    }

    renderAdmin() {
      const books = this.store.state.customBooks;
      return `<section class="content-page admin-page"><header class="page-intro"><div><p class="page-kicker">Administrator</p><h1>Secure PDF library</h1><p>PDF bytes are validated and stored directly in browser IndexedDB for canvas-only rendering.</p></div></header><div class="admin-grid"><form class="upload-card" data-form="pdf-upload"><h2>Upload a custom PDF</h2><p>No raw file link is created. The selected ArrayBuffer is written to IndexedDB.</p><label>Book title<input class="form-control" name="title" maxlength="120" required></label><label>Author<input class="form-control" name="author" maxlength="100"></label><label>Description<textarea class="form-control" name="description" maxlength="500"></textarea></label><label class="file-control">PDF file<input name="pdf" type="file" accept="application/pdf,.pdf" required></label><span class="upload-status" data-upload-status>Maximum file size: 50 MB</span><button class="button" type="submit">Store secure PDF</button></form><section><header class="section-heading"><h2>Uploaded documents</h2><span>${books.length} PDFs</span></header><div class="live-book-grid admin-books">${books.length ? books.map((book) => this.liveBookCard(book)).join("") : this.emptyState("No administrator PDFs have been uploaded in this browser.")}</div></section></div></section>`;
    }

    certificateMarkup(achievement, dialog = false) {
      const user = this.store.currentUser;
      const code = achievement.id.replace(/[^a-z0-9]/gi, "").slice(-10).toUpperCase();
      return `<article class="certificate"><div class="certificate-seal">L</div><p class="certificate-kicker">Lumina Live Library</p><h2 ${dialog ? 'id="dialog-title"' : ""}>Avid Reader Certificate</h2><p class="certificate-name">${escapeHTML(user.name)}</p><p class="certificate-copy">completed at least three distinct books inside a seven-day reading window.</p><div class="certificate-footer"><span><strong>${formatDate(achievement.unlockedAt)}</strong>Date earned</span><span><strong>LUM-${escapeHTML(code)}</strong>Certificate ID</span></div></article>`;
    }

    openCertificate() {
      const achievement = this.store.challenge().achievement;
      if (!achievement) return;
      this.modal.open(`${this.certificateMarkup(achievement, true)}<div class="modal-actions"><button class="button button-secondary" type="button" data-action="close-modal">Close</button><button class="button" type="button" data-action="print-certificate">Print</button></div>`);
    }

    loadingCards(count) {
      return Array.from({ length: count }, () => '<div class="api-skeleton"><span></span><i></i><i></i></div>').join("");
    }

    loadingState(message) {
      return `<div class="api-loading"><span></span><p>${escapeHTML(message)}</p></div>`;
    }

    errorState(message) {
      return `<div class="api-error"><strong>Live catalog unavailable</strong><p>${escapeHTML(message)}</p><button class="button button-secondary button-small" type="button" data-action="retry-api">Retry</button></div>`;
    }

    emptyState(message) {
      return `<div class="empty-slot">${escapeHTML(message)}</div>`;
    }

    uniqueBooks(books) {
      return [...new Map(books.map((book) => [book.key, book])).values()];
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    try {
      const app = new LuminaLiveApp();
      app.init();
      window.LuminaLibrary = app;
    } catch (error) {
      console.error("Lumina failed to start.", error);
      document.body.innerHTML = `<main style="max-width:680px;margin:12vh auto;padding:24px;font-family:Inter,sans-serif;color:#f5f7fa"><h1>Lumina could not start</h1><p style="color:#7f8b9b">Check the browser console for details, then reload the page.</p></main>`;
    }
  });
})();
