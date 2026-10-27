// Cache simples do app (os dados do Supabase nunca são guardados aqui).
const CACHE = "orcamento-v5";
const ARQ = ["./", "index.html", "styles.css", "app.js", "fatura.js", "config.js", "icon.svg", "icon-192.png", "manifest.webmanifest"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(ARQ)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin) return;
  // rede primeiro (sempre a versão mais nova); cache só quando estiver sem internet
  e.respondWith(fetch(e.request).then(r => { const c = r.clone(); caches.open(CACHE).then(ca => ca.put(e.request, c)); return r; }).catch(() => caches.match(e.request)));
});
