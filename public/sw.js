/*
 * Service worker de la PWA.
 * El MVP asume conexion disponible: NUNCA se responde una operacion desde cache.
 * Solo se guarda el armazon de la aplicacion para que abra rapido.
 */
const CACHE = 'demo-vales-v1';
const ARMAZON = [
  '/', '/index.html', '/css/app.css',
  '/js/app.js', '/js/api.js', '/js/ui.js', '/js/router.js', '/js/graficas.js',
  '/icons/icono.svg', '/manifest.webmanifest'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARMAZON)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((claves) => Promise.all(claves.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;

  // Las peticiones de datos siempre van a la red: jamas se simula que una
  // operacion quedo guardada si no llego a la base de datos.
  if (url.pathname.startsWith('/api/')) return;

  if (e.request.method !== 'GET') return;

  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok && res.type === 'basic') {
          const copia = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copia));
        }
        return res;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match('/index.html')))
  );
});
