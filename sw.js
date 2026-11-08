/* Service worker (painel e página do cliente)
   Rede primeiro (sempre a versão mais nova), cache como reserva offline.
   SÓ guarda os arquivos do próprio site listados em SHELL. Nunca intercepta
   nem guarda Firestore, Auth, SDK do Firebase (gstatic) ou qualquer outro domínio.
   Ao mudar arquivos do site, aumente o número em CACHE para os celulares pegarem a versão nova. */
var CACHE = 'levi-shell-v1';
var SHELL = [
  './', 'index.html', 'agendar.html', 'painel.html', 'style.css', 'manifest.json',
  'loja.config.js', 'boot.js', 'comum.js', 'db-firebase.js', 'db-demo.js', 'firebase-config.js', 'agendar.js', 'avaliacoes.js', 'painel.js',
  'fonts/hanken-grotesk.woff2',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/favicon-32.png', 'icons/apple-touch-icon.png'
];
// caminhos absolutos permitidos (escopo do SW + arquivo)
var PERMITIDOS = {};
SHELL.forEach(function (f) { PERMITIDOS[new URL(f, self.registration.scope).pathname] = 1; });

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  // outro domínio (Firestore, Auth, gstatic...) ou arquivo fora da lista: deixa o navegador cuidar, sem cache
  if (url.origin !== self.location.origin || !PERMITIDOS[url.pathname]) return;
  e.respondWith(
    fetch(req).then(function (res) {
      if (res && res.ok && res.type === 'basic') { var copia = res.clone(); caches.open(CACHE).then(function (c) { c.put(url.pathname, copia); }); }
      return res;
    }).catch(function () {
      return caches.match(url.pathname).then(function (r) {
        return r || (req.mode === 'navigate' ? caches.match(new URL('painel.html', self.registration.scope).pathname) : Response.error());
      });
    })
  );
});

// toque na notificação: foca o painel aberto ou abre um novo (só URLs do próprio site)
self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  var alvo = new URL((e.notification.data && e.notification.data.url) || 'painel.html', self.registration.scope);
  if (alvo.origin !== self.location.origin) alvo = new URL('painel.html', self.registration.scope);
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (lista) {
    for (var i = 0; i < lista.length; i++) {
      if (lista[i].url.indexOf('painel.html') >= 0 && 'focus' in lista[i]) return lista[i].focus();
    }
    return self.clients.openWindow ? self.clients.openWindow(alvo.href) : null;
  }));
});
