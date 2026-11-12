/*
 * ScholarScroll application controller
 * ------------------------------------
 * Owns authentication, local state, SPA routing, live Gutendex UI state, and
 * coordination with the independent reader and API modules.
 */
(() => {
  "use strict";

  const Config = window.LibraryConfig;
  const ApiModule = window.LibraryApi;
  const ReaderModule = window.LibraryReaders;
  if (!Config || !ApiModule || !ReaderModule) throw new Error("ScholarScroll modules loaded in the wrong order.");

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

  /**
   * Normalize an optional public base URL used by certificate QR codes. A phone
   * cannot open 127.0.0.1, so a LAN or hosted URL is the only way a scan can
   * reach the verification page. Empty or unsafe values fall back to the
   * readable text summary.
   */
  const normalizeShareBase = (value) => {
    const raw = String(value || "").trim();
    if (!raw) return "";
    try {
      const url = new URL(raw);
      if (!["http:", "https:"].includes(url.protocol)) return "";
      url.hash = "";
      url.search = "";
      return url.href.replace(/\/$/, "");
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
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const dayKey = (value = new Date()) => Config.dayKey(value);
  const dayToUtc = (key) => {
    const match = String(key || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return match ? Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : null;
  };
  const formatDateTime = (value) => {
    const timestamp = dateValue(value);
    if (timestamp === null) return "Not available";
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(timestamp);
  };
  const daysUntil = (value) => {
    const timestamp = dateValue(value);
    if (timestamp === null) return 0;
    return Math.max(0, Math.ceil((timestamp - Date.now()) / Config.DAY_IN_MS));
  };
  const base64UrlEncode = (value) => {
    const bytes = new TextEncoder().encode(String(value));
    let binary = "";
    bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
    return window.btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  };
  const base64UrlDecode = (value) => {
    const normalized = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    const binary = window.atob(padded);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  };
  const streakTitle = (days) => {
    if (days === 1) return "First Day Reader";
    if (days === 7) return "Seven-Day Streak";
    if (days === 30) return "One-Month Streak";
    if (days === 180) return "Six-Month Streak";
    if (days === 365) return "One-Year Streak";
    return `${days}-Day Streak`;
  };
  const streakShort = (days) => {
    if (days === 1) return "1 day";
    if (days === 7) return "7 days";
    if (days === 30) return "1 month";
    if (days === 180) return "6 months";
    if (days === 365) return "1 year";
    return `${days} days`;
  };
  const formatBytes = (bytes) => {
    const value = Number(bytes);
    if (!Number.isFinite(value) || value <= 0) return "0 B";
    const units = ["B", "KB", "MB", "GB"];
    const index = Math.min(units.length - 1, Math.floor(Math.log(value) / Math.log(1024)));
    return `${(value / (1024 ** index)).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
  };
  const rewardCodeFor = (seed) => {
    let hash = 0;
    const source = String(seed || Date.now());
    for (let index = 0; index < source.length; index += 1) {
      hash = ((hash << 5) - hash + source.charCodeAt(index)) | 0;
    }
    return `SCHOLAR-${Math.abs(hash).toString(36).toUpperCase().padStart(6, "0").slice(0, 6)}`;
  };

  /**
   * Inline stat-card icons. They live in the markup instead of CSS `content`
   * because a missing or mis-encoded font glyph renders as a bare "?".
   */
  const STAT_ICONS = {
    book: '<path d="M12 7v14"/><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/>',
    streak: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
    best: '<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>',
    calendar: '<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/>',
    award: '<path d="m15.477 12.89 1.515 8.526a.5.5 0 0 1-.81.47l-3.58-2.687a1 1 0 0 0-1.197 0l-3.586 2.686a.5.5 0 0 1-.81-.469l1.514-8.526"/><circle cx="12" cy="8" r="6"/>'
  };

  /** Persistent application state. Remote catalog data is recorded only after interaction. */
  class LibraryStateStore {
    constructor(config) {
      this.config = config;
      this.state = this.load();
    }

    load() {
      try {
        const current = window.localStorage.getItem(this.config.STATE_KEY);
        if (current) {
          const normalized = this.mergeLegacyRewardClaims(this.normalize(JSON.parse(current)));
          window.localStorage.setItem(this.config.STATE_KEY, JSON.stringify(normalized));
          return normalized;
        }

        for (const legacyKey of this.config.LEGACY_STATE_KEYS) {
          const legacy = window.localStorage.getItem(legacyKey);
          if (legacy) {
            const parsed = JSON.parse(legacy);
            const migrated = this.mergeLegacyRewardClaims(
              this.normalize([5, 6].includes(parsed?.schemaVersion) ? parsed : this.migrateLegacy(parsed))
            );
            window.localStorage.setItem(this.config.STATE_KEY, JSON.stringify(migrated));
            return migrated;
          }
        }
      } catch (error) {
        console.warn("ScholarScroll could not restore local state.", error);
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

    /* Earlier builds kept redemptions in a separate localStorage key. Fold any
       surviving claims into state so reset and export behave predictably. */
    mergeLegacyRewardClaims(state) {
      try {
        const raw = window.localStorage.getItem("scholarscroll-reward-claims-v1");
        if (!raw) return state;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object") return state;
        Object.entries(parsed).forEach(([certificateId, claim]) => {
          if (!claim || typeof claim !== "object") return;
          if (!state.rewardClaims[certificateId]) {
            state.rewardClaims[certificateId] = {
              certificateId,
              userId: claim.userId || "student-maya",
              code: claim.code,
              claimedAt: claim.claimedAt || null,
              redeemedAt: claim.redeemedAt || null,
              bookKey: claim.bookKey || null
            };
          }
        });
        window.localStorage.removeItem("scholarscroll-reward-claims-v1");
      } catch {
        /* A malformed legacy value must not block startup. */
      }
      return state;
    }

    normalize(candidate) {
      if (!candidate || typeof candidate !== "object") return this.config.createInitialState();
      if (candidate.schemaVersion !== this.config.SCHEMA_VERSION) {
        if (candidate.schemaVersion === 5) candidate = this.upgradeV5(candidate);
        else if (candidate.schemaVersion !== 6) return this.config.createInitialState();
      }
      const initial = this.config.createInitialState();
      const validUser = this.config.users.some((user) => user.id === candidate.session?.currentUserId);
      this.persistenceAvailable = true;
      const normalized = {
        schemaVersion: this.config.SCHEMA_VERSION,
        session: {
          currentUserId: validUser ? candidate.session.currentUserId : null,
          authenticatedAt: validUser ? candidate.session.authenticatedAt || null : null
        },
        catalogRecords: candidate.catalogRecords && typeof candidate.catalogRecords === "object" ? clone(candidate.catalogRecords) : {},
        customBooks: Array.isArray(candidate.customBooks) ? candidate.customBooks.map((book) => ({ ...book })) : [],
        readingActivity: {},
        readingDays: {},
        readerState: this.normalizeReaderState(candidate.readerState),
        savedBooks: this.normalizePerUserObject(candidate.savedBooks, initial.savedBooks),
        savedBookRecords: {},
        achievements: Array.isArray(candidate.achievements) ? candidate.achievements.map((item) => ({ ...item })) : [],
        badges: Array.isArray(candidate.badges) ? candidate.badges.filter((badge) => badge && badge.userId && badge.days).map((badge) => ({ ...badge })) : [],
        premiumUnlocks: this.normalizePerUserObject(candidate.premiumUnlocks, initial.premiumUnlocks),
        rewardClaims: candidate.rewardClaims && typeof candidate.rewardClaims === "object" ? clone(candidate.rewardClaims) : {},
        preferences: {
          searchQuery: String(candidate.preferences?.searchQuery || ""),
          shareBaseUrl: normalizeShareBase(candidate.preferences?.shareBaseUrl),
          reader: {
            fontSize: clamp(Number(candidate.preferences?.reader?.fontSize) || 1, 0.8, 2),
            theme: ["paper", "sepia", "night"].includes(candidate.preferences?.reader?.theme) ? candidate.preferences.reader.theme : "paper",
            lineHeight: clamp(Number(candidate.preferences?.reader?.lineHeight) || 1.95, 1.4, 2.4),
            pdfZoom: clamp(Number(candidate.preferences?.reader?.pdfZoom) || 1, 0.5, 2.5),
            layout: candidate.preferences?.reader?.layout === "landscape" ? "landscape" : "portrait"
          }
        }
      };

      this.config.users.forEach((user) => {
        normalized.readingActivity[user.id] = this.normalizeActivity(candidate.readingActivity?.[user.id]);
        const storedDays = Array.isArray(candidate.readingDays?.[user.id]) ? candidate.readingDays[user.id] : null;
        const days = storedDays
          ? storedDays.filter((day) => dayToUtc(day) !== null)
          : this.daysFromActivity(normalized.readingActivity[user.id]);
        normalized.readingDays[user.id] = [...new Set(days)].sort();

        normalized.savedBookRecords[user.id] = {};
        (normalized.savedBooks[user.id] || []).forEach((key) => {
          const snapshot = candidate.savedBookRecords?.[user.id]?.[key] || normalized.catalogRecords[key] || normalized.readingActivity[user.id]?.[key]?.book;
          if (snapshot) normalized.savedBookRecords[user.id][key] = clone(snapshot);
        });
      });
      return normalized;
    }

    normalizeActivity(value) {
      const activity = {};
      if (!value || typeof value !== "object") return activity;
      Object.entries(value).forEach(([key, entry]) => {
        if (!entry || typeof entry !== "object") return;
        activity[key] = {
          ...entry,
          progress: Number.isFinite(Number(entry.progress)) ? clamp(Number(entry.progress), 0, 100) : (entry.completedAt ? 100 : 0),
          book: entry.book && typeof entry.book === "object" ? clone(entry.book) : null
        };
      });
      return activity;
    }

    normalizeReaderState(value) {
      const state = {};
      if (!value || typeof value !== "object") return state;
      Object.entries(value).forEach(([userId, books]) => {
        if (!books || typeof books !== "object") return;
        state[userId] = {};
        Object.entries(books).forEach(([bookKey, record]) => {
          if (!record || typeof record !== "object") return;
          state[userId][bookKey] = {
            engine: record.engine || null,
            lastVisitedPage: Math.max(1, Number(record.lastVisitedPage) || 1),
            lastScrollPercent: clamp(Number(record.lastScrollPercent) || 0, 0, 100),
            bookmarks: (Array.isArray(record.bookmarks) ? record.bookmarks : [])
              .map((bookmark) => {
                if (typeof bookmark === "number") return { page: Math.max(1, bookmark), percent: null, createdAt: null };
                if (!bookmark || typeof bookmark !== "object") return null;
                const percent = Number(bookmark.percent);
                return {
                  page: Math.max(1, Number.parseInt(bookmark.page, 10) || 1),
                  percent: Number.isFinite(percent) ? clamp(percent, 0, 100) : null,
                  createdAt: bookmark.createdAt || null
                };
              })
              .filter(Boolean),
            notes: record.notes && typeof record.notes === "object" ? { ...record.notes } : {}
          };
        });
      });
      return state;
    }

    upgradeV5(candidate) {
      const initial = this.config.createInitialState();
      const upgraded = {
        schemaVersion: this.config.SCHEMA_VERSION,
        session: candidate.session || initial.session,
        catalogRecords: candidate.catalogRecords || {},
        customBooks: Array.isArray(candidate.customBooks) ? candidate.customBooks : [],
        readingActivity: {},
        readingDays: {},
        readerState: candidate.readerState || {},
        savedBooks: candidate.savedBooks || {},
        savedBookRecords: {},
        achievements: Array.isArray(candidate.achievements) ? candidate.achievements : [],
        badges: [],
        preferences: {
          searchQuery: String(candidate.preferences?.searchQuery || ""),
          shareBaseUrl: normalizeShareBase(candidate.preferences?.shareBaseUrl),
          reader: initial.preferences.reader
        }
      };
      this.config.users.forEach((user) => {
        const activity = candidate.readingActivity?.[user.id] || {};
        upgraded.readingActivity[user.id] = {};
        const days = new Set();
        Object.entries(activity).forEach(([key, entry]) => {
          if (!entry || typeof entry !== "object") return;
          const snapshot = candidate.catalogRecords?.[key]
            || initial.readingActivity[user.id]?.[key]?.book
            || null;
          upgraded.readingActivity[user.id][key] = {
            ...entry,
            progress: entry.completedAt ? 100 : Number(entry.progress) || 0,
            book: snapshot ? clone(snapshot) : null
          };
          [entry.startedAt, entry.lastReadAt, entry.completedAt].forEach((value) => {
            const day = dayKey(value);
            if (day) days.add(day);
          });
        });
        upgraded.readingDays[user.id] = [...days].sort();
        upgraded.savedBookRecords[user.id] = {};
        (candidate.savedBooks?.[user.id] || []).forEach((key) => {
          const snapshot = candidate.catalogRecords?.[key];
          if (snapshot) upgraded.savedBookRecords[user.id][key] = clone(snapshot);
        });
      });
      return upgraded;
    }

    daysFromActivity(activity) {
      const days = new Set();
      Object.values(activity || {}).forEach((entry) => {
        [entry.startedAt, entry.lastReadAt, entry.completedAt].forEach((value) => {
          const day = dayKey(value);
          if (day) days.add(day);
        });
      });
      return [...days];
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
          bookmarks: (Array.isArray(record.bookmarks) ? record.bookmarks : [])
            .filter((page) => Number.isFinite(Number(page)))
            .map((page) => ({ page: Math.max(1, Number(page)), percent: null, createdAt: null })),
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
        console.warn("ScholarScroll state is temporary because localStorage failed.", error);
        this.persistenceAvailable = false;
      }
    }

    /** Search typing updates state continuously; persist after a short pause. */
    scheduleSave() {
      window.clearTimeout(this.saveTimer);
      this.saveTimer = window.setTimeout(() => this.save(), 400);
    }

    flush() {
      window.clearTimeout(this.saveTimer);
      this.save();
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
      this.state.preferences.searchQuery = String(query || "");
      this.scheduleSave();
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
      return this.getBookFromState(this.state, key);
    }

    getBookFromState(state, key) {
      const direct = state.catalogRecords[key] || state.customBooks.find((book) => book.key === key);
      if (direct) return direct;
      for (const user of this.config.users) {
        const snapshot = state.readingActivity?.[user.id]?.[key]?.book
          || state.savedBookRecords?.[user.id]?.[key];
        if (snapshot) return snapshot;
      }
      return null;
    }

    snapshot(book) {
      return book && typeof book === "object" ? clone(book) : null;
    }

    addCustomBook(book) {
      this.commit((state) => {
        state.customBooks.unshift(clone(book));
      });
    }

    removeCustomBook(bookKey) {
      this.commit((state) => {
        state.customBooks = state.customBooks.filter((book) => book.key !== bookKey);
        this.config.users.forEach((user) => {
          state.savedBooks[user.id] = (state.savedBooks[user.id] || []).filter((key) => key !== bookKey);
          delete state.savedBookRecords?.[user.id]?.[bookKey];
          delete state.readingActivity?.[user.id]?.[bookKey];
          delete state.readerState?.[user.id]?.[bookKey];
        });
      });
    }

    markReadingDay(state, userId, value = new Date()) {
      const key = dayKey(value);
      if (!key) return;
      state.readingDays[userId] ||= [];
      if (!state.readingDays[userId].includes(key)) {
        state.readingDays[userId].push(key);
        state.readingDays[userId].sort();
      }
    }

    touchReading(book) {
      const userId = this.currentUser?.id;
      if (!userId) return { newBadges: [] };
      const now = new Date().toISOString();
      let newBadges = [];
      this.commit((state) => {
        if (book.source === "gutendex") state.catalogRecords[book.key] = clone(book);
        state.readingActivity[userId] ||= {};
        const activity = state.readingActivity[userId][book.key] || {
          source: book.source,
          sourceId: book.id,
          startedAt: now,
          completedAt: null
        };
        activity.lastReadAt = now;
        activity.book = this.snapshot(book);
        state.readingActivity[userId][book.key] = activity;
        this.markReadingDay(state, userId, now);
        newBadges = this.awardStreakBadges(state, userId, now);
      });
      return { newBadges };
    }

    previousBooks(userId = this.currentUser?.id) {
      const activity = this.state.readingActivity[userId] || {};
      return Object.entries(activity)
        .map(([key, entry]) => ({ book: this.getBook(key) || entry.book, activity: entry }))
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
      let newBadges = [];
      this.commit((state) => {
        const record = this.ensureReaderRecord(state, userId, book.key, location.engine);
        record.engine = location.engine;
        record.lastVisitedPage = Math.max(1, Number(location.page) || 1);
        if (Number.isFinite(location.scrollPercent)) {
          record.lastScrollPercent = clamp(location.scrollPercent, 0, 100);
        }
        state.readingActivity[userId] ||= {};
        const activity = state.readingActivity[userId][book.key] || {
          source: book.source,
          sourceId: book.id,
          startedAt: new Date().toISOString(),
          completedAt: null
        };
        activity.lastReadAt = new Date().toISOString();
        activity.book = this.snapshot(book);
        // A completed book must never regress to a lower percentage when the
        // reader saves a scroll position afterwards.
        activity.progress = activity.completedAt
          ? 100
          : location.engine === "text"
            ? Math.round(location.scrollPercent || 0)
            : Math.min(99, Math.round((location.page / Math.max(1, location.totalPages)) * 100));
        state.readingActivity[userId][book.key] = activity;
        this.markReadingDay(state, userId, activity.lastReadAt);
        newBadges = this.awardStreakBadges(state, userId, activity.lastReadAt);
      });
      return { newBadges };
    }

    toggleReaderBookmark(bookKey, page, percent = null) {
      const userId = this.currentUser.id;
      const pageNumber = Math.max(1, Number.parseInt(page, 10) || 1);
      const percentValue = Number.isFinite(Number(percent)) ? clamp(Number(percent), 0, 100) : null;
      let added = false;
      this.commit((state) => {
        const record = this.ensureReaderRecord(state, userId, bookKey);
        const index = record.bookmarks.findIndex((bookmark) => (
          percentValue !== null && bookmark.percent !== null
            ? Math.abs(bookmark.percent - percentValue) < 0.8
            : bookmark.page === pageNumber && bookmark.percent === null
        ));
        if (index >= 0) {
          record.bookmarks.splice(index, 1);
        } else {
          record.bookmarks.push({ page: pageNumber, percent: percentValue, createdAt: new Date().toISOString() });
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

    savedBookList(userId = this.currentUser?.id) {
      return this.savedKeys(userId)
        .map((key) => this.getBook(key) || this.state.savedBookRecords?.[userId]?.[key])
        .filter(Boolean);
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
        state.savedBookRecords[userId] ||= {};
        if (wasSaved) delete state.savedBookRecords[userId][book.key];
        else state.savedBookRecords[userId][book.key] = clone(book);
      });
      return !wasSaved;
    }

    isComplete(bookKey, userId = this.currentUser?.id) {
      return Boolean(this.state.readingActivity?.[userId]?.[bookKey]?.completedAt);
    }

    getActivity(bookKey, userId = this.currentUser?.id) {
      return clone(this.state.readingActivity?.[userId]?.[bookKey] || null);
    }

    getReaderPreferences() {
      return clone(this.state.preferences.reader || { fontSize: 1, theme: "paper", lineHeight: 1.95, pdfZoom: 1, layout: "portrait" });
    }

    saveReaderPreferences(preferences) {
      this.commit((state) => {
        state.preferences.reader = {
          fontSize: clamp(Number(preferences.fontSize) || 1, 0.8, 2),
          theme: ["paper", "sepia", "night"].includes(preferences.theme) ? preferences.theme : "paper",
          lineHeight: clamp(Number(preferences.lineHeight) || 1.95, 1.4, 2.4),
          pdfZoom: clamp(Number(preferences.pdfZoom) || 1, 0.5, 2.5),
          layout: preferences.layout === "landscape" ? "landscape" : "portrait"
        };
      });
    }

    saveShareBaseUrl(value) {
      const normalized = normalizeShareBase(value);
      this.commit((state) => {
        state.preferences.shareBaseUrl = normalized;
      });
      return normalized;
    }

    computeStreak(days = []) {
      const valid = [...new Set(days.filter((day) => dayToUtc(day) !== null))].sort();
      const shift = (key, delta) => {
        const timestamp = dayToUtc(key);
        if (timestamp === null) return null;
        const date = new Date(timestamp + (delta * this.config.DAY_IN_MS));
        return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
      };

      let best = 0;
      let run = 0;
      let previous = null;
      valid.forEach((day) => {
        if (previous && dayToUtc(day) - dayToUtc(previous) === this.config.DAY_IN_MS) run += 1;
        else run = 1;
        best = Math.max(best, run);
        previous = day;
      });

      const set = new Set(valid);
      const today = dayKey(new Date());
      const yesterday = shift(today, -1);
      let cursor = set.has(today) ? today : set.has(yesterday) ? yesterday : null;
      let current = 0;
      while (cursor && set.has(cursor)) {
        current += 1;
        cursor = shift(cursor, -1);
      }
      return { current, best, total: valid.length, readToday: set.has(today) };
    }

    streakStats(userId = this.currentUser?.id) {
      const stats = this.computeStreak(this.state.readingDays?.[userId] || []);
      const badges = this.badges(userId);
      const next = this.config.STREAK_MILESTONES.find((milestone) => milestone > stats.current) || null;
      return { ...stats, badges, next };
    }

    badges(userId = this.currentUser?.id) {
      return (this.state.badges || [])
        .filter((badge) => badge.userId === userId)
        .sort((a, b) => Number(a.days) - Number(b.days));
    }

    awardStreakBadges(state, userId, now = new Date().toISOString()) {
      const stats = this.computeStreak(state.readingDays?.[userId] || []);
      const unlocked = [];
      this.config.STREAK_MILESTONES.forEach((days) => {
        const exists = (state.badges || []).some((badge) => badge.userId === userId && Number(badge.days) === days);
        if (!exists && stats.current >= days) {
          state.badges.push({
            id: createId("badge"),
            userId,
            type: "streak",
            days,
            title: streakTitle(days),
            unlockedAt: now
          });
          unlocked.push(state.badges[state.badges.length - 1]);
        }
      });
      return unlocked;
    }

    syncBadges(userId = this.currentUser?.id) {
      if (!userId) return [];
      let unlocked = [];
      this.commit((state) => {
        unlocked = this.awardStreakBadges(state, userId);
      });
      return unlocked;
    }

    markComplete(book) {
      const userId = this.currentUser.id;
      const now = new Date().toISOString();
      let isNewAchievement = false;
      let certificate = null;
      let newBadges = [];
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
        activity.book = this.snapshot(book);
        state.readingActivity[userId][book.key] = activity;
        this.markReadingDay(state, userId, now);
        newBadges = this.awardStreakBadges(state, userId, now);

        const existing = state.achievements.find((item) => item.userId === userId && item.type === "avid-reader");
        const cutoff = Date.now() - (this.config.AVID_READER_WINDOW_DAYS * this.config.DAY_IN_MS);
        const qualifying = Object.entries(state.readingActivity[userId]).filter(([, entry]) => {
          const completedAt = dateValue(entry.completedAt);
          return completedAt !== null && completedAt >= cutoff;
        });
        if (!existing && qualifying.length >= this.config.AVID_READER_TARGET) {
          const certificateId = createId("certificate");
          const evidenceBookKeys = qualifying.map(([key]) => key);
          const record = {
            id: certificateId,
            certificateId,
            userId,
            type: "avid-reader",
            unlockedAt: now,
            evidenceBookKeys,
            rewardCode: rewardCodeFor(certificateId),
            rewardExpiresAt: new Date(Date.now() + (this.config.CERTIFICATE_REWARD_DAYS * this.config.DAY_IN_MS)).toISOString(),
            bookSnapshots: evidenceBookKeys
              .map((key) => this.getBookFromState(state, key) || state.readingActivity[userId][key]?.book)
              .filter(Boolean)
              .map((item) => ({ key: item.key, title: item.title, author: item.author }))
          };
          state.achievements.push(record);
          certificate = record;
          isNewAchievement = true;
        }
      });
      return { isNewAchievement, certificate, newBadges };
    }

    challenge(userId = this.currentUser?.id) {
      const cutoff = Date.now() - (this.config.AVID_READER_WINDOW_DAYS * this.config.DAY_IN_MS);
      const activities = this.state.readingActivity[userId] || {};
      const completed = Object.entries(activities)
        .filter(([, entry]) => {
          const timestamp = dateValue(entry.completedAt);
          return timestamp !== null && timestamp >= cutoff;
        });
      const stored = this.state.achievements.find((item) => item.userId === userId && item.type === "avid-reader") || null;
      const achievement = stored
        ? {
          ...stored,
          certificateId: stored.certificateId || stored.id,
          rewardCode: stored.rewardCode || rewardCodeFor(stored.id),
          rewardExpiresAt: stored.rewardExpiresAt || new Date((dateValue(stored.unlockedAt) || Date.now()) + (this.config.CERTIFICATE_REWARD_DAYS * this.config.DAY_IN_MS)).toISOString(),
          bookSnapshots: stored.bookSnapshots || (stored.evidenceBookKeys || [])
            .map((key) => this.getBook(key))
            .filter(Boolean)
            .map((item) => ({ key: item.key, title: item.title, author: item.author }))
        }
        : null;
      return { count: completed.length, achievement };
    }

    premiumBook(bookKey) {
      return this.config.PREMIUM_BOOKS.find((book) => book.key === bookKey) || null;
    }

    premiumUnlocked(userId, bookKey) {
      return Boolean(this.state.premiumUnlocks?.[userId]?.[bookKey]);
    }

    premiumUnlockRecord(userId, bookKey) {
      return this.state.premiumUnlocks?.[userId]?.[bookKey] || null;
    }

    premiumUnlockCount(userId = this.currentUser?.id) {
      return Object.keys(this.state.premiumUnlocks?.[userId] || {}).length;
    }

    /**
     * Resolve the voucher attached to a certificate. The certificate's own
     * reward code is authoritative; legacy PREM-* claims are still accepted so
     * an earlier local demo does not strand a reader.
     */
    voucherForCertificate(achievement) {
      if (!achievement) return null;
      const certificateId = achievement.certificateId || achievement.id;
      const claim = this.state.rewardClaims?.[certificateId] || null;
      const code = claim?.code || achievement.rewardCode || rewardCodeFor(certificateId);
      const expiresAt = achievement.rewardExpiresAt || claim?.rewardExpiresAt || null;
      const redeemedAt = claim?.redeemedAt || null;
      return {
        certificateId,
        code,
        expiresAt,
        redeemedAt,
        bookKey: claim?.bookKey || null,
        expired: dateValue(expiresAt) !== null && dateValue(expiresAt) < Date.now(),
        redeemed: Boolean(redeemedAt)
      };
    }

    availableVouchers(userId = this.currentUser?.id) {
      if (!userId) return [];
      return (this.state.achievements || [])
        .filter((achievement) => achievement.userId === userId && achievement.type === "avid-reader")
        .map((achievement) => this.voucherForCertificate(achievement))
        .filter((voucher) => voucher && !voucher.redeemed && !voucher.expired);
    }

    findCertificateByVoucher(code, userId = this.currentUser?.id) {
      const normalized = String(code || "").trim().toUpperCase();
      if (!normalized || !userId) return null;
      const owned = (this.state.achievements || []).filter((achievement) => achievement.userId === userId);
      const direct = owned.find((achievement) => String(achievement.rewardCode || "").toUpperCase() === normalized);
      if (direct) return direct;
      const legacyClaim = Object.values(this.state.rewardClaims || {})
        .find((claim) => claim?.userId === userId && String(claim.code || "").toUpperCase() === normalized);
      if (!legacyClaim) return null;
      return owned.find((achievement) => (achievement.certificateId || achievement.id) === legacyClaim.certificateId) || null;
    }

    redeemVoucher(code, bookKey, userId = this.currentUser?.id) {
      if (!userId) return { ok: false, error: "Sign in to redeem a voucher." };
      const book = this.premiumBook(bookKey);
      if (!book) return { ok: false, error: "Choose a premium book to unlock." };
      if (this.premiumUnlocked(userId, bookKey)) {
        return { ok: false, error: "You have already unlocked this premium book." };
      }
      const normalized = String(code || "").trim().toUpperCase();
      if (!normalized) return { ok: false, error: "Please enter your Voucher Code:" };
      const achievement = this.findCertificateByVoucher(normalized, userId);
      if (!achievement) {
        return { ok: false, error: "That voucher code was not found for this account." };
      }
      const voucher = this.voucherForCertificate(achievement);
      if (voucher.redeemed) {
        const usedBook = this.premiumBook(voucher.bookKey);
        return {
          ok: false,
          error: usedBook
            ? `This voucher has already been used to unlock “${usedBook.title}”.`
            : "This voucher has already been used."
        };
      }
      if (voucher.expired) {
        return { ok: false, error: `This voucher expired on ${formatDate(voucher.expiresAt)}.` };
      }
      const now = new Date().toISOString();
      this.commit((state) => {
        state.premiumUnlocks[userId] ||= {};
        state.premiumUnlocks[userId][bookKey] = {
          bookKey,
          certificateId: voucher.certificateId,
          voucherCode: voucher.code,
          unlockedAt: now
        };
        const existing = state.rewardClaims[voucher.certificateId] || {};
        state.rewardClaims[voucher.certificateId] = {
          ...existing,
          certificateId: voucher.certificateId,
          userId,
          code: voucher.code,
          claimedAt: existing.claimedAt || now,
          redeemedAt: now,
          bookKey
        };
        state.catalogRecords[book.key] = clone(book);
      });
      return { ok: true, book, voucher };
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
      return this.parse().path;
    }

    query() {
      return this.parse().params;
    }

    parse() {
      const raw = window.location.hash.replace(/^#\/?/, "").trim();
      const [path, queryString] = raw.split("?");
      return { path: path || "store", params: new URLSearchParams(queryString || "") };
    }

    navigate(route, replace = false, params = null) {
      const query = params && [...params.keys()].length ? `?${params.toString()}` : "";
      const hash = `#${route}${query}`;
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
      this.lastFocus = null;
      dialog.addEventListener("click", (event) => {
        if (event.target === dialog) this.close();
      });
      dialog.addEventListener("cancel", (event) => {
        event.preventDefault();
        this.close();
      });
    }

    open(markup, focusSelector = null) {
      this.lastFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
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
      if (this.lastFocus?.isConnected) {
        this.lastFocus.focus({ preventScroll: true });
        this.lastFocus = null;
      }
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

  class ScholarScrollApp {
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
      this.pendingVoucherBookKey = null;
      this.searchController = null;
      this.debouncedApiSearch = debounce((query) => this.runSearch(query), 300);
      this.autocompleteItems = [];
      this.autocompleteIndex = -1;
      this.searchHasFocus = false;
      this.bookIndex = new Map();
      this.adminStatus = "";
      this.catalog = {
        popular: [],
        newest: [],
        searchResults: [],
        totalCount: 0,
        searchCount: 0,
        searchPage: 1,
        searchHasMore: false,
        searchLanguage: "",
        searchSort: "relevance",
        lastQuery: "",
        loadingPopular: true,
        loadingNewest: true,
        loadingSearch: false,
        loadingMore: false,
        popularError: null,
        newestError: null,
        searchError: null
      };

      this.elements = {
        routeView: document.querySelector("#route-view"),
        main: document.querySelector("#main-content"),
        routeAnnouncer: document.querySelector("#route-announcer"),
        search: document.querySelector("#global-search"),
        authControl: document.querySelector("#auth-control"),
        storageDot: document.querySelector("#storage-dot"),
        apiStatusDot: document.querySelector("#api-status-dot"),
        networkBanner: document.querySelector("#network-banner"),
        footerYear: document.querySelector("#footer-year")
      };

      this.routes = {
        store: { title: "ScholarScroll · Live Public Library", description: "Search 79,000+ public-domain books, read securely in the browser, and keep notes and progress.", public: true, sidebar: null, header: "store", render: () => this.renderStorefront() },
        catalog: { title: "Live Catalog · ScholarScroll", description: "Browse and search the live Project Gutenberg catalog through Gutendex.", public: true, sidebar: "catalog", header: "catalog", render: () => this.renderCatalog() },
        premium: { title: "Premium Books · ScholarScroll", description: "A curated members' shelf of public-domain classics and supplied reader editions, open to every member.", public: true, sidebar: "premium", header: "premium", render: () => this.renderPremium() },
        dashboard: { title: "My Library · ScholarScroll", description: "Your reading history, streak badges, certificates and recommendations.", auth: true, role: "student", sidebar: "dashboard", header: "dashboard", render: () => this.renderDashboard() },
        bookmarks: { title: "Saved Books · ScholarScroll", description: "Your personal saved-book collection.", auth: true, sidebar: "bookmarks", header: null, render: () => this.renderBookmarks() },
        settings: { title: "Settings · ScholarScroll", description: "Profile, reader preferences and local data controls.", auth: true, sidebar: "settings", header: null, render: () => this.renderSettings() },
        admin: { title: "PDF Administration · ScholarScroll", description: "Upload and manage browser-stored PDF documents.", auth: true, role: "admin", sidebar: "dashboard", header: "dashboard", render: () => this.renderAdmin() },
        about: { title: "About · ScholarScroll", description: "How ScholarScroll works, where the books come from, and what the demo does.", public: true, sidebar: null, header: null, render: () => this.renderAbout() },
        sources: { title: "Sources & Licensing · ScholarScroll", description: "Project Gutenberg, Gutendex and public-domain attribution.", public: true, sidebar: null, header: null, render: () => this.renderSources() },
        privacy: { title: "Privacy · ScholarScroll", description: "What ScholarScroll stores locally and what leaves your browser.", public: true, sidebar: null, header: null, render: () => this.renderPrivacy() },
        accessibility: { title: "Accessibility · ScholarScroll", description: "Accessibility commitments and known limitations.", public: true, sidebar: null, header: null, render: () => this.renderAccessibility() }
      };
    }

    init() {
      this.setupAutocomplete();
      this.indexBooks(Config.PREMIUM_BOOKS);
      this.store.rememberBooks(Config.PREMIUM_BOOKS);
      this.elements.search.value = this.store.state.preferences.searchQuery;
      if (this.elements.footerYear) this.elements.footerYear.textContent = String(new Date().getFullYear());
      document.addEventListener("click", (event) => this.handleClick(event));
      document.addEventListener("submit", (event) => this.handleSubmit(event));
      document.addEventListener("input", (event) => this.handleSearchInput(event));
      document.addEventListener("change", (event) => this.handleChange(event));
      document.addEventListener("keydown", (event) => this.handleKeyboard(event));
      document.addEventListener("error", (event) => this.handleImageError(event), true);
      window.addEventListener("storage", (event) => this.handleStorageChange(event));
      window.addEventListener("online", () => this.updateNetworkState(true));
      window.addEventListener("offline", () => this.updateNetworkState(false));
      window.addEventListener("pagehide", () => this.store.flush());
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") this.store.flush();
      });
      window.addEventListener("unhandledrejection", (event) => {
        console.error("Unhandled ScholarScroll promise rejection.", event.reason);
      });

      this.renderChrome();
      this.updateNetworkState(navigator.onLine);
      const user = this.store.currentUser;
      this.router.start(window.location.hash ? this.router.current() : user ? (user.role === "admin" ? "admin" : "dashboard") : "store");
      if (user) {
        const badges = this.store.syncBadges();
        if (badges.length) this.announceBadges(badges);
        this.hydrateUserRecords();
      }
      this.loadLiveShelves();
      this.registerServiceWorker();
    }

    registerServiceWorker() {
      if (!("serviceWorker" in navigator) || !/^https?:$/.test(window.location.protocol)) return;
      window.addEventListener("load", () => {
        navigator.serviceWorker.register("./sw.js").catch((error) => {
          console.warn("ScholarScroll offline worker could not register.", error);
        });
      });
    }

    updateNetworkState(online = navigator.onLine) {
      if (!this.elements.networkBanner) return;
      this.elements.networkBanner.hidden = online;
      this.elements.networkBanner.textContent = online
        ? ""
        : "You are offline. Cached books and the app shell remain available; live catalog search needs a connection.";
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
      if (requestedRoute.startsWith("verify/")) {
        this.renderVerifyRoute(decodeURIComponent(requestedRoute.slice(7)));
        return;
      }
      if (requestedRoute.startsWith("book/")) {
        this.renderBookRoute(decodeURIComponent(requestedRoute.slice(5)));
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
      if (routeName === "catalog") this.applyCatalogParams();
      this.elements.routeView.innerHTML = route.render();
      this.setNavigation(route);
      this.updateDocumentMeta(route);
      this.elements.routeAnnouncer.textContent = `${route.title} loaded.`;
      window.scrollTo({ top: 0, behavior: "auto" });
      this.elements.main?.focus({ preventScroll: true });
      this.updateStorageStats();
    }

    applyCatalogParams() {
      const params = this.router.query();
      if (!params.has("q")) return;
      const query = params.get("q") || "";
      const language = params.get("lang") || "";
      const sort = params.get("sort") || "relevance";
      const changed = query !== this.store.state.preferences.searchQuery
        || language !== this.catalog.searchLanguage
        || sort !== this.catalog.searchSort;
      this.store.setSearchQuery(query);
      this.elements.search.value = query;
      this.catalog.searchLanguage = language;
      this.catalog.searchSort = sort;
      if (query && changed) {
        this.catalog.loadingSearch = true;
        this.catalog.searchError = null;
        this.runSearch(query);
      }
    }

    updateDocumentMeta(route, book = null) {
      document.title = book ? `${book.title} · ScholarScroll` : route.title;
      const description = book
        ? `Read ${book.title} by ${book.author} in ScholarScroll, the online student library.`
        : route.description;
      const setMeta = (selector, value) => {
        const element = document.head.querySelector(selector);
        if (element) element.setAttribute("content", value);
      };
      setMeta('meta[name="description"]', description);
      setMeta('meta[property="og:title"]', document.title);
      setMeta('meta[property="og:description"]', description);
      setMeta('meta[property="og:type"]', book ? "book" : "website");
      setMeta('meta[property="og:url"]', window.location.href);
      setMeta('meta[name="twitter:title"]', document.title);
      setMeta('meta[name="twitter:description"]', description);
      const canonical = document.head.querySelector('link[rel="canonical"]');
      if (canonical) canonical.setAttribute("href", window.location.href);

      const structured = document.head.querySelector("#structured-data");
      if (structured) {
        structured.textContent = JSON.stringify(book ? {
          "@context": "https://schema.org",
          "@type": "Book",
          name: book.title,
          author: { "@type": "Person", name: book.author },
          inLanguage: book.languages?.[0] || "en",
          isAccessibleForFree: true,
          url: window.location.href,
          publisher: { "@type": "Organization", name: "Project Gutenberg" }
        } : {
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: "ScholarScroll",
          description,
          url: window.location.href
        });
      }
    }

    refreshView() {
      const current = this.router.current();
      if (current.startsWith("reader/") || current.startsWith("verify/") || current.startsWith("book/")) return;
      const route = this.routes[current] || this.routes.store;
      this.elements.routeView.innerHTML = route.render();
      this.setNavigation(route);
      this.updateDocumentMeta(route);
      this.updateStorageStats();
    }

    refreshCatalogView() {
      if (["store", "catalog", "dashboard", "bookmarks"].includes(this.router.current())) {
        this.refreshView();
      }
    }

    setNavigation(route) {
      document.querySelectorAll("[data-route-group]").forEach((link) => {
        const active = link.dataset.routeGroup === route.sidebar;
        link.classList.toggle("active", active);
        if (active) link.setAttribute("aria-current", "page");
        else link.removeAttribute("aria-current");
      });
      document.querySelectorAll("[data-header-route]").forEach((link) => {
        const active = link.dataset.headerRoute === route.header;
        link.classList.toggle("active", active);
        if (active) link.setAttribute("aria-current", "page");
        else link.removeAttribute("aria-current");
      });
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
      this.catalog.lastQuery = query.trim();
      this.catalog.searchPage = 1;
      this.catalog.searchHasMore = false;
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

    async runSearch(query, append = false) {
      const trimmedQuery = query.trim();
      if (!trimmedQuery) return;
      const page = append ? this.catalog.searchPage + 1 : 1;
      this.searchController?.abort();
      const requestController = new AbortController();
      this.searchController = requestController;
      if (append) this.catalog.loadingMore = true;
      else {
        this.catalog.loadingSearch = true;
        this.catalog.searchPage = 1;
      }
      this.catalog.searchError = null;
      this.refreshView();

      try {
        const result = await this.api.search(trimmedQuery, page, requestController.signal, {
          language: this.catalog.searchLanguage,
          sort: this.catalog.searchSort
        });
        if (requestController !== this.searchController || this.store.state.preferences.searchQuery.trim() !== trimmedQuery) return;
        const merged = append
          ? this.uniqueBooks([...this.catalog.searchResults, ...result.books])
          : result.books;
        this.catalog.searchResults = merged;
        this.catalog.searchCount = result.count;
        this.catalog.searchPage = page;
        this.catalog.searchHasMore = Boolean(result.next);
        this.catalog.searchError = null;
        this.indexBooks(result.books);
        this.updateAutocomplete(trimmedQuery);
        this.setApiStatus(true);
        this.updateCatalogUrl();
      } catch (error) {
        if (error.name === "AbortError" || requestController !== this.searchController) return;
        this.catalog.searchError = error.message;
        this.setApiStatus(false);
        if (append) this.toast.show(error.message, "error");
      } finally {
        if (requestController === this.searchController && this.store.state.preferences.searchQuery.trim() === trimmedQuery) {
          this.catalog.loadingSearch = false;
          this.catalog.loadingMore = false;
          this.refreshView();
        }
      }
    }

    loadMoreResults() {
      if (!this.catalog.searchHasMore || this.catalog.loadingMore || !this.catalog.lastQuery) return;
      this.runSearch(this.catalog.lastQuery, true);
    }

    updateCatalogUrl() {
      if (this.router.current() !== "catalog") return;
      const params = new URLSearchParams();
      const query = this.store.state.preferences.searchQuery.trim();
      if (query) params.set("q", query);
      if (this.catalog.searchLanguage) params.set("lang", this.catalog.searchLanguage);
      if (this.catalog.searchSort && this.catalog.searchSort !== "relevance") params.set("sort", this.catalog.searchSort);
      const hash = `#catalog${params.toString() ? `?${params.toString()}` : ""}`;
      if (window.location.hash !== hash) window.history.replaceState(null, "", hash);
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

    handleChange(event) {
      const shareBaseInput = event.target.closest("[data-share-base]");
      if (shareBaseInput) {
        const normalized = this.store.saveShareBaseUrl(shareBaseInput.value);
        shareBaseInput.value = normalized;
        this.toast.show(normalized ? "Certificate share link saved." : "Certificate share link cleared. QR codes will use the text summary.", normalized ? "success" : "info", 4200);
        return;
      }
      const readerPreference = event.target.closest("[data-reader-pref]");
      if (readerPreference) {
        const key = readerPreference.dataset.readerPref;
        const value = ["theme", "layout"].includes(key) ? readerPreference.value : Number(readerPreference.value);
        this.store.saveReaderPreferences({ ...this.store.getReaderPreferences(), [key]: value });
        const output = readerPreference.closest(".settings-field")?.querySelector("output");
        if (output && (key === "fontSize" || key === "pdfZoom")) output.textContent = `${Math.round(value * 100)}%`;
        this.toast.show("Reader preference saved.", "success", 1800);
        return;
      }
      const filter = event.target.closest("[data-catalog-filter]");
      if (!filter) return;
      if (filter.dataset.catalogFilter === "language") this.catalog.searchLanguage = filter.value;
      if (filter.dataset.catalogFilter === "sort") this.catalog.searchSort = filter.value;
      if (this.store.state.preferences.searchQuery.trim()) this.runSearch(this.store.state.preferences.searchQuery);
      else {
        this.updateCatalogUrl();
        this.refreshView();
      }
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
        "demo-login": () => this.demoLogin(trigger.dataset.role),
        "select-suggestion": () => this.selectSuggestion(trigger.dataset.bookKey),
        "close-modal": () => this.modal.close(),
        "logout": () => this.logout(),
        "read-book": () => this.requestRead(trigger.dataset.bookKey),
        "view-book": () => this.openBookDetails(trigger.dataset.bookKey),
        "copy-link": () => this.copyBookLink(trigger.dataset.bookKey),
        "toggle-save": () => this.toggleSaved(trigger.dataset.bookKey),
        "retry-api": () => this.loadLiveShelves(),
        "clear-search": () => this.clearSearch(),
        "load-more": () => this.loadMoreResults(),
        "view-certificate": () => this.openCertificate(trigger.dataset.certificateId || null),
        "print-certificate": () => window.print(),
        "view-badge": () => this.openBadge(trigger.dataset.badgeId),
        "print-badge": () => window.print(),
        "claim-reward": () => this.openPremiumForCertificate(trigger.dataset.certificateId),
        "open-voucher-claim": () => this.openVoucherClaim(trigger.dataset.bookKey, trigger.dataset.voucherCode || ""),
        "copy-voucher": () => this.copyVoucher(trigger.dataset.voucherCode),
        "copy-verify-link": () => this.copyVerifyLink(trigger.dataset.certificateId),
        "download-qr": () => this.downloadCertificateQr(trigger.dataset.certificateId),
        "delete-custom-book": () => this.confirmDeleteCustomBook(trigger.dataset.bookKey),
        "confirm-delete-custom-book": () => this.deleteCustomBook(trigger.dataset.bookKey),
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
      if (form.dataset.form === "voucher-claim") {
        event.preventDefault();
        this.submitVoucherClaim(form);
      }
    }

    clearSearch() {
      this.elements.search.value = "";
      this.store.setSearchQuery("");
      this.debouncedApiSearch.cancel();
      this.searchController?.abort();
      this.catalog.searchResults = [];
      this.catalog.searchCount = 0;
      this.catalog.searchPage = 1;
      this.catalog.searchHasMore = false;
      this.catalog.loadingSearch = false;
      this.catalog.loadingMore = false;
      this.catalog.searchError = null;
      this.closeAutocomplete();
      this.updateCatalogUrl();
      this.refreshView();
      this.elements.search.focus();
    }

    openLogin() {
      this.modal.open(`
        <div class="login-layout">
          <div class="login-intro"><span class="login-mark">S</span><p class="page-kicker">Member access</p><h2 id="dialog-title">Continue your reading</h2><p>Sign in to open books, save progress, write notes, and use offline reading.</p></div>
          <form class="auth-form" data-form="login">
            <label>Email address<input class="form-control" name="email" type="email" autocomplete="username" placeholder="maya@scholarscroll.local" required></label>
            <label>Password<input class="form-control" name="password" type="password" autocomplete="current-password" placeholder="Enter password" required></label>
            <p class="form-error" id="login-error" role="alert"></p>
            <button class="button" type="submit">Sign in</button>
            <div class="demo-credentials"><strong>Local demo accounts</strong><span>This static demo keeps authentication in your browser. Never enter a real password.</span><div class="demo-login-buttons"><button class="button button-secondary button-small" type="button" data-action="demo-login" data-role="student">Student demo</button><button class="button button-secondary button-small" type="button" data-action="demo-login" data-role="admin">Admin demo</button></div></div>
          </form>
        </div>
      `, "input[name='email']");
    }

    async demoLogin(role) {
      const user = Config.users.find((candidate) => candidate.role === role);
      if (!user) return;
      try {
        const signedIn = await this.auth.signIn(user.email, user.demoPassword);
        this.modal.close();
        this.renderChrome();
        const badges = this.store.syncBadges();
        if (badges.length) this.announceBadges(badges);
        this.hydrateUserRecords();
        const pendingBook = this.pendingReadKey ? this.findBook(this.pendingReadKey) : null;
        const pendingVoucher = this.pendingVoucherBookKey;
        this.pendingReadKey = null;
        this.pendingVoucherBookKey = null;
        if (pendingBook) this.startReader(pendingBook);
        else if (pendingVoucher) {
          this.router.navigate("premium");
          window.setTimeout(() => this.openVoucherClaim(pendingVoucher), 180);
        } else this.router.navigate(signedIn.role === "admin" ? "admin" : "dashboard");
        this.toast.show(`Welcome back, ${signedIn.name.split(" ")[0]}.`, "success");
      } catch (error) {
        this.toast.show(error.message, "error");
      }
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
        const badges = this.store.syncBadges();
        if (badges.length) this.announceBadges(badges);
        this.hydrateUserRecords();
        const pendingBook = this.pendingReadKey ? this.findBook(this.pendingReadKey) : null;
        const pendingVoucher = this.pendingVoucherBookKey;
        this.pendingReadKey = null;
        this.pendingVoucherBookKey = null;
        if (pendingBook) this.startReader(pendingBook);
        else if (pendingVoucher) {
          this.router.navigate("premium");
          window.setTimeout(() => this.openVoucherClaim(pendingVoucher), 180);
        } else this.router.navigate(user.role === "admin" ? "admin" : "dashboard");
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
      const result = this.store.touchReading(book);
      if (result.newBadges?.length) this.announceBadges(result.newBadges);
      this.readerReturnRoute = this.router.current().startsWith("reader/") || this.router.current().startsWith("book/")
        ? "catalog"
        : this.router.current();
      this.router.navigate(`reader/${encodeURIComponent(book.key)}`);
    }

    announceBadges(badges) {
      if (!badges.length) return;
      const latest = badges[badges.length - 1];
      this.toast.show(`${latest.title} badge unlocked — open My Library to view it.`, "success", 6500);
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
          toggleBookmark: (key, page, percent) => this.store.toggleReaderBookmark(key, page, percent),
          saveNote: (key, page, text) => this.store.saveReaderNote(key, page, text),
          markComplete: (activeBook) => this.store.markComplete(activeBook)
        },
        preferences: () => this.store.getReaderPreferences(),
        savePreferences: (preferences) => this.store.saveReaderPreferences(preferences),
        isComplete: (key) => this.store.isComplete(key),
        onClose: () => this.closeReader(),
        notify: (message, type, duration) => this.toast.show(message, type, duration)
      });
      this.reader.open(book);
      this.renderChrome();
      this.updateDocumentMeta(this.routes.catalog, book);
    }

    renderBookRoute(bookKey) {
      const show = (book) => {
        this.elements.routeView.innerHTML = this.renderCatalog();
        this.setNavigation(this.routes.catalog);
        this.updateDocumentMeta(this.routes.catalog, book || null);
        this.elements.routeAnnouncer.textContent = book ? `${book.title} details loaded.` : "Book not found.";
        this.elements.main?.focus({ preventScroll: true });
        if (book) this.openBookDetails(book.key);
        else this.toast.show("That book could not be found in the live catalog.", "error");
      };
      const book = this.findBook(bookKey);
      if (book) {
        show(book);
        return;
      }
      this.elements.routeView.innerHTML = this.loadingState("Restoring the shared book record…");
      this.api.byIds([Number(String(bookKey).replace("gutenberg-", ""))])
        .then((result) => {
          const fetched = result.books[0];
          if (fetched) {
            this.indexBooks([fetched]);
            this.store.rememberBooks([fetched]);
          }
          show(fetched || null);
        })
        .catch((error) => {
          show(null);
          this.toast.show(error.message, "error");
        });
    }

    copyBookLink(bookKey) {
      const url = `${window.location.origin}${window.location.pathname}#book/${encodeURIComponent(bookKey)}`;
      const fallback = () => {
        const field = document.createElement("textarea");
        field.value = url;
        field.setAttribute("readonly", "");
        field.style.position = "fixed";
        field.style.opacity = "0";
        document.body.append(field);
        field.select();
        try { document.execCommand("copy"); } catch { /* ignore */ }
        field.remove();
      };
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(url).then(() => this.toast.show("Share link copied.", "success")).catch(() => {
          fallback();
          this.toast.show("Share link copied.", "success");
        });
      } else {
        fallback();
        this.toast.show("Share link copied.", "success");
      }
    }

    openBookDetails(bookKey) {
      const book = this.findBook(bookKey);
      if (!book) return;
      const saved = this.store.currentUser ? this.store.isSaved(book.key) : false;
      const subjects = (book.subjects || []).slice(0, 4);
      this.modal.open(`
        <div class="live-book-detail">
          <div class="detail-cover-wrap">${this.coverMarkup(book, "detail-live-cover")}</div>
          <div><p class="page-kicker">${escapeHTML(book.category || "Public-domain collection")}</p><h2 id="dialog-title">${escapeHTML(book.title)}</h2><p class="detail-byline">${escapeHTML(book.author)}</p><p class="detail-summary">${escapeHTML(book.summary || "No description is available for this edition.")}</p>${subjects.length ? `<p class="detail-subjects">${subjects.map((subject) => `<span>${escapeHTML(subject)}</span>`).join("")}</p>` : ""}<div class="detail-stats"><span><strong>${compactNumber(book.downloadCount)}</strong> downloads</span><span><strong>${book.reader?.engine === "pdf" ? "PDF.js" : "Protected text"}</strong> reader</span></div><div class="button-row"><button class="button" type="button" data-action="read-book" data-book-key="${escapeHTML(book.key)}" ${book.reader ? "" : "disabled"}>${this.store.currentUser ? "Read now" : "Sign in to read"}</button>${this.store.currentUser ? `<button class="button button-secondary" type="button" data-action="toggle-save" data-book-key="${escapeHTML(book.key)}">${saved ? "Remove saved book" : "Save for later"}</button>` : ""}<button class="button button-secondary" type="button" data-action="copy-link" data-book-key="${escapeHTML(book.key)}">Copy share link</button></div></div>
        </div>
      `);
    }

    toggleSaved(bookKey) {
      if (!this.store.currentUser) return this.openLogin();
      const book = this.findBook(bookKey);
      if (!book) return;
      const saved = this.store.toggleSaved(book);
      this.modal.close();
      if (this.router.current().startsWith("book/")) this.elements.routeView.innerHTML = this.renderCatalog();
      else this.refreshView();
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
          summary: normalizeText(data.get("description")) || "A private PDF supplied by a ScholarScroll administrator.",
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
        this.adminStatus = `${title} was validated and stored in IndexedDB.`;
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
          ${this.renderCatalogFilters(query)}
          ${query ? this.renderSearchGrid() : `<div class="live-book-grid">${combined.length ? combined.map((book) => this.liveBookCard(book)).join("") : this.loadingCards(12)}</div>`}
        </section>
      `;
    }

    renderCatalogFilters(query) {
      const languages = [
        ["", "All languages"], ["en", "English"], ["fr", "French"], ["de", "German"],
        ["es", "Spanish"], ["it", "Italian"], ["pt", "Portuguese"], ["nl", "Dutch"],
        ["fi", "Finnish"], ["sv", "Swedish"], ["la", "Latin"]
      ];
      const sorts = [
        ["relevance", "Best match"], ["popular", "Most downloaded"],
        ["ascending", "Oldest first"], ["descending", "Newest first"]
      ];
      return `
        <div class="catalog-filter-bar" role="group" aria-label="Search filters">
          <span class="catalog-filter-hint">${query ? "Refine these results" : "Filters apply to live searches"}</span>
          <label>Language<select data-catalog-filter="language">${languages.map(([value, label]) => `<option value="${value}" ${this.catalog.searchLanguage === value ? "selected" : ""}>${label}</option>`).join("")}</select></label>
          <label>Sort by<select data-catalog-filter="sort">${sorts.map(([value, label]) => `<option value="${value}" ${this.catalog.searchSort === value ? "selected" : ""}>${label}</option>`).join("")}</select></label>
        </div>
      `;
    }

    renderSearchSection(query) {
      return `<section class="store-section"><header class="store-section-heading"><div><span>Live search</span><h2>Results for “${escapeHTML(query)}”</h2></div><button type="button" data-action="clear-search">Clear</button></header>${this.renderSearchGrid()}</section>`;
    }

    renderSearchGrid() {
      if (this.catalog.loadingSearch) return this.loadingState("Searching the full Gutendex catalog…");
      if (this.catalog.searchError) return this.errorState(this.catalog.searchError);
      const results = this.catalog.searchResults;
      return `
        <div class="search-summary"><span>${this.catalog.searchCount.toLocaleString()} matching ${pluralize(this.catalog.searchCount, "record")}</span><span>Showing ${results.length.toLocaleString()}</span></div>
        <div class="live-book-grid">${results.length ? results.map((book) => this.liveBookCard(book)).join("") : this.emptyState("No books matched this search. Try a shorter title, an author, or a different language.")}</div>
        ${this.catalog.searchHasMore ? `<div class="load-more-row"><button class="button button-secondary" type="button" data-action="load-more" ${this.catalog.loadingMore ? "disabled" : ""}>${this.catalog.loadingMore ? "Loading more…" : "Load more results"}</button></div>` : results.length ? '<p class="results-end">End of results for this search.</p>' : ""}
      `;
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
      const user = this.store.currentUser;
      const query = this.store.state.preferences.searchQuery.trim();
      const previous = this.store.previousBooks();
      const inProgress = previous.filter((item) => !item.activity.completedAt);
      const challenge = this.store.challenge();
      const streak = this.store.streakStats();
      const achievements = this.store.state.achievements.filter((item) => item.userId === user.id);
      const saved = this.store.savedBookList();
      const recommendations = query ? this.catalog.searchResults : this.catalog.popular;
      const completed = previous.filter((item) => item.activity.completedAt).length;
      const premiumTotal = Config.PREMIUM_BOOKS.length;

      return `
        <section class="dashboard-page auth-dashboard">
          <header class="dashboard-welcome">
            <div><span>${formatDate(new Date())}</span><h1>Welcome back, ${escapeHTML(user.name.split(" ")[0])}</h1><p>${streak.readToday ? "You have read today, so your streak is safe. Keep the momentum going." : "Read a few pages today to keep your reading streak alive."}</p></div>
            <a class="button" href="#catalog" data-route-link>Explore books</a>
          </header>

          <section class="stat-strip" aria-label="Reading statistics">
            ${this.statCard("Books completed", completed, "book")}
            ${this.statCard("Current streak", `${streak.current} ${pluralize(streak.current, "day")}`, "streak")}
            ${this.statCard("Best streak", `${streak.best} ${pluralize(streak.best, "day")}`, "best")}
            ${this.statCard("Reading days", streak.total, "calendar")}
            ${this.statCard("Certificates", achievements.length, "award")}
          </section>

          ${inProgress.length ? this.continueReadingCard(inProgress[0]) : ""}

          <div class="dashboard-layout">
            <div class="primary-column">
              <section class="dashboard-section"><header class="section-heading"><h2>Previous reading</h2><span>${previous.length} ${pluralize(previous.length, "title")}</span></header><div class="reading-row">${previous.length ? previous.slice(0, 4).map((item) => this.previousReadingCard(item)).join("") : this.emptyState("Start a book and it will appear here.")}</div></section>
              <section class="dashboard-section"><header class="section-heading"><h2>Streak badges</h2><span>${streak.badges.length} of ${Config.STREAK_MILESTONES.length} unlocked</span></header>${this.badgeShelf(streak)}</section>
              <section class="dashboard-section"><header class="section-heading"><h2>Certificates</h2><span>${achievements.length} ${pluralize(achievements.length, "certificate")}</span></header>${this.certificateShelf(achievements, challenge)}</section>
              ${query ? `<section class="dashboard-section"><header class="section-heading"><h2>Live search results</h2><span>${this.catalog.searchCount.toLocaleString()} matches</span></header>${this.renderSearchGrid()}</section>` : ""}
              <section class="dashboard-section"><header class="section-heading"><h2>${query ? "More from your search" : "Recommended from Gutendex"}</h2><a href="#catalog" data-route-link>View all</a></header><div class="new-books-row">${this.catalog.loadingPopular ? this.loadingCards(5) : recommendations.slice(0, 5).map((book) => this.compactBookCard(book)).join("")}</div></section>
            </div>
            <aside class="discovery-column">
              ${this.streakPanel(streak)}
              ${this.challengeCard(challenge)}
              <section class="dashboard-section"><header class="section-heading"><h2>New public-domain books</h2><span>Live</span></header><div class="special-list">${this.catalog.loadingNewest ? this.loadingCards(3) : this.catalog.newest.slice(0, 4).map((book) => this.listBookCard(book)).join("")}</div></section>
              <section class="dashboard-section premium-teaser"><header class="section-heading"><h2>Premium shelf</h2><a href="#premium" data-route-link>Open</a></header><p class="dashboard-note">${premiumTotal} curated ${pluralize(premiumTotal, "title")} · open to every member.</p><a class="button button-secondary button-small" href="#premium" data-route-link>Visit premium books</a></section>
              <section class="dashboard-section"><header class="section-heading"><h2>Your saved books</h2><a href="#bookmarks" data-route-link>Open</a></header><p class="dashboard-note">${saved.length} saved ${pluralize(saved.length, "title")} · Notes and reader positions are stored on this device.</p></section>
            </aside>
          </div>
        </section>
      `;
    }

    statCard(label, value, icon) {
      const paths = STAT_ICONS[icon] || STAT_ICONS.book;
      return `<article class="stat-card"><span class="stat-icon stat-${escapeHTML(icon)}" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" focusable="false">${paths}</svg></span><strong>${escapeHTML(String(value))}</strong><span>${escapeHTML(label)}</span></article>`;
    }

    continueReadingCard({ book, activity }) {
      const progress = Math.max(0, Math.min(99, Number(activity.progress) || 0));
      return `
        <section class="continue-card">
          <div class="continue-cover">${this.coverMarkup(book, "continue-cover-image")}</div>
          <div class="continue-copy"><span class="page-kicker">Continue reading</span><h2>${escapeHTML(book.title)}</h2><p>${escapeHTML(book.author)} · ${escapeHTML(book.category || "Library")}</p><div class="reading-progress"><div class="progress-label"><span>Saved progress</span><span>${progress}%</span></div><div class="progress-track"><div class="progress-fill" style="--progress:${progress}%"></div></div></div></div>
          <button class="button" type="button" data-action="read-book" data-book-key="${escapeHTML(book.key)}">Resume</button>
        </section>
      `;
    }

    badgeShelf(streak) {
      const unlockedByDays = new Map(streak.badges.map((badge) => [Number(badge.days), badge]));
      return `<div class="milestone-grid">${Config.STREAK_MILESTONES.map((days) => {
        const badge = unlockedByDays.get(days);
        const title = streakTitle(days);
        if (badge) {
          return `<button class="milestone-card unlocked" type="button" data-action="view-badge" data-badge-id="${escapeHTML(badge.id)}"><span class="milestone-medal" aria-hidden="true">${escapeHTML(streakShort(days))}</span><strong>${escapeHTML(title)}</strong><small>Unlocked ${formatDate(badge.unlockedAt)}</small></button>`;
        }
        return `<div class="milestone-card locked"><span class="milestone-medal" aria-hidden="true">${escapeHTML(streakShort(days))}</span><strong>${escapeHTML(title)}</strong><small>Read ${days} ${pluralize(days, "day")} in a row</small></div>`;
      }).join("")}</div>`;
    }

    streakPanel(streak) {
      const nextTarget = streak.next || Math.max(365, streak.current + 1);
      const progress = Math.max(0, Math.min(100, Math.round((streak.current / nextTarget) * 100)));
      const remaining = streak.next ? streak.next - streak.current : 0;
      return `
        <section class="dashboard-section streak-panel">
          <header class="section-heading"><h2>Reading streak</h2><span>Personal best ${streak.best}</span></header>
          <div class="streak-hero">
            <div class="streak-dial" style="--streak-progress:${progress}%"><strong>${streak.current}</strong><span>${pluralize(streak.current, "day")}</span></div>
            <div><p>${streak.readToday ? "Today is counted. Come back tomorrow to extend your streak." : "Read anything today to keep your streak intact."}</p><small>${streak.next ? `${remaining} ${pluralize(remaining, "day")} until ${streakTitle(streak.next)}.` : "Every streak milestone is unlocked. Remarkable."}</small></div>
          </div>
          <div class="progress-track"><div class="progress-fill" style="--progress:${progress}%"></div></div>
        </section>
      `;
    }

    certificateShelf(achievements, challenge) {
      const cards = achievements.map((achievement) => {
        const books = this.certificateBooksFor(achievement);
        return `
          <article class="certificate-shelf-card">
            <span class="certificate-mini-seal" aria-hidden="true">✦</span>
            <div><span class="page-kicker">Avid Reader certificate</span><h3>${escapeHTML(this.store.currentUser.name)}</h3><p>${books.length} ${pluralize(books.length, "book")} completed · ${formatDate(achievement.unlockedAt)}</p><small>Scan the QR code to verify this record.</small></div>
            <button class="button button-secondary button-small" type="button" data-action="view-certificate" data-certificate-id="${escapeHTML(achievement.certificateId || achievement.id)}">View certificate</button>
          </article>
        `;
      });
      const target = Config.AVID_READER_TARGET;
      const progress = Math.min(100, Math.round((challenge.count / target) * 100));
      const progressCard = `<article class="certificate-progress-card"><span class="certificate-mini-seal" aria-hidden="true">✦</span><div><strong>${challenge.count} of ${target} books in ${Config.AVID_READER_WINDOW_DAYS} days</strong><p>Complete ${target} books inside ${Config.AVID_READER_WINDOW_DAYS} days to unlock a printable certificate and a scannable QR record of your achievement.</p><div class="progress-track"><div class="progress-fill" style="--progress:${progress}%"></div></div></div></article>`;
      return `<div class="certificate-shelf">${cards.join("")}${cards.length ? "" : progressCard}</div>`;
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
      const target = Config.AVID_READER_TARGET;
      const progress = Math.min(100, Math.round((challenge.count / target) * 100));
      const earned = challenge.achievement;
      return `<section class="challenge-panel dashboard-challenge"><span class="badge badge-gold">${Config.AVID_READER_WINDOW_DAYS}-day reading target</span><h2>${earned ? "Certificate unlocked" : `${challenge.count} of ${target} books complete`}</h2><p>${earned ? `Earned ${formatDate(earned.unlockedAt)}. The QR code on your certificate shares proof of your name, the date and the books you completed.` : `Finish ${target} books inside ${Config.AVID_READER_WINDOW_DAYS} days to earn a printable certificate and a scannable QR record of your achievement.`}</p><div class="progress-track"><div class="progress-fill" style="--progress:${progress}%"></div></div>${earned ? `<button class="button button-small" type="button" data-action="view-certificate" data-certificate-id="${escapeHTML(earned.certificateId || earned.id)}">View certificate</button>` : ""}</section>`;
    }

    renderBookmarks() {
      const books = this.store.savedBookList();
      return `<section class="content-page"><header class="page-intro"><div><p class="page-kicker">Personal collection</p><h1>Saved books</h1><p>Metadata and reading shortcuts stored for ${escapeHTML(this.store.currentUser.name)}. Saved details remain available when the live catalog is offline.</p></div></header><div class="live-book-grid">${books.length ? books.map((book) => this.liveBookCard(book)).join("") : this.emptyState("Save books from the live catalog to find them here.")}</div></section>`;
    }

    renderPremium() {
      const user = this.store.currentUser;
      const total = Config.PREMIUM_BOOKS.length;
      const publicShelf = Config.PREMIUM_BOOKS.filter((book) => book.collection !== "Reader editions");
      const readerShelf = Config.PREMIUM_BOOKS.filter((book) => book.collection === "Reader editions");
      return `
        <section class="content-page premium-page">
          <header class="premium-hero">
            <div class="premium-hero-copy">
              <p class="page-kicker">Members' reading room</p>
              <h1>Premium books</h1>
              <p class="premium-lede">A curated members' shelf of public-domain essentials and supplied PDF editions — philosophy, classics, mindset and money. Every title here is open to read, free, with the same member account you use everywhere else.</p>
              <div class="premium-hero-actions">
                <a class="button button-secondary" href="#catalog" data-route-link>Browse the free catalog</a>
                ${user
                  ? `<a class="button" href="#dashboard" data-route-link>Earn a certificate</a>`
                  : `<button class="button" type="button" data-action="open-login">Sign in to read</button>`}
              </div>
            </div>
            <aside class="premium-status-card" aria-label="Premium collection summary">
              <span class="page-kicker">In this collection</span>
              <strong>${total}</strong>
              <span>${pluralize(total, "curated title")} · open to every member</span>
              <div class="progress-track"><div class="progress-fill" style="--progress:100%"></div></div>
            </aside>
          </header>

          <div class="premium-grid">
            ${publicShelf.map((book) => this.premiumBookCard(book, user)).join("")}
          </div>

          <p class="premium-note">The public-domain shelf above is drawn from ordinary Project Gutenberg texts. Nothing here is paid, gated or time-limited.</p>

          ${readerShelf.length ? `
            <section class="premium-reader-shelf" aria-labelledby="premium-reader-shelf-title">
              <header class="section-heading">
                <div>
                  <p class="page-kicker">PDF reader editions</p>
                  <h2 id="premium-reader-shelf-title">Modern mindset &amp; money shelf</h2>
                </div>
                <span class="premium-rights-badge">PDF edition</span>
              </header>
              <p class="premium-spotlight-note">These PDF editions were supplied by the project owner for this local demo. They open in the PDF.js reader with zoom, portrait/landscape layout and light/dark themes. Check that you have the right to use each copy in your jurisdiction; they are not downloads from Project Gutenberg.</p>
              <div class="premium-grid">
                ${readerShelf.map((book) => this.premiumBookCard(book, user)).join("")}
              </div>
            </section>
          ` : ""}

          <section class="premium-spotlight" aria-labelledby="premium-spotlight-title">
            <header class="section-heading">
              <div>
                <p class="page-kicker">Modern bestsellers · rights-aware preview</p>
                <h2 id="premium-spotlight-title">Books people keep asking for</h2>
              </div>
              <span class="premium-rights-badge">Preview only</span>
            </header>
            <p class="premium-spotlight-note">These popular titles are still protected by copyright and no reader copy has been supplied, so ScholarScroll cannot host their full text. The cards below link to an Open Library record so you can borrow, preview or buy a licensed copy. The public-domain shelf and the supplied reader editions above are fully readable.</p>
            <div class="premium-spotlight-grid">
              ${Config.PREMIUM_SPOTLIGHT.map((book) => this.premiumSpotlightCard(book)).join("")}
            </div>
          </section>
        </section>
      `;
    }

    premiumSpotlightCard(book) {
      const link = safeUrl(book.sourceUrl);
      return `
        <article class="premium-card premium-card-spotlight">
          <div class="premium-cover-stage">
            ${this.coverMarkup(book, "premium-cover-image")}
            <span class="premium-access-badge premium-access-badge-muted">${escapeHTML(book.rights || "Copyrighted")}</span>
          </div>
          <div class="premium-card-body">
            <span class="book-category">${escapeHTML(book.category)}</span>
            <h3>${escapeHTML(book.title)}</h3>
            ${book.subtitle ? `<p class="premium-spotlight-subtitle">${escapeHTML(book.subtitle)}</p>` : ""}
            <p class="premium-author">${escapeHTML(book.author)}</p>
            <p class="premium-summary">${escapeHTML(book.summary)}</p>
            <div class="premium-card-actions">
              <small>Full text not supplied</small>
              ${link
                ? `<a class="button button-secondary" href="${escapeHTML(link)}" target="_blank" rel="noopener noreferrer">Find a licensed copy</a>`
                : `<button class="button button-secondary" type="button" disabled>Preview unavailable</button>`}
            </div>
          </div>
        </article>
      `;
    }

    premiumBookCard(book, user) {
      const edition = book.collection === "Reader editions" ? "PDF edition" : "Gutenberg text";
      return `
        <article class="premium-card is-open">
          <div class="premium-cover-stage">
            ${this.coverMarkup(book, "premium-cover-image")}
            <span class="premium-access-badge">${escapeHTML(edition)}</span>
          </div>
          <div class="premium-card-body">
            <span class="book-category">${escapeHTML(book.category)}</span>
            <h2>${escapeHTML(book.title)}</h2>
            <p class="premium-author">${escapeHTML(book.author)}</p>
            <p class="premium-summary">${escapeHTML(book.summary)}</p>
            <div class="premium-card-actions">
              <small>Open to all members</small>
              ${user
                ? `<button class="button" type="button" data-action="read-book" data-book-key="${escapeHTML(book.key)}">Read now</button>`
                : `<button class="button" type="button" data-action="open-login">Sign in to read</button>`}
            </div>
          </div>
        </article>
      `;
    }

    renderSettings() {
      const user = this.store.currentUser;
      const challenge = this.store.challenge();
      const streak = this.store.streakStats();
      const preferences = this.store.getReaderPreferences();
      return `
        <section class="content-page settings-page">
          <header class="page-intro"><div><p class="page-kicker">Account</p><h1>Profile and local data</h1><p>Authentication and reader state are scoped to this browser profile. This is a demonstration account, not a production identity provider.</p></div></header>
          <div class="settings-layout">
            <section class="settings-card">
              <h2>${escapeHTML(user.name)}</h2>
              <p>${escapeHTML(user.email)} · ${escapeHTML(user.role)}</p>
              <div class="profile-summary"><span class="profile-avatar">${escapeHTML(user.initials)}</span><div><strong>${this.store.previousBooks().length} reading records</strong><small>${this.store.savedKeys().length} saved books · ${streak.badges.length} badges</small></div></div>
              <div class="settings-stats"><span><strong>${streak.current}</strong>day streak</span><span><strong>${streak.best}</strong>personal best</span><span><strong>${this.store.state.achievements.filter((item) => item.userId === user.id).length}</strong>certificates</span></div>
            </section>
            <section class="settings-card">
              <h2>Reader appearance</h2>
              <p>These preferences apply every time you open a book.</p>
              <label class="settings-field">Text size <span class="settings-range"><input type="range" min="0.8" max="2" step="0.1" value="${preferences.fontSize}" data-reader-pref="fontSize" aria-label="Reader text size"> <output>${Math.round(preferences.fontSize * 100)}%</output></span></label>
              <label class="settings-field">PDF zoom <span class="settings-range"><input type="range" min="0.5" max="2.5" step="0.1" value="${preferences.pdfZoom}" data-reader-pref="pdfZoom" aria-label="PDF zoom"> <output>${Math.round(preferences.pdfZoom * 100)}%</output></span></label>
              <label class="settings-field">Theme <select data-reader-pref="theme" class="form-control"><option value="paper" ${preferences.theme === "paper" ? "selected" : ""}>Light</option><option value="sepia" ${preferences.theme === "sepia" ? "selected" : ""}>Sepia</option><option value="night" ${preferences.theme === "night" ? "selected" : ""}>Dark</option></select></label>
              <label class="settings-field">Page layout <select data-reader-pref="layout" class="form-control"><option value="portrait" ${preferences.layout === "portrait" ? "selected" : ""}>Portrait</option><option value="landscape" ${preferences.layout === "landscape" ? "selected" : ""}>Landscape</option></select></label>
              <label class="settings-field">Line spacing <select data-reader-pref="lineHeight" class="form-control"><option value="1.6" ${Number(preferences.lineHeight) === 1.6 ? "selected" : ""}>Compact</option><option value="1.95" ${Number(preferences.lineHeight) === 1.95 ? "selected" : ""}>Comfortable</option><option value="2.2" ${Number(preferences.lineHeight) === 2.2 ? "selected" : ""}>Relaxed</option></select></label>
              <label class="settings-field">Certificate share link <input class="form-control" type="url" inputmode="url" placeholder="https://your-site.example or http://192.168.1.20:8123" value="${escapeHTML(this.store.state.preferences.shareBaseUrl || "")}" data-share-base></label>
              <p class="settings-hint">Optional. A phone cannot open 127.0.0.1, so certificate QR codes use a readable text summary on localhost. Enter a hosted URL or your computer's Wi-Fi address here to make the QR open the full verification page on a phone.</p>
            </section>
            <section class="settings-card">
              <h2>Storage &amp; privacy</h2>
              <p>Metadata, notes and authentication use localStorage. Offline document bytes use IndexedDB. No profile data is sent to a server by this demo.</p>
              <p class="storage-estimate"><span>Browser storage used</span><strong data-storage-estimate>Calculating…</strong></p>
              <div class="settings-actions"><button class="button button-danger" type="button" data-action="request-reset">Reset local state</button><button class="button button-secondary" type="button" data-action="logout">Log out</button></div>
            </section>
            <section class="settings-card">
              <h2>About this demo</h2>
              <p>ScholarScroll is a static student project. Sign-in, certificates and badges are local browser demonstrations and are not legally verifiable credentials.</p>
              <div class="settings-links"><a href="#about" data-route-link>About ScholarScroll</a><a href="#sources" data-route-link>Sources &amp; licensing</a><a href="#privacy" data-route-link>Privacy</a><a href="#accessibility" data-route-link>Accessibility</a></div>
            </section>
          </div>
          <div class="settings-achievement">${this.challengeCard(challenge)}</div>
        </section>
      `;
    }

    renderAdmin() {
      const books = this.store.state.customBooks;
      return `
        <section class="content-page admin-page">
          <header class="page-intro"><div><p class="page-kicker">Administrator</p><h1>Secure PDF library</h1><p>PDF bytes are validated and stored directly in browser IndexedDB for canvas-only rendering. This is a local demonstration of administrative tooling.</p></div></header>
          <div class="admin-status-row">
            <p class="admin-status" role="status">${escapeHTML(this.adminStatus || "Administrator session active. Uploads stay in this browser.")}</p>
            <p class="storage-estimate"><span>Browser storage used</span><strong data-storage-estimate>Calculating…</strong></p>
          </div>
          <div class="admin-grid">
            <form class="upload-card" data-form="pdf-upload">
              <h2>Upload a custom PDF</h2>
              <p>No raw file link is created. The selected ArrayBuffer is written to IndexedDB.</p>
              <label>Book title<input class="form-control" name="title" maxlength="120" required></label>
              <label>Author<input class="form-control" name="author" maxlength="100"></label>
              <label>Description<textarea class="form-control" name="description" maxlength="500"></textarea></label>
              <label class="file-control">PDF file<input name="pdf" type="file" accept="application/pdf,.pdf" required></label>
              <span class="upload-status" data-upload-status>Maximum file size: 50 MB</span>
              <button class="button" type="submit">Store secure PDF</button>
            </form>
            <section>
              <header class="section-heading"><h2>Uploaded documents</h2><span>${books.length} ${pluralize(books.length, "PDF")}</span></header>
              <div class="admin-book-list">${books.length ? books.map((book) => this.adminBookCard(book)).join("") : this.emptyState("No administrator PDFs have been uploaded in this browser.")}</div>
            </section>
          </div>
        </section>
      `;
    }

    adminBookCard(book) {
      return `
        <article class="admin-book-card">
          <div class="admin-book-cover">${this.coverMarkup(book, "admin-cover")}</div>
          <div class="admin-book-copy"><span class="page-kicker">${escapeHTML(book.category || "Secure uploads")}</span><h3>${escapeHTML(book.title)}</h3><p>${escapeHTML(book.author)}</p><small>Uploaded ${formatDate(book.uploadedAt)} · IndexedDB</small></div>
          <div class="admin-book-actions"><button class="button button-secondary button-small" type="button" data-action="read-book" data-book-key="${escapeHTML(book.key)}">Open</button><button class="button button-danger button-small" type="button" data-action="delete-custom-book" data-book-key="${escapeHTML(book.key)}">Delete</button></div>
        </article>
      `;
    }

    renderAbout() {
      return `
        <section class="content-page prose-page">
          <header class="page-intro"><div><p class="page-kicker">About</p><h1>A calmer way to read the classics</h1><p>ScholarScroll is a student-built, browser-only library for public-domain books. It combines live catalog discovery with a distraction-free reader and local progress tracking.</p></div></header>
          <div class="prose-grid">
            <article class="prose-card"><h2>What it does</h2><p>Search more than 79,000 Project Gutenberg editions through Gutendex, read text editions in a protected reader, keep private notes and bookmarks, and store documents for offline reading.</p></article>
            <article class="prose-card"><h2>Reading streaks &amp; badges</h2><p>Every day you read is recorded locally. Milestones at 1, 7, 30, 180 and 365 consecutive days unlock a badge carrying your name and a personal congratulation.</p></article>
            <article class="prose-card"><h2>Certificates &amp; QR records</h2><p>Completing three books inside a seven-day window unlocks an Avid Reader certificate. Its QR code opens a shareable record with your name, the date and the books you finished.</p></article>
            <article class="prose-card"><h2>Honest demo boundaries</h2><p>This build has no server. Accounts, badges, certificates and reading records are local demonstrations. They are not identity-verified credentials, and nothing is transmitted to ScholarScroll.</p></article>
          </div>
          <div class="prose-actions"><a class="button" href="#catalog" data-route-link>Browse the catalog</a><a class="button button-secondary" href="#sources" data-route-link>Read about our sources</a></div>
        </section>
      `;
    }

    renderSources() {
      return `
        <section class="content-page prose-page">
          <header class="page-intro"><div><p class="page-kicker">Sources &amp; licensing</p><h1>Where the books come from</h1><p>ScholarScroll indexes and presents public-domain works. It does not claim ownership of the books or their covers.</p></div></header>
          <div class="prose-grid">
            <article class="prose-card"><h2>Project Gutenberg</h2><p>Book texts, covers and catalogue metadata originate from <a href="https://www.gutenberg.org/" target="_blank" rel="noopener noreferrer">Project Gutenberg</a>. Most works are in the public domain in the United States; local copyright rules may differ.</p></article>
            <article class="prose-card"><h2>Gutendex API</h2><p>Live discovery uses the free <a href="https://gutendex.com/" target="_blank" rel="noopener noreferrer">Gutendex</a> JSON API. Availability and latency depend on that public service. Search results are cached only in memory for the current session.</p></article>
            <article class="prose-card"><h2>Reader technology</h2><p>PDF documents are rendered with <a href="https://mozilla.github.io/pdf.js/" target="_blank" rel="noopener noreferrer">PDF.js</a>. QR codes are generated locally with the MIT-licensed <code>qrcode-generator</code> library, so certificate codes never leave your browser.</p></article>
            <article class="prose-card"><h2>Attribution &amp; takedown</h2><p>If you believe a work is presented incorrectly, contact the project maintainer with the title, Gutenberg ID and the nature of the concern. Public-domain status is always determined by the source archive and your local law.</p></article>
          </div>
        </section>
      `;
    }

    renderPrivacy() {
      return `
        <section class="content-page prose-page">
          <header class="page-intro"><div><p class="page-kicker">Privacy</p><h1>Your reading stays on your device</h1><p>ScholarScroll is a static application. It has no analytics, advertising, tracking pixels or ScholarScroll account server.</p></div></header>
          <div class="prose-grid">
            <article class="prose-card"><h2>Stored in your browser</h2><p>localStorage keeps your session flag, reading history, streak days, badges, certificates, reader preferences, bookmarks and notes. IndexedDB keeps optional offline book bytes and administrator PDFs.</p></article>
            <article class="prose-card"><h2>Sent over the network</h2><p>Search terms and book IDs go to Gutendex. Book text may be requested from Project Gutenberg or a text-only proxy. PDF.js and web fonts load from their public CDNs. These requests are subject to those services' policies.</p></article>
            <article class="prose-card"><h2>Clearing your data</h2><p>Use “Reset local state” in Settings to clear profiles and reading data. You can also clear site data in your browser. IndexedDB documents are removed individually from the administrator page or with site data.</p></article>
            <article class="prose-card"><h2>Certificates are public by design</h2><p>A certificate QR code contains the recipient name, date and completed book titles. Anyone who scans it can read that information. Treat the link as you would a shared document.</p></article>
          </div>
        </section>
      `;
    }

    renderAccessibility() {
      return `
        <section class="content-page prose-page">
          <header class="page-intro"><div><p class="page-kicker">Accessibility</p><h1>Reading should work for everyone</h1><p>ScholarScroll aims to meet WCAG 2.2 AA practices in its interface and reader.</p></div></header>
          <div class="prose-grid">
            <article class="prose-card"><h2>Keyboard support</h2><p>Every control is reachable by keyboard. Press <kbd>Tab</kbd> to move, <kbd>Enter</kbd> or <kbd>Space</kbd> to activate, and <kbd>Ctrl</kbd>/<kbd>⌘</kbd> + <kbd>K</kbd> to focus search. The reader uses the arrow keys for page navigation.</p></article>
            <article class="prose-card"><h2>Screen readers</h2><p>Route changes are announced, dialogs manage focus, the search combobox exposes listbox semantics, and progress bars carry readable values. Decorative imagery is hidden from assistive technology.</p></article>
            <article class="prose-card"><h2>Comfort controls</h2><p>The reader offers three themes, adjustable text size and three line-spacing options. Visible focus rings and reduced-motion support respect system preferences.</p></article>
            <article class="prose-card"><h2>Known limitations</h2><p>Some Project Gutenberg covers lack alternative descriptions. The PDF canvas reader cannot expose selectable text to screen readers, and third-party fonts or APIs may fail without a connection. Report barriers to the project maintainer.</p></article>
          </div>
        </section>
      `;
    }

    certificateOwner(achievement) {
      return Config.users.find((user) => user.id === achievement.userId) || this.store.currentUser || Config.users[0];
    }

    certificateBooksFor(achievement) {
      const snapshots = Array.isArray(achievement.bookSnapshots) ? achievement.bookSnapshots.filter(Boolean) : [];
      if (snapshots.length) {
        return snapshots.map((item) => ({
          key: item.key || item.title,
          title: item.title || "Untitled",
          author: item.author || "Unknown author"
        }));
      }
      return (achievement.evidenceBookKeys || [])
        .map((key) => this.store.getBook(key))
        .filter(Boolean)
        .map((book) => ({ key: book.key, title: book.title, author: book.author }));
    }

    findAchievement(certificateId) {
      return (this.store.state.achievements || []).find((item) => (item.certificateId || item.id) === certificateId) || null;
    }

    /**
     * Compact certificate payload. Version 2 keeps the QR sparse enough to scan
     * at a comfortable size: short keys, an ISO date for issue, and the books as
     * [title, author] pairs. Version 1 tokens from earlier builds still decode.
     */
    certificateToken(achievement) {
      const owner = this.certificateOwner(achievement);
      const books = this.certificateBooksFor(achievement);
      return base64UrlEncode(JSON.stringify({
        v: 2,
        k: "ssc",
        c: achievement.certificateId || achievement.id,
        u: achievement.userId || owner?.id || "",
        n: owner?.name || "ScholarScroll reader",
        d: String(achievement.unlockedAt || "").slice(0, 10),
        b: books.map((book) => book.title)
      }));
    }

    decodeCertificateToken(token) {
      let decoded = null;
      try {
        decoded = JSON.parse(base64UrlDecode(token));
      } catch {
        return null;
      }
      if (!decoded || typeof decoded !== "object") return null;
      if (decoded.v === 2 && decoded.k === "ssc" && decoded.c) {
        return {
          certificateId: decoded.c,
          userId: decoded.u || null,
          recipient: decoded.n || "ScholarScroll reader",
          issuedAt: decoded.d || null,
          books: (Array.isArray(decoded.b) ? decoded.b : []).map((book) => {
            if (Array.isArray(book)) return { title: String(book[0] || "Untitled"), author: String(book[1] || "") };
            if (book && typeof book === "object") return { title: String(book.title || "Untitled"), author: String(book.author || "") };
            return { title: String(book || "Untitled"), author: "" };
          }),
          rewardCode: decoded.r || "",
          /* Date-only values are treated as the end of that day. */
          rewardExpiresAt: decoded.e ? `${decoded.e}T23:59:59.999Z` : null,
          target: `Complete ${Config.AVID_READER_TARGET} books in ${Config.AVID_READER_WINDOW_DAYS} days`
        };
      }
      if (decoded.kind === "scholarscroll-certificate" && decoded.certificateId) {
        return {
          certificateId: decoded.certificateId,
          userId: decoded.userId || null,
          recipient: decoded.recipient || "ScholarScroll reader",
          issuedAt: decoded.issuedAt || null,
          books: Array.isArray(decoded.books) ? decoded.books : [],
          rewardCode: decoded.rewardCode || "",
          rewardExpiresAt: decoded.rewardExpiresAt || null,
          target: decoded.target || `Complete ${Config.AVID_READER_TARGET} books in ${Config.AVID_READER_WINDOW_DAYS} days`
        };
      }
      return null;
    }

    certificateVerifyUrl(achievement) {
      return `${window.location.href.split("#")[0]}#verify/${this.certificateToken(achievement)}`;
    }

    /**
     * A phone scanning a 127.0.0.1 URL can never reach the development machine.
     * For local demos the QR therefore carries a human-readable summary, which
     * every camera can display. On a hosted origin it carries the verification
     * URL so scanning opens the full record.
     */
    certificateQrPayload(achievement) {
      const shareBase = this.store.state.preferences.shareBaseUrl;
      if (shareBase) return `${shareBase}#verify/${this.certificateToken(achievement)}`;

      const hostname = window.location.hostname;
      const isLocal = window.location.protocol === "file:"
        || ["", "localhost", "127.0.0.1", "::1"].includes(hostname)
        || hostname.endsWith(".local");
      if (!isLocal) return this.certificateVerifyUrl(achievement);

      const owner = this.certificateOwner(achievement);
      const books = this.certificateBooksFor(achievement);
      return [
        "ScholarScroll certificate",
        owner?.name || "ScholarScroll reader",
        `Received: ${String(achievement.unlockedAt || "").slice(0, 10)}`,
        `Books: ${books.map((book) => book.title).join("; ")}`,
        `${books.length} books completed in ${Config.AVID_READER_WINDOW_DAYS} days`
      ].join("\n");
    }

    qrMarkup(text, label = "Certificate QR code") {
      try {
        if (typeof window.qrcode !== "function") throw new Error("QR generator is unavailable.");
        /* Error correction L keeps the module count low enough that the code
           remains readable at the on-screen size; the display is clean and
           digital, so extra recovery capacity is not needed. */
        const qr = window.qrcode(0, "L");
        qr.addData(text);
        qr.make();
        return qr.createSvgTag({ cellSize: 8, margin: 4, alt: label, title: label, scalable: true });
      } catch (error) {
        console.warn("Certificate QR code could not be generated.", error);
        return '<div class="qr-fallback">QR code unavailable</div>';
      }
    }

    downloadCertificateQr(certificateId) {
      const achievement = this.findAchievement(certificateId);
      if (!achievement) return;
      try {
        if (typeof window.qrcode !== "function") throw new Error("QR generator is unavailable.");
        const qr = window.qrcode(0, "L");
        qr.addData(this.certificateQrPayload(achievement));
        qr.make();
        /* The generator returns a lossless GIF data URL. Downloading it
           directly avoids a canvas round-trip that can stall on some
           embedded browsers. */
        const link = document.createElement("a");
        link.href = qr.createDataURL(12, 8);
        link.download = `scholarscroll-qr-${String(achievement.certificateId || achievement.id).slice(-8)}.gif`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        this.toast.show("QR code downloaded. Print it or scan it from another screen.", "success", 5000);
      } catch (error) {
        console.warn("Certificate QR download failed.", error);
        this.toast.show("The QR code could not be downloaded. Use the verification link instead.", "error");
      }
    }

    rewardExpired(achievement) {
      const expiresAt = dateValue(achievement.rewardExpiresAt);
      return expiresAt !== null && expiresAt < Date.now();
    }

    openPremiumForCertificate(certificateId) {
      const achievement = this.findAchievement(certificateId);
      this.router.navigate("premium");
      if (achievement) {
        this.toast.show("Every premium title is open to read — no voucher needed.", "success", 6500);
      }
    }

    copyVoucher(code) {
      const value = String(code || "").trim();
      if (!value) return;
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(value)
          .then(() => this.toast.show(`Voucher ${value} copied.`, "success"))
          .catch(() => this.toast.show("Copy failed. Select the voucher code manually.", "error"));
      } else {
        this.toast.show(`Voucher: ${value}`, "info", 7000);
      }
    }

    openVoucherClaim(bookKey, prefillCode = "") {
      const book = this.store.premiumBook(bookKey);
      if (!book) return;
      if (!this.store.currentUser) {
        this.pendingVoucherBookKey = bookKey;
        this.openLogin();
        return;
      }
      if (this.store.premiumUnlocked(this.store.currentUser.id, bookKey)) {
        this.toast.show("This premium book is already unlocked.", "info");
        return;
      }
      const vouchers = this.store.availableVouchers();
      const suggested = prefillCode || (vouchers.length === 1 ? vouchers[0].code : "");
      this.modal.open(`
        <form class="voucher-form" data-form="voucher-claim" data-book-key="${escapeHTML(bookKey)}">
          <p class="page-kicker">Premium unlock</p>
          <h2 id="dialog-title">Unlock “${escapeHTML(book.title)}”</h2>
          <p class="voucher-intro">A certificate voucher unlocks exactly one premium book, once. It cannot be reused or transferred.</p>
          <label for="voucher-code">Please enter your Voucher Code:</label>
          <input class="form-control" id="voucher-code" name="voucherCode" type="text" value="${escapeHTML(suggested)}" placeholder="SCHOLAR-XXXXXX" autocomplete="off" spellcheck="false" required>
          <p class="form-error" id="voucher-error" role="alert"></p>
          <div class="modal-actions">
            <button class="button button-secondary" type="button" data-action="close-modal">Cancel</button>
            <button class="button" type="submit">Unlock this book</button>
          </div>
        </form>
      `, "#voucher-code");
    }

    submitVoucherClaim(form) {
      const bookKey = form.dataset.bookKey;
      const input = form.querySelector("#voucher-code");
      const error = form.querySelector("#voucher-error");
      const code = String(new FormData(form).get("voucherCode") || "").trim();
      if (error) error.textContent = "";
      const result = this.store.redeemVoucher(code, bookKey);
      if (!result.ok) {
        if (error) error.textContent = result.error;
        input?.focus();
        input?.select();
        return;
      }
      this.modal.close();
      if (this.router.current().startsWith("verify/")) this.router.resolve();
      else this.refreshView();
      this.toast.show(`“${result.book.title}” unlocked. Voucher ${result.voucher.code} has now been used.`, "success", 8500);
    }

    badgeMarkup(badge) {
      const owner = Config.users.find((user) => user.id === badge.userId) || this.store.currentUser;
      const firstName = owner.name.split(" ")[0];
      const milestone = streakShort(badge.days);
      return `
        <article class="badge-award" aria-label="${escapeHTML(badge.title)} badge for ${escapeHTML(owner.name)}">
          <div class="badge-award-medal" aria-hidden="true"><strong>${badge.days}</strong><span>${badge.days === 1 ? "DAY" : "DAYS"}</span></div>
          <p class="badge-award-kicker">ScholarScroll achievement</p>
          <h2 id="dialog-title">${escapeHTML(badge.title)}</h2>
          <p class="badge-award-recipient">Awarded to <strong>${escapeHTML(owner.name)}</strong></p>
          <p class="badge-award-copy">Congratulations, ${escapeHTML(firstName)}! You read on ${badge.days} consecutive ${pluralize(badge.days, "day")} — ${escapeHTML(milestone)} of showing up for yourself, one page at a time. Your consistency is worth celebrating.</p>
          <div class="badge-award-footer"><span><strong>${formatDate(badge.unlockedAt)}</strong>Date earned</span><span><strong>${escapeHTML(badge.id.slice(-8).toUpperCase())}</strong>Badge ID</span></div>
        </article>
      `;
    }

    openBadge(badgeId) {
      const badge = (this.store.state.badges || []).find((item) => item.id === badgeId);
      if (!badge) return;
      this.modal.open(`${this.badgeMarkup(badge)}<div class="modal-actions"><button class="button button-secondary" type="button" data-action="close-modal">Close</button><button class="button" type="button" data-action="print-badge">Print badge</button></div>`, "[data-action='close-modal']");
    }

    certificateMarkup(achievement, dialog = false) {
      const owner = this.certificateOwner(achievement);
      const books = this.certificateBooksFor(achievement);
      const certificateId = achievement.certificateId || achievement.id;
      const token = this.certificateToken(achievement);
      const qrPayload = this.certificateQrPayload(achievement);
      const shareBase = this.store.state.preferences.shareBaseUrl;
      const qrIsLink = Boolean(shareBase) || !qrPayload.startsWith("ScholarScroll certificate");
      return `
        <article class="certificate" aria-label="Avid Reader certificate for ${escapeHTML(owner.name)}">
          <div class="certificate-frame">
            <div class="certificate-ornament" aria-hidden="true">✦</div>
            <p class="certificate-kicker">ScholarScroll · Online Student Library</p>
            <h2 ${dialog ? 'id="dialog-title"' : ""}>Certificate of Reading Achievement</h2>
            <p class="certificate-presented">This certificate is proudly presented to</p>
            <p class="certificate-name">${escapeHTML(owner.name)}</p>
            <p class="certificate-copy">for completing <strong>${books.length} ${pluralize(books.length, "book")}</strong> within ${Config.AVID_READER_WINDOW_DAYS} days — a testament to hard work, dedication and consistency.</p>
            <ul class="certificate-books">${books.map((book) => `<li><strong>${escapeHTML(book.title)}</strong><span>${escapeHTML(book.author)}</span></li>`).join("")}</ul>
            <div class="certificate-meta">
              <span><strong>${formatDate(achievement.unlockedAt)}</strong>Date received</span>
              <span><strong>${books.length}</strong>Books completed</span>
              <span><strong>${escapeHTML(certificateId.slice(-10).toUpperCase())}</strong>Certificate ID</span>
            </div>
            <div class="certificate-reward">
              <div><span class="page-kicker">A note of congratulations</span><h3>Hard work, dedication and consistency</h3><p>Finishing ${books.length} ${pluralize(books.length, "book")} in ${Config.AVID_READER_WINDOW_DAYS} days is a real achievement. Keep the habit going — every premium title in the library is open to you, free, with nothing to unlock.</p></div>
              <div class="certificate-reward-actions"><button class="button button-small button-secondary" type="button" data-action="claim-reward" data-certificate-id="${escapeHTML(certificateId)}">Browse premium books</button></div>
            </div>
            <div class="certificate-qr-row">
              <div class="certificate-qr">${this.qrMarkup(qrPayload, `QR code for ${owner.name}'s certificate`)}<span>Scan for details</span></div>
              <div class="certificate-qr-copy">
                <p class="certificate-fineprint">${qrIsLink
                  ? `Scanning opens the full verification record with the recipient's name, the date received and the books completed.`
                  : `Scanning reveals the recipient's name, the date received and the books completed.`}</p>
                <p class="certificate-qr-fallback"><a class="text-link" href="#verify/${token}" data-route-link>Open the verification page</a> <button class="text-button" type="button" data-action="copy-verify-link" data-certificate-id="${escapeHTML(certificateId)}">Copy link</button> <button class="text-button" type="button" data-action="download-qr" data-certificate-id="${escapeHTML(certificateId)}">Download QR</button></p>
                <p class="certificate-fineprint">${qrIsLink
                  ? `The QR links to ${escapeHTML(shareBase || window.location.hostname)} and works on any phone that can reach that address.`
                  : `This demo is served from ${escapeHTML(window.location.hostname || "a local file")}, which a phone cannot reach. The QR carries a readable summary here. To scan a working link, <a class="text-link" href="#settings" data-route-link>set a phone-friendly share link</a> in Settings.`}</p>
              </div>
            </div>
          </div>
        </article>
      `;
    }

    openCertificate(certificateId = null) {
      const achievements = this.store.state.achievements.filter((item) => item.userId === this.store.currentUser?.id);
      const achievement = certificateId
        ? this.findAchievement(certificateId)
        : achievements[achievements.length - 1] || this.store.challenge().achievement;
      if (!achievement) return;
      this.modal.open(`
        ${this.certificateMarkup(achievement, true)}
        <div class="modal-actions">
          <button class="button button-secondary" type="button" data-action="close-modal">Close</button>
          <button class="button button-secondary" type="button" data-action="claim-reward" data-certificate-id="${escapeHTML(achievement.certificateId || achievement.id)}">Browse premium books</button>
          <button class="button" type="button" data-action="print-certificate">Print</button>
        </div>
      `);
    }

    copyVerifyLink(certificateId) {
      const achievement = this.findAchievement(certificateId);
      if (!achievement) return;
      const url = this.certificateVerifyUrl(achievement);
      const done = () => this.toast.show("Certificate verification link copied.", "success");
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(url).then(done).catch(() => this.toast.show("Copy failed. Open the certificate QR code instead.", "error"));
      } else {
        this.toast.show("Clipboard access is unavailable. Scan the QR code instead.", "warning");
      }
    }

    renderVerifyRoute(token) {
      this.reader?.destroy();
      this.reader = null;
      document.body.classList.remove("reader-mode");
      this.modal.close();
      this.renderChrome();
      this.verifyPayload = null;

      let payload = null;
      payload = this.decodeCertificateToken(token);

      if (!payload) {
        this.elements.routeView.innerHTML = `
          <section class="content-page verify-page">
            <article class="verify-card verify-invalid">
              <span class="verify-stamp">Unreadable record</span>
              <h1>This certificate link is not valid</h1>
              <p>The QR code may have been shortened or altered. Ask the recipient for a fresh certificate link.</p>
              <a class="button" href="#store" data-route-link>Return to the library</a>
            </article>
          </section>
        `;
        this.setNavigation({});
        this.updateDocumentMeta({ title: "Certificate verification · ScholarScroll", description: "A certificate verification link for ScholarScroll." });
        this.elements.routeAnnouncer.textContent = "Certificate link could not be read.";
        this.elements.main?.focus({ preventScroll: true });
        return;
      }

      this.verifyPayload = payload;
      const achievement = this.findAchievement(payload.certificateId);
      const localBooks = achievement ? this.certificateBooksFor(achievement) : [];
      const books = (Array.isArray(payload.books) ? payload.books : []).map((book) => ({
        ...book,
        author: book.author || localBooks.find((item) => item.title === book.title)?.author || ""
      }));
      const title = `Certificate for ${payload.recipient} · ScholarScroll`;
      this.elements.routeView.innerHTML = `
        <section class="content-page verify-page">
          <article class="verify-card">
            <div class="verify-header">
              <span class="verify-stamp">Certificate record</span>
              <p class="page-kicker">ScholarScroll certificate verification</p>
              <h1>Certificate of Reading Achievement</h1>
              <p class="verify-recipient">Awarded to <strong>${escapeHTML(payload.recipient)}</strong></p>
            </div>
            <dl class="verify-details">
              <div><dt>Date received</dt><dd>${formatDate(payload.issuedAt)}</dd></div>
              <div><dt>Books completed</dt><dd>${books.length}</dd></div>
              <div><dt>Target</dt><dd>${escapeHTML(payload.target || `${Config.AVID_READER_TARGET} books in ${Config.AVID_READER_WINDOW_DAYS} days`)}</dd></div>
              <div><dt>Certificate ID</dt><dd>${escapeHTML(String(payload.certificateId).slice(-12).toUpperCase())}</dd></div>
            </dl>
            <section class="verify-books"><h2>Books completed at the time</h2><ul>${books.map((book) => `<li><strong>${escapeHTML(book.title)}</strong>${book.author ? `<span>${escapeHTML(book.author)}</span>` : ""}</li>`).join("")}</ul></section>
            <section class="verify-reward">
              <span class="page-kicker">Congratulations</span>
              <h2>Hard work, dedication and consistency</h2>
              <p>${escapeHTML(payload.recipient)} completed ${books.length} ${pluralize(books.length, "book")} in ${Config.AVID_READER_WINDOW_DAYS} days. Every premium title in ScholarScroll is open to read, free, with nothing to unlock.</p>
            </section>
            <p class="verify-note">This page is generated from data embedded in the certificate QR code. It is a static demonstration record, not a server-verified credential.</p>
            <div class="verify-actions"><a class="button button-secondary" href="#premium" data-route-link>Browse premium books</a><a class="button button-secondary" href="#store" data-route-link>Explore ScholarScroll</a><button class="button button-secondary" type="button" data-action="print-certificate">Print this record</button></div>
          </article>
        </section>
      `;
      this.setNavigation({});
      this.updateDocumentMeta({ title, description: `A ScholarScroll reading certificate awarded to ${payload.recipient}.` });
      this.elements.routeAnnouncer.textContent = `Certificate for ${payload.recipient} loaded.`;
      this.elements.main?.focus({ preventScroll: true });
    }

    async updateStorageStats() {
      const nodes = document.querySelectorAll("[data-storage-estimate]");
      if (!nodes.length) return;
      let label = "Storage details are unavailable in this browser.";
      try {
        const estimate = await navigator.storage?.estimate?.();
        if (estimate && Number.isFinite(Number(estimate.usage))) {
          const used = formatBytes(estimate.usage);
          const quota = Number(estimate.quota);
          label = Number.isFinite(quota) && quota > 0
            ? `${used} used of ${formatBytes(quota)} available`
            : `${used} used`;
        }
      } catch {
        /* Storage estimation is a progressive enhancement. */
      }
      nodes.forEach((node) => { node.textContent = label; });
    }

    confirmDeleteCustomBook(bookKey) {
      const book = this.findBook(bookKey);
      if (!book) return;
      this.modal.open(`
        <div class="confirm-icon">!</div>
        <div class="modal-heading"><p class="page-kicker">Delete PDF</p><h2 id="dialog-title">Remove “${escapeHTML(book.title)}”?</h2><p>The PDF bytes will be deleted from this browser's IndexedDB. Reading history entries for this upload are also removed. This cannot be undone.</p></div>
        <div class="modal-actions"><button class="button button-secondary" type="button" data-action="close-modal">Cancel</button><button class="button button-danger" type="button" data-action="confirm-delete-custom-book" data-book-key="${escapeHTML(bookKey)}">Delete PDF</button></div>
      `, "[data-action='close-modal']");
    }

    async deleteCustomBook(bookKey) {
      const book = this.findBook(bookKey);
      try {
        await this.cache.delete(bookKey);
      } catch (error) {
        console.warn("The offline PDF record could not be removed.", error);
      }
      this.store.removeCustomBook(bookKey);
      this.bookIndex.delete(bookKey);
      this.adminStatus = `${book?.title || "The PDF"} was removed from this browser.`;
      this.modal.close();
      this.refreshView();
      this.toast.show(`${book?.title || "The PDF"} deleted.`, "success");
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
      const app = new ScholarScrollApp();
      app.init();
      window.ScholarScroll = app;
    } catch (error) {
      console.error("ScholarScroll failed to start.", error);
      document.body.innerHTML = `<main style="max-width:680px;margin:12vh auto;padding:24px;font-family:Inter,sans-serif;color:#f5f7fa"><h1>ScholarScroll could not start</h1><p style="color:#7f8b9b">Check the browser console for details, then reload the page.</p></main>`;
    }
  });
})();
