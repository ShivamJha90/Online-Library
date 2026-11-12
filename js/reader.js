/*
 * ScholarScroll dual-engine reader
 * --------------------------------
 * Gutendex text/HTML is rendered as sanitized, inert markup. Administrator
 * PDFs are rendered by PDF.js onto canvas. Shared controls handle notes,
 * stable bookmarks, reading preferences, completion tracking, and
 * browser-managed IndexedDB offline storage.
 */
(() => {
  "use strict";

  const Config = window.LibraryConfig;
  if (!Config) throw new Error("LibraryConfig must load before reader.js.");

  const safeHttpsUrl = (value) => {
    try {
      const url = new URL(String(value));
      return url.protocol === "https:" ? url.href : null;
    } catch {
      return null;
    }
  };

  /**
   * Reader documents may be remote HTTPS files or same-origin bundled assets.
   * Relative paths are resolved against the current page, but credentials,
   * javascript: URLs and cross-origin HTTP are rejected.
   */
  const safeDocumentUrl = (value) => {
    try {
      const url = new URL(String(value), window.location.href);
      if (url.protocol === "https:") return url.href;
      if (url.protocol === "http:" && url.origin === window.location.origin) return url.href;
      return null;
    } catch {
      return null;
    }
  };

  const escapeHTML = (value = "") => String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;"
  })[character]);

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  /**
   * Wait for a paint, but never hang. Chromium can pause
   * requestAnimationFrame for occluded or background tabs, so a timeout is a
   * required fallback for the reader to finish opening in every context.
   */
  const afterNextPaint = () => new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    window.requestAnimationFrame(() => window.requestAnimationFrame(finish));
    window.setTimeout(finish, 150);
  });

  const START_MARKER = /\*\*\*\s*START OF (?:THE|THIS) PROJECT GUTENBERG EBOOK[^\n]*\*\*\*/i;
  const END_MARKER = /\*\*\*\s*END OF (?:THE|THIS) PROJECT GUTENBERG EBOOK[^\n]*\*\*\*/i;

  /** Remove the licence wrapper Gutenberg adds around every plain text file. */
  const stripGutenbergWrapper = (text) => {
    let cleaned = String(text || "");
    const start = cleaned.match(START_MARKER);
    if (start) cleaned = cleaned.slice(start.index + start[0].length);
    const end = cleaned.match(END_MARKER);
    if (end) cleaned = cleaned.slice(0, end.index);
    return cleaned.replace(/^\s+/, "").trim();
  };

  const charsetFromMime = (mimeType) => {
    const match = String(mimeType || "").match(/charset\s*=\s*["']?([a-z0-9_-]+)/i);
    return match ? match[1] : "utf-8";
  };

  const decodeBytes = (bytes, mimeType) => {
    try {
      return new TextDecoder(charsetFromMime(mimeType), { fatal: false }).decode(bytes).replace(/\0/g, "");
    } catch {
      return new TextDecoder("utf-8", { fatal: false }).decode(bytes).replace(/\0/g, "");
    }
  };

  const ALLOWED_TAGS = new Set([
    "p", "div", "span", "br", "hr", "h1", "h2", "h3", "h4", "h5", "h6",
    "em", "strong", "i", "b", "u", "small", "blockquote", "ul", "ol", "li",
    "dl", "dt", "dd", "pre", "code", "sup", "sub", "table", "thead", "tbody",
    "tfoot", "tr", "th", "td", "figure", "figcaption", "section", "article",
    "a", "img"
  ]);

  /**
   * Rebuild untrusted book HTML from a strict allowlist. No attributes survive
   * except safe links and https images, and no event handlers or styles can be
   * introduced by the source document.
   */
  const sanitizeHtmlToFragment = (html) => {
    const parsed = new DOMParser().parseFromString(String(html || ""), "text/html");
    parsed.querySelectorAll("script, style, noscript, iframe, object, embed, svg, math, link, meta, base, form, input, button, textarea, select").forEach((node) => node.remove());
    const fragment = document.createDocumentFragment();

    const copyNode = (node, target) => {
      if (node.nodeType === Node.TEXT_NODE) {
        target.append(document.createTextNode(node.nodeValue || ""));
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      const tag = node.tagName.toLowerCase();
      if (!ALLOWED_TAGS.has(tag)) {
        [...node.childNodes].forEach((child) => copyNode(child, target));
        return;
      }

      if (tag === "img") {
        const source = safeHttpsUrl(node.getAttribute("src"));
        if (!source) return;
        const image = document.createElement("img");
        image.src = source;
        image.alt = node.getAttribute("alt") || "";
        image.loading = "lazy";
        image.referrerPolicy = "no-referrer";
        target.append(image);
        return;
      }

      const element = document.createElement(tag);
      if (tag === "a") {
        const href = safeHttpsUrl(node.getAttribute("href"));
        if (!href) {
          [...node.childNodes].forEach((child) => copyNode(child, target));
          return;
        }
        element.href = href;
        element.target = "_blank";
        element.rel = "noopener noreferrer nofollow";
        element.title = node.getAttribute("title") || "";
      }
      [...node.childNodes].forEach((child) => copyNode(child, element));
      target.append(element);
    };

    [...(parsed.body?.childNodes || [])].forEach((node) => copyNode(node, fragment));
    return fragment;
  };

  /**
   * Generic browser document cache.
   *
   * ArrayBuffers remain inside IndexedDB rather than triggering an OS-level
   * download. IndexedDB is browser-managed storage, not encrypted DRM; users
   * with local browser control can inspect it. Server authorization is still
   * required for protected production documents.
   */
  class DocumentCacheService {
    constructor() {
      this.databaseName = Config.CACHE_DATABASE_NAME;
      this.storeName = Config.CACHE_STORE_NAME;
      this.databasePromise = null;
    }

    open() {
      if (this.databasePromise) return this.databasePromise;
      if (!window.indexedDB) return Promise.reject(new Error("IndexedDB is unavailable."));

      this.databasePromise = new Promise((resolve, reject) => {
        const request = window.indexedDB.open(this.databaseName, 1);
        request.onupgradeneeded = () => {
          const database = request.result;
          if (!database.objectStoreNames.contains(this.storeName)) {
            database.createObjectStore(this.storeName, { keyPath: "key" });
          }
        };
        request.onsuccess = () => {
          request.result.onversionchange = () => request.result.close();
          resolve(request.result);
        };
        request.onerror = () => reject(request.error || new Error("Could not open offline storage."));
        request.onblocked = () => reject(new Error("Offline storage is blocked by another tab."));
      }).catch((error) => {
        // Allow a later retry after a transient blocked/quota failure.
        this.databasePromise = null;
        throw error;
      });
      return this.databasePromise;
    }

    async get(key, sourceIdentity = null) {
      const database = await this.open();
      return new Promise((resolve, reject) => {
        const request = database.transaction(this.storeName, "readonly").objectStore(this.storeName).get(key);
        request.onsuccess = () => {
          const record = request.result;
          if (!record || !(record.bytes instanceof ArrayBuffer)) return resolve(null);
          if (sourceIdentity && record.sourceIdentity !== sourceIdentity) return resolve(null);
          resolve(record);
        };
        request.onerror = () => reject(request.error || new Error("Could not read the offline document."));
      });
    }

    async put({ key, sourceIdentity, engine, mimeType, title, bytes }) {
      if (!(bytes instanceof ArrayBuffer) || !bytes.byteLength) throw new Error("Cannot cache an empty document.");
      const database = await this.open();
      return new Promise((resolve, reject) => {
        const transaction = database.transaction(this.storeName, "readwrite");
        transaction.objectStore(this.storeName).put({
          key,
          sourceIdentity,
          engine,
          mimeType,
          title,
          bytes,
          cachedAt: new Date().toISOString()
        });
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error || new Error("Could not save the offline document."));
        transaction.onabort = () => reject(transaction.error || new Error("The offline save was cancelled."));
      });
    }

    async delete(key) {
      const database = await this.open();
      return new Promise((resolve, reject) => {
        const transaction = database.transaction(this.storeName, "readwrite");
        transaction.objectStore(this.storeName).delete(key);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error || new Error("Could not remove the offline document."));
      });
    }
  }

  /** Canvas-only PDF.js engine for browser-cached administrator uploads. */
  class PdfCanvasEngine {
    constructor({ viewport, canvas, onLocation, getPdfJs, getViewOptions }) {
      this.type = "pdf";
      this.viewport = viewport;
      this.canvas = canvas;
      this.onLocation = onLocation;
      this.getPdfJs = getPdfJs;
      this.getViewOptions = getViewOptions;
      this.document = null;
      this.loadingTask = null;
      this.renderTask = null;
      this.currentPage = 1;
      this.totalPages = 1;
      this.renderSequence = 0;
      this.destroyed = false;
    }

    async load(bytes, record) {
      const signature = String.fromCharCode(...new Uint8Array(bytes, 0, Math.min(5, bytes.byteLength)));
      if (signature !== "%PDF-") throw new Error("The uploaded file is not a valid PDF document.");

      const pdfjs = await this.getPdfJs();
      this.loadingTask = pdfjs.getDocument({
        data: new Uint8Array(bytes.slice(0)),
        isEvalSupported: false,
        useSystemFonts: true
      });
      this.document = await this.loadingTask.promise;
      this.totalPages = this.document.numPages;
      this.currentPage = Math.min(Math.max(1, Number(record.lastVisitedPage) || 1), this.totalPages);
      await this.render(this.currentPage);
    }

    async render(pageNumber) {
      const sequence = ++this.renderSequence;
      if (this.renderTask) {
        try { this.renderTask.cancel(); } catch { /* previous render already ended */ }
      }

      const page = await this.document.getPage(pageNumber);
      if (this.destroyed || sequence !== this.renderSequence) return;
      const baseViewport = page.getViewport({ scale: 1 });
      const options = this.getViewOptions?.() || {};
      const zoom = clamp(Number(options.zoom) || 1, 0.5, 2.5);
      const landscape = options.layout === "landscape";
      const availableWidth = Math.max(280, Math.min(this.viewport.clientWidth - 48, landscape ? 1400 : 980));
      const availableHeight = Math.max(320, this.viewport.clientHeight - 48);
      // Portrait fits the page width and scrolls vertically. Landscape fits the
      // full page height so the whole spread is visible at once.
      const fitScale = landscape
        ? Math.min(availableHeight / baseViewport.height, availableWidth / baseViewport.width)
        : availableWidth / baseViewport.width;
      const viewport = page.getViewport({ scale: fitScale * zoom });
      const outputScale = Math.min(window.devicePixelRatio || 1, 2);
      const context = this.canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error("Canvas rendering is unavailable.");

      this.canvas.width = Math.floor(viewport.width * outputScale);
      this.canvas.height = Math.floor(viewport.height * outputScale);
      this.canvas.style.width = `${Math.floor(viewport.width)}px`;
      this.canvas.style.height = `${Math.floor(viewport.height)}px`;
      this.canvas.hidden = false;
      this.renderTask = page.render({
        canvasContext: context,
        viewport,
        transform: outputScale === 1 ? null : [outputScale, 0, 0, outputScale, 0, 0]
      });
      try {
        await this.renderTask.promise;
      } catch (error) {
        if (error?.name !== "RenderingCancelledException") throw error;
        return;
      }
      if (this.destroyed || sequence !== this.renderSequence) return;

      this.currentPage = pageNumber;
      this.canvas.setAttribute("aria-label", `PDF page ${pageNumber} of ${this.totalPages}`);
      this.onLocation({ page: pageNumber, totalPages: this.totalPages, scrollPercent: null, engine: this.type });
    }

    goTo(pageNumber) {
      const page = Math.min(this.totalPages, Math.max(1, Number.parseInt(pageNumber, 10) || this.currentPage));
      return this.render(page);
    }

    previous() { return this.goTo(this.currentPage - 1); }
    next() { return this.goTo(this.currentPage + 1); }
    resize() { if (this.document) return this.render(this.currentPage); }

    destroy() {
      this.destroyed = true;
      try { this.renderTask?.cancel(); } catch { /* already complete */ }
      this.loadingTask?.destroy?.();
      this.document?.destroy?.();
    }
  }

  /** Protected scroll renderer for Project Gutenberg text and HTML editions. */
  class ProtectedTextEngine {
    constructor({ viewport, content, onLocation }) {
      this.type = "text";
      this.viewport = viewport;
      this.content = content;
      this.onLocation = onLocation;
      this.currentPage = 1;
      this.totalPages = 1;
      this.lastPercent = 0;
      this.scrollTimer = null;
      this.handleScroll = this.handleScroll.bind(this);
    }

    async load(payload, record) {
      // Both branches avoid unsanitized innerHTML. HTML is rebuilt from an
      // allowlist before insertion; plain text stays one inert text node.
      if (payload.fragment) this.content.replaceChildren(payload.fragment);
      else this.content.textContent = payload.text || "";
      this.content.hidden = false;
      this.viewport.addEventListener("scroll", this.handleScroll, { passive: true });

      await afterNextPaint();
      const savedPercent = clamp(Number(record.lastScrollPercent) || 0, 0, 100);
      const maxScroll = Math.max(0, this.viewport.scrollHeight - this.viewport.clientHeight);
      this.viewport.scrollTop = (savedPercent / 100) * maxScroll;
      this.reportLocation(true);
    }

    calculateLocation() {
      const viewportHeight = Math.max(1, this.viewport.clientHeight);
      const maxScroll = Math.max(0, this.viewport.scrollHeight - viewportHeight);
      const scrollPercent = maxScroll ? (this.viewport.scrollTop / maxScroll) * 100 : 100;
      const totalPages = Math.max(1, Math.ceil(this.viewport.scrollHeight / viewportHeight));
      const page = Math.min(totalPages, Math.floor(this.viewport.scrollTop / viewportHeight) + 1);
      return { page, totalPages, scrollPercent, engine: this.type };
    }

    reportLocation(force = false) {
      const location = this.calculateLocation();
      const pageChanged = location.page !== this.currentPage;
      this.currentPage = location.page;
      this.totalPages = location.totalPages;
      this.lastPercent = location.scrollPercent;
      if (force || pageChanged || Math.abs(location.scrollPercent - (this.reportedPercent || 0)) >= 0.5) {
        this.reportedPercent = location.scrollPercent;
        this.onLocation(location);
      }
    }

    handleScroll() {
      window.clearTimeout(this.scrollTimer);
      this.scrollTimer = window.setTimeout(() => this.reportLocation(), 140);
    }

    goTo(pageNumber) {
      const page = Math.min(this.totalPages, Math.max(1, Number.parseInt(pageNumber, 10) || this.currentPage));
      this.viewport.scrollTo({ top: (page - 1) * this.viewport.clientHeight, behavior: "smooth" });
      window.setTimeout(() => this.reportLocation(true), 220);
    }

    goToPercent(percent) {
      const maxScroll = Math.max(0, this.viewport.scrollHeight - this.viewport.clientHeight);
      this.viewport.scrollTo({ top: (clamp(Number(percent) || 0, 0, 100) / 100) * maxScroll, behavior: "smooth" });
      window.setTimeout(() => this.reportLocation(true), 220);
    }

    getChapters() {
      return [...this.content.querySelectorAll("h1, h2, h3")]
        .map((heading, index) => ({
          index,
          label: heading.textContent.trim().replace(/\s+/g, " "),
          top: heading.getBoundingClientRect().top - this.viewport.getBoundingClientRect().top + this.viewport.scrollTop
        }))
        .filter((chapter) => chapter.label);
    }

    scrollToChapter(index) {
      const chapter = this.getChapters()[index];
      if (!chapter) return;
      this.viewport.scrollTo({ top: Math.max(0, chapter.top - 24), behavior: "smooth" });
      window.setTimeout(() => this.reportLocation(true), 260);
    }

    previous() { this.goTo(this.currentPage - 1); }
    next() { this.goTo(this.currentPage + 1); }

    resize() {
      const percent = this.lastPercent;
      window.requestAnimationFrame(() => {
        const maxScroll = Math.max(0, this.viewport.scrollHeight - this.viewport.clientHeight);
        this.viewport.scrollTop = (percent / 100) * maxScroll;
        this.reportLocation(true);
      });
    }

    destroy() {
      window.clearTimeout(this.scrollTimer);
      this.viewport.removeEventListener("scroll", this.handleScroll);
    }
  }

  class ReaderManager {
    constructor({ container, cache, state, preferences, savePreferences, isComplete, onClose, notify }) {
      this.container = container;
      this.cache = cache;
      this.state = state;
      this.preferencesApi = preferences;
      this.savePreferences = savePreferences;
      this.isComplete = isComplete;
      this.onClose = onClose;
      this.notify = notify;
      this.engine = null;
      this.book = null;
      this.currentBytes = null;
      this.currentMimeType = null;
      this.currentSourceIdentity = null;
      this.notePage = null;
      this.noteTimer = null;
      this.resizeTimer = null;
      this.lastLocation = null;
      this.lastSavedAt = 0;
      this.destroyed = false;
      this.handleResize = this.handleResize.bind(this);
      this.handleKeydown = this.handleKeydown.bind(this);
      this.handleFullscreenChange = this.handleFullscreenChange.bind(this);
    }

    async open(book) {
      this.book = book;
      this.destroyed = false;
      document.body.classList.add("reader-mode");
      this.container.innerHTML = this.shell(book);
      // A book can be opened from a scrolled catalog, so reset the document
      // scroll before the fixed reader overlay is painted. Otherwise the
      // toolbar starts above the viewport and looks missing.
      window.scrollTo(0, 0);
      this.bindElements();
      this.bindControls();
      this.applyPreferences();
      if (window.matchMedia?.("(max-width: 760px)").matches) this.root.classList.add("notes-closed");

      try {
        const source = await this.loadSource(book);
        if (this.destroyed) return;
        this.currentBytes = source.bytes.slice(0);
        this.currentMimeType = source.mimeType;
        this.currentSourceIdentity = source.sourceIdentity;
        this.offlineInput.checked = source.cached;
        this.offlineInput.disabled = book.source === "custom";
        this.offlineStatus.textContent = book.source === "custom"
          ? "Administrator PDF stored in IndexedDB"
          : source.cached ? "Loaded from this device" : "Online reader session";

        const record = this.state.getRecord(book.key);
        const completed = Boolean(this.isComplete?.(book.key));
        if (completed) {
          this.completeButton.disabled = true;
          this.completeButton.querySelector("span").textContent = "Completed";
        }

        if (book.reader.engine === "pdf") {
          this.engineLabel.textContent = "PDF.js Canvas";
          this.locationLabel.textContent = "Page";
          this.pageBookmarkLabel.textContent = "Bookmark page";
          this.chaptersSection.hidden = true;
          this.engine = new PdfCanvasEngine({
            viewport: this.viewport,
            canvas: this.canvas,
            onLocation: (location) => this.handleLocation(location),
            getPdfJs: () => this.waitForPdfJs(),
            getViewOptions: () => {
              const preferences = this.preferencesApi();
              return { zoom: preferences.pdfZoom, layout: preferences.layout };
            }
          });
          await this.engine.load(source.bytes, record);
        } else {
          this.engineLabel.textContent = "Protected Text";
          this.locationLabel.textContent = "Page";
          this.pageBookmarkLabel.textContent = "Bookmark position";
          const content = this.prepareTextContent(source.bytes, source.mimeType);
          this.engine = new ProtectedTextEngine({
            viewport: this.viewport,
            content: this.textSurface,
            onLocation: (location) => this.handleLocation(location)
          });
          await this.engine.load(content, record);
          this.buildChapters();
        }
        if (!this.destroyed) {
          this.loading.hidden = true;
          this.applyPreferences();
        }
      } catch (error) {
        if (this.destroyed || error?.name === "AbortError") return;
        console.error("Reader failed to open.", error);
        this.showError(error.message || "The digital edition could not be opened.");
      }
    }

    shell(book) {
      const engineName = book.reader?.engine === "pdf" ? "PDF.js Canvas" : "Protected Text";
      return `
        <section class="reader-shell" id="reader-root" aria-label="Read-only e-reader">
          <header class="reader-toolbar">
            <div class="reader-book-identity">
              <button class="reader-icon-button" id="reader-exit" type="button" aria-label="Close reader">←</button>
              <div><span>Read-Only Mode · <b id="reader-engine-label">${engineName}</b></span><strong>${escapeHTML(book.title)}</strong><small>${escapeHTML(book.author)}</small></div>
            </div>
            <div class="reader-pagination" aria-label="Reader navigation">
              <button class="reader-icon-button" id="reader-previous" type="button" aria-label="Previous page">‹</button>
              <label id="reader-location-label" for="reader-page-input">Page</label>
              <input id="reader-page-input" type="number" min="1" value="1" inputmode="numeric" aria-label="Reader page number">
              <span id="reader-page-total">/ —</span>
              <button class="reader-icon-button" id="reader-next" type="button" aria-label="Next page">›</button>
            </div>
            <div class="reader-toolbar-actions">
              <button class="reader-tool-button" id="reader-page-bookmark" type="button" aria-pressed="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12v18l-6-4-6 4V3Z"></path></svg><span id="reader-page-bookmark-label">Bookmark page</span></button>
              <button class="reader-tool-button reader-complete" id="reader-complete" type="button" aria-label="Mark book complete"><b aria-hidden="true">✓</b><span>Mark complete</span></button>
              <label class="offline-control"><input id="reader-offline" type="checkbox"><span class="toggle-track" aria-hidden="true"><i></i></span><span>Available Offline</span></label>
              <div class="reader-zoom-controls" role="group" aria-label="Zoom controls">
                <button class="reader-zoom-button" type="button" data-reader-zoom="out" aria-label="Zoom out">−</button>
                <button class="reader-zoom-value" type="button" data-reader-zoom="reset" aria-label="Reset zoom"><span data-reader-zoom-label>100%</span></button>
                <button class="reader-zoom-button" type="button" data-reader-zoom="in" aria-label="Zoom in">+</button>
              </div>
              <button class="reader-icon-button" id="reader-theme-toggle" type="button" aria-label="Switch to dark reading theme" title="Toggle light and dark reading theme">☾</button>
              <button class="reader-icon-button" id="reader-fullscreen" type="button" aria-label="Enter full screen" aria-pressed="false" title="Toggle full screen (F)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4H4v5M15 4h5v5M9 20H4v-5M15 20h5v-5"></path></svg></button>
              <button class="reader-icon-button" id="reader-settings-toggle" type="button" aria-controls="reader-settings" aria-expanded="false" aria-label="Reading appearance settings">Aa</button>
              <button class="reader-icon-button notes-toggle" id="reader-notes-toggle" type="button" aria-controls="reader-notes" aria-expanded="true" aria-label="Toggle notes sidebar">✎</button>
            </div>
            <div class="reader-settings-popover" id="reader-settings" hidden>
              <div class="reader-setting"><span>Text size</span><div class="reader-setting-buttons"><button type="button" data-reader-font="down" aria-label="Decrease text size">A−</button><button type="button" data-reader-font="up" aria-label="Increase text size">A+</button></div></div>
              <div class="reader-setting"><span>Zoom</span><div class="reader-setting-buttons"><button type="button" data-reader-zoom="out" aria-label="Zoom out">−</button><button type="button" data-reader-zoom="reset" aria-label="Reset zoom"><span data-reader-zoom-label>100%</span></button><button type="button" data-reader-zoom="in" aria-label="Zoom in">+</button></div></div>
              <div class="reader-setting"><span>Theme</span><div class="reader-setting-buttons"><button type="button" data-reader-theme="paper">Light</button><button type="button" data-reader-theme="sepia">Sepia</button><button type="button" data-reader-theme="night">Dark</button></div></div>
              <div class="reader-setting"><span>Page layout</span><div class="reader-setting-buttons"><button type="button" data-reader-layout="portrait">Portrait</button><button type="button" data-reader-layout="landscape">Landscape</button></div></div>
              <label class="reader-setting"><span>Line spacing</span><select id="reader-line-height"><option value="1.6">Compact</option><option value="1.95">Comfortable</option><option value="2.2">Relaxed</option></select></label>
            </div>
            <div class="reader-progress-track" aria-hidden="true"><div class="reader-progress-fill" id="reader-progress-fill"></div></div>
          </header>
          <div class="reader-workspace">
            <main class="reader-stage" id="reader-stage">
              <div class="reader-loading" id="reader-loading" role="status"><span class="reader-spinner" aria-hidden="true"></span><p id="reader-loading-text">Checking browser storage…</p></div>
              <canvas id="pdf-canvas" tabindex="0" hidden aria-label="PDF page canvas"></canvas>
              <article class="text-reader-content" id="text-reader-content" tabindex="0" hidden aria-label="Protected book text"></article>
              <p class="reader-security-note">Protected in-app view · selection and context menus disabled</p>
            </main>
            <aside class="reader-notes" id="reader-notes" aria-label="Page notes">
              <header><div><span>Reading notes</span><h2 id="reader-note-title">Notes</h2></div><span class="reader-note-status" id="reader-note-status">No note here</span></header>
              <label class="sr-only" for="reader-note">Notes for the current page</label>
              <textarea id="reader-note" maxlength="10000" placeholder="Write a private note for this page…"></textarea>
              <section class="reader-chapters" id="reader-chapters-section" hidden><h3>Chapters</h3><div id="reader-chapters"></div></section>
              <section class="reader-saved-pages"><h3>Bookmarked positions</h3><div id="reader-bookmarked-pages"><span class="reader-empty-meta">No bookmarks yet.</span></div></section>
              <footer><span id="reader-offline-status">Checking offline availability…</span><small>Notes and progress use localStorage. Offline document bytes use IndexedDB.</small></footer>
            </aside>
          </div>
        </section>
      `;
    }

    bindElements() {
      this.root = document.querySelector("#reader-root");
      this.viewport = document.querySelector("#reader-stage");
      this.canvas = document.querySelector("#pdf-canvas");
      this.textSurface = document.querySelector("#text-reader-content");
      this.loading = document.querySelector("#reader-loading");
      this.loadingText = document.querySelector("#reader-loading-text");
      this.previousButton = document.querySelector("#reader-previous");
      this.nextButton = document.querySelector("#reader-next");
      this.pageInput = document.querySelector("#reader-page-input");
      this.pageTotal = document.querySelector("#reader-page-total");
      this.locationLabel = document.querySelector("#reader-location-label");
      this.engineLabel = document.querySelector("#reader-engine-label");
      this.pageBookmark = document.querySelector("#reader-page-bookmark");
      this.pageBookmarkLabel = document.querySelector("#reader-page-bookmark-label");
      this.completeButton = document.querySelector("#reader-complete");
      this.noteInput = document.querySelector("#reader-note");
      this.noteTitle = document.querySelector("#reader-note-title");
      this.noteStatus = document.querySelector("#reader-note-status");
      this.savedPages = document.querySelector("#reader-bookmarked-pages");
      this.offlineInput = document.querySelector("#reader-offline");
      this.offlineStatus = document.querySelector("#reader-offline-status");
      this.notesToggle = document.querySelector("#reader-notes-toggle");
      this.settingsToggle = document.querySelector("#reader-settings-toggle");
      this.settingsPanel = document.querySelector("#reader-settings");
      this.themeToggle = document.querySelector("#reader-theme-toggle");
      this.fullscreenToggle = document.querySelector("#reader-fullscreen");
      this.zoomLabels = [...document.querySelectorAll("[data-reader-zoom-label]")];
      this.progressFill = document.querySelector("#reader-progress-fill");
      this.chaptersSection = document.querySelector("#reader-chapters-section");
      this.chaptersList = document.querySelector("#reader-chapters");
      this.lineHeightInput = document.querySelector("#reader-line-height");
    }

    bindControls() {
      document.querySelector("#reader-exit").addEventListener("click", () => this.onClose());
      this.previousButton.addEventListener("click", () => this.changeLocation("previous"));
      this.nextButton.addEventListener("click", () => this.changeLocation("next"));
      this.pageInput.addEventListener("change", () => this.goTo(this.pageInput.value));
      this.pageInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          this.goTo(this.pageInput.value);
        }
      });
      this.pageBookmark.addEventListener("click", () => this.toggleBookmark());
      this.completeButton.addEventListener("click", () => this.markComplete());
      this.noteInput.addEventListener("input", () => this.scheduleNoteSave());
      this.noteInput.addEventListener("blur", () => this.saveNoteNow());
      this.savedPages.addEventListener("click", (event) => {
        const bookmark = event.target.closest("[data-reader-bookmark]");
        if (bookmark) this.goToBookmark(Number(bookmark.dataset.readerBookmark));
      });
      this.chaptersList.addEventListener("click", (event) => {
        const chapter = event.target.closest("[data-reader-chapter]");
        if (chapter) this.engine?.scrollToChapter?.(Number(chapter.dataset.readerChapter));
      });
      this.offlineInput.addEventListener("change", () => this.toggleOffline(this.offlineInput.checked));
      this.notesToggle.addEventListener("click", () => {
        const closed = this.root.classList.toggle("notes-closed");
        this.notesToggle.setAttribute("aria-expanded", String(!closed));
      });
      this.settingsToggle.addEventListener("click", () => {
        const opening = this.settingsPanel.hidden;
        this.settingsPanel.hidden = !opening;
        this.settingsToggle.setAttribute("aria-expanded", String(opening));
      });
      this.settingsPanel.addEventListener("click", (event) => {
        const font = event.target.closest("[data-reader-font]");
        if (font) this.changePreference("fontSize", this.preferencesApi().fontSize + (font.dataset.readerFont === "up" ? 0.1 : -0.1));
        const theme = event.target.closest("[data-reader-theme]");
        if (theme) this.changePreference("theme", theme.dataset.readerTheme);
        const layout = event.target.closest("[data-reader-layout]");
        if (layout) this.changePreference("layout", layout.dataset.readerLayout);
      });
      document.querySelectorAll("[data-reader-zoom]").forEach((button) => {
        button.addEventListener("click", () => this.changeZoom(button.dataset.readerZoom));
      });
      this.themeToggle.addEventListener("click", () => this.toggleTheme());
      this.fullscreenToggle.addEventListener("click", () => this.toggleFullscreen());
      document.addEventListener("fullscreenchange", this.handleFullscreenChange);
      this.lineHeightInput.addEventListener("change", () => this.changePreference("lineHeight", Number(this.lineHeightInput.value)));

      // Both display engines block context menus and copy events. HTML is
      // rebuilt from an allowlist; it never passes through innerHTML.
      this.viewport.addEventListener("contextmenu", (event) => event.preventDefault());
      this.viewport.addEventListener("copy", (event) => event.preventDefault());
      this.viewport.addEventListener("dragstart", (event) => event.preventDefault());
      window.addEventListener("resize", this.handleResize);
      window.addEventListener("keydown", this.handleKeydown);
    }

    applyPreferences() {
      const preferences = this.preferencesApi();
      const theme = ["paper", "sepia", "night"].includes(preferences.theme) ? preferences.theme : "paper";
      const layout = preferences.layout === "landscape" ? "landscape" : "portrait";
      const fontSize = clamp(Number(preferences.fontSize) || 1, 0.8, 2);
      const lineHeight = clamp(Number(preferences.lineHeight) || 1.95, 1.4, 2.4);
      this.root.dataset.readerTheme = theme;
      this.root.dataset.readerLayout = layout;
      this.root.style.setProperty("--reader-font-scale", String(fontSize));
      this.root.style.setProperty("--reader-line-height", String(lineHeight));
      this.lineHeightInput.value = String(lineHeight);
      this.settingsPanel.querySelectorAll("[data-reader-theme]").forEach((button) => {
        button.classList.toggle("active", button.dataset.readerTheme === theme);
        button.setAttribute("aria-pressed", String(button.dataset.readerTheme === theme));
      });
      this.settingsPanel.querySelectorAll("[data-reader-layout]").forEach((button) => {
        button.classList.toggle("active", button.dataset.readerLayout === layout);
        button.setAttribute("aria-pressed", String(button.dataset.readerLayout === layout));
      });
      this.updateZoomLabels();
      this.updateThemeToggle(theme);
      if (this.engine) this.engine.resize?.();
    }

    updateZoomLabels() {
      const preferences = this.preferencesApi();
      const isPdf = this.book?.reader?.engine === "pdf";
      const value = isPdf ? Number(preferences.pdfZoom) || 1 : Number(preferences.fontSize) || 1;
      const label = `${Math.round(value * 100)}%`;
      this.zoomLabels.forEach((element) => { element.textContent = label; });
    }

    updateThemeToggle(theme) {
      const dark = theme === "night";
      this.themeToggle.textContent = dark ? "☀" : "☾";
      this.themeToggle.setAttribute("aria-label", dark ? "Switch to light reading theme" : "Switch to dark reading theme");
      this.themeToggle.setAttribute("aria-pressed", String(dark));
    }

    changeZoom(action) {
      const isPdf = this.book?.reader?.engine === "pdf";
      const key = isPdf ? "pdfZoom" : "fontSize";
      const minimum = isPdf ? 0.5 : 0.8;
      const maximum = isPdf ? 2.5 : 2;
      const current = Number(this.preferencesApi()[key]) || 1;
      const next = action === "reset"
        ? 1
        : Math.round(clamp(current + (action === "in" ? 0.1 : -0.1), minimum, maximum) * 10) / 10;
      this.changePreference(key, next);
    }

    toggleTheme() {
      const current = this.preferencesApi().theme;
      this.changePreference("theme", current === "night" ? "paper" : "night");
    }

    /**
     * Full screen expands the reader shell itself, so the toolbar and notes stay
     * available. The Fullscreen API needs a user gesture, which the toolbar
     * button and the F shortcut both provide.
     */
    async toggleFullscreen() {
      try {
        if (document.fullscreenElement) {
          await document.exitFullscreen?.();
          return;
        }
        if (typeof this.root.requestFullscreen !== "function") {
          this.notify("Full screen is not supported in this browser.", "warning");
          return;
        }
        await this.root.requestFullscreen({ navigationUI: "hide" });
      } catch (error) {
        console.warn("Full screen request failed.", error);
        this.notify("Full screen could not be opened in this browser.", "warning");
      }
    }

    handleFullscreenChange() {
      const active = document.fullscreenElement === this.root;
      this.root.classList.toggle("is-fullscreen", active);
      this.fullscreenToggle.setAttribute("aria-pressed", String(active));
      this.fullscreenToggle.setAttribute("aria-label", active ? "Exit full screen" : "Enter full screen");
      this.fullscreenToggle.setAttribute("title", active ? "Exit full screen (F)" : "Toggle full screen (F)");
      this.engine?.resize?.();
    }

    changePreference(key, value) {
      const next = { ...this.preferencesApi(), [key]: value };
      if (key === "fontSize") next.fontSize = Math.round(clamp(Number(value) || 1, 0.8, 2) * 10) / 10;
      if (key === "pdfZoom") next.pdfZoom = Math.round(clamp(Number(value) || 1, 0.5, 2.5) * 10) / 10;
      if (key === "lineHeight") next.lineHeight = Math.round(clamp(Number(value) || 1.95, 1.4, 2.4) * 100) / 100;
      this.savePreferences(next);
      this.applyPreferences();
    }

    buildChapters() {
      const chapters = this.engine?.getChapters?.() || [];
      this.chaptersSection.hidden = chapters.length < 2;
      this.chaptersList.innerHTML = chapters.map((chapter) => `<button type="button" class="reader-chapter" data-reader-chapter="${chapter.index}">${escapeHTML(chapter.label)}</button>`).join("");
    }

    getSourceIdentity(book) {
      if (book.source === "custom") return `custom:${book.key}`;
      return safeDocumentUrl(book.reader?.sourceUrl);
    }

    async loadSource(book) {
      if (!book.reader?.engine) throw new Error("This book has no readable digital format.");
      const identity = this.getSourceIdentity(book);
      if (!identity) throw new Error("The reader source is invalid.");

      let cached = null;
      try {
        cached = await this.cache.get(book.key, identity);
      } catch (error) {
        console.warn("Offline cache lookup failed.", error);
      }
      if (cached) return { ...cached, cached: true };
      if (book.source === "custom") throw new Error("The uploaded PDF is missing from IndexedDB.");

      if (book.reader.engine === "pdf") {
        this.setLoading("Fetching the PDF edition…");
        const fetched = await this.fetchDocumentResource(book.reader.sourceUrl, book.reader.mimeType);
        return {
          key: book.key,
          sourceIdentity: identity,
          engine: "pdf",
          mimeType: fetched.mimeType || "application/pdf",
          title: book.title,
          bytes: fetched.bytes,
          cached: false
        };
      }

      this.setLoading("Fetching the public-domain text…");
      const fetched = await this.fetchTextResource(book.reader.sourceUrl, book.reader.mimeType);
      return {
        key: book.key,
        sourceIdentity: identity,
        engine: "text",
        mimeType: fetched.mimeType,
        title: book.title,
        bytes: fetched.bytes,
        cached: false
      };
    }

    async fetchTextResource(sourceUrl, expectedMimeType) {
      const url = safeHttpsUrl(sourceUrl);
      if (!url) throw new Error("The text source URL is invalid.");
      this.abortController = new AbortController();

      const request = async (requestUrl) => {
        const response = await fetch(requestUrl, {
          headers: { Accept: "text/plain,text/html;q=0.8" },
          credentials: "omit",
          cache: "no-store",
          referrerPolicy: "no-referrer",
          signal: this.abortController.signal
        });
        if (!response.ok) throw new Error(`Text server returned HTTP ${response.status}.`);
        const declaredSize = Number(response.headers.get("content-length")) || 0;
        if (declaredSize > Config.MAX_TEXT_BYTES) throw new Error("This text exceeds the reader size limit.");
        const bytes = await response.arrayBuffer();
        if (!bytes.byteLength || bytes.byteLength > Config.MAX_TEXT_BYTES) throw new Error("The text response has an invalid size.");
        return { bytes, mimeType: response.headers.get("content-type") || expectedMimeType || "text/plain" };
      };

      try {
        return await request(url);
      } catch (directError) {
        if (directError.name === "AbortError") throw directError;
        // Gutenberg download hosts omit browser CORS headers. In this static
        // demo, a configurable text-only proxy is the fallback. Production
        // deployments should replace it with an owned same-origin endpoint.
        const proxyUrl = `${Config.TEXT_PROXY_BASE_URL}${url}`;
        return request(proxyUrl);
      }
    }

    async fetchDocumentResource(sourceUrl, expectedMimeType) {
      const url = safeDocumentUrl(sourceUrl);
      if (!url) throw new Error("The PDF source URL is invalid.");
      this.abortController = new AbortController();
      const response = await fetch(url, {
        credentials: "omit",
        cache: "default",
        referrerPolicy: "no-referrer",
        signal: this.abortController.signal
      });
      if (!response.ok) throw new Error(`PDF server returned HTTP ${response.status}.`);
      const declaredSize = Number(response.headers.get("content-length")) || 0;
      if (declaredSize > Config.MAX_PDF_BYTES) throw new Error("This PDF exceeds the reader size limit.");
      const bytes = await response.arrayBuffer();
      if (!bytes.byteLength || bytes.byteLength > Config.MAX_PDF_BYTES) throw new Error("The PDF response has an invalid size.");
      return { bytes, mimeType: response.headers.get("content-type") || expectedMimeType || "application/pdf" };
    }

    prepareTextContent(bytes, mimeType) {
      const decoded = stripGutenbergWrapper(decodeBytes(bytes, mimeType));
      if (!String(mimeType).toLowerCase().includes("html")) return { text: decoded };
      return { fragment: sanitizeHtmlToFragment(decoded) };
    }

    waitForPdfJs() {
      if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
      return new Promise((resolve, reject) => {
        let timer;
        const ready = () => {
          window.clearTimeout(timer);
          resolve(window.pdfjsLib);
        };
        window.addEventListener("pdfjs-ready", ready, { once: true });
        timer = window.setTimeout(() => {
          window.removeEventListener("pdfjs-ready", ready);
          reject(new Error("PDF.js did not load. Check the network connection."));
        }, 15000);
      });
    }

    handleLocation(location) {
      if (this.destroyed) return;
      const pageChanged = this.notePage !== location.page;
      if (pageChanged) this.saveNoteNow();
      this.lastLocation = location;
      this.pageInput.value = String(location.page);
      this.pageInput.max = String(location.totalPages);
      this.pageTotal.textContent = `/ ${location.totalPages}`;
      this.previousButton.disabled = location.page <= 1;
      this.nextButton.disabled = location.page >= location.totalPages;
      const percent = location.engine === "text"
        ? clamp(Number(location.scrollPercent) || 0, 0, 100)
        : Math.min(100, (location.page / Math.max(1, location.totalPages)) * 100);
      if (this.progressFill) this.progressFill.style.width = `${percent}%`;
      this.progressFill?.parentElement?.setAttribute("aria-valuenow", String(Math.round(percent)));

      // Persisting on every 0.5% scroll tick caused visible jank. Save at most
      // once a second, plus immediately on page changes and at the extremes.
      const now = Date.now();
      if (pageChanged || now - this.lastSavedAt >= 1000 || percent === 0 || percent === 100) {
        this.lastSavedAt = now;
        this.state.saveLocation(this.book, location);
      }
      if (pageChanged) this.loadPageMetadata(location.page, location.engine);
    }

    loadPageMetadata(page, engine) {
      const record = this.state.getRecord(this.book.key);
      const bookmarks = record.bookmarks || [];
      const currentPercent = Number(this.lastLocation?.scrollPercent);
      const current = bookmarks.find((bookmark) => (
        engine === "text"
          ? Number.isFinite(currentPercent) && Number.isFinite(bookmark.percent) && Math.abs(bookmark.percent - currentPercent) < 0.8
          : bookmark.page === page && !Number.isFinite(bookmark.percent)
      ));
      this.notePage = page;
      this.pageBookmark.classList.toggle("active", Boolean(current));
      this.pageBookmark.setAttribute("aria-pressed", String(Boolean(current)));
      this.pageBookmarkLabel.textContent = current ? "Position saved" : "Bookmark position";
      this.noteTitle.textContent = `${engine === "text" ? "Text notes" : "PDF notes"} · Page ${page}`;
      this.noteInput.value = record.notes[page] || "";
      this.noteStatus.textContent = this.noteInput.value ? "Saved locally" : "No note here";
      this.savedPages.innerHTML = bookmarks.length
        ? bookmarks.map((bookmark, index) => {
          const label = Number.isFinite(bookmark.percent) ? `${Math.round(bookmark.percent)}%` : `Page ${bookmark.page}`;
          const active = current === bookmark ? "active" : "";
          return `<button class="reader-page-chip ${active}" type="button" data-reader-bookmark="${index}">${escapeHTML(label)}</button>`;
        }).join("")
        : '<span class="reader-empty-meta">No bookmarks yet.</span>';
    }

    changeLocation(direction) {
      this.saveNoteNow();
      this.engine?.[direction]?.();
    }

    goTo(page) {
      this.saveNoteNow();
      this.engine?.goTo(page);
    }

    goToBookmark(index) {
      const record = this.state.getRecord(this.book.key);
      const bookmark = record.bookmarks?.[index];
      if (!bookmark) return;
      this.saveNoteNow();
      if (this.engine?.type === "text" && Number.isFinite(bookmark.percent)) this.engine.goToPercent(bookmark.percent);
      else this.engine?.goTo(bookmark.page);
    }

    toggleBookmark() {
      if (!this.notePage) return;
      const percent = this.engine?.type === "text" ? this.lastLocation?.scrollPercent : null;
      const added = this.state.toggleBookmark(this.book.key, this.notePage, percent);
      this.loadPageMetadata(this.notePage, this.engine.type);
      this.notify(added ? "Reading position bookmarked." : "Bookmark removed.", "success");
    }

    scheduleNoteSave() {
      window.clearTimeout(this.noteTimer);
      this.noteStatus.textContent = "Unsaved changes";
      this.noteTimer = window.setTimeout(() => this.saveNoteNow(), 500);
    }

    saveNoteNow() {
      if (!this.notePage || !this.noteInput) return;
      window.clearTimeout(this.noteTimer);
      this.state.saveNote(this.book.key, this.notePage, this.noteInput.value);
      this.noteStatus.textContent = this.noteInput.value.trim() ? "Saved locally" : "No note here";
    }

    markComplete() {
      const result = this.state.markComplete(this.book);
      this.completeButton.disabled = true;
      this.completeButton.querySelector("span").textContent = "Completed";
      if (result.isNewAchievement) {
        this.notify("Certificate unlocked — your certificate QR code is ready.", "success", 6500);
      } else if (result.newBadges?.length) {
        this.notify(`${result.newBadges[0].title} badge unlocked.`, "success", 6500);
      } else {
        this.notify(`${this.book.title} marked complete.`, "success", 3600);
      }
    }

    async toggleOffline(enabled) {
      if (!this.currentBytes || this.destroyed || this.book.source === "custom") return;
      this.offlineInput.disabled = true;
      try {
        if (enabled) {
          this.offlineStatus.textContent = "Saving in IndexedDB…";
          await this.cache.put({
            key: this.book.key,
            sourceIdentity: this.getSourceIdentity(this.book),
            engine: this.book.reader.engine,
            mimeType: this.currentMimeType,
            title: this.book.title,
            bytes: this.currentBytes.slice(0)
          });
          this.offlineStatus.textContent = "Available without a network";
          this.notify(`${this.book.title} is available offline.`, "success");
        } else {
          this.offlineStatus.textContent = "Removing offline copy…";
          await this.cache.delete(this.book.key);
          this.offlineStatus.textContent = "Online reader session";
          this.notify("Offline copy removed from this browser.", "info");
        }
      } catch (error) {
        this.offlineInput.checked = !enabled;
        this.offlineStatus.textContent = "Offline storage failed";
        this.notify(error.message || "Could not update offline availability.", "error");
      } finally {
        this.offlineInput.disabled = false;
      }
    }

    handleResize() {
      window.clearTimeout(this.resizeTimer);
      this.resizeTimer = window.setTimeout(() => {
        this.saveNoteNow();
        this.engine?.resize?.();
        if (this.engine?.type === "text") this.buildChapters();
      }, 180);
    }

    handleKeydown(event) {
      const tag = event.target?.tagName?.toLowerCase();
      if (["input", "textarea", "select"].includes(tag)) return;
      if (event.key === "ArrowLeft") this.changeLocation("previous");
      if (event.key === "ArrowRight") this.changeLocation("next");
      if (event.key === "f" || event.key === "F") {
        if (event.ctrlKey || event.metaKey || event.altKey) return;
        event.preventDefault();
        this.toggleFullscreen();
      }
      if (event.key === "Escape" && !this.settingsPanel.hidden) {
        this.settingsPanel.hidden = true;
        this.settingsToggle.setAttribute("aria-expanded", "false");
      }
    }

    setLoading(message) {
      if (!this.loading) return;
      this.loading.hidden = false;
      this.loadingText.textContent = message;
    }

    showError(message) {
      this.loading.hidden = false;
      this.loading.classList.add("error");
      this.loading.querySelector(".reader-spinner").hidden = true;
      this.loadingText.textContent = message;
    }

    destroy() {
      if (this.destroyed) return;
      this.saveNoteNow();
      if (this.lastLocation && this.book) this.state.saveLocation(this.book, this.lastLocation);
      this.destroyed = true;
      window.clearTimeout(this.noteTimer);
      window.clearTimeout(this.resizeTimer);
      window.removeEventListener("resize", this.handleResize);
      window.removeEventListener("keydown", this.handleKeydown);
      document.removeEventListener("fullscreenchange", this.handleFullscreenChange);
      if (document.fullscreenElement === this.root) Promise.resolve(document.exitFullscreen?.()).catch(() => {});
      this.abortController?.abort();
      this.engine?.destroy?.();
      this.currentBytes = null;
    }
  }

  window.LibraryReaders = Object.freeze({ DocumentCacheService, ReaderManager });
})();
