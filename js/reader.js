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

  /* The local Python backend may be on the same origin or on a loopback port.
     Loopback HTTP is allowed because the backend serves the text proxy; all
     other cross-origin HTTP stays blocked. */
  const isLoopbackHttp = (url) => url.protocol === "http:"
    && (url.origin === window.location.origin || ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname));

  /**
   * Reader documents may be remote HTTPS files or same-origin bundled assets.
   * Relative paths are resolved against the current page, but credentials,
   * javascript: URLs and cross-origin HTTP are rejected.
   */
  const safeDocumentUrl = (value) => {
    try {
      const url = new URL(String(value), window.location.href);
      if (url.protocol === "https:") return url.href;
      if (isLoopbackHttp(url)) return url.href;
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

  /**
   * Text sources are fetched through the same-origin proxy when the site has
   * one, then through the public reader mirror, and only then directly. The
   * mirror matters because www.gutenberg.org answers most requests with 503
   * and does not send CORS headers at all.
   */
  const textSourceCandidates = (sourceUrl) => {
    const primary = safeDocumentUrl(sourceUrl);
    if (!primary) return [];
    const idMatch = primary.match(/(?:ebooks|cache\/epub|files)\/(\d+)/i);
    const candidates = [];
    if (idMatch) candidates.push(Config.TEXT_MIRROR_TEMPLATE.replace(/\{id\}/g, idMatch[1]));
    candidates.push(primary);
    return [...new Set(candidates)];
  };

  const textTransports = (url) => {
    const host = (() => { try { return new URL(url).hostname; } catch { return ""; } })();
    // Bundled editions live on this origin, so there is nothing to proxy.
    if (url.startsWith(window.location.origin)) return [{ id: "direct", url }];
    const proxyEndpoint = String(Config.TEXT_PROXY_ENDPOINT || "");
    const readerProxy = String(Config.TEXT_PROXY_BASE_URL || "");
    const sameOrigin = proxyEndpoint && /^https?:$/.test(window.location.protocol)
      ? { id: "site", url: `${proxyEndpoint}${encodeURIComponent(url)}` }
      : null;
    const jina = readerProxy ? { id: "mirror-proxy", url: `${readerProxy}${url}` } : null;
    const direct = { id: "direct", url };
    // Archive.org sends CORS headers, so it never needs a proxy first.
    if (host.endsWith("archive.org")) return [direct, sameOrigin, jina].filter(Boolean);
    return [sameOrigin, jina, direct].filter(Boolean);
  };

  const isGzipBytes = (bytes) => {
    if (!bytes || bytes.byteLength < 2) return false;
    const head = new Uint8Array(bytes, 0, 2);
    return head[0] === 0x1f && head[1] === 0x8b;
  };

  /** Bundled Hindi editions are gzipped to keep the repository small. */
  const gunzipBytes = async (bytes) => {
    if (typeof DecompressionStream !== "function") {
      throw new Error("This browser cannot open the compressed bundled edition.");
    }
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
    return new Response(stream).arrayBuffer();
  };

  const fetchWithTimeout = async (url, timeoutMs) => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, {
        headers: { Accept: "text/plain,text/html;q=0.8" },
        credentials: "omit",
        cache: "default",
        referrerPolicy: "no-referrer",
        signal: controller.signal
      });
    } finally {
      window.clearTimeout(timer);
    }
  };

  /** Remove the small header r.jina.ai places above mirrored text. */
  const stripProxyPrelude = (text) => {
    const value = String(text || "");
    if (!/^\s*Title:/i.test(value) || !/URL Source:/i.test(value.slice(0, 800))) return value;
    const marker = value.indexOf("Markdown Content:");
    if (marker >= 0) return value.slice(marker + "Markdown Content:".length).replace(/^\s*\n/, "");
    return value
      .replace(/^\s*Title:[^\n]*\n?/i, "")
      .replace(/^\s*URL Source:[^\n]*\n?/i, "")
      .trim();
  };

  /** A proxy can return HTTP 200 while the book host answered with an error page. */
  const looksLikeBrokenText = (text) => {
    const sample = String(text || "").slice(0, 8000);
    if (/Temporarily Down for Maintenance|Warning: Target URL returned error|Service Unavailable|503 Service/i.test(sample)) return true;
    if (/^\s*<(?:!doctype|html)/i.test(sample) && !/<(?:p|div|pre|h[1-6])[\s>]/i.test(sample)) return true;
    return sample.replace(/\s/g, "").length < 400;
  };

  const textCacheAvailable = () => "caches" in window && /^https?:$/.test(window.location.protocol);

  const textCacheKey = (bookKey) => new URL(
    `/__reader-text/${encodeURIComponent(String(bookKey || "book"))}`,
    window.location.href
  ).href;

  const readCachedText = async (bookKey) => {
    if (!textCacheAvailable()) return null;
    try {
      const cache = await caches.open(Config.TEXT_CACHE_NAME || "scholarscroll-text-v1");
      const hit = await cache.match(textCacheKey(bookKey));
      if (!hit) return null;
      const bytes = await hit.arrayBuffer();
      if (!bytes.byteLength) return null;
      return { bytes, mimeType: hit.headers.get("content-type") || "text/plain; charset=utf-8", cached: true };
    } catch {
      return null;
    }
  };

  const writeCachedText = async (bookKey, result) => {
    if (!textCacheAvailable()) return;
    try {
      const cache = await caches.open(Config.TEXT_CACHE_NAME || "scholarscroll-text-v1");
      await cache.put(textCacheKey(bookKey), new Response(result.bytes.slice(0), {
        headers: { "Content-Type": result.mimeType || "text/plain; charset=utf-8" }
      }));
    } catch {
      /* Browsers refuse cache writes in private mode; the reader still works. */
    }
  };

  /**
   * Editions bundled under assets/text/ open instantly and work offline. The
   * manifest is generated at build time, so deployments without it simply skip
   * straight to the network sources below.
   */
  let bundledTextFiles = null;
  const loadBundledTextManifest = () => {
    if (!bundledTextFiles) {
      bundledTextFiles = fetch(new URL("assets/text/manifest.json", window.location.href), {
        cache: "force-cache",
        credentials: "omit"
      })
        .then((response) => (response.ok ? response.json() : null))
        .then((data) => new Set(Array.isArray(data?.files) ? data.files : []))
        .catch(() => new Set());
    }
    return bundledTextFiles;
  };

  const bundledTextUrl = (book, files) => {
    const key = String(book?.key || "");
    if (!key || !files?.has(key)) return null;
    return new URL(`assets/text/${encodeURIComponent(key)}.txt.gz`, window.location.href).href;
  };

  const pendingTextLoads = new Map();

  const fetchTextAcrossMirrors = async (book, onStatus) => {
    const bundled = bundledTextUrl(book, await loadBundledTextManifest());
    const candidates = [
      ...(bundled ? [bundled] : []),
      ...textSourceCandidates(book.reader?.sourceUrl)
    ];
    if (!candidates.length) throw new Error("The text source URL is invalid.");
    const deadline = Date.now() + 40000;
    let attempt = 0;
    let lastError = null;

    for (const candidate of candidates) {
      for (const transport of textTransports(candidate)) {
        if (Date.now() > deadline) break;
        attempt += 1;
        try {
          onStatus?.(attempt === 1
            ? "Downloading the public-domain text…"
            : "Trying a backup text mirror…");
          const response = await fetchWithTimeout(transport.url, transport.id === "direct" ? 12000 : 15000);
          if (!response.ok) throw new Error(`The text source returned HTTP ${response.status}.`);
          const declared = Number(response.headers.get("content-length")) || 0;
          if (declared > Config.MAX_TEXT_BYTES) throw new Error("This text exceeds the reader size limit.");
          let bytes = await response.arrayBuffer();
          if (!bytes.byteLength || bytes.byteLength > Config.MAX_TEXT_BYTES) throw new Error("The text response has an invalid size.");
          if (isGzipBytes(bytes)) {
            bytes = await gunzipBytes(bytes);
            if (!bytes.byteLength || bytes.byteLength > Config.MAX_TEXT_BYTES) {
              throw new Error("The bundled text exceeds the reader size limit.");
            }
          }

          const mimeType = response.headers.get("content-type") || book.reader?.mimeType || "text/plain";
          const rawText = decodeBytes(bytes, mimeType);
          const cleaned = /html/i.test(mimeType) ? rawText : stripProxyPrelude(rawText);
          if (looksLikeBrokenText(cleaned)) throw new Error("The mirror returned an error page.");
          if (cleaned === rawText) return { bytes, mimeType };
          return { bytes: new TextEncoder().encode(cleaned).buffer, mimeType: "text/plain; charset=utf-8" };
        } catch (error) {
          lastError = error;
        }
      }
    }
    throw new Error(
      lastError?.message && lastError.message !== "Failed to fetch"
        ? lastError.message
        : "The book text could not be downloaded. Check the connection and try again."
    );
  };

  /** Shared by the reader and by hover/tap prefetching in the app shell. */
  const loadTextDocument = (book, onStatus) => {
    const key = String(book.key || "");
    const pending = pendingTextLoads.get(key);
    if (pending) return pending;

    const promise = (async () => {
      const cached = await readCachedText(key);
      if (cached) {
        onStatus?.("Opening the cached copy…");
        return cached;
      }
      onStatus?.("Downloading the public-domain text…");
      const result = await fetchTextAcrossMirrors(book, onStatus);
      await writeCachedText(key, result);
      return result;
    })();

    pendingTextLoads.set(key, promise);
    promise.catch(() => {}).finally(() => {
      window.setTimeout(() => {
        if (pendingTextLoads.get(key) === promise) pendingTextLoads.delete(key);
      }, 20000);
    });
    return promise;
  };

  const createSessionCode = () => {
    const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
    const values = new Uint8Array(8);
    try {
      window.crypto.getRandomValues(values);
    } catch {
      for (let index = 0; index < values.length; index += 1) values[index] = Math.floor(Math.random() * 256);
    }
    const code = [...values].map((value) => alphabet[value % alphabet.length]).join("");
    return `SS-${code.slice(0, 4)}-${code.slice(4)}`;
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
    constructor({ viewport, canvas, onLocation, onProgress, getPdfJs, getViewOptions }) {
      this.type = "pdf";
      this.viewport = viewport;
      this.canvas = canvas;
      this.onLocation = onLocation;
      this.onProgress = onProgress;
      this.getPdfJs = getPdfJs;
      this.getViewOptions = getViewOptions;
      this.document = null;
      this.loadingTask = null;
      this.renderTask = null;
      this.currentPage = 1;
      this.totalPages = 1;
      this.renderSequence = 0;
      this.targetPage = 1;
      this.lastViewSignature = "";
      this.renderActive = false;
      this.resizeFrame = null;
      this.destroyed = false;
    }

    async load(source, record) {
      const bytes = source.bytes || null;
      const pdfjs = await this.getPdfJs();
      const options = { isEvalSupported: false, useSystemFonts: true };
      if (bytes?.byteLength) {
        const signature = String.fromCharCode(...new Uint8Array(bytes, 0, Math.min(5, bytes.byteLength)));
        if (signature !== "%PDF-") throw new Error("The uploaded file is not a valid PDF document.");
        options.data = new Uint8Array(bytes.slice(0));
      } else if (source.url) {
        // Let PDF.js fetch byte ranges. The first page is painted after a few
        // hundred kilobytes instead of waiting for a multi-megabyte file.
        options.url = source.url;
        options.rangeChunkSize = 262144;
        options.disableAutoFetch = true;
        // PDF.js probes the URL with a full GET to read its headers. Disabling
        // streaming makes it abort that body as soon as the origin confirms
        // range support, so a 6 MB PDF never downloads in full just to start.
        options.disableStream = true;
      } else {
        throw new Error("The PDF source is invalid.");
      }
      this.loadingTask = pdfjs.getDocument(options);
      // Show real byte progress while the first pages stream in; PDF.js only
      // requests what the first render needs, so this finishes quickly.
      this.loadingTask.onProgress = ({ loaded, total }) => {
        if (!this.onProgress) return;
        if (total > 0 && loaded < total) {
          const percent = Math.min(99, Math.round((loaded / total) * 100));
          this.onProgress(`Opening the PDF edition… ${percent}%`);
        } else {
          this.onProgress("Rendering the first page…");
        }
      };
      this.document = await this.loadingTask.promise;
      this.totalPages = this.document.numPages;
      this.onProgress?.(`Rendering page 1 of ${this.totalPages}…`);
      this.currentPage = Math.min(Math.max(1, Number(record.lastVisitedPage) || 1), this.totalPages);
      await this.render(this.currentPage);
    }

    async render(pageNumber) {
      const signature = this.viewSignature(pageNumber);
      if (signature === this.lastViewSignature && !this.renderActive) return;
      const sequence = ++this.renderSequence;
      this.targetPage = pageNumber;
      this.renderActive = true;
      if (this.renderTask) {
        try { this.renderTask.cancel(); } catch { /* previous render already ended */ }
      }

      const page = await this.document.getPage(pageNumber);
      if (this.destroyed || sequence !== this.renderSequence) return;
      const baseViewport = page.getViewport({ scale: 1 });
      const options = this.getViewOptions?.() || {};
      const zoom = clamp(Number(options.zoom) || 1, 0.5, 2.5);
      const mode = ["auto", "portrait", "landscape"].includes(options.layout) ? options.layout : "auto";
      const wholePage = mode === "landscape";
      const widthCap = mode === "portrait" ? 980 : 1600;
      const availableWidth = Math.max(240, Math.min(
        this.viewport.clientWidth - (window.innerWidth <= 760 ? 16 : 48),
        widthCap
      ));
      const availableHeight = Math.max(280, this.viewport.clientHeight - (window.innerWidth <= 760 ? 24 : 48));
      // Auto and portrait fit the reading width, so a phone held sideways uses
      // the whole landscape screen; the page then scrolls vertically and its
      // end becomes the next-page gesture. Landscape fits the whole page.
      const fitScale = wholePage
        ? Math.min(availableHeight / baseViewport.height, availableWidth / baseViewport.width)
        : availableWidth / baseViewport.width;
      const viewport = page.getViewport({ scale: fitScale * zoom });
      const outputScale = Math.min(window.devicePixelRatio || 1, 2);
      const context = this.canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error("Canvas rendering is unavailable.");

      this.canvas.dataset.layout = mode;

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
        if (error?.name !== "RenderingCancelledException") {
          if (sequence === this.renderSequence) this.renderActive = false;
          throw error;
        }
        return;
      }
      if (this.destroyed || sequence !== this.renderSequence) return;

      this.currentPage = pageNumber;
      this.lastViewSignature = signature;
      this.renderActive = false;
      this.canvas.setAttribute("aria-label", `PDF page ${pageNumber} of ${this.totalPages}`);
      this.onLocation({ page: pageNumber, totalPages: this.totalPages, scrollPercent: null, engine: this.type });
    }

    goTo(pageNumber) {
      const page = Math.min(this.totalPages, Math.max(1, Number.parseInt(pageNumber, 10) || this.currentPage));
      return this.render(page);
    }

    previous() { return this.goTo(this.currentPage - 1); }
    next() { return this.goTo(this.currentPage + 1); }

    /** A render is only worth repeating when page, size, zoom or layout changed. */
    viewSignature(pageNumber, options = this.getViewOptions?.() || {}) {
      return [
        Math.floor(this.viewport.clientWidth),
        Math.floor(this.viewport.clientHeight),
        options.zoom ?? 1,
        options.layout ?? "portrait",
        pageNumber
      ].join(":");
    }

    /**
     * Fullscreen fires a window resize and a fullscreenchange event back to
     * back. Both used to start a fresh PDF raster pass. Coalescing them into a
     * single animation frame, and skipping identical view signatures, keeps the
     * transition responsive.
     */
    resize() {
      if (!this.document) return;
      if (this.resizeFrame) window.cancelAnimationFrame(this.resizeFrame);
      this.resizeFrame = window.requestAnimationFrame(() => {
        this.resizeFrame = null;
        const page = this.targetPage || this.currentPage;
        if (this.viewSignature(page) === this.lastViewSignature && !this.renderActive) return;
        this.render(page);
      });
    }

    destroy() {
      this.destroyed = true;
      if (this.resizeFrame) window.cancelAnimationFrame(this.resizeFrame);
      try { this.renderTask?.cancel(); } catch { /* already complete */ }
      this.loadingTask?.destroy?.();
      this.document?.destroy?.();
    }
  }

  /**
   * Protected, page-based renderer for Project Gutenberg and Archive.org text.
   *
   * The whole book used to live in one enormous text block, so a font-size or
   * fullscreen change forced the browser to re-lay out millions of characters
   * (several seconds on large Hindi scans). The text is now split into
   * fixed-size page sheets, and `content-visibility: auto` keeps off-screen
   * pages out of layout, which makes settings changes near-instant. The sheets
   * also give readers an unambiguous page boundary and a page number.
   */
  class ProtectedTextEngine {
    constructor({ viewport, content, onLocation }) {
      this.type = "text";
      this.viewport = viewport;
      this.content = content;
      this.onLocation = onLocation;
      this.pages = [];
      this.pageCount = 1;
      this.totalPages = 1;
      this.currentPage = 1;
      this.reportedPage = 1;
      this.lastPercent = 0;
      this.reportedPercent = 0;
      this.inPageOffset = 0;
      this.chapterCache = null;
      this.scrollFrame = null;
      this.correctTimer = null;
      this.ignoreObserverUntil = 0;
      this.observer = null;
      this.handleScroll = this.handleScroll.bind(this);
      this.handleIntersections = this.handleIntersections.bind(this);
    }

    async load(payload, record) {
      this.content.hidden = false;
      this.buildPages(payload);

      this.viewport.addEventListener("scroll", this.handleScroll, { passive: true });
      // A narrow band near the top of the viewport decides the current page,
      // so a page number only advances once that page is mostly behind you.
      this.observer = new IntersectionObserver(this.handleIntersections, {
        root: this.viewport,
        rootMargin: "-8% 0px -84% 0px",
        threshold: [0, 0.01, 0.5, 1]
      });
      this.pages.forEach((page) => this.observer.observe(page));

      const pageCount = this.pageCount;
      let target = clamp(Math.round(Number(record.lastVisitedPage) || 1), 1, pageCount);
      const savedPercent = clamp(Number(record.lastScrollPercent) || 0, 0, 100);
      // Records written by the old scroll-based reader can point past this
      // edition's page count; fall back to their saved percentage.
      if (savedPercent > 0 && (Number(record.lastVisitedPage) || 1) > pageCount) {
        target = clamp(Math.round((savedPercent / 100) * (pageCount - 1)) + 1, 1, pageCount);
      }
      this.currentPage = target;
      this.reportedPage = target;

      await afterNextPaint();
      this.goTo(target, { instant: true });
      await afterNextPaint();
      this.reportLocation(true);
    }

    /** Fixed page geometry and a character budget that roughly fills a sheet. */
    pageMetrics() {
      const style = getComputedStyle(this.content);
      const fontSize = Number.parseFloat(style.fontSize) || 16;
      const lineHeight = Number.parseFloat(style.lineHeight) || fontSize * 1.95;
      const cardWidth = Math.min(900, Math.max(300, this.viewport.clientWidth - 48));
      const padding = clamp(cardWidth * 0.045, 22, 46);
      const innerWidth = Math.max(200, cardWidth - padding * 2);
      const pageHeight = Math.max(420, this.viewport.clientHeight - 96);
      const bodyHeight = Math.max(240, pageHeight - padding * 2 - 54);
      const charsPerLine = Math.max(20, innerWidth / (fontSize * 0.56));
      const linesPerPage = Math.max(8, Math.floor(bodyHeight / lineHeight));
      return {
        pageHeight,
        charsPerLine,
        linesPerPage,
        // `contain-intrinsic-size` describes the content box, so subtract the
        // sheet padding. Without this, skipped pages are measured 92px too tall
        // and far page jumps drift.
        intrinsicHeight: Math.max(220, pageHeight - padding * 2),
        // 0.92 leaves headroom for paragraph reflow so most sheets stay close
        // to one screen tall.
        budget: Math.round(clamp(charsPerLine * linesPerPage * 0.92, 700, 4500))
      };
    }

    updatePageHeight(metrics = this.pageMetrics()) {
      this.content.style.setProperty("--reader-page-height", `${Math.round(metrics.pageHeight)}px`);
      this.content.style.setProperty("--reader-page-intrinsic", `${Math.round(metrics.intrinsicHeight)}px`);
    }

    buildPages(payload) {
      const metrics = this.pageMetrics();
      this.updatePageHeight(metrics);
      const groups = payload.fragment
        ? this.splitHtmlPages(payload.fragment, metrics.budget)
        : this.splitTextPages(String(payload.text || ""), metrics);

      const root = document.createElement("div");
      root.className = "reader-pages";
      const total = Math.max(1, groups.length);
      const fragment = document.createDocumentFragment();

      groups.forEach((nodes, index) => {
        const section = document.createElement("section");
        section.className = "reader-page";
        section.dataset.page = String(index + 1);
        section.setAttribute("aria-label", `Page ${index + 1} of ${total}`);

        const body = document.createElement("div");
        body.className = "reader-page-body";
        body.append(...nodes);

        const footer = document.createElement("footer");
        footer.className = "reader-page-footer";
        const label = document.createElement("span");
        label.textContent = `Page ${index + 1} of ${total}`;
        footer.append(label);

        section.append(body, footer);
        fragment.append(section);
        this.pages.push(section);
      });

      root.append(fragment);
      this.content.replaceChildren(root);
      this.pageCount = total;
      this.totalPages = total;
    }

    /**
     * Split plain text into pages of roughly `linesPerPage` visual lines.
     * Counting lines (instead of characters) matters for Hindi OCR scans,
     * whose lines are short and hard-wrapped by the source.
     */
    splitTextPages(text, { charsPerLine, linesPerPage }) {
      const nodes = [];
      const maxLineChars = Math.max(240, Math.floor(charsPerLine * linesPerPage));
      let current = "";
      let currentLines = 0;
      const flush = () => {
        if (current.trim().length) nodes.push(document.createTextNode(current));
        current = "";
        currentLines = 0;
      };
      const addLongLine = (line) => {
        let rest = line.replace(/^\s+/, "");
        while (rest.length > maxLineChars) {
          let cut = rest.lastIndexOf(" ", maxLineChars);
          if (cut < maxLineChars * 0.5) cut = maxLineChars;
          nodes.push(document.createTextNode(rest.slice(0, cut)));
          rest = rest.slice(cut).replace(/^\s+/, "");
        }
        current = rest;
        currentLines = Math.max(1, Math.ceil(rest.length / charsPerLine));
      };

      String(text || "").replace(/\r\n?/g, "\n").split("\n").forEach((line) => {
        if (line.length > maxLineChars) {
          if (current.trim().length) flush();
          addLongLine(line);
          return;
        }
        const visualLines = Math.max(1, Math.ceil(line.length / charsPerLine));
        if (currentLines && currentLines + visualLines > linesPerPage) flush();
        current = current ? `${current}\n${line}` : line;
        currentLines += visualLines;
        if (currentLines >= linesPerPage) flush();
      });
      flush();
      if (!nodes.length) nodes.push(document.createTextNode(""));
      return nodes.map((node) => [node]);
    }

    /** Split sanitised HTML at block boundaries, keeping markup intact. */
    splitHtmlPages(fragment, budget) {
      const groups = [];
      let current = [];
      let length = 0;
      const isBlock = (node) => node.nodeType === Node.ELEMENT_NODE
        && /^(P|DIV|SECTION|ARTICLE|MAIN|HEADER|FOOTER|LI|UL|OL|DL|DT|DD|BLOCKQUOTE|PRE|H[1-6]|TABLE|FIGURE|FIGCAPTION|HR)$/.test(node.tagName);
      const flush = () => {
        if (current.length) groups.push(current);
        current = [];
        length = 0;
      };

      [...fragment.childNodes].forEach((node) => {
        const nodeLength = (node.textContent || "").length;
        const boundary = isBlock(node) || node.nodeType === Node.TEXT_NODE;
        if (boundary && length && length + nodeLength > budget) flush();
        current.push(node);
        length += nodeLength;
        if (boundary && length >= budget) flush();
      });
      flush();
      if (!groups.length) groups.push([document.createTextNode("")]);
      return groups;
    }

    calculateLocation() {
      const viewportHeight = Math.max(1, this.viewport.clientHeight);
      const maxScroll = Math.max(0, this.viewport.scrollHeight - viewportHeight);
      const scrollPercent = maxScroll ? (this.viewport.scrollTop / maxScroll) * 100 : 100;
      return {
        page: this.currentPage,
        totalPages: this.pageCount,
        scrollPercent,
        engine: this.type
      };
    }

    reportLocation(force = false) {
      const location = this.calculateLocation();
      this.lastPercent = location.scrollPercent;
      this.rememberInPageOffset();
      if (force || location.page !== this.reportedPage || Math.abs(location.scrollPercent - this.reportedPercent) >= 0.5) {
        this.reportedPage = location.page;
        this.reportedPercent = location.scrollPercent;
        this.onLocation(location);
      }
    }

    rememberInPageOffset() {
      const page = this.pages[this.currentPage - 1];
      if (!page) return;
      const rect = page.getBoundingClientRect();
      const stageTop = this.viewport.getBoundingClientRect().top;
      this.inPageOffset = clamp(rect.top - stageTop, -Math.max(0, rect.height - 60), 0);
    }

    handleIntersections(entries) {
      // Programmatic jumps scroll through many pages; let goTo() own the label
      // until the smooth scroll settles instead of flickering page numbers.
      if (performance.now() < this.ignoreObserverUntil) return;
      const stageRect = this.viewport.getBoundingClientRect();
      const bandTop = stageRect.top + stageRect.height * 0.08;
      const bandBottom = stageRect.top + stageRect.height * 0.16;
      let best = null;
      let bestOverlap = 0;
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const overlap = Math.min(entry.boundingClientRect.bottom, bandBottom)
          - Math.max(entry.boundingClientRect.top, bandTop);
        if (overlap > bestOverlap) {
          bestOverlap = overlap;
          best = entry.target;
        }
      });
      if (!best) return;
      const page = Number(best.dataset.page) || 1;
      if (page === this.currentPage) return;
      this.currentPage = page;
      this.inPageOffset = 0;
      this.reportLocation(true);
    }

    handleScroll() {
      if (this.scrollFrame) return;
      this.scrollFrame = window.requestAnimationFrame(() => {
        this.scrollFrame = null;
        this.reportLocation();
      });
    }

    goTo(pageNumber, { instant = false } = {}) {
      const page = clamp(Math.round(Number(pageNumber) || this.currentPage), 1, this.pageCount);
      const target = this.pages[page - 1];
      if (!target) return;
      const previous = this.currentPage;
      const farJump = Math.abs(page - previous) > 3;
      this.currentPage = page;
      this.inPageOffset = 0;
      this.ignoreObserverUntil = performance.now() + (instant || farJump ? 700 : 460);
      const top = target.getBoundingClientRect().top - this.viewport.getBoundingClientRect().top + this.viewport.scrollTop;
      this.viewport.scrollTo({ top: Math.max(0, top), behavior: instant || farJump ? "auto" : "smooth" });
      window.clearTimeout(this.correctTimer);

      // Off-screen sheets are measured from an intrinsic size, so a long jump
      // can land a little short. Nudge towards the sheet until its top is at
      // the viewport top.
      let attempts = 0;
      const settle = () => {
        const delta = target.getBoundingClientRect().top - this.viewport.getBoundingClientRect().top;
        if (Math.abs(delta) > 2 && attempts < 4) {
          this.viewport.scrollTop = Math.max(0, this.viewport.scrollTop + delta);
          attempts += 1;
          this.correctTimer = window.setTimeout(settle, 150);
          return;
        }
        this.ignoreObserverUntil = Math.max(this.ignoreObserverUntil, performance.now() + 60);
        this.reportLocation(true);
      };

      if (instant || farJump) {
        this.reportLocation(true);
        this.correctTimer = window.setTimeout(settle, 80);
      } else {
        this.correctTimer = window.setTimeout(settle, 360);
      }
    }

    goToPercent(percent) {
      const page = clamp(Math.round((clamp(Number(percent) || 0, 0, 100) / 100) * (this.pageCount - 1)) + 1, 1, this.pageCount);
      this.goTo(page);
    }

    getChapters() {
      if (this.chapterCache) return this.chapterCache;
      this.chapterCache = [...this.content.querySelectorAll("h1, h2, h3")]
        .map((heading, index) => {
          const page = heading.closest(".reader-page");
          return {
            index,
            label: heading.textContent.trim().replace(/\s+/g, " "),
            page: Number(page?.dataset.page) || 1
          };
        })
        .filter((chapter) => chapter.label);
      return this.chapterCache;
    }

    scrollToChapter(index) {
      const chapter = this.getChapters()[index];
      if (chapter) this.goTo(chapter.page);
    }

    previous() { this.goTo(this.currentPage - 1); }
    next() { this.goTo(this.currentPage + 1); }

    resize() {
      const page = this.currentPage;
      const offset = this.inPageOffset;
      window.requestAnimationFrame(() => {
        this.updatePageHeight();
        const target = this.pages[page - 1];
        if (target) {
          const top = target.getBoundingClientRect().top - this.viewport.getBoundingClientRect().top + this.viewport.scrollTop + offset;
          this.viewport.scrollTop = Math.max(0, top);
        }
        this.reportLocation(true);
      });
    }

    destroy() {
      if (this.scrollFrame) window.cancelAnimationFrame(this.scrollFrame);
      window.clearTimeout(this.correctTimer);
      this.observer?.disconnect();
      this.viewport.removeEventListener("scroll", this.handleScroll);
    }
  }

  class ReaderManager {
    constructor({ container, cache, state, preferences, savePreferences, isComplete, onClose, notify, watermark }) {
      this.container = container;
      this.cache = cache;
      this.state = state;
      this.preferencesApi = preferences;
      this.savePreferences = savePreferences;
      this.isComplete = isComplete;
      this.onClose = onClose;
      this.notify = notify;
      this.watermark = watermark;
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
      this.sessionCode = createSessionCode();
      this.watermarkPageKey = "";
      this.gestureCooldownUntil = 0;
      this.wheelAccumulator = 0;
      this.wheelResetTimer = null;
      this.loadingClock = null;
      this.loadingMessage = "";
      this.loadingStartedAt = 0;
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
      this.renderWatermark();
      // Refresh the forensic stamp every minute so a shared screenshot can be
      // tied to a rough time as well as to the signed-in account.
      window.clearInterval(this.watermarkTimer);
      this.watermarkTimer = window.setInterval(() => this.renderWatermark(), 60000);
      this.startLoadingClock();
      this.applyPreferences();
      if (window.matchMedia?.("(max-width: 900px), (max-height: 560px)").matches) this.root.classList.add("notes-closed");

      try {
        const source = await this.loadSource(book);
        if (this.destroyed) return;
        this.currentBytes = source.bytes ? source.bytes.slice(0) : null;
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
            onProgress: (message) => this.setLoading(message),
            getPdfJs: () => this.waitForPdfJs(),
            getViewOptions: () => {
              const preferences = this.preferencesApi();
              return { zoom: preferences.pdfZoom, layout: this.effectivePdfLayout() };
            }
          });
          await this.engine.load(source, record);
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
          this.stopLoadingClock();
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
              <div class="reader-setting"><span>Page layout</span><div class="reader-setting-buttons"><button type="button" data-reader-layout="auto">Auto</button><button type="button" data-reader-layout="portrait">Portrait</button><button type="button" data-reader-layout="landscape">Landscape</button></div></div>
              <label class="reader-setting"><span>Line spacing</span><select id="reader-line-height"><option value="1.6">Compact</option><option value="1.95">Comfortable</option><option value="2.2">Relaxed</option></select></label>
              <div class="reader-setting reader-setting-note">
                <span>Protection</span>
                <small id="reader-watermark-code">Loading your watermark…</small>
                <p>Pages are stamped with your account, a per-session code and the time. A browser cannot stop a phone's own screenshot tool, but every copy stays traceable.</p>
              </div>
            </div>
            <div class="reader-progress-track" aria-hidden="true"><div class="reader-progress-fill" id="reader-progress-fill"></div></div>
          </header>
          <div class="reader-watermark" id="reader-watermark" aria-hidden="true" hidden></div>
          <div class="reader-workspace">
            <main class="reader-stage" id="reader-stage">
              <div class="reader-loading" id="reader-loading" role="status"><span class="reader-spinner" aria-hidden="true"></span><p id="reader-loading-text">Checking browser storage…</p></div>
              <canvas id="pdf-canvas" tabindex="0" hidden aria-label="PDF page canvas"></canvas>
              <article class="text-reader-content" id="text-reader-content" tabindex="0" hidden aria-label="Protected book text"></article>
              <p class="reader-security-note">Protected in-app view · every page is watermarked to your account · swipe or scroll sideways to turn pages</p>
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

    /**
     * Faint, per-account forensic watermark. A screenshot cannot be blocked,
     * but the account, the minute and the per-session code make a shared copy
     * traceable to one reader session and one page.
     */
    renderWatermark(location = this.lastLocation) {
      const layer = this.root?.querySelector("#reader-watermark");
      if (!layer) return;
      const account = String(this.watermark?.() || "").trim();
      if (!account) {
        layer.hidden = true;
        return;
      }
      const page = Number(location?.page) || 0;
      const total = Number(location?.totalPages) || 0;
      const details = [this.sessionCode];
      if (page && total) details.push(`p.${page}/${total}`);
      const text = `${account} · ${details.join(" · ")}`;
      const codeField = this.root?.querySelector("#reader-watermark-code");
      if (codeField) codeField.textContent = `${account} · ${this.sessionCode}`;
      this.watermarkPageKey = page && total ? `${page}/${total}` : "";
      layer.hidden = false;
      const tile = `<span>${escapeHTML(text)}</span>`;
      layer.innerHTML = Array.from({ length: 24 }, () => tile).join("");
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
      this.bindPageGestures();
      window.addEventListener("resize", this.handleResize);
      window.addEventListener("keydown", this.handleKeydown);
    }

    /**
     * Page turning by touch and trackpad. Horizontal swipes or sideways
     * scrolling always change the page. PDF pages that are taller than the
     * screen keep native vertical scrolling; once the page is at its bottom a
     * further upward swipe (or downward wheel) opens the next page.
     */
    bindPageGestures() {
      const stage = this.viewport;
      let touch = null;

      stage.addEventListener("touchstart", (event) => {
        if (event.touches.length !== 1) {
          touch = null;
          return;
        }
        const point = event.touches[0];
        touch = {
          x: point.clientX,
          y: point.clientY,
          atTop: stage.scrollTop <= 2,
          atBottom: stage.scrollTop + stage.clientHeight >= stage.scrollHeight - 2
        };
      }, { passive: true });

      stage.addEventListener("touchend", (event) => {
        if (!touch) return;
        const point = event.changedTouches[0];
        const started = touch;
        touch = null;
        this.handlePageGesture(point.clientX - started.x, point.clientY - started.y, started);
      }, { passive: true });

      stage.addEventListener("wheel", (event) => this.handleWheelNavigation(event), { passive: false });
    }

    handlePageGesture(dx, dy, started) {
      if (performance.now() < this.gestureCooldownUntil) return;
      const horizontallyScrollable = this.viewport.scrollWidth > this.viewport.clientWidth + 4;
      const horizontal = Math.abs(dx) > 56 && Math.abs(dx) > Math.abs(dy) * 1.2;
      if (horizontal && !horizontallyScrollable) {
        this.turnPage(dx < 0 ? 1 : -1);
        return;
      }
      if (this.engine?.type !== "pdf") return;
      if (Math.abs(dy) < 64 || Math.abs(dy) < Math.abs(dx) * 1.2) return;
      if (dy < 0 && started.atBottom) this.turnPage(1);
      else if (dy > 0 && started.atTop) this.turnPage(-1);
    }

    handleWheelNavigation(event) {
      if (event.ctrlKey) return;
      const horizontallyScrollable = this.viewport.scrollWidth > this.viewport.clientWidth + 4;
      const horizontal = Math.abs(event.deltaX) > Math.abs(event.deltaY) * 1.15;
      const shifted = event.shiftKey && Math.abs(event.deltaY) > Math.abs(event.deltaX);

      if ((horizontal || shifted) && !horizontallyScrollable) {
        event.preventDefault();
        if (performance.now() < this.gestureCooldownUntil) return;
        window.clearTimeout(this.wheelResetTimer);
        this.wheelAccumulator += shifted ? event.deltaY : event.deltaX;
        this.wheelResetTimer = window.setTimeout(() => { this.wheelAccumulator = 0; }, 260);
        if (Math.abs(this.wheelAccumulator) < 52) return;
        const direction = this.wheelAccumulator > 0 ? 1 : -1;
        this.wheelAccumulator = 0;
        this.turnPage(direction);
        return;
      }

      if (this.engine?.type !== "pdf" || Math.abs(event.deltaY) < 8) return;
      const stage = this.viewport;
      const atBottom = stage.scrollTop + stage.clientHeight >= stage.scrollHeight - 2;
      const atTop = stage.scrollTop <= 2;
      if (event.deltaY > 0 ? !atBottom : !atTop) return;
      event.preventDefault();
      this.turnPage(event.deltaY > 0 ? 1 : -1);
    }

    turnPage(direction) {
      if (performance.now() < this.gestureCooldownUntil) return;
      this.gestureCooldownUntil = performance.now() + 420;
      this.changeLocation(direction > 0 ? "next" : "previous");
    }

    applyPreferences() {
      const preferences = this.preferencesApi();
      const theme = ["paper", "sepia", "night"].includes(preferences.theme) ? preferences.theme : "paper";
      const layout = ["auto", "portrait", "landscape"].includes(preferences.layout) ? preferences.layout : "auto";
      const fontSize = clamp(Number(preferences.fontSize) || 1, 0.8, 2);
      const lineHeight = clamp(Number(preferences.lineHeight) || 1.95, 1.4, 2.4);
      this.root.dataset.readerTheme = theme;
      this.root.dataset.readerLayout = layout;
      // A zoomed PDF may be wider than the stage, so it needs native
      // horizontal panning; everything else turns pages on a sideways swipe.
      const pdfZoomed = this.book?.reader?.engine === "pdf" && (Number(preferences.pdfZoom) || 1) > 1;
      if (this.viewport) this.viewport.style.touchAction = pdfZoomed ? "pan-x pan-y" : "pan-y";
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

    /**
     * "Auto" fits the page to the reading width, so a phone held sideways uses
     * the landscape screen and a desktop page grows with the window. Explicit
     * Portrait caps the width, Landscape fits the whole page at once.
     */
    effectivePdfLayout() {
      const preference = this.preferencesApi().layout;
      return ["auto", "portrait", "landscape"].includes(preference) ? preference : "auto";
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
      if (key === "layout") {
        next.layout = ["auto", "portrait", "landscape"].includes(value) ? value : "auto";
        // Remember that the reader made a deliberate choice, so a future
        // default change never overrides it.
        next.layoutExplicit = next.layout !== "auto";
      }
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
        this.setLoading("Opening the PDF edition…");
        const sourceUrl = safeDocumentUrl(book.reader.sourceUrl);
        if (!sourceUrl) throw new Error("The PDF source URL is invalid.");
        return {
          key: book.key,
          sourceIdentity: identity,
          engine: "pdf",
          mimeType: book.reader.mimeType || "application/pdf",
          title: book.title,
          url: sourceUrl,
          bytes: null,
          cached: false
        };
      }

      const fetched = await loadTextDocument(book, (message) => this.setLoading(message));
      return {
        key: book.key,
        sourceIdentity: identity,
        engine: "text",
        mimeType: fetched.mimeType,
        title: book.title,
        bytes: fetched.bytes,
        cached: Boolean(fetched.cached)
      };
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
      const pageKey = `${location.page}/${location.totalPages}`;
      if (pageKey !== this.watermarkPageKey) this.renderWatermark(location);
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
      if (direction === "first" || direction === "last") {
        const total = Number(this.engine?.totalPages) || Number(this.lastLocation?.totalPages) || 1;
        if (direction === "first") this.engine?.goTo?.(1);
        else this.engine?.goTo?.(total);
        return;
      }
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
      if (this.destroyed || this.book.source === "custom") return;
      this.offlineInput.disabled = true;
      try {
        if (enabled) {
          // PDFs open through PDF.js range requests, so the full file may not
          // be in memory yet. Download it once, only when asked to go offline.
          if (!this.currentBytes && this.book.reader.engine === "pdf") {
            this.offlineStatus.textContent = "Downloading the full PDF…";
            const fetched = await this.fetchDocumentResource(this.book.reader.sourceUrl, this.book.reader.mimeType);
            this.currentBytes = fetched.bytes;
            this.currentMimeType = fetched.mimeType;
          }
          if (!this.currentBytes) return;
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
        // A phone rotated to landscape has no room for the notes column.
        if (window.matchMedia?.("(max-height: 560px), (max-width: 900px)").matches) {
          this.root?.classList.add("notes-closed");
        }
        this.saveNoteNow();
        this.engine?.resize?.();
        if (this.engine?.type === "text") this.buildChapters();
      }, 180);
    }

    handleKeydown(event) {
      const tag = event.target?.tagName?.toLowerCase();
      if (["input", "textarea", "select"].includes(tag)) return;
      const isPdf = this.engine?.type === "pdf";
      if (event.key === "ArrowLeft") this.changeLocation("previous");
      if (event.key === "ArrowRight") this.changeLocation("next");
      if (event.key === "PageDown" || (isPdf && event.key === "ArrowDown")) {
        event.preventDefault();
        this.changeLocation("next");
      }
      if (event.key === "PageUp" || (isPdf && event.key === "ArrowUp")) {
        event.preventDefault();
        this.changeLocation("previous");
      }
      if (event.key === "Home") {
        event.preventDefault();
        this.changeLocation("first");
      }
      if (event.key === "End") {
        event.preventDefault();
        this.changeLocation("last");
      }
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
      this.loading.classList.remove("error");
      this.loadingMessage = message;
      if (!this.loadingStartedAt) this.loadingStartedAt = Date.now();
      this.loadingText.textContent = this.loadingLabel();
    }

    loadingLabel() {
      if (!this.loadingStartedAt) return this.loadingMessage;
      const seconds = Math.floor((Date.now() - this.loadingStartedAt) / 1000);
      if (seconds < 2) return this.loadingMessage;
      const note = seconds >= 6 ? " · first read saves a cached copy" : "";
      return `${this.loadingMessage} ${seconds}s${note}`;
    }

    startLoadingClock() {
      this.loadingStartedAt = Date.now();
      this.loadingMessage = this.loadingText?.textContent?.trim() || "Preparing the reader…";
      window.clearInterval(this.loadingClock);
      this.loadingClock = window.setInterval(() => {
        if (!this.loading || this.loading.hidden || this.loading.classList.contains("error")) return;
        this.loadingText.textContent = this.loadingLabel();
      }, 500);
    }

    stopLoadingClock() {
      window.clearInterval(this.loadingClock);
      this.loadingClock = null;
      this.loadingStartedAt = 0;
    }

    showError(message) {
      this.stopLoadingClock();
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
      window.clearTimeout(this.wheelResetTimer);
      window.clearInterval(this.watermarkTimer);
      this.stopLoadingClock();
      window.removeEventListener("resize", this.handleResize);
      window.removeEventListener("keydown", this.handleKeydown);
      document.removeEventListener("fullscreenchange", this.handleFullscreenChange);
      if (document.fullscreenElement === this.root) Promise.resolve(document.exitFullscreen?.()).catch(() => {});
      this.abortController?.abort();
      this.engine?.destroy?.();
      this.currentBytes = null;
    }
  }

  window.LibraryReaders = Object.freeze({
    DocumentCacheService,
    ReaderManager,
    /* Warm the text cache before the click so the reader opens instantly. */
    prefetchText: (book) => {
      if (!book?.reader || book.reader.engine !== "text") return Promise.resolve(null);
      return loadTextDocument(book).catch(() => null);
    }
  });
})();
