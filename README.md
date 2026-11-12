# ScholarScroll

**ScholarScroll** is a browser-only student library built with vanilla JavaScript. It combines a live public-domain catalog, a protected reading experience, local reading analytics, streak badges, and printable certificates with QR verification.

> **Demo notice.** ScholarScroll has no backend. Authentication, badges and certificates are local browser demonstrations. They are not production identity or credential systems.

## Features

### Live catalog
- Search **79,000+ Project Gutenberg editions** through the public [Gutendex](https://gutendex.com/) API.
- Predictive search suggestions blending local history and live catalog results.
- Language and sorting filters, paginated search with “Load more”.
- Shareable book links (`#book/<book-key>`), cover fallbacks, loading skeletons, and graceful API error states.
- Saved books keep a metadata snapshot so the collection still renders while the API is offline.

### Reader
- Text/HTML reader with allowlist-based sanitization, Gutenberg licence-wrapper removal, and charset detection.
- Administrator and bundled PDFs are rendered with PDF.js onto a canvas.
- **Zoom controls** in the toolbar (`−`, percentage, `+`, and click-to-reset) plus the same controls in the appearance panel.
- **Portrait / landscape layout**: portrait fits the page width and scrolls; landscape fits the page height and uses two columns for text editions.
- **Light, sepia and dark themes**, with a one-click light/dark toggle in the toolbar.
- **Full screen** reading from the toolbar button or the `F` key; the toolbar and notes stay available and `Esc`/`F` returns to the normal view.
- Adjustable text size, line spacing and saved reader preferences.
- Chapter shortcuts for text editions, stable percent-based bookmarks, page bookmarks for PDFs, and per-page notes.
- Progress is saved at most once per second and never regresses after a book is completed.
- Optional per-book offline copies stored in IndexedDB.

### Streaks, badges and certificates
- Each local calendar day with reading activity extends a streak.
- Milestones at **1, 7, 30, 180 and 365 consecutive days** unlock named badges.
- Badge modals show the reader’s name, milestone, congratulations and date earned, and can be printed.
- Completing **3 books inside 7 days** unlocks an **Avid Reader certificate** celebrating hard work, dedication and consistency.
- The certificate contains a locally generated QR code. On a hosted or LAN origin, scanning opens `#verify/<token>` with:
  - the recipient’s name,
  - the date received,
  - the books completed at that time,
  - the certificate ID and reading target.
- On `localhost`/`127.0.0.1` a phone cannot reach the development machine, so the QR carries the same details as readable text. Set **Settings → Certificate share link** to a hosted or Wi-Fi address to make the QR open the full verification page.

### Premium books
- The premium shelf is visible to everyone. Every premium title — public-domain classics and the supplied PDF reader editions — is **free to read for any signed-in member**, exactly like the normal catalog.
- There is no voucher, unlock or time limit on the current premium shelf. A dedicated paid section is planned for the future and is not part of this build.
- The reading-history state still carries the older `premiumUnlocks` and `rewardClaims` fields so a future paid tier can reuse them without a schema migration.

#### Reader editions
- The premium page includes a PDF shelf of editions supplied by the project owner: *The Power of Your Subconscious Mind*, *The 4-Hour Workweek*, *The Almanack of Naval Ravikant*, *Wealth* (Emerson), *The Game of Life and How to Play It*, *Think and Grow Rich*, *Atomic Habits*, *The Richest Man in Babylon*, *The Science of Getting Rich*, *The Art of Money Getting*, *As a Man Thinketh* and *Acres of Diamonds*.
- These PDFs live in `assets/premium/` and open in the same PDF.js reader as administrator uploads, with zoom, portrait/landscape layout and light/dark themes.
- Some of these titles remain in copyright. They are included only because the project owner supplied the files; check that you have the right to use each copy in your jurisdiction. They are not downloads from Project Gutenberg.

#### Modern bestsellers spotlight
- The bottom of the premium page previews popular modern titles that still have no supplied reader copy: *Rich Dad Poor Dad*, *The 7 Habits of Highly Effective People* and *How to Win Friends and Influence People*.
- These works are **still in copyright**, so the app stores metadata and a cover reference only. It does **not** bundle or fetch their full text.
- Each spotlight card is labelled *Copyrighted / Preview only* and links to an Open Library record so readers can find a licensed copy. The rest of the premium page is fully readable.

### Dashboard & administration
- Completed books, current streak, personal-best streak, reading days and certificate counts.
- Continue-reading card, saved shelf, recommendations, streak milestones and certificate shelf.
- Admin PDF upload with signature/size validation, IndexedDB storage, browser storage estimates, and delete actions.
- Settings for account summary, reader preferences, certificate share link, storage estimates, and local-state reset.

### PWA, SEO and accessibility
- `manifest.webmanifest`, generated icons, and a service worker for the app shell and runtime caching.
- Navigation requests fall back to the cached shell when the origin is unreachable **or** returns a 5xx response, so a reverse-proxy error does not replace the offline app.
- Dynamic document title, description, canonical URL, Open Graph/Twitter tags and JSON-LD for books/routes.
- Skip link, visible focus states, route announcements, focus-managed dialogs, combobox semantics, reduced-motion support.
- Trust pages: About, Sources & Licensing, Privacy and Accessibility.

## Demo accounts

| Role | Email | Password |
| --- | --- | --- |
| Student | `maya@scholarscroll.local` | `reader2026` |
| Admin | `elena@scholarscroll.local` | `admin2026` |

The login dialog also provides one-click **Student demo** and **Admin demo** buttons. Never enter a real password.

The seeded student profile has two completed books and a five-day streak, so you can:
1. Open a third book, mark it complete, and unlock the certificate with its QR record.
2. Open a book to keep the streak alive and inspect the 1-day badge.

## Run locally

The app is static, but the service worker and PDF.js modules require an HTTP origin.

On Windows, double-click **`serve-local.cmd`** in the project folder. It starts the server on port 8124 and opens <http://127.0.0.1:8124/>.

Or run it manually:

```powershell
python -m http.server 8124 --bind 127.0.0.1
```

Open <http://127.0.0.1:8124/>.

To test certificate QR links with a phone on the same Wi-Fi, bind to all interfaces and use the computer's LAN address:

```powershell
python -m http.server 8124 --bind 0.0.0.0
```

Open `http://<your-lan-ip>:8124/` (for example `http://192.168.1.20:8124/`), then either leave the certificate share link empty (the current origin is used automatically) or enter that address under **Settings → Certificate share link**. A phone cannot reach `127.0.0.1`, so a localhost QR intentionally falls back to a readable text summary.

If the page looks stale after an update, hard-refresh once with **Ctrl + Shift + R**. The server must stay running while you use the app; closing its window stops the site.

Do not open `index.html` through `file://` if you want service-worker caching or module imports to behave normally.

## Project structure

```
index.html                 Application shell, metadata, footer
css/styles.css             Full dark editorial UI + reader/certificate styles
js/data.js                 Config, demo identities, schema v7 seed state, premium catalog
js/api.js                  Gutendex client and normalization
js/reader.js               Text/PDF engines, IndexedDB cache, reader UI
js/app.js                  State store, auth demo, router, views, badges/certificates
js/vendor/qrcode.js        MIT qrcode-generator by Kazuhiko Arase
assets/                    Optimized logo, favicon, PWA icons
assets/premium/            User-supplied premium PDF reader editions
sw.js                      Offline app-shell/runtime worker
manifest.webmanifest       PWA manifest
robots.txt, sitemap.xml    Crawler hints (replace example origin)
serve-local.cmd            Windows one-click local preview on port 8124
```

## Local state model (schema v7)

- `scholarscroll-library-v7` is the canonical state key.
- Legacy keys from earlier ScholarScroll builds and the old Lumina v3–v6 keys are migrated on first load.
- Per user: `readingActivity`, `readingDays`, reader records, saved books, saved metadata snapshots, badges and achievements. Legacy `premiumUnlocks` and `rewardClaims` fields are preserved for a future paid tier but are not used for gating.
- Reader preferences and the optional certificate share link are global.

All state is browser-local. Clearing site data removes profiles, history, badges, certificates and reading records.

## Certificate QR format

On a hosted or LAN origin the QR contains a URL pointing to `#verify/<base64url-token>`. The v2 token is a compact JSON payload:

```json
{
  "v": 2,
  "k": "ssc",
  "c": "certificate-…",
  "u": "student-maya",
  "n": "Maya Chen",
  "d": "2026-11-09",
  "b": ["Pride and Prejudice", "Frankenstein; Or, The Modern Prometheus", "The Adventures of Sherlock Holmes"]
}
```

The decoder also accepts the earlier v1 `kind: "scholarscroll-certificate"` shape. On `localhost`/`127.0.0.1` the QR instead carries a human-readable summary:

```text
ScholarScroll certificate
Maya Chen
Received: 2026-11-09
Books: Pride and Prejudice; Frankenstein; Or, The Modern Prometheus; The Adventures of Sherlock Holmes
3 books completed in 7 days
```

The QR is rendered at up to 300×300 CSS pixels with error correction L and can be downloaded as a GIF from the certificate dialog. The payload is self-contained but **not cryptographically signed**. It is intended for the demo’s shareable/printable experience, not for admissions, employment or other high-trust verification. A production implementation would sign the payload server-side and verify it at a trusted endpoint.

## Production limitations

These items are intentionally documented rather than faked:

- **No real authentication or authorization.** Password hashes and sessions are local demo data.
- **No server-side certificate verification.** QR records are self-contained local data, not server-signed credentials.
- **QR verification needs a reachable origin.** A phone cannot open `127.0.0.1`. Use a LAN/hosted URL, or set **Settings → Certificate share link**; otherwise the QR intentionally carries a readable text summary.
- **No true SEO prerendering.** `index.html` carries baseline metadata; route-specific metadata updates at runtime, which most crawlers will not execute.
- **Gutendex availability and CORS.** Book-text requests may need a same-origin text proxy in production. The demo falls back to `r.jina.ai`, which is a third-party service.
- **Google Fonts / PDF.js CDNs.** These are external dependencies. Self-host them for a fully offline, privacy-hardened deployment.
- **IndexedDB is not DRM.** Users with browser control can inspect stored documents. Protect licensed content on the server.
- **Modern bestsellers are previews only unless a PDF was supplied.** *Rich Dad Poor Dad* and *The 7 Habits of Highly Effective People* remain copyrighted; the app links out to licensed sources instead of hosting their text. The user-supplied reader editions in `assets/premium/` are included at the project owner's request and are not a licence to redistribute them.

## Credits & licensing

- Book texts and covers: [Project Gutenberg](https://www.gutenberg.org/).
- Catalog API: [Gutendex](https://gutendex.com/).
- PDF rendering: [PDF.js](https://mozilla.github.io/pdf.js/).
- QR generation: [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) by Kazuhiko Arase (MIT).
- Fonts: Inter and Merriweather via Google Fonts.
