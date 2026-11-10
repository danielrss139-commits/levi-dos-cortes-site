/* Remove o service worker antigo para restaurar o carregamento normal do site. */
(function () {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.getRegistrations().then(function (regs) {
    regs.forEach(function (reg) { reg.unregister().catch(function () {}); });
  }).catch(function () {});
})();
