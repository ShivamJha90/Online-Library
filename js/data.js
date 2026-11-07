/*
 * Lumina configuration and initial state
 * --------------------------------------
 * The book catalog is intentionally absent from this file. Catalog metadata
 * comes from Gutendex at runtime; only user identities and state defaults live
 * here. Passwords are represented by SHA-256 hashes for this static demo.
 */
(() => {
  "use strict";

  const DAY_IN_MS = 24 * 60 * 60 * 1000;
  const isoFromNow = (days) => new Date(Date.now() + (days * DAY_IN_MS)).toISOString();

  const users = [
    {
      id: "student-maya",
      name: "Maya Chen",
      email: "maya@lumina.local",
      role: "student",
      initials: "MC",
      passwordHash: "79ff5644f062a15f804fa0c478d8c70e96be9948572d8965b0a2b19697c201c7"
    },
    {
      id: "admin-elena",
      name: "Elena Brooks",
      email: "elena@lumina.local",
      role: "admin",
      initials: "EB",
      passwordHash: "6051fc84a7a0d74c225fb18a496b09952da5642e60723ecae543298edd7d82d6"
    }
  ];

  const createInitialState = () => ({
    schemaVersion: 5,
    session: { currentUserId: null, authenticatedAt: null },
    catalogRecords: {},
    customBooks: [],
    readingActivity: {
      "student-maya": {
        "gutenberg-1342": {
          source: "gutendex",
          sourceId: 1342,
          startedAt: isoFromNow(-8),
          lastReadAt: isoFromNow(-1),
          completedAt: isoFromNow(-1)
        },
        "gutenberg-84": {
          source: "gutendex",
          sourceId: 84,
          startedAt: isoFromNow(-10),
          lastReadAt: isoFromNow(-4),
          completedAt: isoFromNow(-4)
        }
      },
      "admin-elena": {}
    },
    readerState: {},
    savedBooks: {
      "student-maya": [],
      "admin-elena": []
    },
    achievements: [],
    preferences: {
      searchQuery: ""
    }
  });

  window.LibraryConfig = Object.freeze({
    STATE_KEY: "lumina-live-library-v5",
    LEGACY_STATE_KEYS: ["lumina-library-dashboard-v4", "lumina-library-dashboard-v3"],
    SCHEMA_VERSION: 5,
    GUTENDEX_BASE_URL: "https://gutendex.com/books/",
    TEXT_PROXY_BASE_URL: "https://r.jina.ai/",
    PDF_JS_VERSION: "6.4.299",
    CACHE_DATABASE_NAME: "lumina-document-cache",
    CACHE_STORE_NAME: "documents",
    MAX_TEXT_BYTES: 12 * 1024 * 1024,
    MAX_PDF_BYTES: 50 * 1024 * 1024,
    AVID_READER_TARGET: 3,
    AVID_READER_WINDOW_DAYS: 7,
    DAY_IN_MS,
    users,
    createInitialState
  });
})();
