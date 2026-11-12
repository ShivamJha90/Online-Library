/*
 * ScholarScroll offline worker
 * ----------------------------
 * Caches only the local application shell, plus successful runtime responses
 * for covers, fonts and catalog data. Book text and PDFs remain user-controlled
 * through IndexedDB inside the reader.
 */
"use strict";

const VERSION = "v15";
const SHELL_CACHE = `scholarscroll-shell-${VERSION}`;
const RUNTIME_CACHE = `scholarscroll-runtime-${VERSION}`;
const API_CACHE = `scholarscroll-api-${VERSION}`;

const SHELL_ASSETS = [
  "./",
  "./index.html",
  "./css/styles.css?v=17",
  "./js/data.js?v=17",
  "./js/api.js?v=17",
  "./js/reader.js?v=17",
  "./js/app.js?v=17",
  "./js/vendor/qrcode.js?v=17",
  "./manifest.webmanifest",
  "./assets/logo-96.png",
  "./assets/favicon-32.png",
  "./assets/apple-touch-icon.png",
  "./assets/icon-192.png",
  "./assets/icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
      .catch((error) => console.warn("ScholarScroll shell precache failed.", error))
  );
});

self.addEventListener("activate", (event) => {
  const keep = new Set([SHELL_CACHE, RUNTIME_CACHE, API_CACHE]);
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => !keep.has(key)).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

const isCacheable = (response) => response && (response.ok || response.type === "opaque");

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      if (isCacheable(response)) cache.put(request, response.clone()).catch(() => {});
      return response;
    })
    .catch(() => null);
  return cached || network || Response.error();
}

async function networkFirst(request, cacheName, fallback = null) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (isCacheable(response)) cache.put(request, response.clone()).catch(() => {});
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    if (fallback) {
      const shell = await caches.open(SHELL_CACHE);
      const fallbackResponse = await shell.match(fallback);
      if (fallbackResponse) return fallbackResponse;
    }
    return Response.error();
  }
}

/**
 * Navigations must always resolve to the cached shell when the origin is
 * unreachable *or* answering with an error status. A reverse proxy can return
 * 502/503 while the browser still reports itself as online, and in that case
 * the app should open from cache rather than show the proxy error page.
 */
async function navigationFirst(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const response = await fetch(request);
    if (!response.ok) throw new Error(`Navigation returned HTTP ${response.status}.`);
    cache.put(request, response.clone()).catch(() => {});
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    const shell = await cache.match("./index.html");
    if (shell) return shell;
    return Response.error();
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Navigation requests always resolve to the application shell so hash routes
  // continue to work offline and after a refresh.
  if (request.mode === "navigate") {
    event.respondWith(navigationFirst(request));
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(staleWhileRevalidate(request, RUNTIME_CACHE));
    return;
  }

  if (url.hostname === "gutendex.com") {
    event.respondWith(networkFirst(request, API_CACHE));
    return;
  }

  if (
    url.hostname.endsWith("gutenberg.org")
    || url.hostname.includes("fonts.googleapis.com")
    || url.hostname.includes("fonts.gstatic.com")
    || url.hostname.includes("cdn.jsdelivr.net")
  ) {
    event.respondWith(staleWhileRevalidate(request, RUNTIME_CACHE));
  }
});
