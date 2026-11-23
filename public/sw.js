/* Service Worker der Mitarbeitereinteilung.
 * Bewusst zurückhaltend: Seiten und API-Daten werden NIE zwischengespeichert,
 * damit nie eine veraltete Einteilung angezeigt wird. Gecacht werden nur
 * unveränderliche Build-Dateien (/_next/static) und Icons; ohne Netz erscheint
 * eine Offline-Seite. */
const VERSION = "v1";
const STATIC_CACHE = `einteilung-static-${VERSION}`;
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((c) => c.addAll([OFFLINE_URL, "/icons/icon-192.png"]))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== STATIC_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Seitenaufrufe: immer Netz, ohne Netz die Offline-Seite
  if (req.mode === "navigate") {
    event.respondWith(fetch(req).catch(() => caches.match(OFFLINE_URL)));
    return;
  }

  // Unveränderliche Build-Dateien und Icons: Cache zuerst
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      }),
    );
  }
  // alles andere (API, Daten): normal über das Netz
});
