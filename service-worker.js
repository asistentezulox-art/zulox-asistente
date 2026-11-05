/**
 * ZULOX_ASISTENTE - Service worker
 * Guarda la pantalla para que abra rápido. Nunca guarda respuestas de la API.
 */

const CACHE = 'zulox-asistente-v0.5.0';
const ARCHIVOS = [
  './',
  './index.html',
  './estilos.css',
  './app.js',
  './manifest.json',
  './icono-192.png',
  './icono-512.png'
];

self.addEventListener('install', function (evento) {
  evento.waitUntil(
    caches.open(CACHE)
      .then(function (cache) { return cache.addAll(ARCHIVOS); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (evento) {
  evento.waitUntil(
    caches.keys()
      .then(function (claves) {
        return Promise.all(claves.map(function (clave) {
          if (clave !== CACHE) return caches.delete(clave);
          return Promise.resolve();
        }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (evento) {
  const pedido = evento.request;
  if (pedido.method !== 'GET') return;

  const url = new URL(pedido.url);
  if (url.origin !== self.location.origin) return;

  evento.respondWith(
    caches.match(pedido).then(function (guardado) {
      if (guardado) return guardado;
      return fetch(pedido).then(function (respuesta) {
        if (respuesta && respuesta.ok && respuesta.type === 'basic') {
          const copia = respuesta.clone();
          caches.open(CACHE).then(function (cache) { cache.put(pedido, copia); });
        }
        return respuesta;
      }).catch(function () {
        if (pedido.mode === 'navigate') return caches.match('./index.html');
        return new Response('', { status: 503, statusText: 'Sin conexión' });
      });
    })
  );
});
