# ScholarScroll

**ScholarScroll** is a student library built with vanilla JavaScript, plus an optional zero-dependency Python/SQLite backend. It combines a live public-domain catalog, a free Hindi classics shelf, a protected reading experience, reading analytics, streak badges, and printable certificates with QR verification.

> **Demo notice.** The front end still works as a static site. Run `run-server.cmd` to start the local Python/SQLite backend, which adds real server-side accounts, purchases, vouchers and the two-device limit. Payments remain simulated until a payment provider is connected, and certificates are reading records rather than legal credentials.

## Features

### Live catalog
- Search **79,000+ Project Gutenberg editions** through the public [Gutendex](https://gutendex.com/) API.
- Predictive search suggestions blending local history and live catalog results.
- Language and sorting filters, paginated search with “Load more”.
- Shareable certificate links (`#verify/<token>`), cover fallbacks, loading skeletons, and graceful API error states. Book share links are intentionally not offered: books are personal to the signed-in account.
- Saved books keep a metadata snapshot so the collection still renders while the API is offline.
- **Resilient shelves.** Requests retry once with a 7-second timeout, and successful results are cached in `localStorage`. If Gutendex is slow or unreachable, the storefront shows the saved shelf (or a bundled 12-book starter shelf) with a friendly notice and toast instead of a blank section or a bare “Retry”. The catalog also retries automatically when the browser comes back online or the tab becomes visible.

### हिंदी पुस्तकालय (Hindi classics)
- A free shelf of **29 Hindi works** across literature, scripture and general knowledge: the Bhagavad Gita, Valmiki Ramayan, Ramcharitmanas, two Mahabharat parvas, Chanakya Niti, Godaan, Premchand stories, Bhagwat/Shiv/Vishnu Puran, Kabir Bijak, Hitopadesh, Panchatantra, Yoga Vasistha, Surdas and Meera, plus Ayurveda (Charak Samhita), yoga, drama (Andher Nangari), autobiography (Satya ke Prayog), medieval history, Indian science, Hindi grammar, Jyotish and Tantra.
- **26 titles are readable in the browser** from Internet Archive scans. The local backend proxies and caches their `_djvu.txt` text so the browser avoids Archive.org's CORS limits and repeat reads are instant.
- **3 titles are link-only** (`मीराबाई`, `कौटिल्य अर्थशास्त्र`, `गरुड़ पुराण`) because no clean public-domain full text was available; each card links to the original source.
- Category filters, Devanagari covers, a storefront teaser and dashboard/settings cross-links.
- With the backend offline the reader tries the Archive.org URL directly and falls back gracefully; the original source link always works.

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
- Completing **3 books inside 7 days** unlocks an **Avid Reader certificate** and a private premium discount voucher.
- The certificate contains a locally generated QR code. On a hosted or LAN origin, scanning opens `#verify/<token>` with:
  - the recipient’s name,
  - the date received,
  - the books completed at that time,
  - the certificate ID and reading target.
- On `localhost`/`127.0.0.1` a phone cannot reach the development machine, so the QR carries the same details as readable text. Set **Settings → Certificate share link** to a hosted or Wi-Fi address to make the QR open the full verification page.

### Premium plans and vouchers
- The premium shelf is paid. Three local-demo plans are offered in Indian rupees:
  - **₹50** for one month of access to every premium title,
  - **₹150** for lifetime access to one premium title,
  - **₹1000** for lifetime access to the whole premium shelf.
- No reading target, certificate or voucher grants free premium reading. Checkout is a clearly labelled local demo; no card details are collected and no real payment is processed.
- Payment integration is intentionally deferred. `LibraryStateStore.purchasePlan()` is the local fallback hook; the backend's `apply_purchase()` is where a real gateway confirmation should be added later.
- Completing the 3-books-in-7-days target now issues a **10%, 20%, 30%, 40% or 50% discount voucher** instead of free access.
- A voucher is **single-use**, expires after **7 days**, applies only to a premium purchase (single book or all-access) and is bound to the recipient’s registered email address. It cannot be transferred, shared or redeemed from another account.
- With the backend running, vouchers are issued and redeemed on the server, so the same code cannot be reused from another browser.
- Premium gating is enforced in the reader entry points and in the direct `#reader/<book-key>` route, so a copied URL cannot bypass a locked title.

### Content protection and device limit
- **Best-effort screenshot protection:** the reading surface is blacked out when the window loses focus or the tab is hidden, and `PrintScreen`, `Ctrl/Cmd+P` and `Ctrl/Cmd+S` are intercepted. Copy, cut and the context menu are blocked inside the reader, reader pages print as a black notice, and a faint per-account watermark is drawn over the reader.
- Browser JavaScript cannot stop an operating-system screenshot tool or a camera. This is a deterrent, not DRM.
- An account may be active on at most **2 devices**. Signing in on a third device automatically disconnects the least recently used session. Active devices are listed in Settings with a manual **Disconnect** action.
- With the local backend running, device sessions are enforced on the server and the evicted browser is signed out on its next heartbeat. Without it, the limit is enforced inside the local browser profile.

### Premium reader editions
- The premium page includes a PDF shelf of editions supplied by the project owner: *The Power of Your Subconscious Mind*, *The 4-Hour Workweek*, *The Almanack of Naval Ravikant*, *Wealth* (Emerson), *The Game of Life and How to Play It*, *Think and Grow Rich*, *Atomic Habits*, *The Richest Man in Babylon*, *The Science of Getting Rich*, *The Art of Money Getting*, *As a Man Thinketh* and *Acres of Diamonds*.
- These PDFs live in `assets/premium/` and open in the same PDF.js reader as administrator uploads, with zoom, portrait/landscape layout and light/dark themes.
- Some of these titles remain in copyright. They are included only because the project owner supplied the files; check that you have the right to use each copy in your jurisdiction. They are not downloads from Project Gutenberg.

### Modern bestsellers spotlight
- The bottom of the premium page previews popular modern titles that still have no supplied reader copy: *Rich Dad Poor Dad*, *The 7 Habits of Highly Effective People* and *How to Win Friends and Influence People*.
- These works are **still in copyright**, so the app stores metadata and a cover reference only. It does **not** bundle or fetch their full text.
- Each spotlight card is labelled *Copyrighted / Preview only* and links to an Open Library record so readers can find a licensed copy. The rest of the premium page is fully readable.

### Local backend (optional)
- `server/app.py` is a **zero-dependency Python 3 + SQLite** API. It has no pip installs and no external services.
- Server-side accounts with PBKDF2-SHA256 password hashing and bearer sessions.
- **Two-device limit enforced by the server.** A third sign-in deletes the oldest device's sessions, so the evicted browser is rejected on its next heartbeat.
- Premium plans, quotes, orders and entitlements; the server recalculates every price and voucher discount.
- Deterministic single-use, email-bound vouchers with a 7-day expiry.
- A cached Hindi text proxy for Archive.org `_djvu.txt` files.
- Static hosting for the whole front end, so `http://127.0.0.1:8000/` serves the app and API together.
- The front end probes same-origin `/api`, then `127.0.0.1:8000` and `localhost:8000`. If none answer, it falls back to the original local demo mode, so the static GitHub Pages build still works.

### Dashboard & administration
- Completed books, current streak, personal-best streak, reading days and certificate counts.
- Continue-reading card, saved shelf, recommendations, streak milestones and certificate shelf.
- Admin PDF upload with signature/size validation, IndexedDB storage, browser storage estimates, and delete actions.
- Settings for account summary, premium status, certificate vouchers, active devices, reader preferences, certificate share link, storage estimates, and local-state reset.

### PWA, SEO and accessibility
- `manifest.webmanifest`, generated icons, and a service worker for the app shell and runtime caching.
- Catalog API responses are cached per query with stale-while-revalidate, so repeat visits paint instantly and still refresh in the background.
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

### Run with the Python/SQLite backend

Double-click **`run-server.cmd`**, or run:

```powershell
python server/app.py
```

Then open <http://127.0.0.1:8000/>. This single process serves the app and the API, creates `server/data/scholarscroll.sqlite3` on first run (ignored by git), and seeds the same demo accounts. The static server on port 8124 still works; in that case the app probes the backend on port 8000 and uses local fallback if it is not running.

Backend environment variables:

| Variable | Purpose | Default |
| --- | --- | --- |
| `SCHOLARSCROLL_HOST` | Bind host | `127.0.0.1`, or `0.0.0.0` when `PORT` is set |
| `SCHOLARSCROLL_PORT` | Bind port | `8000` (a platform `PORT` variable takes precedence) |
| `SCHOLARSCROLL_DATA_DIR` | Data directory | `server/data` |
| `SCHOLARSCROLL_DB` | SQLite file path | `<data>/scholarscroll.sqlite3` |
| `SCHOLARSCROLL_HINDI_FIXTURES` | Folder of `<key>.txt` fixtures instead of downloading Hindi texts | unset |
| `SCHOLARSCROLL_HINDI_CACHE_DAYS` | Hindi text cache lifetime | `30` |

API summary: `GET /api/health`, `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/me`, `GET|DELETE /api/devices`, `POST /api/devices/heartbeat`, `GET /api/premium/plans`, `POST /api/premium/quote`, `POST /api/premium/purchase`, `GET /api/premium/entitlements`, `GET /api/orders`, `GET /api/vouchers`, `POST /api/vouchers/issue`, `POST /api/vouchers/validate`, `GET /api/hindi/books`, `GET /api/hindi/text/<key>`.

The server binds to loopback only by default. If you expose it on a LAN, put it behind HTTPS and a reverse proxy; bearer tokens and demo payments are not hardened for the public internet.

Do not open `index.html` through `file://` if you want service-worker caching or module imports to behave normally.

## Deploying the front end to Vercel

Vercel can host the static front end at <https://onlinelibrary-beta.vercel.app/>. It **cannot** run the Python/SQLite backend as written: Vercel functions have an ephemeral filesystem, so a SQLite database would reset and would not be shared between instances.

`vercel.json` adds security/caching headers and blocks accidental requests to backend files. `.vercelignore` keeps `server/`, local scripts and the database out of the upload. Deploy the Python service separately on a host with a persistent disk or volume (Render, Railway, Fly.io, PythonAnywhere, or a small VPS), then point the front end at it:

```text
https://onlinelibrary-beta.vercel.app/?backend=https://your-api.example.com
```

The `?backend=` value is stored in `localStorage`, so it only needs to be opened once per browser. You can also set the default in `index.html`:

```html
<meta name="scholarscroll-backend" content="https://your-api.example.com" />
```

When the Python server hosts the app itself, it injects `content="auto"` into that meta tag so the browser probes the same origin automatically. On a static host with an empty value, the app skips doomed `/api` probes and runs in local demo mode.

> **Premium PDFs:** `assets/premium/` ships with the static deployment so the premium shelf opens without a backend. If you later exclude that folder in `.vercelignore`, those cards automatically fall back to a **Backend required** state, and the front end rewrites repository-relative PDF paths through `backend.assetUrl()` when a server is connected. Add authenticated, short-lived URLs before treating the files as licensed content.

### Hosting the backend

The repository includes a `Dockerfile` that runs the same Python/SQLite service. Build and run it with a persistent volume:

```powershell
docker build -t scholarscroll-api .
docker run -p 8000:8000 -v scholarscroll-data:/data scholarscroll-api
```

On Render, Railway, Fly.io or a VPS, mount a persistent disk at `/data` and expose the service over HTTPS. The server now honours the platform `PORT` variable and binds to `0.0.0.0` automatically when `PORT` is present. Then connect the Vercel front end with `?backend=https://your-api.example.com` or the meta tag described above.

SQLite is suitable for a small single-instance deployment. If you need multiple backend instances, move accounts/orders to a shared database (Postgres or similar) before scaling horizontally.

## Project structure

```
index.html                 Application shell, metadata, footer
css/styles.css             Full dark editorial UI + reader/certificate styles
js/data.js                 Config, demo identities, schema v8 seed state, premium + Hindi catalog
js/api.js                  Gutendex client and normalization
js/backend.js              Backend client: probe, token, auth, devices, purchases, vouchers, Hindi URLs
js/reader.js               Text/PDF engines, IndexedDB cache, reader UI
js/app.js                  State store, auth, router, views, badges/certificates, Hindi shelf, server sync
js/vendor/qrcode.js        MIT qrcode-generator by Kazuhiko Arase
server/app.py              Zero-dependency Python/SQLite backend (API + static hosting)
server/data/               Local SQLite database (git-ignored, created on first run)
assets/                    Optimized logo, favicon, PWA icons
assets/premium/            User-supplied premium PDF reader editions
sw.js                      Offline app-shell/runtime worker
manifest.webmanifest       PWA manifest
robots.txt, sitemap.xml    Crawler hints (replace example origin)
serve-local.cmd            Windows one-click static preview on port 8124
run-server.cmd             Windows one-click backend + app on port 8000
vercel.json                Vercel headers + blocked backend paths
.vercelignore              Keeps backend/local files out of the static deployment
Dockerfile                 Backend container with a persistent /data volume
.dockerignore              Keeps git data, caches and local DB out of the image
.gitignore                 Ignores the SQLite database and Python caches
```

## Local state model (schema v8)

- `scholarscroll-library-v8` is the canonical state key.
- Legacy keys from earlier ScholarScroll builds and the old Lumina v3–v7 keys are migrated on first load.
- Per user: `readingActivity`, `readingDays`, reader records, saved books, saved metadata snapshots, badges and achievements.
- `premiumAccess` stores an active `monthlyUntil` window, a `lifetimeAll` flag and lifetime `books` unlocks. Older `premiumUnlocks` voucher unlocks migrate into lifetime single-book access.
- `orders` is a local demo purchase ledger. `deviceSessions` tracks active browser sessions for the two-device limit. `rewardClaims` records voucher redemption (single use) by certificate ID.
- Reader preferences and the optional certificate share link are global.

All state is browser-local. With the backend running, server accounts and entitlements are mirrored into the same local state so existing views render unchanged. Clearing site data removes browser profiles, history, badges, certificates and reading records; deleting `server/data/scholarscroll.sqlite3` removes server accounts, orders, vouchers and devices.

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

- **The backend is local, not a hosted service.** It binds to `127.0.0.1` by default and is not hardened for the public internet. Vercel/GitHub Pages cannot host the Python/SQLite service as written; publishing the full backend needs a Python host with persistent storage.
- **No real payments.** Premium plans are recorded as `demo-paid` orders. No card data is collected. Connect a payment provider in `server/app.py` (`apply_purchase`) and verify its webhook before granting entitlements.
- **Certificates are not signed credentials.** QR records are self-contained reading records, not server-signed certificates. A production implementation would sign and verify them at a trusted endpoint.
- **QR verification needs a reachable origin.** A phone cannot open `127.0.0.1`. Use a LAN/hosted URL, or set **Settings → Certificate share link**; otherwise the QR intentionally carries a readable text summary.
- **No true SEO prerendering.** `index.html` carries baseline metadata; route-specific metadata updates at runtime, which most crawlers will not execute.
- **Gutendex availability and CORS.** Book-text requests may need a same-origin text proxy in production. The demo falls back to `r.jina.ai`, which is a third-party service.
- **Archive.org can be slow or rate-limited.** Hindi text is proxied and cached by the backend, but a first download can fail. The UI then links to the original source instead of pretending to have the text.
- **Google Fonts / PDF.js CDNs.** These are external dependencies. Self-host them for a fully offline, privacy-hardened deployment.
- **IndexedDB is not DRM.** Users with browser control can inspect stored documents. Protect licensed content on the server.
- **Screenshot protection is best-effort.** JavaScript can black the page on blur, intercept common shortcuts and add a per-account watermark, but it cannot block an OS-level screenshot tool, a camera, or a modified browser.
- **The static build still has local-only vouchers and devices.** If the backend is offline, single-use vouchers and the two-device limit are enforced only in the browser profile.
- **Modern bestsellers are previews only unless a PDF was supplied.** *Rich Dad Poor Dad* and *The 7 Habits of Highly Effective People* remain copyrighted; the app links out to licensed sources instead of hosting their text. The user-supplied reader editions in `assets/premium/` are included at the project owner's request and are not a licence to redistribute them. Confirm that you hold the rights to each title before publishing them.
- **Hindi scans vary in OCR quality.** Some Archive.org texts contain OCR errors, and a few titles are link-only because no clean public-domain copy was available.

## Credits & licensing

- Book texts and covers: [Project Gutenberg](https://www.gutenberg.org/).
- Catalog API: [Gutendex](https://gutendex.com/).
- Hindi texts and covers: [Internet Archive](https://archive.org/) public-domain scans, plus [Wikisource](https://hi.wikisource.org/) for linked poetry.
- PDF rendering: [PDF.js](https://mozilla.github.io/pdf.js/).
- QR generation: [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) by Kazuhiko Arase (MIT).
- Fonts: Inter and Merriweather via Google Fonts.
