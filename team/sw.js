// Offline support. Always tries the network first (so updates show up right away when online)
// and falls back to the saved copy when there's no connection at the gym.
const CACHE = "vbteam-v34";
const FILES = [
  "./", "./index.html", "./styles.css", "./icon.png", "./icon-192.png", "./icon-512.png", "./manifest.webmanifest",
  "./js/app.js", "./js/db.js", "./js/schema.js", "./js/sync.js", "./js/ui.js", "./js/model.js", "./js/match.js", "./js/court.js",
  "./js/tabs/track.js", "./js/tabs/schedule.js", "./js/tabs/team.js", "./js/tabs/stats.js",
  "./js/tabs/sync.js", "./js/tabs/more.js", "./js/tabs/guide.js", "./js/tabs/court.js", "./js/tabs/work.js", "./js/tabs/links.js",
  "./js/tabs/board.js", "./js/tabs/scout.js", "./js/tabs/share.js", "./js/qr.js", "./js/tabs/about.js", "./js/welcome.js", "./js/terms.js", "./js/tabs/rotation.js", "./js/planui.js", "./js/levels.js", "./js/gauge.js", "./js/lock.js", "./js/filelock.js", "../intro.js",
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(FILES.map(f => c.add(new Request(f, { cache: "reload" })).catch(() => {})))));
  self.skipWaiting();
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith("vbteam-") && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    fetch(req, { cache: req.cache === "reload" ? "reload" : "no-cache" })
      .then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true })
        .then(hit => hit || (req.mode === "navigate" ? caches.match("./index.html") : Response.error())))
  );
});
