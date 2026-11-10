/* Service worker do Painel Levi dos Cortes.
   Rede sempre atual: não guarda agenda, clientes ou dados do Firebase em cache. */
self.addEventListener('install', function (event) {
  self.skipWaiting();
});
self.addEventListener('activate', function (event) {
  event.waitUntil(self.clients.claim());
});
self.addEventListener('fetch', function (event) {
  if (event.request.method !== 'GET') return;
  event.respondWith(fetch(event.request));
});
