/*
 * ScholarScroll backend client
 * ----------------------------
 * The app is server-first but never server-only. This module probes the local
 * Python/SQLite API, keeps a bearer token, and exposes typed calls for auth,
 * devices, premium purchases, vouchers and the Hindi text proxy.
 *
 * When the API is not running every call fails with a BackendError whose
 * `status` is null, and the app falls back to its original local demo mode.
 */
(() => {
  "use strict";

  const Config = window.LibraryConfig;
  if (!Config) throw new Error("LibraryConfig must load before backend.js.");

  const TOKEN_KEY = "scholarscroll-backend-token-v1";
  const USER_CACHE_KEY = "scholarscroll-server-users-v1";
  const BASE_OVERRIDE_KEY = "scholarscroll-backend-url";
  const HEALTH_TIMEOUT = 2200;
  const REQUEST_TIMEOUT = 16000;

  const safeStorage = {
    get(key) {
      try { return window.localStorage.getItem(key); } catch { return null; }
    },
    set(key, value) {
      try { window.localStorage.setItem(key, value); } catch { /* private mode */ }
    },
    remove(key) {
      try { window.localStorage.removeItem(key); } catch { /* private mode */ }
    }
  };

  class BackendError extends Error {
    constructor(message, status = null, code = "network_error", payload = null) {
      super(message);
      this.name = "BackendError";
      this.status = status;
      this.code = code;
      this.payload = payload;
    }
  }

  const publicUser = (user) => ({
    id: String(user?.id || ""),
    name: String(user?.name || "ScholarScroll reader"),
    email: String(user?.email || ""),
    role: user?.role === "admin" ? "admin" : "student",
    initials: String(user?.initials || "").slice(0, 2).toUpperCase() || "SS",
    server: true
  });

  /** Server accounts are cached so a reload can restore the session user. */
  const cachedUsers = () => {
    try {
      const parsed = JSON.parse(safeStorage.get(USER_CACHE_KEY) || "[]");
      return Array.isArray(parsed) ? parsed.filter((user) => user && user.id && user.email) : [];
    } catch {
      return [];
    }
  };

  const rememberUser = (user) => {
    const clean = publicUser(user);
    if (!clean.id || !clean.email) return clean;
    const list = cachedUsers().filter((item) => item.id !== clean.id);
    list.unshift(clean);
    safeStorage.set(USER_CACHE_KEY, JSON.stringify(list.slice(0, 40)));
    if (!Config.users.some((item) => item.id === clean.id)) Config.users.push(clean);
    return clean;
  };

  /** Called at script load, before app.js builds the state store. */
  const hydrateCachedUsers = () => {
    cachedUsers().forEach((user) => {
      if (!Config.users.some((item) => item.id === user.id)) {
        Config.users.push({ ...publicUser(user) });
      }
    });
  };

  const withTimeout = async (url, options, timeout) => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeout);
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } finally {
      window.clearTimeout(timer);
    }
  };

  class BackendClient {
    constructor() {
      this.baseUrl = "";
      this.available = false;
      this.probing = null;
      this.token = safeStorage.get(TOKEN_KEY) || "";
      this.lastError = null;
      this.lastUser = null;
    }

    configuredBase() {
      const port = Number(Config.BACKEND_PORT) || 8000;
      const meta = document.querySelector('meta[name="scholarscroll-backend"]');
      const metaValue = String(meta?.content || "").trim().replace(/\/+$/, "");
      let value = String(safeStorage.get(BASE_OVERRIDE_KEY) || "").trim().replace(/\/+$/, "");
      const query = new URLSearchParams(window.location.search).get("backend");
      if (query) {
        value = (query === "1" ? `http://127.0.0.1:${port}` : query).trim().replace(/\/+$/, "");
        safeStorage.set(BASE_OVERRIDE_KEY, value);
      }
      return value || metaValue;
    }

    candidateBases() {
      const port = Number(Config.BACKEND_PORT) || 8000;
      const configured = this.configuredBase();
      if (configured === "none" || configured === "off") return [];
      if (configured && configured !== "auto") {
        return [configured.endsWith("/api") ? configured : `${configured}/api`];
      }

      // A static host (Vercel, GitHub Pages, file://) cannot run the Python
      // service. Probe same-origin only when the backend marks the page with
      // meta="auto"; otherwise the console fills with 404s and mixed-content
      // errors. Local development keeps both same-origin and loopback probes.
      const host = window.location.hostname;
      const local = host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]";
      const bases = [];
      if (configured === "auto" || local) {
        if (window.location.origin && /^https?:/.test(window.location.origin)) {
          bases.push(`${window.location.origin}/api`);
        }
      }
      if (local) {
        bases.push(`http://127.0.0.1:${port}/api`, `http://localhost:${port}/api`);
      }
      return [...new Set(bases)];
    }

    hasToken() {
      return Boolean(this.token);
    }

    setToken(token) {
      this.token = String(token || "");
      if (this.token) safeStorage.set(TOKEN_KEY, this.token);
      else safeStorage.remove(TOKEN_KEY);
    }

    headers(extra = {}) {
      const headers = { Accept: "application/json", ...extra };
      if (this.token) headers.Authorization = `Bearer ${this.token}`;
      return headers;
    }

    async probe(force = false) {
      if (this.probing && !force) return this.probing;
      this.probing = (async () => {
        for (const base of this.candidateBases()) {
          try {
            const response = await withTimeout(`${base}/health`, { method: "GET", headers: { Accept: "application/json" } }, HEALTH_TIMEOUT);
            if (!response.ok) continue;
            const payload = await response.json();
            if (!payload?.ok) continue;
            this.baseUrl = base;
            this.available = true;
            this.lastError = null;
            this.announce();
            return payload;
          } catch (error) {
            this.lastError = error;
          }
        }
        this.available = false;
        this.baseUrl = "";
        this.announce();
        return null;
      })().finally(() => { this.probing = null; });
      return this.probing;
    }

    announce() {
      window.dispatchEvent(new CustomEvent("scholarscroll:backend", {
        detail: { available: this.available, baseUrl: this.baseUrl }
      }));
    }

    async request(path, { method = "GET", body = null, timeout = REQUEST_TIMEOUT, auth = true } = {}) {
      if (!this.baseUrl) {
        const health = await this.probe();
        if (!health) throw new BackendError("The ScholarScroll server is not reachable.", null, "server_offline");
      }
      const headers = this.headers(body ? { "Content-Type": "application/json" } : {});
      if (!auth) delete headers.Authorization;
      let response;
      try {
        response = await withTimeout(`${this.baseUrl}${path}`, {
          method,
          headers,
          body: body ? JSON.stringify(body) : undefined,
          cache: "no-store",
          credentials: "omit"
        }, timeout);
      } catch (error) {
        this.available = false;
        throw new BackendError("The ScholarScroll server could not be reached.", null, "network_error", error);
      }
      let payload = {};
      try { payload = await response.json(); } catch { payload = {}; }
      if (!response.ok) {
        if (response.status === 401) this.setToken("");
        throw new BackendError(payload.error || `Server returned HTTP ${response.status}.`, response.status, payload.code || "request_failed", payload);
      }
      return payload;
    }

    async register({ name, email, password, deviceId, deviceLabel }) {
      const payload = await this.request("/auth/register", {
        method: "POST",
        auth: false,
        body: { name, email, password, deviceId, deviceLabel }
      });
      this.setToken(payload.token);
      this.lastUser = rememberUser(payload.user);
      this.available = true;
      return { ...payload, user: this.lastUser };
    }

    async login({ email, password, deviceId, deviceLabel }) {
      const payload = await this.request("/auth/login", {
        method: "POST",
        auth: false,
        body: { email, password, deviceId, deviceLabel }
      });
      this.setToken(payload.token);
      this.lastUser = rememberUser(payload.user);
      this.available = true;
      return { ...payload, user: this.lastUser };
    }

    async logout() {
      try {
        if (this.token) await this.request("/auth/logout", { method: "POST" });
      } catch {
        /* Local sign-out must still work when the server is offline. */
      }
      this.setToken("");
      this.lastUser = null;
    }

    async me() {
      const payload = await this.request("/me");
      if (payload?.user) {
        this.lastUser = rememberUser(payload.user);
        return { ...payload, user: this.lastUser };
      }
      return payload;
    }

    async heartbeat() {
      return this.request("/devices/heartbeat", { method: "POST", body: {} });
    }

    async devices() {
      return this.request("/devices");
    }

    async revokeDevice(deviceRowId) {
      return this.request(`/devices/${encodeURIComponent(deviceRowId)}`, { method: "DELETE" });
    }

    async quote(planId, bookKey = null, voucherCode = "") {
      return this.request("/premium/quote", {
        method: "POST",
        body: { planId, bookKey, voucherCode }
      });
    }

    async purchase(planId, bookKey = null, voucherCode = "") {
      const payload = await this.request("/premium/purchase", {
        method: "POST",
        body: { planId, bookKey, voucherCode }
      });
      if (payload?.user) this.lastUser = rememberUser(payload.user);
      return payload;
    }

    async entitlements() {
      return this.request("/premium/entitlements");
    }

    async issueVoucher(certificateId) {
      return this.request("/vouchers/issue", {
        method: "POST",
        body: { certificateId }
      });
    }

    async validateVoucher(code) {
      return this.request("/vouchers/validate", {
        method: "POST",
        body: { code }
      });
    }

    async vouchers() {
      return this.request("/vouchers");
    }

    async hindiBooks() {
      return this.request("/hindi/books", { auth: false });
    }

    hindiTextUrl(bookKey) {
      if (!this.baseUrl) return "";
      return `${this.baseUrl}/hindi/text/${encodeURIComponent(bookKey)}?raw=1`;
    }

    /**
     * Resolve a repository-relative asset (for example a premium PDF) against
     * the backend origin. When the front end is hosted separately from the
     * Python service, `assets/premium/...` would otherwise point at the static
     * host, where those files are intentionally not deployed.
     */
    assetUrl(relativePath) {
      if (!this.baseUrl) return "";
      const origin = this.baseUrl.replace(/\/api\/?$/, "");
      return `${origin}/${String(relativePath || "").replace(/^\/+/, "")}`;
    }
  }

  hydrateCachedUsers();

  window.BackendModule = {
    BackendClient,
    BackendError,
    hydrateCachedUsers,
    rememberUser,
    cachedUsers,
    TOKEN_KEY,
    USER_CACHE_KEY,
    BASE_OVERRIDE_KEY
  };
})();
