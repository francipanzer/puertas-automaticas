const CACHE_NAME = 'autopuerta-v35'; // ⬆️ subido: fuerza limpieza de la v34

// ═══════════════════════════════════════════════════════════
//  INSTALL
// ═══════════════════════════════════════════════════════════
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      const assets = [
        './',
        'index.html',
        'css/styles.css',
        'manifest.json',                                  // ➕ añadido
        'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css'
        // ⚠️ QUITADOS los js/*.js: ahora se cachean solos bajo demanda
        //    con network-first (ver fetch). Así nunca instalas JS viejo.
      ];
      return cache.addAll(assets);
    })
      .then(() => self.skipWaiting())                     // ➕ CLAVE: activa sin esperar
      .catch(err => console.warn('[SW] install parcial:', err)) // ➕ no revienta en silencio
  );
});

// ═══════════════════════════════════════════════════════════
//  ACTIVATE (limpieza de caches viejas)
// ═══════════════════════════════════════════════════════════
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.map(key => {
          if (key !== CACHE_NAME) return caches.delete(key);
        })
      )
    ).then(() => self.clients.claim())                    // ➕ toma el control YA
  );
});

// ═══════════════════════════════════════════════════════════
//  FETCH
// ═══════════════════════════════════════════════════════════
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
  if (event.request.method !== 'GET') return;

  // ➕ AÑADIDO: Supabase SIEMPRE directo a red, jamás por caché.
  //    Tus datos en la nube no deben leerse nunca de una copia vieja.
  if (url.hostname.endsWith('.supabase.co')) return;

  const isHtml = event.request.mode === 'navigate'
    || event.request.headers.get('accept')?.includes('text/html');
  const isCode = /\.(js|css)$/i.test(url.pathname);       // 🔧 separado del resto
  const isMedia = /\.(png|jpg|jpeg|svg|ico|webp|woff2?)$/i.test(url.pathname);

  const networkFirst = () =>
    fetch(event.request).then(response => {
      if (response.ok) {
        const clone = response.clone();
        caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
      }
      return response;
    }).catch(() => caches.match(event.request));

  const cacheFirst = () =>
    caches.match(event.request).then(cached =>
      cached || fetch(event.request).then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
        }
        return response;
      })
    );

  if (isHtml)      event.respondWith(networkFirst());     // siempre última versión
  else if (isCode) event.respondWith(networkFirst());     // 🔧 ANTES cache-first → causa del bug
  else if (isMedia) event.respondWith(cacheFirst());      // iconos/fuentes: cache-first OK
  else             event.respondWith(networkFirst());
});