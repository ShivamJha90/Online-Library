/*
 * Gutendex API client
 * -------------------
 * All remote catalog concerns live in this module: URL construction, request
 * cancellation, response validation, and normalization into one UI-safe shape.
 */
(() => {
  "use strict";

  const Config = window.LibraryConfig;
  if (!Config) throw new Error("LibraryConfig must load before api.js.");

  class LibraryApiError extends Error {
    constructor(message, status = null) {
      super(message);
      this.name = "LibraryApiError";
      this.status = status;
    }
  }

  const httpsUrl = (value) => {
    try {
      const url = new URL(String(value));
      return url.protocol === "https:" ? url.href : null;
    } catch {
      return null;
    }
  };

  const humanizeAuthor = (name = "Unknown author") => {
    const parts = String(name).split(",").map((part) => part.trim()).filter(Boolean);
    return parts.length === 2 ? `${parts[1]} ${parts[0]}` : String(name);
  };

  const selectFormat = (formats, prefix) => Object.entries(formats || {})
    .filter(([mime, url]) => mime.toLowerCase().startsWith(prefix) && httpsUrl(url))
    .sort(([firstMime], [secondMime]) => {
      const firstUtf8 = firstMime.toLowerCase().includes("utf-8") ? 0 : 1;
      const secondUtf8 = secondMime.toLowerCase().includes("utf-8") ? 0 : 1;
      return firstUtf8 - secondUtf8;
    })[0] || null;

  class GutendexClient {
    constructor(baseUrl = Config.GUTENDEX_BASE_URL) {
      this.baseUrl = baseUrl;
    }

    async request(parameters = {}, signal = null) {
      const url = new URL(this.baseUrl);
      Object.entries(parameters).forEach(([key, value]) => {
        if (value !== null && value !== undefined && value !== "") url.searchParams.set(key, String(value));
      });

      // Gutendex is a public service and can occasionally stall on expensive
      // queries. A local controller combines caller cancellation with a hard
      // timeout so loading indicators always resolve to data or an error state.
      const requestController = new AbortController();
      let timedOut = false;
      const forwardAbort = () => requestController.abort(signal?.reason);
      if (signal?.aborted) forwardAbort();
      else signal?.addEventListener("abort", forwardAbort, { once: true });
      const timeout = window.setTimeout(() => {
        timedOut = true;
        requestController.abort();
      }, 20000);

      let response;
      try {
        response = await fetch(url, {
          method: "GET",
          headers: { Accept: "application/json" },
          credentials: "omit",
          signal: requestController.signal
        });
      } catch (error) {
        if (timedOut) throw new LibraryApiError("The live library request timed out. Try a shorter search.");
        if (signal?.aborted || error.name === "AbortError") throw error;
        throw new LibraryApiError("The live library could not be reached. Check your connection and retry.");
      } finally {
        window.clearTimeout(timeout);
        signal?.removeEventListener("abort", forwardAbort);
      }

      if (!response.ok) {
        throw new LibraryApiError(`Gutendex returned HTTP ${response.status}.`, response.status);
      }

      let payload;
      try {
        payload = await response.json();
      } catch {
        throw new LibraryApiError("Gutendex returned an unreadable response.", response.status);
      }
      if (!payload || !Array.isArray(payload.results)) {
        throw new LibraryApiError("Gutendex returned an unexpected data shape.", response.status);
      }

      return {
        count: Number(payload.count) || 0,
        next: payload.next || null,
        previous: payload.previous || null,
        books: payload.results.map((book) => this.normalizeBook(book))
      };
    }

    popular(signal) {
      return this.request({ sort: "popular" }, signal);
    }

    newest(signal) {
      return this.request({ sort: "descending" }, signal);
    }

    search(query, page = 1, signal = null, options = {}) {
      const parameters = { search: String(query).trim() };
      if (Number(page) > 1) parameters.page = Number(page);
      if (options.language) parameters.languages = String(options.language).trim();
      if (options.sort && options.sort !== "relevance") parameters.sort = String(options.sort).trim();
      return this.request(parameters, signal);
    }

    byIds(ids, signal = null) {
      const normalizedIds = [...new Set(ids.map(Number).filter((id) => Number.isInteger(id) && id > 0))];
      if (!normalizedIds.length) return Promise.resolve({ count: 0, next: null, previous: null, books: [] });
      return this.request({ ids: normalizedIds.join(",") }, signal);
    }

    normalizeBook(rawBook) {
      const formats = rawBook.formats || {};
      const plainText = selectFormat(formats, "text/plain");
      const htmlText = selectFormat(formats, "text/html");
      const selectedReader = plainText || htmlText;
      const authors = Array.isArray(rawBook.authors) && rawBook.authors.length
        ? rawBook.authors.map((author) => humanizeAuthor(author.name))
        : ["Unknown author"];
      const shelf = rawBook.bookshelves?.[0]?.replace(/^Category:\s*/i, "");
      const subject = rawBook.subjects?.[0]?.split(" -- ")[0];
      const summary = rawBook.summaries?.[0]
        ?.replace(/\s*\(This is an automatically generated summary\.\)\s*$/i, "")
        || `A public-domain title by ${authors[0]}, available through Project Gutenberg.`;

      return {
        key: `gutenberg-${rawBook.id}`,
        id: Number(rawBook.id),
        source: "gutendex",
        title: String(rawBook.title || "Untitled"),
        author: authors[0],
        authors,
        category: shelf || subject || "General collection",
        subjects: Array.isArray(rawBook.subjects) ? rawBook.subjects.slice(0, 8) : [],
        languages: Array.isArray(rawBook.languages) ? rawBook.languages : [],
        summary,
        coverUrl: httpsUrl(formats["image/jpeg"]),
        sourceUrl: `https://www.gutenberg.org/ebooks/${rawBook.id}`,
        downloadCount: Number(rawBook.download_count) || 0,
        copyright: Boolean(rawBook.copyright),
        reader: selectedReader ? {
          engine: "text",
          sourceUrl: httpsUrl(selectedReader[1]),
          mimeType: selectedReader[0]
        } : null
      };
    }
  }

  window.LibraryApi = Object.freeze({ GutendexClient, LibraryApiError });
})();
