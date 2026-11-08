/* Decisões antes de pintar (único script síncrono no <head>; o resto é defer). Carregar DEPOIS de loja.config.js.
   - html.lite: aparelho fraco (≤4 núcleos ou ≤4 GB, ou sem backdrop-filter) -> mesmo vidro translúcido com desfoque menor
     (10px), fundo parado, sem tilt 3D. Nunca vira cartão sólido.
     Forçar no celular: ?lite=1 (liga) ou ?lite=0 (desliga) — fica salvo no aparelho; ?lite=auto volta ao automático.
   - html.intro: abertura animada (1x por sessão em cada página), nunca com "reduzir movimento".
   - html.pausado: aba escondida -> animações contínuas param.
   - Aplica cedo a cor de destaque e a imagem de fundo do loja.config.js (sem "piscar" a cor padrão). */
(function (w, d) {
  'use strict';
  var html = d.documentElement, n = w.navigator || {}, lite = false, forca = null, L = w.LOJA || {};
  try {
    var q = /(?:^|[?&])lite=(0|1|auto)(?:&|$)/.exec(w.location.search.slice(1));
    if (q) { if (q[1] === 'auto') localStorage.removeItem('bt_lite'); else localStorage.setItem('bt_lite', q[1]); }
    forca = localStorage.getItem('bt_lite');
  } catch (e) {}
  var temBlur = !!(w.CSS && CSS.supports && (CSS.supports('backdrop-filter', 'blur(1px)') || CSS.supports('-webkit-backdrop-filter', 'blur(1px)')));
  if (forca === '1') lite = true;
  else if (forca !== '0') lite = !temBlur || (n.hardwareConcurrency > 0 && n.hardwareConcurrency <= 4) || (n.deviceMemory > 0 && n.deviceMemory <= 4);
  if (lite) html.classList.add('lite');

  // cor de destaque e fundo (valores validados: nada de CSS arbitrário vindo do arquivo)
  var cor = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(L.corDestaque || '') ? L.corDestaque : '#d9b77e';
  html.style.setProperty('--ac', cor);
  var f = L.fundo || {};
  if (f.imagem && /^[\w\-./]+\.(webp|jpe?g|png|avif)$/i.test(f.imagem) && f.imagem.indexOf('..') < 0) {
    html.style.setProperty('--fundo-img', 'url("' + f.imagem + '")');
    var k = Math.max(0, Math.min(.9, Number(f.escurecer)));
    html.style.setProperty('--fundo-esc', String(isFinite(k) ? k : .55));
    html.classList.add('com-fundo');
  }

  var reduz = !!(w.matchMedia && w.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var chave = 'bt_intro_' + (html.getAttribute('data-intro') || '');
  try {
    if (html.hasAttribute('data-intro') && !reduz && !sessionStorage.getItem(chave)) {
      html.classList.add('intro');
      // segurança: se algo falhar, nunca deixa a página escondida
      setTimeout(function () { html.classList.remove('intro'); var i = d.getElementById('intro'); if (i) i.remove(); }, 3200);
    }
  } catch (e) { html.classList.remove('intro'); }

  function vis() { html.classList.toggle('pausado', d.visibilityState === 'hidden'); }
  d.addEventListener('visibilitychange', vis); vis();

  w.JC_BOOT = { lite: lite, reduz: reduz, chaveIntro: chave };
})(window, document);
