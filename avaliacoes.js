/* Avaliações da barbearia (página do cliente). Na demo ficam só neste aparelho. */
(function () {
  var CH = 'aego_avaliacoes_' + location.pathname.split('/')[1];
  var BASE = [
    { n: 'Rafael M.', e: 5, t: 'Corte impecável e atendimento pontual. Já marquei o próximo.', d: '2026-10-28' },
    { n: 'Lucas A.', e: 5, t: 'Melhor degradê que já fiz. Ambiente top.', d: '2026-10-19' },
    { n: 'Thiago S.', e: 4, t: 'Muito bom, e agendar pelo celular facilitou demais.', d: '2026-10-07' }
  ];
  var nota = 0;
  function $(i) { return document.getElementById(i); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function ler() { try { return JSON.parse(localStorage.getItem(CH)) || []; } catch (e) { return []; } }
  function est(n) { var s = ''; for (var i = 1; i <= 5; i++) s += i <= n ? '★' : '☆'; return s; }
  function data(d) { var p = d.split('-'); return p[2] + '/' + p[1] + '/' + p[0]; }
  function render() {
    var todas = ler().concat(BASE);
    var media = todas.reduce(function (a, b) { return a + b.e; }, 0) / todas.length;
    $('av-media').textContent = '★ ' + media.toFixed(1).replace('.', ',') + ' · ' + todas.length + ' avaliações';
    $('av-lista').innerHTML = todas.slice(0, 6).map(function (a) {
      return '<li class="av-item"><div class="av-top"><b>' + esc(a.n) + '</b><span class="av-e" aria-label="' + a.e + ' de 5">' + est(a.e) + '</span></div>' +
        (a.t ? '<p>' + esc(a.t) + '</p>' : '') + '<span class="av-d">' + data(a.d) + '</span></li>';
    }).join('');
  }
  function estrelas() {
    var box = $('av-estrelas'); box.innerHTML = '';
    for (var i = 1; i <= 5; i++) (function (i) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'av-star' + (i <= nota ? ' on' : ''); b.textContent = i <= nota ? '★' : '☆';
      b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', i === nota); b.setAttribute('aria-label', i + ' estrela' + (i > 1 ? 's' : ''));
      b.onclick = function () { nota = i; estrelas(); };
      box.appendChild(b);
    })(i);
  }
  function msg(t) { var m = $('av-msg'); m.textContent = t; m.classList.remove('hidden'); }
  document.addEventListener('DOMContentLoaded', function () {
    if (!$('avaliacoes')) return;
    estrelas(); render();
    $('av-form').addEventListener('submit', function (ev) {
      ev.preventDefault();
      var n = $('av-nome').value.trim(), t = $('av-txt').value.trim();
      if (!nota) return msg('Escolha de 1 a 5 estrelas.');
      if (n.length < 2) return msg('Digite seu nome.');
      var l = ler(); l.unshift({ n: n.slice(0, 40), e: nota, t: t.slice(0, 280), d: new Date().toISOString().slice(0, 10) });
      try { localStorage.setItem(CH, JSON.stringify(l.slice(0, 20))); } catch (e) {}
      nota = 0; $('av-nome').value = ''; $('av-txt').value = ''; estrelas(); render();
      msg('Obrigado! Sua avaliação foi publicada.');
    });
  });
})();
