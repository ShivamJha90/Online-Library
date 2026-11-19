/*
 * ScholarScroll same-origin text proxy
 * -----------------------------------
 * Gutenberg and Archive.org text files do not send CORS headers, so a static
 * page cannot read them directly. This tiny Vercel function fetches an
 * allow-listed public-domain text file, returns it from the same origin, and
 * lets Vercel's edge cache keep repeat reads instant.
 *
 * Local static servers do not expose /api/text. The reader treats a missing
 * endpoint as a normal failure and falls back to its public mirrors.
 */

const ALLOWED_HOSTS = new Set([
  "gutenberg.pglaf.org",
  "www.gutenberg.org",
  "gutenberg.org",
  "aleph.gutenberg.org",
  "archive.org",
  "www.archive.org"
]);

const MAX_TEXT_BYTES = 12 * 1024 * 1024;
const UPSTREAM_TIMEOUT_MS = 20000;

const send = (res, status, payload, contentType = "text/plain; charset=utf-8") => {
  res.statusCode = status;
  res.setHeader("Content-Type", contentType);
  res.setHeader("Cache-Control", "no-store");
  res.end(payload);
};

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return send(res, 405, "Method not allowed.");
  }

  let target;
  try {
    target = new URL(String(req.query?.url || ""));
  } catch {
    return send(res, 400, "The url query parameter is invalid.");
  }
  if (target.protocol !== "https:" || !ALLOWED_HOSTS.has(target.hostname.toLowerCase())) {
    return send(res, 403, "That host is not an approved text source.");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const upstream = await fetch(target, {
      headers: {
        Accept: "text/plain,text/html;q=0.8",
        "User-Agent": "ScholarScroll/1.0 (public-domain reading proxy)"
      },
      redirect: "follow",
      signal: controller.signal
    });
    if (!upstream.ok) {
      return send(res, 502, `The text source returned HTTP ${upstream.status}.`);
    }
    const declared = Number(upstream.headers.get("content-length")) || 0;
    if (declared > MAX_TEXT_BYTES) {
      return send(res, 413, "This text exceeds the reader size limit.");
    }
    const bytes = Buffer.from(await upstream.arrayBuffer());
    if (!bytes.length || bytes.length > MAX_TEXT_BYTES) {
      return send(res, 502, "The text source returned an invalid document.");
    }

    res.statusCode = 200;
    res.setHeader("Content-Type", upstream.headers.get("content-type") || "text/plain; charset=utf-8");
    // A week at the edge: seed books change only when a new edition is picked.
    res.setHeader("Cache-Control", "public, s-maxage=604800, stale-while-revalidate=86400");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.end(bytes);
  } catch (error) {
    const message = error?.name === "AbortError"
      ? "The text source took too long to answer."
      : "The text source could not be reached.";
    return send(res, 504, message);
  } finally {
    clearTimeout(timer);
  }
};
