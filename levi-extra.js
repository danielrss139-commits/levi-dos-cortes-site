/* Levi Dos Cortes · extras (marca LC na capa + trilha animada das etapas). Só transform/opacity. */
(function () {
  'use strict';
  var d = document, reduz = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- logo da capa: LC minimalista com anel que se desenha ---------- */
  var logo = d.querySelector('.capa .capa-logo');
  if (logo && window.JC && JC.marca) {
    var box = d.createElement('span'); box.className = 'capa-marca'; box.setAttribute('aria-hidden', 'true');
    box.innerHTML = JC.marca('marca-capa');
    logo.parentNode.replaceChild(box, logo);
  }

  /* ---------- trilha das etapas ---------- */
  var ids = ['s1', 's2', 's3', 's4'], passos = ids.map(function (id) { return d.getElementById(id); }).filter(Boolean);
  if (passos.length < 2) return;
  var t = d.createElement('div'); t.className = 'trilha'; t.id = 'trilha';
  t.innerHTML = '<div class="trilha-linha" aria-hidden="true"><i id="trilhaFill"></i></div>';
  passos[0].parentNode.insertBefore(t, passos[0]);
  passos.forEach(function (s, i) {
    t.appendChild(s);
    var n = d.createElement('span'); n.className = 'trilha-n num'; n.setAttribute('aria-hidden', 'true');
    n.textContent = ('0' + (i + 1)).slice(-2); s.insertBefore(n, s.firstChild);
  });
  d.body.classList.add('tem-trilha');
  var fill = d.getElementById('trilhaFill'), raf = 0;
  function atualizar() {
    raf = 0;
    var atual = 0;
    for (var i = 0; i < passos.length; i++) { if (passos[i].classList.contains('is-done')) atual = Math.min(i + 1, passos.length - 1); else break; }
    passos.forEach(function (s, i) {
      s.classList.toggle('is-atual', i === atual && !s.classList.contains('is-locked'));
      s.classList.toggle('is-passou', i < atual || s.classList.contains('is-done'));
    });
    var h = t.offsetHeight || 1, alvo = passos[atual].querySelector('.trilha-n');
    var y = alvo ? (passos[atual].offsetTop + alvo.offsetTop + alvo.offsetHeight / 2) : 0;
    fill.style.transform = 'scaleY(' + Math.max(0, Math.min(1, y / h)).toFixed(4) + ')';
  }
  function pedir() { if (!raf) raf = requestAnimationFrame(atualizar); }
  var mo = new MutationObserver(pedir);
  passos.forEach(function (s) { mo.observe(s, { attributes: true, attributeFilter: ['class'] }); });
  window.addEventListener('resize', pedir, { passive: true });
  if ('ResizeObserver' in window) new ResizeObserver(pedir).observe(t);
  // cartões entram ao rolar (uma vez só)
  if (!reduz && 'IntersectionObserver' in window) {
    passos.forEach(function (s) { s.classList.remove('rise'); s.classList.add('tr-esconde'); });
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('tr-entra'); e.target.classList.remove('tr-esconde'); io.unobserve(e.target); } });
    }, { rootMargin: '0px 0px -10% 0px', threshold: .06 });
    passos.forEach(function (s) { io.observe(s); });
    setTimeout(function () { passos.forEach(function (s) { s.classList.remove('tr-esconde'); }); }, 6000); // segurança
  }
  pedir(); setTimeout(pedir, 600);
})();
