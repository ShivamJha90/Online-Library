/*
 * Lumina dual-engine reader
 * -------------------------
 * Gutendex text is rendered as inert textContent. Administrator PDFs are
 * rendered by PDF.js onto canvas. Shared controls handle notes, locations,
 * completion tracking, and browser-managed IndexedDB offline storage.
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

  const escapeHTML = (value = "") => String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;"
  })[character]);

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
    constructor({ viewport, canvas, onLocation, getPdfJs }) {
      this.type = "pdf";
      this.viewport = viewport;
      this.canvas = canvas;
      this.onLocation = onLocation;
      this.getPdfJs = getPdfJs;
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
      const availableWidth = Math.max(280, Math.min(this.viewport.clientWidth - 48, 980));
      const viewport = page.getViewport({ scale: availableWidth / baseViewport.width });
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

    async load(text, record) {
      // textContent is the security boundary: fetched strings are never parsed
      // as executable application markup or inserted with innerHTML.
      this.content.textContent = text;
      this.content.hidden = false;
      this.viewport.addEventListener("scroll", this.handleScroll, { passive: true });

      await new Promise((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)));
      const savedPercent = Math.max(0, Math.min(100, Number(record.lastScrollPercent) || 0));
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
    constructor({ container, cache, state, onClose, notify }) {
      this.container = container;
      this.cache = cache;
      this.state = state;
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
      this.destroyed = false;
      this.handleResize = this.handleResize.bind(this);
      this.handleKeydown = this.handleKeydown.bind(this);
    }

    async open(book) {
      this.book = book;
      this.destroyed = false;
      document.body.classList.add("reader-mode");
      this.container.innerHTML = this.shell(book);
      this.bindElements();
      this.bindControls();
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
        if (book.reader.engine === "pdf") {
          this.engineLabel.textContent = "PDF.js Canvas";
          this.locationLabel.textContent = "Page";
          this.pageBookmarkLabel.textContent = "Bookmark page";
          this.engine = new PdfCanvasEngine({
            viewport: this.viewport,
            canvas: this.canvas,
            onLocation: (location) => this.handleLocation(location),
            getPdfJs: () => this.waitForPdfJs()
          });
          await this.engine.load(source.bytes, record);
        } else {
          this.engineLabel.textContent = "Protected Text";
          this.locationLabel.textContent = "Page";
          this.pageBookmarkLabel.textContent = "Bookmark page";
          const text = this.decodeText(source.bytes, source.mimeType);
          this.engine = new ProtectedTextEngine({
            viewport: this.viewport,
            content: this.textContent,
            onLocation: (location) => this.handleLocation(location)
          });
          await this.engine.load(text, record);
        }
        if (!this.destroyed) this.loading.hidden = true;
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
              <button class="reader-icon-button notes-toggle" id="reader-notes-toggle" type="button" aria-controls="reader-notes" aria-expanded="true" aria-label="Toggle notes sidebar">✎</button>
            </div>
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
              <section class="reader-saved-pages"><h3>Bookmarked pages</h3><div id="reader-bookmarked-pages"><span class="reader-empty-meta">No bookmarks yet.</span></div></section>
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
      this.textContent = document.querySelector("#text-reader-content");
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
        const target = event.target.closest("[data-reader-page]");
        if (target) this.goTo(target.dataset.readerPage);
      });
      this.offlineInput.addEventListener("change", () => this.toggleOffline(this.offlineInput.checked));
      this.notesToggle.addEventListener("click", () => {
        const closed = this.root.classList.toggle("notes-closed");
        this.notesToggle.setAttribute("aria-expanded", String(!closed));
      });

      // Both display engines block context menus and copy events. Text is never
      // exposed as an HTML interpretation layer; it remains one inert text node.
      this.viewport.addEventListener("contextmenu", (event) => event.preventDefault());
      this.viewport.addEventListener("copy", (event) => event.preventDefault());
      this.viewport.addEventListener("dragstart", (event) => event.preventDefault());
      window.addEventListener("resize", this.handleResize);
      window.addEventListener("keydown", this.handleKeydown);
    }

    getSourceIdentity(book) {
      return book.source === "custom" ? `custom:${book.key}` : safeHttpsUrl(book.reader?.sourceUrl);
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

    decodeText(bytes, mimeType) {
      const decoded = new TextDecoder("utf-8", { fatal: false }).decode(bytes).replace(/\0/g, "");
      if (!String(mimeType).toLowerCase().includes("html")) return decoded;

      const parsed = new DOMParser().parseFromString(decoded, "text/html");
      parsed.querySelectorAll("script, style, noscript, iframe, object, embed, svg").forEach((node) => node.remove());
      return parsed.body?.textContent || "";
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
      this.pageInput.value = String(location.page);
      this.pageInput.max = String(location.totalPages);
      this.pageTotal.textContent = `/ ${location.totalPages}`;
      this.previousButton.disabled = location.page <= 1;
      this.nextButton.disabled = location.page >= location.totalPages;
      this.state.saveLocation(this.book, location);
      if (pageChanged) this.loadPageMetadata(location.page, location.engine);
    }

    loadPageMetadata(page, engine) {
      const record = this.state.getRecord(this.book.key);
      const bookmarked = record.bookmarks.includes(page);
      this.notePage = page;
      this.pageBookmark.classList.toggle("active", bookmarked);
      this.pageBookmark.setAttribute("aria-pressed", String(bookmarked));
      this.pageBookmarkLabel.textContent = bookmarked ? "Page saved" : "Bookmark page";
      this.noteTitle.textContent = `${engine === "text" ? "Text notes" : "PDF notes"} · Page ${page}`;
      this.noteInput.value = record.notes[page] || "";
      this.noteStatus.textContent = this.noteInput.value ? "Saved locally" : "No note here";
      this.savedPages.innerHTML = record.bookmarks.length
        ? record.bookmarks.map((savedPage) => `<button class="reader-page-chip ${savedPage === page ? "active" : ""}" type="button" data-reader-page="${savedPage}">Page ${savedPage}</button>`).join("")
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

    toggleBookmark() {
      if (!this.notePage) return;
      const added = this.state.toggleBookmark(this.book.key, this.notePage);
      this.loadPageMetadata(this.notePage, this.engine.type);
      this.notify(added ? `Page ${this.notePage} bookmarked.` : `Page ${this.notePage} bookmark removed.`, "success");
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
      this.notify(result.isNewAchievement ? "Avid Reader unlocked — your certificate is ready." : `${this.book.title} marked complete.`, "success", result.isNewAchievement ? 6500 : 3600);
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
      }, 180);
    }

    handleKeydown(event) {
      const tag = event.target?.tagName?.toLowerCase();
      if (["input", "textarea"].includes(tag)) return;
      if (event.key === "ArrowLeft") this.changeLocation("previous");
      if (event.key === "ArrowRight") this.changeLocation("next");
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
      this.destroyed = true;
      window.clearTimeout(this.noteTimer);
      window.clearTimeout(this.resizeTimer);
      window.removeEventListener("resize", this.handleResize);
      window.removeEventListener("keydown", this.handleKeydown);
      this.abortController?.abort();
      this.engine?.destroy?.();
      this.currentBytes = null;
    }
  }

  window.LibraryReaders = Object.freeze({ DocumentCacheService, ReaderManager });
})();
