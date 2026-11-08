/* Página do cliente (index.html / agendar.html). Lê a loja de loja.config.js (JC.loja) e os dados do Firebase (ou da demo).
   Todo texto vindo do banco ou do cliente é escapado (JC.esc) ou posto com textContent. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var html = document.documentElement;

  if (!window.JC || !JC.configOk() || !window.DB) { if (window.JC) JC.pendente(false); return; }

  var U = DB.util, esc = JC.esc;
  var LJ = JC.loja;
  var ZAP = LJ.whatsapp, MAPS = LJ.mapa, INSTA = LJ.instagram ? 'https://www.instagram.com/' + LJ.instagram : '';
  var reduz = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var lite = html.classList.contains('lite');   // aparelho fraco (boot.js): sem entradas animadas
  var calmo = reduz || lite;

  var st = { servicos: [], cfg: null, servico: null, data: null, inicio: null, livres: [], enviando: false };

  /* ================= marca, cabeçalho e abertura ================= */
  JC.aplicarHead('Agendar');
  JC.preencher();
  JC.abertura();
  var ICO_PIN = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 14.5s-4.6-4-4.6-7.8a4.6 4.6 0 0 1 9.2 0C12.6 10.5 8 14.5 8 14.5z"/><circle cx="8" cy="6.7" r="1.6"/></svg>';
  var ICO_REL = '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.2"/><path d="M8 4.6V8l2.3 1.5"/></svg>';
  var ICO_EST = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2l1.8 3.7 4 .6-2.9 2.8.7 4L8 11.2 4.4 13.1l.7-4L2.2 6.3l4-.6z"/></svg>';
  // resumo do horário a partir da configuração: ['Seg a sex · 9h às 19h', 'Sáb · 9h às 17h']
  function resumoHorario(cfg) {
    var D3 = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'], grupos = [], ordem = [1, 2, 3, 4, 5, 6, 0];
    if (!cfg) return [];
    ordem.forEach(function (k) {
      var f = cfg.horarios[k]; if (!f) { grupos.push(null); return; }
      var g = grupos[grupos.length - 1];
      if (g && g.f[0] === f[0] && g.f[1] === f[1]) g.fim = k; else grupos.push({ ini: k, fim: k, f: f });
    });
    return grupos.filter(Boolean).slice(0, 3).map(function (g) {
      return cap(g.ini === g.fim ? D3[g.ini] : D3[g.ini] + ' a ' + D3[g.fim]) + ' · ' + U.horaCurta(g.f[0]) + ' às ' + U.horaCurta(g.f[1]);
    });
  }
  function renderTrust(cfg) {
    var li = [];
    if (LJ.avaliacao) li.push('<li>' + ICO_EST + '<span><b>' + esc(LJ.avaliacao.nota) + '</b> no ' + esc(LJ.avaliacao.fonte) + (LJ.avaliacao.total ? ' · ' + esc(LJ.avaliacao.total) + ' avaliações' : '') + '</span></li>');
    if (LJ.bairroCidade) li.push('<li>' + ICO_PIN + '<span>' + esc(LJ.bairroCidade) + '</span></li>');
    resumoHorario(cfg || LJ.config).slice(0, li.length >= 2 ? 1 : 2).forEach(function (h) { li.push('<li>' + ICO_REL + '<span>' + esc(h) + '</span></li>'); });
    $('trust').innerHTML = li.join('');
    $('trust').classList.toggle('hidden', !li.length);
  }
  function renderRodape(cfg) {
    var linhas = ['<span class="foot-nome">' + esc(LJ.nome) + '</span>'];
    if (LJ.endereco) linhas.push('<span>' + esc(LJ.endereco) + '</span>');
    resumoHorario(cfg || LJ.config).forEach(function (h) { linhas.push('<span>' + esc(h) + '</span>'); });
    var bt = '';
    if (ZAP) bt += '<a class="btn btn-ghost btn-sm" href="https://wa.me/' + esc(ZAP) + '" target="_blank" rel="noopener noreferrer"><svg viewBox="0 0 24 24" aria-hidden="true"><path class="wa" d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38a9.9 9.9 0 0 0 4.74 1.21c5.46 0 9.91-4.45 9.91-9.91C21.95 6.45 17.5 2 12.04 2Zm5.8 14.13c-.25.69-1.44 1.32-1.98 1.36-.53.05-1.03.24-3.47-.72-2.93-1.16-4.79-4.17-4.94-4.36-.14-.19-1.18-1.57-1.18-3 0-1.42.75-2.13 1.01-2.42.27-.29.58-.36.78-.36.19 0 .39 0 .56.01.18.01.42-.07.66.5.25.59.84 2.03.91 2.18.07.15.12.32.02.51-.1.19-.15.32-.29.49-.15.17-.31.38-.44.51-.15.15-.3.31-.13.6.17.29.76 1.25 1.63 2.03 1.12 1 2.06 1.31 2.35 1.45.29.15.46.12.63-.07.17-.19.73-.85.92-1.15.19-.29.39-.24.66-.15.27.1 1.71.81 2 .96.29.15.49.22.56.34.07.12.07.69-.18 1.39Z"/></svg>WhatsApp</a>';
    if (INSTA) bt += '<a class="btn btn-ghost btn-sm" href="' + esc(INSTA) + '" target="_blank" rel="noopener noreferrer"><svg viewBox="0 0 24 24" aria-hidden="true"><defs><linearGradient id="igg" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#FEDA75"/><stop offset=".35" stop-color="#FA7E1E"/><stop offset=".6" stop-color="#D62976"/><stop offset=".85" stop-color="#962FBF"/><stop offset="1" stop-color="#4F5BD5"/></linearGradient></defs><rect class="ig" x="2.5" y="2.5" width="19" height="19" rx="5.5"/><circle class="ig" cx="12" cy="12" r="4.3"/><circle class="igd" cx="17.4" cy="6.6" r="1.3"/></svg>Instagram</a>';
    if (MAPS) bt += '<a class="btn btn-ghost btn-sm" href="' + esc(MAPS) + '" target="_blank" rel="noopener noreferrer">Como chegar</a>';
    if (LJ.email) linhas.push('<a href="mailto:' + esc(LJ.email) + '">' + esc(LJ.email) + '</a>');
    $('rodape').innerHTML = '<div class="foot-txt">' + linhas.join('') + '</div>' + (bt ? '<div class="foot-bt">' + bt + '</div>' : '');
  }
  renderTrust(); renderRodape();
  // foto final: entra uma vez quando aparece (sem recalcular a cada quadro de rolagem)
  (function () {
    var f = document.getElementById('final'); if (!f) return;
    if (!('IntersectionObserver' in window)) { f.classList.add('is-in'); return; }
    var io = new IntersectionObserver(function (ents) { if (ents[0].isIntersecting) { f.classList.add('is-in'); io.disconnect(); } }, { rootMargin: '0px 0px -15% 0px' });
    io.observe(f);
  })();
  // durante a rolagem, pausa o letreiro para sobrar fôlego
  (function () {
    var h = document.documentElement, t = 0;
    window.addEventListener('scroll', function () { if (!t) h.classList.add('rolando'); clearTimeout(t); t = setTimeout(function () { h.classList.remove('rolando'); t = 0; }, 160); }, { passive: true });
  })();
  if (LJ.ddd) $('zap').placeholder = '(' + LJ.ddd + ') 9 0000-0000';

  /* descrição e foto opcional (loja.config.js) ou cartão com ícone */
  function extra(s) { return JC.extraServico(s); }

  function dur(min) { min = Number(min) || 0; return min >= 60 ? (Math.floor(min / 60) + 'h' + (min % 60 ? (' ' + (min % 60) + ' min') : '')) : min + ' min'; }
  function agoraMin() { var d = new Date(); return d.getHours() * 60 + d.getMinutes(); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function diaLongo(iso) {
    var d = U.parseISO(iso), h = U.hoje();
    if (iso === h) return 'hoje, ' + d.getDate() + ' ' + U.MESES3[d.getMonth()];
    if (iso === U.addDias(h, 1)) return 'amanhã, ' + d.getDate() + ' ' + U.MESES3[d.getMonth()];
    return U.DIAS[d.getDay()] + ', ' + d.getDate() + ' ' + U.MESES3[d.getMonth()];
  }
  function diaZap(iso) {
    var d = U.parseISO(iso), h = U.hoje(), dm = pad(d.getDate()) + '/' + pad(d.getMonth() + 1);
    if (iso === h) return 'hoje (' + dm + ')';
    if (iso === U.addDias(h, 1)) return 'amanhã (' + dm + ')';
    return U.DIAS[d.getDay()] + ', ' + dm + ',';
  }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  var toastT;
  function toast(msg, ms) {
    var t = $('toast'); t.textContent = msg; t.classList.add('is-on');
    clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('is-on'); }, ms || 3200);
  }
  function msgHorario(txt) {
    var m = $('msg-horario');
    if (!txt) { m.classList.add('hidden'); m.textContent = ''; return; }
    m.textContent = txt; m.classList.remove('hidden');
  }
  // "mola" ao escolher: Web Animations (sem void offsetWidth = sem layout forçado); desligada em lite/reduzir movimento
  function pop(el) {
    if (calmo || !el || !el.animate) return;
    el.animate([{ transform: 'scale(.92)' }, { transform: 'scale(1)' }], { duration: 420, easing: 'cubic-bezier(.34,1.56,.64,1)' });
  }

  /* ---------- serviços ---------- */
  var revelados = false;
  function fotoHTML(s, anim) {
    var x = extra(s);
    var vis = x.foto
      ? '<figure class="foto-fig"><img src="' + esc(x.foto) + '" width="720" height="560" decoding="async" alt="' + esc(s.nome) + '"></figure>'
      : '<div class="foto-ico" aria-hidden="true">' + JC.icone(s, 'ico-xl') + '</div>';
    return '<div class="foto gl2' + (anim ? ' is-anim' : '') + '">' + vis +
      '<div class="foto-cap"><span class="foto-cap-n">' + esc(s.nome) + '</span>' +
      (x.descricao ? '<span class="foto-cap-t">' + esc(x.descricao) + '</span>' : '') +
      '<span class="foto-cap-m"><span class="foto-pill num">' + esc(U.brlCurto(s.preco)) + '</span><span class="foto-pill">' + esc(dur(s.duracao)) + '</span></span></div>' +
      (st.data ? '' : '<button type="button" class="btn btn-ghost btn-block" data-ir="s2">Escolher o dia</button>') +
      '</div>';
  }
  function renderServicos(anim) {
    $('servicos').innerHTML = st.servicos.map(function (s, i) {
      var on = st.servico && st.servico.id === s.id, x = extra(s);
      var th = '<span class="thumb" aria-hidden="true">' + (x.foto ? '<img src="' + esc(x.foto) + '" alt="" width="52" height="52" decoding="async"' + (i ? ' loading="lazy"' : '') + '>' : JC.icone(s)) + '</span>';
      return '<li class="reveal' + (revelados ? ' is-in' : '') + '" style="--i:' + i + '"><button type="button" class="row svc opt' + (on ? ' is-on' : '') + '" role="radio" aria-checked="' + !!on + '" data-id="' + esc(s.id) + '">' +
        th +
        '<span class="row-main"><span class="row-title">' + esc(s.nome) + '</span><span class="row-sub" style="display:block">' + esc(dur(s.duracao)) + '</span></span>' +
        '<span class="row-end">' + esc(U.brlCurto(s.preco)) + '<span class="row-mark" aria-hidden="true"></span></span></button>' +
        (on ? fotoHTML(s, anim) : '') + '</li>';
    }).join('');
    if (!revelados) observarLinhas();
  }
  function observarLinhas() {
    var lis = $('servicos').querySelectorAll('.reveal');
    if (calmo || !('IntersectionObserver' in window)) { lis.forEach(function (l) { l.classList.add('is-in'); }); revelados = true; return; }
    var io = new IntersectionObserver(function (ents) {
      ents.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); } });
      if (!$('servicos').querySelector('.reveal:not(.is-in)')) { revelados = true; io.disconnect(); }
    }, { rootMargin: '0px 0px -8% 0px', threshold: .15 });
    lis.forEach(function (l) { io.observe(l); });
  }
  $('servicos').addEventListener('click', function (e) {
    if (e.target.closest('[data-recarregar]')) { iniciar(); return; }
    var ir = e.target.closest('[data-ir]');
    if (ir) { rolarPara(ir.dataset.ir); return; }
    var b = e.target.closest('.row'); if (!b || st.feito) return;
    var mesmo = st.servico && st.servico.id === b.dataset.id;
    var novo = st.servicos.filter(function (s) { return s.id === b.dataset.id; })[0];
    if (!novo) return;
    st.servico = novo;
    revelados = true;
    if (!mesmo) {
      msgHorario('');
      renderServicos(true);
      var nb = $('servicos').querySelector('.row.is-on');
      if (nb) setTimeout(function () {
        var r = nb.getBoundingClientRect();
        if (r.top < 0 || r.top > window.innerHeight * .45) window.scrollTo({ top: r.top + window.scrollY - 16, behavior: reduz ? 'auto' : 'smooth' });
      }, 60);
    }
    $('s2').classList.remove('is-locked');
    renderDias();
    if (st.data) carregarHorarios();
    atualizarBarra();
  });

  /* ---------- faixa "Trabalhos da casa" (galeria do loja.config.js; vazia = escondida) ---------- */
  function renderFaixa() {
    var g = LJ.galeria; if (!g.length) return;
    $('works').classList.remove('hidden');
    function fig(x, i, rep) {
      return '<figure' + (rep ? ' aria-hidden="true"' : '') + '><img src="' + esc(x.foto) + '" width="112" height="140" decoding="async" alt="' + (rep ? '' : esc(x.legenda || 'Trabalho da casa')) + '"' + (i || rep ? ' loading="lazy"' : '') + '>' +
        (x.legenda ? '<figcaption>' + esc(x.legenda) + '</figcaption>' : '') + '</figure>';
    }
    $('mtrack').innerHTML = g.map(function (x, i) { return fig(x, i); }).join('') + (reduz ? '' : g.map(function (x, i) { return fig(x, i, true); }).join(''));
    var m = $('marquee');
    var pausa = function () { m.classList.add('is-paused'); };
    var segue = function () { m.classList.remove('is-paused'); };
    m.addEventListener('pointerdown', pausa); m.addEventListener('pointerup', segue);
    m.addEventListener('pointercancel', segue); m.addEventListener('pointerleave', segue);
    m.addEventListener('touchstart', pausa, { passive: true }); m.addEventListener('touchend', segue);
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (ents) { m.classList.toggle('is-fora', !ents[0].isIntersecting); }).observe(m);
    }
  }
  renderFaixa();

  /* ---------- dias (rápidos + calendário do mês) ---------- */
  var MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  var JANELA = LJ.diasAntecedencia;   // loja.config.js (máx. 60 = limite das regras)
  function diaMax() { return U.addDias(U.hoje(), JANELA); }
  function rotuloAcess(iso) { var d = U.parseISO(iso); return U.DIAS[d.getDay()] + ', ' + d.getDate() + ' de ' + MESES[d.getMonth()]; }
  function diaDisponivel(iso) { return iso >= U.hoje() && iso <= diaMax() && !U.diaFechado(iso, st.cfg); }
  var RAPIDOS = 14;
  function renderDias() {
    var h = U.hoje(), out = '', meses = {};
    for (var i = 0; i < RAPIDOS; i++) {
      var iso = U.addDias(h, i), d = U.parseISO(iso);
      var fechado = U.diaFechado(iso, st.cfg);
      var on = st.data === iso;
      meses[U.MESES3[d.getMonth()]] = 1;
      var rot = i === 0 ? 'hoje' : i === 1 ? 'amanhã' : U.DIAS3[d.getDay()];
      out += '<button type="button" class="chip day opt' + (on ? ' is-on' : '') + '" role="radio" aria-checked="' + on + '" data-d="' + iso + '"' +
        (fechado ? ' disabled aria-label="' + esc(rotuloAcess(iso)) + ', fechado"' : ' aria-label="' + esc(rotuloAcess(iso)) + '"') + '>' +
        '<span class="day-dow">' + rot + '</span><span class="day-n">' + d.getDate() + '</span><span class="day-m">' + (fechado ? 'fechado' : U.MESES3[d.getMonth()]) + '</span></button>';
    }
    $('dias').innerHTML = out;
    $('mes').textContent = Object.keys(meses).join(' / ');
    $('calAbrir').classList.remove('hidden');
    // dia escolhido no calendário fora dos dias rápidos: o botão mostra a data, destacado
    var fora = st.data && st.data >= U.addDias(h, RAPIDOS);
    $('calAbrir').classList.toggle('is-on', !!fora);
    $('calAbrirT').textContent = fora ? cap(rotuloAcess(st.data)) + ' · trocar' : 'Ver calendário';
  }
  function escolherDia(iso) {
    if (st.feito || !diaDisponivel(iso)) return;
    var mudou = st.data !== iso;
    st.data = iso;
    if (mudou) { st.inicio = null; msgHorario(''); }
    renderDias();
    var b = $('dias').querySelector('.day[data-d="' + iso + '"]');
    if (b) pop(b); else pop($('calAbrir'));
    $('s3').classList.remove('is-locked');
    carregarHorarios().then(function () { setTimeout(function () { rolarPara('s3'); }, 120); });
    atualizarBarra();
  }
  $('dias').addEventListener('click', function (e) {
    var b = e.target.closest('.day'); if (!b || b.disabled) return;
    escolherDia(b.dataset.d);
  });

  /* calendário do mês: abre de baixo; domingos/folgas fechados, passado e além de 60 dias desabilitados */
  var cal = { ano: 0, mes: 0, aberto: false, foco: null };
  function mesIdx(a, m) { return a * 12 + m; }
  function limitesMes() {
    var h = U.parseISO(U.hoje()), mx = U.parseISO(diaMax());
    return { min: mesIdx(h.getFullYear(), h.getMonth()), max: mesIdx(mx.getFullYear(), mx.getMonth()) };
  }
  function renderCal(dir) {
    var lim = limitesMes(), at = mesIdx(cal.ano, cal.mes);
    $('calT').textContent = cap(MESES[cal.mes]) + ' de ' + cal.ano;
    $('calAnt').disabled = at <= lim.min; $('calProx').disabled = at >= lim.max;
    var primeiro = new Date(cal.ano, cal.mes, 1), dias = new Date(cal.ano, cal.mes + 1, 0).getDate(), h = U.hoje();
    var out = '';
    for (var v = 0; v < primeiro.getDay(); v++) out += '<span class="cal-v" aria-hidden="true"></span>';
    for (var n = 1; n <= dias; n++) {
      var iso = U.iso(new Date(cal.ano, cal.mes, n));
      var pode = diaDisponivel(iso), on = st.data === iso, hoje = iso === h;
      var lbl = rotuloAcess(iso) + (hoje ? ', hoje' : '') + (on ? ', escolhido' : '') +
        (pode ? '' : (iso < h || iso > diaMax()) ? ', indisponível' : ', fechado');
      out += '<button type="button" class="cal-d opt' + (on ? ' is-on' : '') + (hoje ? ' is-hoje' : '') + '" data-d="' + iso + '"' +
        ' aria-label="' + esc(lbl) + '"' + (on ? ' aria-pressed="true"' : '') + (pode ? '' : ' disabled') +
        ' style="--i:' + n + '"><span class="cal-n">' + n + '</span></button>';
    }
    var g = $('calGrade');
    g.innerHTML = out;
    g.classList.remove('is-de-tras', 'is-da-frente', 'is-abrindo');
    if (!calmo) { void g.offsetWidth; g.classList.add(dir < 0 ? 'is-de-tras' : dir > 0 ? 'is-da-frente' : 'is-abrindo'); }
  }
  function abrirCal() {
    if (st.feito) return;
    var base = U.parseISO(st.data || U.hoje());
    cal.ano = base.getFullYear(); cal.mes = base.getMonth(); cal.aberto = true;
    cal.foco = document.activeElement;
    renderCal(0);
    $('calScrim').classList.add('is-on'); $('cal').classList.add('is-on'); $('cal').setAttribute('aria-hidden', 'false');
    $('calAbrir').setAttribute('aria-expanded', 'true');
    setTimeout(function () {
      var alvo = $('calGrade').querySelector('.cal-d.is-on') || $('calGrade').querySelector('.cal-d:not([disabled])') || $('calFechar');
      alvo.focus({ preventScroll: true });
    }, reduz ? 0 : 320);
  }
  function fecharCal() {
    if (!cal.aberto) return;
    cal.aberto = false;
    $('calScrim').classList.remove('is-on'); $('cal').classList.remove('is-on'); $('cal').setAttribute('aria-hidden', 'true');
    $('calAbrir').setAttribute('aria-expanded', 'false');
    if (cal.foco && cal.foco.focus) cal.foco.focus({ preventScroll: true });
  }
  function mudarMes(d) {
    var lim = limitesMes(), alvo = mesIdx(cal.ano, cal.mes) + d;
    if (alvo < lim.min || alvo > lim.max) return;
    cal.ano = Math.floor(alvo / 12); cal.mes = alvo % 12;
    renderCal(d);
  }
  $('calAbrir').addEventListener('click', abrirCal);
  $('calFechar').addEventListener('click', fecharCal);
  $('calScrim').addEventListener('click', fecharCal);
  $('calAnt').addEventListener('click', function () { mudarMes(-1); });
  $('calProx').addEventListener('click', function () { mudarMes(1); });
  $('calGrade').addEventListener('click', function (e) {
    var b = e.target.closest('.cal-d'); if (!b || b.disabled) return;
    var iso = b.dataset.d;
    $('calGrade').querySelectorAll('.cal-d.is-on').forEach(function (x) { x.classList.remove('is-on'); x.removeAttribute('aria-pressed'); });
    b.classList.add('is-on'); b.setAttribute('aria-pressed', 'true');
    // deixa ver o dia marcado por um instante e fecha mostrando os horários
    setTimeout(function () { fecharCal(); escolherDia(iso); }, reduz ? 0 : 220);
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && cal.aberto) { e.stopImmediatePropagation(); fecharCal(); } }, true);

  /* ---------- horários ---------- */
  function carregarHorarios() {
    if (st.feito || !st.servico || !st.data) return Promise.resolve();
    var data = st.data, servico = st.servico;
    return Promise.all([DB.config(), DB.ocupados(data)]).then(function (r) {
      if (st.feito || data !== st.data || servico !== st.servico) return;
      st.cfg = r[0];
      st.livres = U.horariosLivres(data, servico.duracao, r[0], r[1], data === U.hoje() ? agoraMin() : null);
      if (st.inicio != null && st.livres.indexOf(st.inicio) < 0 && !st.pend) {
        st.inicio = null;
        msgHorario('O horário que você escolheu acabou de ser ocupado. Escolha outro.');
      }
      renderHorarios();
      atualizarBarra();
    }, function (err) {
      if (data !== st.data) return;
      console.warn('[agendar] horários:', err && err.code);
      $('nlivres').textContent = '';
      $('horarios').innerHTML = '<div class="empty"><strong>Não foi possível carregar os horários.</strong>' + esc(JC.msgErro(err)) +
        '<button type="button" class="btn btn-ghost btn-block" data-recarregar-h style="margin-top:14px">Tentar de novo</button></div>';
    });
  }
  var ultimaGrade = '';
  function renderHorarios() {
    var box = $('horarios');
    if (!st.livres.length) {
      $('nlivres').textContent = '';
      box.innerHTML = '<div class="empty"><strong>Sem horários livres neste dia.</strong>Tente outro dia ou um serviço mais curto.</div>';
      return;
    }
    $('nlivres').textContent = st.livres.length + (st.livres.length === 1 ? ' livre' : ' livres');
    // entra com leve tilt só quando muda o dia/serviço (atualização ao vivo não anima de novo)
    var chave = st.data + '|' + (st.servico && st.servico.id), anim = !reduz && chave !== ultimaGrade;
    ultimaGrade = chave;
    box.innerHTML = '<div class="slots" role="radiogroup" aria-labelledby="t3">' + st.livres.map(function (t, i) {
      var on = st.inicio === t;
      return '<button type="button" class="slot opt' + (on ? ' is-on' : '') + (anim ? ' tilt-in' : '') + '" role="radio" aria-checked="' + on + '" data-t="' + Number(t) + '"' +
        (anim ? ' style="--i:' + Math.min(i, 16) + '"' : '') + '>' + U.hhmm(t) + '</button>';
    }).join('') + '</div>';
  }
  $('horarios').addEventListener('click', function (e) {
    if (e.target.closest('[data-recarregar-h]')) { carregarHorarios(); return; }
    var b = e.target.closest('.slot'); if (!b || st.feito) return;
    st.inicio = +b.dataset.t;
    msgHorario('');
    $('horarios').querySelectorAll('.slot').forEach(function (x) {
      var on = x === b; x.classList.toggle('is-on', on); x.setAttribute('aria-checked', on);
    });
    pop(b);
    var primeira = $('s4').classList.contains('is-locked');
    $('s4').classList.remove('is-locked');
    atualizarBarra();
    if (primeira) setTimeout(function () { rolarPara('s4'); }, 140);
  });

  /* ---------- seus dados (mesmas regras do servidor) ---------- */
  // nome: 2–60 caracteres depois de tirar espaços repetidos
  function nomeLimpo() { return $('nome').value.trim().replace(/\s+/g, ' '); }
  function nomeOk() { var n = nomeLimpo(); return n.length >= 2 && n.length <= 60; }
  // telefone: só dígitos, sem +55; DDD + 8 (fixo) ou DDD + 9 + 8 (celular) -> 10 ou 11 dígitos (servidor aceita 10–13)
  function telDigitos(v) {
    var d = U.soDigitos(v);
    if (d.length > 11 && d.indexOf('55') === 0) d = d.slice(2);
    if (d.length > 11 && d.charAt(0) === '0') d = d.replace(/^0+/, '');
    return d.slice(0, 11);
  }
  function telOk() { return /^[1-9]{2}(9\d{8}|[2-8]\d{7})$/.test(telDigitos($('zap').value)); }
  function mascara(v) {
    var d = telDigitos(v);
    if (!d.length) return '';
    if (d.length === 10 && d.charAt(2) !== '9') return '(' + d.slice(0, 2) + ') ' + d.slice(2, 6) + '-' + d.slice(6);
    var o = '(' + d.slice(0, 2);
    if (d.length >= 2) o += ') ';
    if (d.length > 2) o += d.slice(2, 3);
    if (d.length > 3) o += ' ' + d.slice(3, 7);
    if (d.length > 7) o += '-' + d.slice(7, 11);
    return o;
  }
  var DICA_TEL = 'Só para a barbearia confirmar com você.';
  $('zap').addEventListener('input', function () {
    this.value = mascara(this.value);
    $('f-zap').classList.remove('is-error');
    $('f-zap').querySelector('.field-hint').textContent = DICA_TEL;
    atualizarBarra();
  });
  $('nome').addEventListener('input', function () {
    $('f-nome').classList.remove('is-error'); $('f-nome').querySelector('.field-hint').classList.add('hidden');
    atualizarBarra();
  });

  /* ---------- barra ---------- */
  function atualizarBarra() {
    var bar = $('bar');
    $('s1').classList.toggle('is-done', !!st.servico);
    $('s2').classList.toggle('is-done', !!st.data);
    $('s3').classList.toggle('is-done', st.inicio != null);
    $('s4').classList.toggle('is-done', nomeOk() && telOk());
    if (!st.servico) { bar.classList.remove('is-on'); return; }
    bar.classList.add('is-on');
    $('sum1').textContent = st.servico.nome + ' · ' + U.brlCurto(st.servico.preco);
    var p = [];
    if (st.data) p.push(cap(diaLongo(st.data)));
    $('sum2').textContent = st.inicio != null ? p.join(' ') + ' às ' + U.hhmm(st.inicio)
      : p.concat(st.data ? 'escolha o horário' : 'escolha o dia').join(' · ');
    var pronto = st.data && st.inicio != null && nomeOk() && telOk();
    $('continuar').classList.toggle('is-ready', !!pronto);
    $('continuar').setAttribute('aria-disabled', pronto ? 'false' : 'true');
    $('continuar').style.opacity = pronto ? '' : '.5';
  }
  function rolarPara(id) {
    var el = $(id); if (!el) return;
    window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 16, behavior: reduz ? 'auto' : 'smooth' });
  }

  $('continuar').addEventListener('click', function () {
    if (st.enviando) return;
    if (!st.data) { toast('Escolha o dia.'); rolarPara('s2'); return; }
    if (st.inicio == null) { toast('Escolha um horário.'); rolarPara('s3'); return; }
    if (!nomeOk()) {
      $('f-nome').classList.add('is-error'); $('f-nome').querySelector('.field-hint').classList.remove('hidden');
      rolarPara('s4'); $('nome').focus({ preventScroll: true }); return;
    }
    if (!telOk()) {
      $('f-zap').classList.add('is-error');
      $('f-zap').querySelector('.field-hint').textContent = 'Confira o número com DDD. Ex.: (' + (LJ.ddd || '11') + ') 9 9999-9999.';
      rolarPara('s4'); $('zap').focus({ preventScroll: true }); return;
    }
    abrirSheet();
  });

  /* ---------- confirmação ---------- */
  function kv(k, v, num) { return '<div class="kv-row"><span class="kv-k">' + esc(k) + '</span><span class="kv-v' + (num ? ' num' : '') + '">' + esc(v) + '</span></div>'; }
  function resumoKV() {
    return kv('Serviço', st.servico.nome) +
      kv('Dia', cap(diaLongo(st.data))) +
      kv('Horário', U.hhmm(st.inicio) + ' – ' + U.hhmm(st.inicio + Number(st.servico.duracao)), true) +
      kv('Nome', nomeLimpo()) +
      kv('Valor', U.brlCurto(st.servico.preco), true);
  }
  function abrirSheet() {
    st.pend = { servico: st.servico, data: st.data, inicio: st.inicio };
    $('sheet-kv').innerHTML = resumoKV();
    $('sheet-msg').classList.add('hidden'); $('sheet-msg').classList.remove('sheet-lento');
    $('confirmar').disabled = false; $('confirmar').textContent = 'Confirmar agendamento';
    $('voltar').disabled = false;
    $('scrim').classList.add('is-on'); $('sheet').classList.add('is-on');
    if (document.activeElement) document.activeElement.blur();
  }
  function fecharSheet() {
    if (st.enviando) return;   // não fecha no meio do envio
    st.pend = null; $('scrim').classList.remove('is-on'); $('sheet').classList.remove('is-on');
  }
  $('scrim').addEventListener('click', fecharSheet);
  $('voltar').addEventListener('click', fecharSheet);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') fecharSheet(); });

  function sheetMsg(txt, lento) {
    var m = $('sheet-msg'); m.textContent = txt; m.classList.toggle('sheet-lento', !!lento); m.classList.remove('hidden');
  }
  $('confirmar').addEventListener('click', function () {
    var b = this, p = st.pend;
    if (st.enviando || !p) return;   // trava duplo toque
    if (navigator.onLine === false) { sheetMsg('Sem internet. Confira a conexão e toque em Tentar de novo.'); b.textContent = 'Tentar de novo'; return; }
    st.enviando = true;
    b.disabled = true; b.textContent = 'Confirmando…'; $('voltar').disabled = true;
    $('sheet-msg').classList.add('hidden');
    var lento = setTimeout(function () { sheetMsg('A conexão está lenta. Aguarde, ainda estamos confirmando…', true); }, 12000);
    DB.criarAgendamento({
      nome: nomeLimpo(), telefone: telDigitos($('zap').value),
      servicoId: p.servico.id, servicoNome: p.servico.nome, preco: p.servico.preco, duracao: p.servico.duracao,
      data: p.data, inicio: p.inicio
    }).then(function (ag) {
      clearTimeout(lento); st.enviando = false;
      fecharSheet(); sucesso(ag);
    }).catch(function (err) {
      clearTimeout(lento); st.enviando = false;
      $('voltar').disabled = false;
      b.disabled = false; b.textContent = 'Confirmar agendamento';
      if (err && err.code === 'ocupado') {
        fecharSheet();
        st.inicio = null;
        msgHorario('Esse horário acabou de ser ocupado. Escolha outro.');
        carregarHorarios().then(function () { rolarPara('s3'); });
        toast('Esse horário acabou de ser ocupado. Escolha outro.', 4200);
      } else {
        b.disabled = false; b.textContent = 'Tentar de novo';
        sheetMsg(err && err.code === 'invalido'
          ? 'Não foi possível confirmar esse horário. Atualize a página e tente de novo.'
          : JC.semRede(err) ? 'Sem conexão com a internet. Confira e toque em Tentar de novo.'
          : 'Não foi possível salvar agora. Tente de novo.');
        console.warn('[agendar] criar:', err && err.code);
      }
    });
  });

  /* ---------- sucesso ---------- */
  function sucesso(ag) {
    st.feito = true;
    var texto = 'Olá! Marquei ' + ag.servicoNome + ' ' + diaZap(ag.data) + ' às ' + U.hhmm(ag.inicio) + ' na ' + LJ.nome + '. Nome: ' + ag.nome;
    var wa = ZAP ? 'https://wa.me/' + ZAP + '?text=' + encodeURIComponent(texto) : '';
    var primeiro = String(ag.nome).split(' ')[0];
    var links = '';
    if (wa) links += '<a class="btn btn-primary btn-block" target="_blank" rel="noopener noreferrer" href="' + esc(wa) + '">' +
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 19.5l1.2-4A8 8 0 1 1 8.6 18.4z"/><path d="M9.2 9.3c.3 1.9 1.6 3.6 3.6 4.6l1.2-1.1 1.9.8-.3 1.6c-3.4.2-6.6-2.9-6.7-6.3l1.6-.4.8 1.9z"/></svg>' +
      'Avisar no WhatsApp</a>';
    if (MAPS) links += '<a class="btn btn-ghost btn-block" target="_blank" rel="noopener noreferrer" href="' + esc(MAPS) + '">' +
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0C18.5 15.4 12 21 12 21z"/><circle cx="12" cy="10" r="2.3"/></svg>Como chegar</a>';
    if (INSTA) links += '<a class="btn btn-ghost btn-block" target="_blank" rel="noopener noreferrer" href="' + esc(INSTA) + '">' +
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3.5h8A4.5 4.5 0 0 1 20.5 8v8a4.5 4.5 0 0 1-4.5 4.5H8A4.5 4.5 0 0 1 3.5 16V8A4.5 4.5 0 0 1 8 3.5z"/><circle cx="12" cy="12" r="3.8"/><circle cx="17.2" cy="6.8" r=".4"/></svg>@' + esc(LJ.instagram) + '</a>';
    $('sucesso').innerHTML =
      '<a class="logo-link rise" style="--i:0" href="index.html" aria-label="' + esc(LJ.nome) + ', início">' + JC.marca('marca-md') + '</a>' +
      '<div class="gl suc-card">' +
      '<svg class="check" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="30"/><path d="M20 33.5l8 8 16-18"/></svg>' +
      '<p class="eyebrow rise" style="--i:1">Horário marcado</p>' +
      '<h1 class="rise" style="--i:2;margin-top:8px" id="suc-t"></h1>' +
      '<p class="muted rise" style="--i:3;margin:6px 0 0">' + (wa ? 'Avise a barbearia no WhatsApp para confirmar.' : 'Até breve! Chegue alguns minutos antes.') + '</p>' +
      '<div class="kv rise" style="--i:4">' +
        kv('Serviço', ag.servicoNome) + kv('Dia', cap(diaLongo(ag.data))) +
        kv('Horário', U.hhmm(ag.inicio) + ' – ' + U.hhmm(ag.fim), true) + kv('Valor', U.brlCurto(ag.preco), true) +
      '</div></div>' +
      '<div class="links rise" style="--i:5">' + links +
        '<button class="btn btn-text btn-block" type="button" id="outro">Fazer outro agendamento</button>' +
      '</div>';
    $('suc-t').textContent = 'Até lá, ' + primeiro + '.';
    $('fluxo').classList.add('hidden');
    $('bar').classList.remove('is-on');
    $('sucesso').classList.remove('hidden');
    window.scrollTo(0, 0);
    $('outro').addEventListener('click', reiniciar);
  }

  function reiniciar() {
    st.feito = false; st.servico = null; st.data = null; st.inicio = null; st.livres = [];
    $('nome').value = ''; $('zap').value = '';
    msgHorario('');
    ['s2', 's3', 's4'].forEach(function (id) { $(id).classList.add('is-locked'); });
    $('horarios').innerHTML = '<p class="muted small">Escolha o serviço e o dia para ver os horários livres.</p>';
    $('nlivres').textContent = '';
    renderServicos(); renderDias(); atualizarBarra();
    $('sucesso').classList.add('hidden'); $('sucesso').innerHTML = '';
    $('fluxo').classList.remove('hidden');
    window.scrollTo(0, 0);
    // enquanto a tela de sucesso estava aberta o barbeiro pode ter mudado horário/serviços: relê
    Promise.all([DB.config(), DB.servicos()]).then(function (x) {
      aplicarCatalogo(x[1].filter(function (s) { return s.ativo !== false; }), x[0]);
    }).catch(function () {});
  }

  /* ---------- início ---------- */
  function erroCarga(err) {
    if (err && err.code === 'sem-config') { JC.pendente(false); return; }
    console.warn('[agendar] carregar:', err && (err.code || err.message));
    $('servicos').innerHTML = '<li><div class="empty"><strong>Não foi possível carregar os serviços.</strong>' +
      esc(JC.msgErro(err)) +
      '<button type="button" class="btn btn-ghost btn-block" data-recarregar style="margin-top:14px">Tentar de novo</button></div></li>';
  }
  // leitura funcionou, mas o barbeiro ainda não configurou serviços/horário: mensagem calma (a página atualiza sozinha)
  function emBreve() {
    $('servicos').innerHTML = '<li><div class="empty em-breve" id="emBreve"><strong>A agenda online abre em breve.</strong>' +
      (ZAP ? 'Enquanto isso, chame a barbearia no WhatsApp para marcar.' +
      '<a class="btn btn-ghost btn-block" style="margin-top:14px" href="https://wa.me/' + esc(ZAP) + '" target="_blank" rel="noopener noreferrer">Falar no WhatsApp</a>' : 'Volte daqui a pouco.') + '</div></li>';
    $('s2').classList.add('is-locked'); $('dias').innerHTML = ''; $('mes').textContent = ''; $('calAbrir').classList.add('hidden');
  }
  function pronto() { return st.servicos.length > 0 && st.cfg && st.cfg.existe !== false; }
  function aplicarCatalogo(lista, cfg) {
    var antes = pronto();
    st.cfg = cfg; if (cfg && cfg.existe !== false) { renderTrust(cfg); renderRodape(cfg); }
    if (JSON.stringify(lista) !== JSON.stringify(st.servicos)) {   // catálogo mudou no painel
      st.servicos = lista;
      if (st.servico) st.servico = lista.filter(function (s) { return s.id === st.servico.id; })[0] || null;
      if (pronto()) { renderServicos(); atualizarBarra(); }
    }
    if (!pronto()) { emBreve(); return; }
    if (!antes) { revelados = false; renderServicos(); }
    renderDias();
    if (st.data && st.servico) carregarHorarios();
  }
  var ligado = false;
  function iniciar() {
    $('servicos').innerHTML = '<li class="muted small" style="padding:14px 0">Carregando serviços…</li>';
    DB.iniciar().then(function () {
      return Promise.all([DB.servicos(), DB.config()]);
    }).then(function (r) {
      if (!ligado) {
        ligado = true;
        DB.aoMudar(function () {
          if (st.feito) return;
          Promise.all([DB.config(), DB.servicos()]).then(function (x) {
            aplicarCatalogo(x[1].filter(function (s) { return s.ativo !== false; }), x[0]);
          }).catch(function () {});
        });
      }
      st.servicos = r[0].filter(function (s) { return s.ativo !== false; });
      st.cfg = r[1];
      if (st.cfg && st.cfg.existe !== false) { renderTrust(st.cfg); renderRodape(st.cfg); }
      if (!pronto()) { emBreve(); return; }
      renderServicos(); renderDias();
    }).catch(erroCarga);
  }
  iniciar();
})();
