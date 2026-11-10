/* Registra o suporte de instalação do Painel Levi dos Cortes. */
(function () {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('/sw.js', { scope: '/' })
      .catch(function (error) {
        console.warn('[painel] Não foi possível registrar o modo instalável:', error);
      });
  });
})();
