/* Painel do barbeiro (painel.html): Firebase Auth + Firestore (ou dados locais no modo demonstração).
   Nada de dado é mostrado antes de o login ser confirmado como barbeiro (admins/{uid}).
   Todo texto vindo do banco é escapado (esc) ou posto com textContent. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  if (!window.JC || !JC.configOk() || !window.DB) { if (window.JC) JC.pendente(true); return; }
  var U = DB.util, LJ = JC.loja;
  JC.aplicarHead('Painel');
  JC.preencher();
  JC.abertura();
  if (LJ.demo && DB.demo) {
    $('demoDica').textContent = 'Demonstração: e-mail ' + DB.demo.email + ' · senha ' + DB.demo.senha;
    $('demoDica').classList.remove('hidden');
    $('restaurarDemo').classList.remove('hidden');
  }
  $('ajFoot').textContent = LJ.nome + (LJ.endereco ? ' · ' + LJ.endereco : '');
  var K_VISTOS = 'jcp_vistos';

  var st = { view: 'agenda', dia: U.hoje(), periodo: 'hoje', modo: 'saida', svcSel: null,
    servicos: [], cfg: null, vistos: null, novos: {}, flash: {}, just: {}, dir: 0, lock: false, pend: false,
    autorizado: false, ocupado: {} };

  var esc = JC.esc;
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function diaCurto(iso) { var d = U.parseISO(iso); return U.DIAS3[d.getDay()] + ', ' + d.getDate() + ' ' + U.MESES3[d.getMonth()]; }
  function parseValor(s) { var n = parseFloat(String(s).replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.')); return isFinite(n) ? Math.round(n * 100) / 100 : NaN; }
  function agoraHHMM() { var d = new Date(); return U.hhmm(d.getHours() * 60 + d.getMinutes()); }
  function zapLink(a) {
    var n = U.soDigitos(a.telefone || a.whatsapp); if (n.length <= 11) n = '55' + n;
    var msg = 'Olá, ' + String(a.nome).split(' ')[0] + '! Aqui é da ' + LJ.nome + ', sobre seu horário de ' + U.DIAS3[U.parseISO(a.data).getDay()] + ' ' + U.hhmm(a.inicio) + ' (' + a.servicoNome + ').';
    return 'https://wa.me/' + n + '?text=' + encodeURIComponent(msg);
  }

  /* ---------- movimento ---------- */
  var MQ = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  function reduz() { return MQ.matches; }
  var EASE = 'cubic-bezier(.2,.7,.2,1)';
  // número que conta (tween) até o valor; fmt formata
  function contar(el, alvo, fmt, de) {
    if (el._raf) cancelAnimationFrame(el._raf);
    var ini = de != null ? de : (el._v != null ? el._v : 0);
    el._v = alvo;
    if (reduz() || ini === alvo) { el.textContent = fmt(alvo); return; }
    var t0 = performance.now(), dur = 800;
    function passo(t) {
      var k = Math.min(1, (t - t0) / dur); k = 1 - Math.pow(1 - k, 3);
      el.textContent = fmt(k < 1 ? Math.round(ini + (alvo - ini) * k) : alvo);
      if (k < 1) el._raf = requestAnimationFrame(passo); else el._raf = 0;
    }
    el._raf = requestAnimationFrame(passo);
  }
  function fmtSaldo(v) { return (v < 0 ? '− ' : '') + U.brlCurto(Math.abs(v)); }

  var toastT;
  function toast(msg) {
    var t = $('toast'); t.textContent = msg; t.classList.add('is-on');
    clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('is-on'); }, 3200);
  }

  /* ---------- abas com indicador ---------- */
  function moverInd(tabs) {
    var on = tabs.querySelector('.tab.is-on'), ind = tabs.querySelector('.tab-ind');
    if (!on || !ind || !on.offsetWidth) return;
    ind.style.width = '1px';
    ind.style.transform = 'translateX(' + on.offsetLeft + 'px) scaleX(' + on.offsetWidth + ')';
  }
  function ligarTabs(tabs, attr, cb) {
    tabs.addEventListener('click', function (e) {
      var b = e.target.closest('.tab'); if (!b) return;
      tabs.querySelectorAll('.tab').forEach(function (t) { var on = t === b; t.classList.toggle('is-on', on); t.setAttribute('aria-selected', on); });
      moverInd(tabs); cb(b.dataset[attr]);
    });
  }

  /* ---------- login (Firebase Auth) ---------- */
  function loginMsg(txt, ok) {
    var m = $('loginMsg');
    if (!txt) { m.classList.add('hidden'); m.textContent = ''; return; }
    m.textContent = txt; m.classList.toggle('is-ok', !!ok); m.classList.remove('hidden');
  }
  function msgLogin(e) {
    var c = (e && e.code) || '';
    if (navigator.onLine === false || c === 'auth/network-request-failed' || c === 'unavailable' || c === 'rede') return 'Sem internet. Confira a conexão e tente de novo.';
    if (c === 'auth/wrong-password') return 'Senha incorreta.';
    if (c === 'auth/invalid-credential' || c === 'auth/invalid-login-credentials' || c === 'auth/user-not-found') return 'E-mail ou senha incorretos.';
    if (c === 'auth/invalid-email' || c === 'auth/missing-email') return 'E-mail inválido.';
    if (c === 'auth/missing-password') return 'Digite a senha.';
    if (c === 'auth/too-many-requests') return 'Muitas tentativas. Espere alguns minutos ou use "Esqueci a senha".';
    if (c === 'auth/user-disabled') return 'Esta conta foi desativada.';
    if (c === 'nao-autorizado') return 'Acesso não autorizado. Esta conta não tem permissão para o painel.';
    return 'Não foi possível entrar agora. Tente de novo.';
  }
  function emailOk(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); }
  function mostrarLogin() {
    $('app').classList.add('hidden'); $('nav').classList.remove('is-on');
    var l = $('login'); l.classList.remove('hidden', 'is-leaving', 'is-checking');
    $('entrar').disabled = false; $('entrar').textContent = 'Entrar';
  }
  var entT;
  function mostrarApp() {
    var app = $('app');
    $('login').classList.add('hidden'); $('login').classList.remove('is-leaving');
    $('senha').value = ''; loginMsg('');
    $('nav').classList.remove('is-on');
    app.classList.remove('hidden');
    if (!reduz()) { app.classList.add('is-entering'); clearTimeout(entT); entT = setTimeout(function () { app.classList.remove('is-entering'); }, 1900); }
    void app.offsetWidth;
    requestAnimationFrame(function () { $('nav').classList.add('is-on'); moverInd(document.querySelector('#nav .tabs')); });
    st.entrada = true; iniciarVistos(); renderTudo(true);
  }
  // só chamado quando o Firebase confirmou: logado E barbeiro
  // 1ª configuração: banco sem serviços e/ou sem config/loja -> cria o padrão (nunca sobrescreve)
  var cfgInicialFeita = false, cfgInicialRodando = false;
  function primeiraConfig(tentativa) {
    if (cfgInicialFeita || cfgInicialRodando || !st.autorizado) return;
    cfgInicialRodando = true;
    DB.primeiraConfiguracao().then(function (r) {
      cfgInicialRodando = false; cfgInicialFeita = true;
      if (!st.autorizado || !(r.servicos || r.config)) return;
      var o = [];
      if (r.servicos) o.push(r.servicos + ' serviços');
      if (r.config) o.push('horário de funcionamento');
      toast('Primeira configuração pronta: ' + o.join(' e ') + '. Ajuste em Ajustes.');
      if (st.view === 'aj') renderAjustes(); else renderTudo();
    }, function (err) {
      cfgInicialRodando = false;
      console.warn('[painel] primeira configuração:', err && (err.code || err.message));
      if ((tentativa || 0) < 3) setTimeout(function () { primeiraConfig((tentativa || 0) + 1); }, 4000);
      else if (st.autorizado) toast(err && err.code === 'permission-denied'
        ? 'Não deu para criar os serviços padrão: as regras do Firestore recusaram. Publique o firestore.rules atual.'
        : 'Não deu para criar os serviços padrão agora. Recarregue a página para tentar de novo.');
    });
  }
  function liberar() {
    if (st.autorizado) return;
    st.autorizado = true;
    primeiraConfig(0);
    prepararAudio();
    var l = $('login');
    if (reduz() || l.classList.contains('hidden') || l.classList.contains('is-checking')) return mostrarApp();
    l.classList.add('is-leaving');
    setTimeout(function () { if (st.autorizado) mostrarApp(); }, 380);
  }
  // apaga tudo que estava na tela (dados do barbeiro não ficam no DOM depois de sair)
  function limparTela() {
    st.autorizado = false; st.vistos = null; st.novos = {}; st.flash = {}; st.just = {}; st.ocupado = {};
    st.view = 'agenda'; st.dia = U.hoje(); st.periodo = 'hoje';
    ['agLista', 'finLista', 'finKv', 'bars', 'svcEd', 'hrEd', 'hrAlmoco', 'cSvc', 'ringOcup', 'rcMargem', 'rcComp'].forEach(function (id) { $(id).innerHTML = ''; });
    $('ringOcup').dataset.k = ''; $('rcMargem').dataset.k = '';
    ['hsH', 'hsA'].forEach(function (id) { $(id).textContent = '0'; $(id)._v = 0; });
    $('hsP').textContent = 'R$ 0'; $('hsP')._v = 0; $('saldo').textContent = 'R$ 0'; $('saldo')._v = 0;
    $('agSum').textContent = ''; $('chartV').textContent = '';
    fecharSheet();
    ['agenda', 'fin', 'aj'].forEach(function (x) { $('v-' + x).hidden = x !== 'agenda'; });
    document.querySelectorAll('#nav .tab').forEach(function (t) { var on = t.dataset.v === 'agenda'; t.classList.toggle('is-on', on); t.setAttribute('aria-selected', on); });
  }

  $('loginForm').addEventListener('submit', function (e) {
    e.preventDefault();
    if (st.entrando) return;   // trava duplo envio
    var email = $('email').value.trim(), senha = $('senha').value;
    $('f-email').classList.remove('is-error'); $('f-senha').classList.remove('is-error');
    if (!emailOk(email)) { $('f-email').classList.add('is-error'); loginMsg('Digite um e-mail válido.'); $('email').focus(); return; }
    if (!senha) { $('f-senha').classList.add('is-error'); loginMsg('Digite a senha.'); $('senha').focus(); return; }
    if (navigator.onLine === false) { loginMsg('Sem internet. Confira a conexão e tente de novo.'); return; }
    st.entrando = true; prepararAudio();
    $('entrar').disabled = true; $('entrar').textContent = 'Entrando…'; loginMsg('');
    DB.entrar(email, senha).then(function () {
      st.entrando = false; liberar();
    }).catch(function (err) {
      st.entrando = false;
      $('entrar').disabled = false; $('entrar').textContent = 'Entrar';
      var c = err && err.code;
      if (c === 'auth/wrong-password' || c === 'auth/invalid-credential' || c === 'auth/invalid-login-credentials') {
        $('f-senha').classList.add('is-error'); $('senha').value = ''; $('senha').focus();
      }
      loginMsg(msgLogin(err));
    });
  });
  $('esqueci').addEventListener('click', function () {
    var b = this, email = $('email').value.trim();
    if (!emailOk(email)) { $('f-email').classList.add('is-error'); loginMsg('Digite seu e-mail acima e toque em "Esqueci a senha".'); $('email').focus(); return; }
    if (navigator.onLine === false) { loginMsg('Sem internet. Confira a conexão e tente de novo.'); return; }
    b.disabled = true; b.textContent = 'Enviando…';
    DB.redefinirSenha(email).then(function () {
      loginMsg('Se esse e-mail tiver conta, enviamos um link para criar uma nova senha. Confira também o spam.', true);
    }).catch(function (err) {
      loginMsg(err && err.code === 'auth/too-many-requests' ? 'Muitas tentativas. Espere alguns minutos.' : msgLogin(err));
    }).then(function () { b.disabled = false; b.textContent = 'Esqueci a senha'; });
  });
  $('email').addEventListener('input', function () { $('f-email').classList.remove('is-error'); });
  $('senha').addEventListener('input', function () { $('f-senha').classList.remove('is-error'); });
  $('sair').addEventListener('click', function () {
    var b = this; b.disabled = true;
    DB.sair().catch(function () {}).then(function () {
      b.disabled = false; limparTela(); window.scrollTo(0, 0); mostrarLogin();
    });
  });

  /* ---------- navegação ---------- */
  var ORDEM = ['agenda', 'fin', 'aj'], navTok = 0;
  function mostrarView(v) { ORDEM.forEach(function (x) { $('v-' + x).hidden = x !== v; }); }
  ligarTabs(document.querySelector('#nav .tabs'), 'v', function (v) {
    if (v === st.view) return;
    var dir = ORDEM.indexOf(v) > ORDEM.indexOf(st.view) ? 1 : -1, velha = $('v-' + st.view), tok = ++navTok;
    st.view = v;
    function entrar() {
      if (tok !== navTok) return;
      mostrarView(v); window.scrollTo(0, 0); renderTudo(true);
      if (!reduz()) $('v-' + v).animate([{ opacity: 0, transform: 'translateX(' + (dir * 36) + 'px)' }, { opacity: 1, transform: 'none' }], { duration: 380, easing: EASE });
    }
    if (reduz() || velha.hidden) return entrar();
    var sai = velha.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateX(' + (-dir * 28) + 'px)' }], { duration: 150, easing: 'cubic-bezier(.4,0,1,1)', fill: 'forwards' });
    sai.onfinish = function () { entrar(); sai.cancel(); };
  });

  function renderTop() {
    var d = new Date();
    $('topDate').innerHTML = esc(U.DIAS3[d.getDay()]) + '<b>' + d.getDate() + ' ' + U.MESES3[d.getMonth()] + '</b>';
    var h = d.getHours(); $('topG').textContent = h < 5 ? 'Boa noite' : h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
  }
  function renderTudo(animar) {
    if (animar) st.animar = true;
    renderTop();
    if (st.view === 'agenda') renderAgenda();
    else if (st.view === 'fin') renderFin();
    else renderAjustes();
  }

  /* ---------- AGENDA ---------- */
  function rotuloDia(iso) {
    var h = U.hoje();
    if (iso === h) return 'Hoje';
    if (iso === U.addDias(h, 1)) return 'Amanhã';
    if (iso === U.addDias(h, -1)) return 'Ontem';
    return cap(U.DIAS[U.parseISO(iso).getDay()]);
  }
  function minAgora() { var d = new Date(); return d.getHours() * 60 + d.getMinutes(); }
  var OK_SVG = '<svg class="ag-ok" viewBox="0 0 18 18" aria-hidden="true"><circle cx="9" cy="9" r="7.5"/><path d="M5.6 9.2l2.3 2.3 4.6-4.8"/></svg>';
  // minutos de trabalho de um dia (horário menos almoço)
  function minAbertos(iso, cfg) {
    var f = cfg && !U.diaFechado(iso, cfg) && cfg.horarios[U.parseISO(iso).getDay()]; if (!f) return 0;
    var t = f[1] - f[0], al = cfg.almoco;
    if (al) t -= Math.max(0, Math.min(f[1], al[1]) - Math.max(f[0], al[0]));
    return Math.max(0, t);
  }
  function renderHojeStats(todos, cfg) {
    var h = U.hoje(), l = todos.filter(function (a) { return a.data === h; });
    var val = l.filter(function (a) { return a.status !== 'faltou' && a.status !== 'cancelado'; });
    var prev = val.reduce(function (s, a) { return s + Number(a.preco || 0); }, 0);
    var at = l.filter(function (a) { return a.status === 'atendido'; }).length;
    var zero = st.statsZero; st.statsZero = false;
    contar($('hsH'), val.length, String, zero ? 0 : null);
    contar($('hsP'), prev, U.brlCurto, zero ? 0 : null);
    contar($('hsA'), at, String, zero ? 0 : null);
    var ab = minAbertos(h, cfg), oc = val.reduce(function (s, a) { return s + (Number(a.fim) - Number(a.inicio) || 0); }, 0);
    var p = ab ? Math.min(100, Math.round(oc / ab * 100)) : 0;
    var box = $('ringOcup'), chave = p + '|' + ab;
    if (box.dataset.k !== chave || zero) { box.dataset.k = chave; box.innerHTML = JC.anel(p, p + '<small>%</small>', ab ? 'ocupação' : 'fechado hoje', 'rg-sm'); }
  }
  function renderAgenda() {
    if (!st.autorizado) return;
    if (st.lock) { st.pend = true; return; }
    var d = U.parseISO(st.dia), dir = st.dir || 0; st.dir = 0;
    $('diaT').textContent = rotuloDia(st.dia);
    $('diaS').textContent = (st.dia === U.hoje() || Math.abs(d - U.parseISO(U.hoje())) <= 86400000 * 1.5 ? U.DIAS[d.getDay()] + ', ' : '') + d.getDate() + ' de ' + U.MESES3[d.getMonth()];
    $('irHoje').classList.toggle('hidden', st.dia === U.hoje());
    if (dir && !reduz()) document.querySelector('.dayswitch-mid').animate([{ opacity: 0, transform: 'translateX(' + (dir * 22) + 'px)' }, { opacity: 1, transform: 'none' }], { duration: 360, easing: EASE });
    Promise.all([DB.agendamentos(), DB.config()]).then(function (r) {
      if (!st.autorizado) return;
      if (st.lock) { st.pend = true; return; }
      var todos = r[0], cfg = r[1], anim = st.animar; st.animar = false;
      if (st.entrada) { st.statsZero = true; st.entrada = false; }
      renderHojeStats(todos, cfg);
      var ags = todos.filter(function (a) { return a.data === st.dia; });
      var validos = ags.filter(function (a) { return a.status !== 'faltou' && a.status !== 'cancelado'; });
      var previsto = validos.reduce(function (s, a) { return s + Number(a.preco || 0); }, 0);
      $('agSum').textContent = ags.length
        ? validos.length + (validos.length === 1 ? ' horário' : ' horários') + ' · ' + U.brlCurto(previsto) + ' previsto'
        : (U.diaFechado(st.dia, cfg) ? 'Fechado' : 'Sem horários');
      var ul = $('agLista');
      ul.style.setProperty('--dx', (dir * 34) + 'px'); ul.style.setProperty('--dy', dir ? '0px' : '12px');
      if (!ags.length) {
        ul.innerHTML = '<li class="empty' + (anim ? ' ag-in' : '') + '"><strong>' + (U.diaFechado(st.dia, cfg) ? 'Barbearia fechada' : 'Nenhum horário marcado') + '</strong>' +
          (U.diaFechado(st.dia, cfg) ? 'Dia sem expediente.' : 'Quando um cliente marcar, aparece aqui e você recebe um aviso.') + '</li>';
        return;
      }
      // posições antes (FLIP: os cartões deslizam quando um recolhe/expande)
      var antes = {};
      if (!anim) ul.querySelectorAll('.ag[data-id]').forEach(function (li) { antes[li.dataset.id] = li.getBoundingClientRect().top; });
      var ehHoje = st.dia === U.hoje(), agora = minAgora(), proxId = null, nowAt = -1;
      if (ehHoje) {
        for (var k = 0; k < ags.length; k++) {
          if (ags[k].status === 'marcado' && ags[k].inicio > agora && !proxId) proxId = ags[k].id;
          if (nowAt < 0 && ags[k].inicio > agora) nowAt = k;
        }
        if (nowAt < 0) nowAt = ags.length;
      }
      var nowLi = '<li class="now' + (anim ? ' is-in' : '') + '" aria-label="Agora, ' + U.hhmm(agora) + '"><span class="now-l"></span><span class="now-t">' + U.hhmm(agora) + '</span></li>';
      var html = ags.map(function (a, i) {
        var feito = a.status === 'atendido', faltou = a.status === 'faltou';
        var acts = (feito || faltou)
          ? '<span class="ag-status"><span class="dot"></span>' + (feito ? 'Atendido · no caixa' : 'Não veio') + '</span>' +
            '<button class="btn btn-text btn-sm" data-a="desfazer" data-id="' + esc(a.id) + '" type="button">Desfazer</button>'
          : '<a class="btn btn-ghost btn-sm" href="' + esc(zapLink(a)) + '" target="_blank" rel="noopener noreferrer">WhatsApp</a>' +
            '<button class="btn btn-primary btn-sm" data-a="atendido" data-id="' + esc(a.id) + '" type="button">Atendido</button>' +
            '<button class="btn btn-text btn-sm" data-a="faltou" data-id="' + esc(a.id) + '" type="button">Não veio</button>';
        var cls = 'ag' + (anim ? ' ag-in' : '') + (feito ? ' is-feito' : '') + (faltou ? ' is-faltou' : '') +
          (st.flash[a.id] ? ' is-flash' : '') + (st.just[a.id] ? ' just' : '');
        return (i === nowAt ? nowLi : '') + '<li class="' + cls + '" data-id="' + esc(a.id) + '" style="--i:' + Math.min(i, 7) + '">' +
          '<div class="ag-top"><div class="ag-time"><span class="num">' + esc(U.hhmm(a.inicio)) + '</span>' + (feito ? OK_SVG : '<span class="small">até ' + esc(U.hhmm(a.fim)) + '</span>') + '</div>' +
          '<div class="ag-main">' + (a.id === proxId ? '<div class="ag-prox"><span class="pulse" aria-hidden="true"></span>Próximo</div>' : '') +
          '<div class="ag-name">' + esc(a.nome) + (st.novos[a.id] ? '<span class="ag-new">novo</span>' : '') + '</div>' +
          '<div class="ag-svc">' + esc(a.servicoNome) + (a.origem === 'online' ? ' · pelo link' : '') + '</div></div>' +
          '<div class="ag-price">' + esc(U.brlCurto(a.preco)) + '</div></div>' +
          '<div class="ag-acts">' + acts + '</div></li>';
      }).join('') + (nowAt === ags.length ? nowLi : '');
      ags.forEach(function (a) { delete st.flash[a.id]; delete st.just[a.id]; });
      ul.innerHTML = html;
      if (!anim && !reduz()) ul.querySelectorAll('.ag[data-id]').forEach(function (li) {
        var p = antes[li.dataset.id];
        if (p == null) { if (Object.keys(antes).length) li.animate([{ opacity: 0, transform: 'translateY(-10px)' }, { opacity: 1, transform: 'none' }], { duration: 450, easing: EASE }); return; }
        var dy = p - li.getBoundingClientRect().top;
        if (Math.abs(dy) > 1) li.animate([{ transform: 'translateY(' + dy + 'px)' }, { transform: 'none' }], { duration: 440, easing: EASE });
      });
    }).catch(function (err) { falhaLeitura(err); });
  }
  var falhaT = 0;
  function falhaLeitura(err) {
    console.warn('[painel] leitura:', err && err.code);
    if (Date.now() - falhaT > 5000) { falhaT = Date.now(); toast(JC.msgErro(err)); }
  }

  // chip "+R$ 25" sai do botão e voa até o ícone da aba Financeiro
  function voarChip(de, valor) {
    var alvo = document.querySelector('#nav .tab[data-v=fin] svg'); if (!alvo || reduz()) return;
    var c = document.createElement('div'); c.className = 'fly num'; c.textContent = '+' + U.brlCurto(valor);
    document.body.appendChild(c);
    var a = de.getBoundingClientRect(), t = alvo.getBoundingClientRect(), w = c.offsetWidth, h = c.offsetHeight;
    var x0 = a.left + a.width / 2 - w / 2, y0 = a.top - h - 6, x1 = t.left + t.width / 2 - w / 2, y1 = t.top + t.height / 2 - h / 2;
    var dx = x1 - x0, dy = y1 - y0;
    function tr(x, y, sc) { return 'translate(' + (x0 + x) + 'px,' + (y0 + y) + 'px) scale(' + sc + ')'; }
    var an = c.animate([
      { transform: tr(0, 10, .7), opacity: 0 },
      { transform: tr(0, -14, 1.05), opacity: 1, offset: .22 },
      { transform: tr(dx * .35, -26 + dy * .2, 1), opacity: 1, offset: .45 },
      { transform: tr(dx, dy, .45), opacity: 0 }
    ], { duration: 1050, easing: 'cubic-bezier(.45,0,.3,1)', fill: 'forwards' });
    an.onfinish = function () {
      c.remove();
      alvo.classList.remove('bump'); void alvo.getBoundingClientRect(); alvo.classList.add('bump');
    };
  }
  function travar(ms, fn) {
    st.lock = true;
    setTimeout(function () { st.lock = false; fn(); if (st.pend) { st.pend = false; renderAgenda(); } }, ms);
  }
  $('agLista').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-a]'); if (!b || st.lock) return;
    var id = b.dataset.id, a = b.dataset.a, li = b.closest('.ag'), anima = !reduz() && li, p;
    if (st.ocupado[id]) return;   // trava duplo toque no mesmo cartão
    st.ocupado[id] = 1;
    if (li) li.querySelectorAll('button').forEach(function (x) { x.disabled = true; });
    function feito(pr) {
      pr.catch(function (err) {
        console.warn('[painel] ação:', err && err.code);
        toast(err && err.code === 'ocupado' ? 'Não dá para desfazer: outro cliente já marcou esse horário.' : JC.msgErro(err));
      }).then(function () { delete st.ocupado[id]; renderAgenda(); });
    }
    if (a === 'atendido') {
      var go = function () { st.just[id] = 1; feito(DB.marcarAtendido(id).then(function (x) { toast(U.brlCurto(x.preco) + ' lançado no caixa'); })); };
      if (!anima) return go();
      li.classList.add('is-closing');
      var tm = li.querySelector('.ag-time'), sm = tm.querySelector('.small');
      setTimeout(function () { if (sm) sm.remove(); tm.insertAdjacentHTML('beforeend', OK_SVG); tm.lastChild.classList.add('draw'); }, 180);
      DB.agendamentos().then(function (l) { var x = l.filter(function (y) { return y.id === id; })[0]; if (x) voarChip(b, x.preco); }).catch(function () {});
      travar(620, go);
    } else if (a === 'faltou') {
      var go2 = function () { feito(DB.atualizarAgendamento(id, { status: 'faltou' }).then(function () { toast('Marcado como não veio. Horário liberado.'); })); };
      if (!anima) return go2();
      li.classList.add('is-fading'); travar(360, go2);
    } else feito(DB.desfazerStatus(id).then(function () { toast('Desfeito'); }));
  });
  function mudarDia(n) { st.dia = n === 0 ? U.hoje() : U.addDias(st.dia, n); st.animar = true; renderAgenda(); }
  $('diaAnt').addEventListener('click', function () { st.dir = -1; mudarDia(-1); });
  $('diaProx').addEventListener('click', function () { st.dir = 1; mudarDia(1); });
  $('irHoje').addEventListener('click', function () { st.dir = st.dia > U.hoje() ? -1 : 1; mudarDia(0); });

  /* ---------- FINANCEIRO ---------- */
  function intervalo() {
    var h = U.hoje();
    if (st.periodo === '7') return [U.addDias(h, -6), h];
    if (st.periodo === 'mes') return [h.slice(0, 8) + '01', h];
    return [h, h];
  }
  function renderChart(cortes7) {
    var h = U.hoje(), dias = [], max = 0;
    for (var i = 6; i >= 0; i--) {
      var d = U.addDias(h, -i), v = cortes7.filter(function (c) { return c.data === d; }).reduce(function (s, c) { return s + Number(c.valor || 0); }, 0);
      dias.push({ d: d, v: v }); if (v > max) max = v;
    }
    st.chart = dias;
    var box = $('bars'), novo = box.dataset.ini !== h || !box.children.length;
    if (novo) {
      box.dataset.ini = h;
      box.innerHTML = dias.map(function (x, i) {
        return '<button class="bc' + (x.d === h ? ' is-hoje' : '') + '" type="button" data-d="' + esc(x.d) + '"><span class="bt"><span class="b"></span></span>' +
          '<span class="bl">' + (x.d === h ? 'hoje' : U.DIAS3[U.parseISO(x.d).getDay()]) + '</span></button>';
      }).join('');
    }
    var crescer = novo || st.chartReset; st.chartReset = false;
    var bs = box.querySelectorAll('.bc');
    dias.forEach(function (x, i) {
      var b = bs[i].querySelector('.b'), k = max ? Math.max(x.v / max, .025) : .025;
      bs[i].setAttribute('aria-label', diaCurto(x.d) + ': ' + U.brlCurto(x.v));
      if (crescer && !reduz()) {
        b.style.transitionDelay = '0ms'; b.style.transitionDuration = '0ms'; b.style.transform = 'scaleY(0)';
        void b.offsetWidth;
        b.style.transitionDuration = ''; b.style.transitionDelay = (120 + i * 60) + 'ms';
      } else b.style.transitionDelay = '0ms';
      b.style.transform = 'scaleY(' + k.toFixed(4) + ')';
    });
    mostrarBarra(st.barSel && dias.some(function (x) { return x.d === st.barSel; }) ? st.barSel : h);
  }
  function mostrarBarra(d) {
    st.barSel = d;
    var x = (st.chart || []).filter(function (y) { return y.d === d; })[0]; if (!x) return;
    $('bars').querySelectorAll('.bc').forEach(function (b) { b.classList.toggle('is-sel', b.dataset.d === d); });
    $('chartV').textContent = (d === U.hoje() ? 'Hoje' : cap(diaCurto(d))) + ' · ' + U.brlCurto(x.v);
  }
  $('bars').addEventListener('click', function (e) { var b = e.target.closest('.bc'); if (b) mostrarBarra(b.dataset.d); });

  function renderFin() {
    if (!st.autorizado) return;
    var iv = intervalo(), h = U.hoje(), d7 = U.addDias(h, -6);
    $('saldoLbl').textContent = st.periodo === 'hoje' ? 'Saldo de hoje' : st.periodo === '7' ? 'Saldo · últimos 7 dias' : 'Saldo · ' + U.MESES3[new Date().getMonth()] + ' até hoje';
    var de = iv[0] < d7 ? iv[0] : d7;
    Promise.all([DB.cortes(de, h), DB.saidas(iv[0], iv[1]), DB.agendamentos()]).then(function (r) {
      var anim = st.animar; st.animar = false;
      var cortes = r[0].filter(function (c) { return c.data >= iv[0] && c.data <= iv[1]; }), saidas = r[1];
      var fat = cortes.reduce(function (s, c) { return s + Number(c.valor || 0); }, 0);
      var sai = saidas.reduce(function (s, c) { return s + Number(c.valor || 0); }, 0);
      var saldo = fat - sai;
      contar($('saldo'), saldo, fmtSaldo, anim ? 0 : null);
      $('saldo').classList.toggle('neg', saldo < 0);
      var agsP = r[2].filter(function (a) { return a.data >= iv[0] && a.data <= iv[1]; });
      var atd = agsP.filter(function (a) { return a.status === 'atendido'; }).length, falt = agsP.filter(function (a) { return a.status === 'faltou'; }).length;
      var margem = fat > 0 ? Math.max(0, Math.round(saldo / fat * 100)) : 0, comp = atd + falt ? Math.round(atd / (atd + falt) * 100) : 0;
      var kRing = st.periodo + '|' + margem + '|' + comp + '|' + atd + '|' + falt;
      if (anim || $('rcMargem').dataset.k !== kRing) {
        $('rcMargem').dataset.k = kRing;
        $('rcMargem').innerHTML = '<span class="l">Margem</span>' + JC.anel(margem, (fat > 0 ? margem : '–') + (fat > 0 ? '<small>%</small>' : ''), 'do faturado') +
          '<span class="rgs num">' + (sai ? '− ' + esc(U.brlCurto(sai)) + ' em saídas' : 'sem saídas') + '</span>';
        $('rcComp').innerHTML = '<span class="l">Comparecimento</span>' + JC.anel(comp, (atd + falt ? comp : '–') + (atd + falt ? '<small>%</small>' : ''), 'vieram', 'rg-b') +
          '<span class="rgs num">' + atd + ' atendido' + (atd === 1 ? '' : 's') + ' · ' + falt + ' não ' + (falt === 1 ? 'veio' : 'vieram') + '</span>';
        $('rcMargem').classList.toggle('ov', fat > 0 && saldo < 0);
      }
      if (anim) st.chartReset = true;
      renderChart(r[0].filter(function (c) { return c.data >= d7; }));
      $('finKv').innerHTML =
        '<div class="kv-row"><span class="kv-k">Faturado</span><span class="kv-v num" id="kvFat"></span></div>' +
        '<div class="kv-row"><span class="kv-k">Cortes</span><span class="kv-v num" id="kvCor"></span></div>' +
        '<div class="kv-row"><span class="kv-k">Saídas</span><span class="kv-v num">' + (sai ? '− ' : '') + U.brlCurto(sai) + '</span></div>';
      var kf = $('kvFat'), kc = $('kvCor');
      kf._v = st.kvFat; kc._v = st.kvCor;
      contar(kf, fat, U.brlCurto, anim ? 0 : null); contar(kc, cortes.length, String, anim ? 0 : null);
      st.kvFat = fat; st.kvCor = cortes.length;
      var itens = cortes.map(function (c) { return { t: 'cortes', x: c }; }).concat(saidas.map(function (s) { return { t: 'saidas', x: s }; }));
      if (!itens.length) { $('finLista').innerHTML = '<div class="grp' + (anim ? ' row-in' : '') + '"><div class="empty"><strong>Nada lançado</strong>Marque um atendimento na Agenda ou use Adicionar.</div></div>'; return; }
      var dias = {}, n = 0;
      itens.forEach(function (it) { (dias[it.x.data] = dias[it.x.data] || []).push(it); });
      function ri() { var c = anim ? ' row-in" style="--i:' + Math.min(n++, 12) : ''; return c + '"'; }
      $('finLista').innerHTML = Object.keys(dias).sort().reverse().map(function (d) {
        var l = dias[d].sort(function (a, b) { return (b.x.hora || '').localeCompare(a.x.hora || ''); });
        var tot = l.reduce(function (s, it) { return s + (it.t === 'cortes' ? 1 : -1) * Number(it.x.valor || 0); }, 0);
        return '<div class="grp"><div class="grp-h' + ri() + '><span class="eyebrow">' + (d === U.hoje() ? 'Hoje · ' : '') + diaCurto(d) + '</span>' +
          '<span class="num">' + (tot < 0 ? '− ' : '') + U.brlCurto(Math.abs(tot)) + '</span></div><ul class="list">' +
          l.map(function (it) {
            var s = it.t === 'saidas';
            return '<li class="row lanc' + (s ? ' is-saida' : '') + ri() + '><span class="lanc-h">' + esc(it.x.hora || '') + '</span>' +
              '<div class="row-main"><div class="row-title">' + esc(it.x.descricao) + '</div>' + (s ? '<div class="row-sub">Saída</div>' : '') + '</div>' +
              '<span class="row-end">' + (s ? '− ' : '') + esc(U.brlCurto(it.x.valor)) + '</span></li>';
          }).join('') + '</ul></div>';
      }).join('');
    }).catch(function (err) { falhaLeitura(err); });
  }
  $('periodos').addEventListener('click', function (e) {
    var b = e.target.closest('.chip'); if (!b) return;
    st.periodo = b.dataset.p;
    this.querySelectorAll('.chip').forEach(function (c) { var on = c === b; c.classList.toggle('is-on', on); c.setAttribute('aria-checked', on); });
    b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop');
    st.animar = true; renderFin();
  });

  /* sheet adicionar */
  function setModo(m) {
    st.modo = m;
    $('mSaida').classList.toggle('hidden', m !== 'saida');
    $('mCorte').classList.toggle('hidden', m !== 'corte');
    $('addSalvar').textContent = m === 'saida' ? 'Lançar saída' : 'Lançar atendimento';
    $('addMsg').classList.add('hidden');
  }
  ligarTabs($('seg'), 'm', setModo);
  function renderSvcChips() {
    $('cSvc').innerHTML = st.servicos.map(function (s) {
      return '<button class="chip' + (st.svcSel === s.id ? ' is-on' : '') + '" data-id="' + esc(s.id) + '" type="button">' + esc(s.nome) + '</button>';
    }).join('');
  }
  $('cSvc').addEventListener('click', function (e) {
    var b = e.target.closest('.chip'); if (!b) return;
    st.svcSel = b.dataset.id;
    var s = st.servicos.filter(function (x) { return x.id === st.svcSel; })[0];
    if (s) $('cVal').value = String(s.preco).replace('.', ',');
    renderSvcChips();
  });
  function abrirSheet() {
    $('addMsg').classList.add('hidden');
    DB.servicos().then(function (l) { st.servicos = l.filter(function (s) { return s.ativo !== false; }); renderSvcChips(); }).catch(falhaLeitura);
    $('scrim').classList.add('is-on'); $('sheet').classList.add('is-on');
    requestAnimationFrame(function () { moverInd($('seg')); });
  }
  function fecharSheet() { $('scrim').classList.remove('is-on'); $('sheet').classList.remove('is-on'); }
  $('abrirAdd').addEventListener('click', abrirSheet);
  $('scrim').addEventListener('click', fecharSheet);
  $('addCancelar').addEventListener('click', fecharSheet);
  $('addSalvar').addEventListener('click', function () {
    var msg = $('addMsg'), base = { data: U.hoje(), hora: agoraHHMM() }, p;
    function erro(t) { msg.textContent = t; msg.classList.remove('hidden'); }
    if (st.modo === 'saida') {
      var desc = $('sDesc').value.trim(), v = parseValor($('sVal').value);
      if (!desc) return erro('Escreva a descrição.');
      if (!(v > 0) || v > 100000) return erro('Valor inválido.');
      if ($('addSalvar').disabled) return;
      p = DB.addSaida(Object.assign(base, { descricao: desc, valor: v })).then(function () { toast('Saída de ' + U.brlCurto(v) + ' lançada'); });
    } else {
      var s = st.servicos.filter(function (x) { return x.id === st.svcSel; })[0], vc = parseValor($('cVal').value);
      if (!s) return erro('Escolha o serviço.');
      if (!(vc > 0) || vc > 100000) return erro('Valor inválido.');
      if ($('addSalvar').disabled) return;
      p = DB.addCorte(Object.assign(base, { descricao: s.nome + ' · avulso', valor: vc })).then(function () { toast('Atendimento de ' + U.brlCurto(vc) + ' lançado'); });
    }
    var bt = $('addSalvar'), txt = bt.textContent; bt.disabled = true; bt.textContent = 'Lançando…';
    p.then(function () { $('sDesc').value = ''; $('sVal').value = ''; $('cVal').value = ''; st.svcSel = null; fecharSheet(); },
      function (err) { erro(JC.msgErro(err)); })
      .then(function () { bt.disabled = false; bt.textContent = txt; });
  });

  /* ---------- AJUSTES ---------- */
  var DIAS_ORD = [1, 2, 3, 4, 5, 6, 0];
  function renderAjustes() {
    if (!st.autorizado) return;
    Promise.all([DB.servicos(), DB.config()]).then(function (r) {
      if (!st.autorizado) return;
      st.servicos = r[0]; st.cfg = r[1];
      renderSvcEd(st.servicos); renderHr(st.cfg); renderNotif();
    }).catch(falhaLeitura);
  }
  function svcLinha(s) {
    return '<div class="svc-ed" data-id="' + esc(s.id) + '">' +
      '<label class="lbl-nome"><span class="field-label">Serviço</span><input class="input" data-k="nome" value="' + esc(s.nome) + '" placeholder="Nome" maxlength="60"></label>' +
      '<label class="lbl-preco"><span class="field-label">R$</span><input class="input" data-k="preco" inputmode="decimal" maxlength="9" value="' + esc(String(s.preco).replace('.', ',')) + '"></label>' +
      '<label><span class="field-label">Min</span><input class="input" data-k="duracao" inputmode="numeric" maxlength="3" value="' + esc(s.duracao) + '"></label>' +
      '<button class="ibtn" data-rm type="button" aria-label="Remover ' + esc(s.nome) + '"><svg viewBox="0 0 18 18"><path d="M4.5 4.5l9 9M13.5 4.5l-9 9"/></svg></button></div>';
  }
  function renderSvcEd(l) { $('svcEd').innerHTML = l.map(svcLinha).join(''); }
  $('svcEd').addEventListener('click', function (e) { var b = e.target.closest('[data-rm]'); if (b) b.parentNode.remove(); });
  $('svcAdd').addEventListener('click', function () {
    $('svcEd').insertAdjacentHTML('beforeend', svcLinha({ id: 'svc-' + U.uid(), nome: '', preco: '', duracao: 30 }));
    $('svcEd').lastElementChild.querySelector('input').focus();
  });
  $('svcSalvar').addEventListener('click', function () {
    var out = [], ok = true;
    $('svcEd').querySelectorAll('.svc-ed').forEach(function (el, i) {
      var g = function (k) { return el.querySelector('[data-k="' + k + '"]').value; };
      var nome = g('nome').trim(), preco = parseValor(g('preco')), dur = parseInt(g('duracao'), 10);
      if (!nome || nome.length > 60 || !(preco >= 0) || preco > 100000 || !(dur >= 5) || dur > 240) { ok = false; el.querySelector('.input').closest('label').classList.add('is-error'); return; }
      out.push({ id: el.dataset.id, nome: nome, preco: preco, duracao: dur, ordem: i + 1, ativo: true });
    });
    if (!ok) return toast('Confira nome, preço e minutos (de 5 a 240).');
    if (!out.length) return toast('Deixe pelo menos um serviço.');
    var bt = $('svcSalvar'); if (bt.disabled) return; bt.disabled = true;
    DB.salvarServicos(out).then(function () { toast('Serviços salvos'); }, function (err) { toast(JC.msgErro(err)); })
      .then(function () { bt.disabled = false; });
  });

  function selHora(k, val, label) {
    var o = '';
    for (var m = 360; m <= 1425; m += 15) o += '<option value="' + U.hhmm(m) + '"' + (m === val ? ' selected' : '') + '>' + U.hhmm(m) + '</option>';
    if ((val - 360) % 15 || val < 360 || val > 1425) o = '<option value="' + U.hhmm(val) + '" selected>' + U.hhmm(val) + '</option>' + o;
    return '<select class="input" data-k="' + k + '" aria-label="' + label + '">' + o + '</select>';
  }
  function hrLinha(dow, faixa) {
    return '<div class="hr' + (faixa ? '' : ' is-off') + '" data-d="' + dow + '"><span class="hr-d">' + cap(U.DIAS3[dow]) + '</span>' +
      '<button class="tg" role="switch" aria-checked="' + !!faixa + '" aria-label="' + U.DIAS[dow] + ' aberto" type="button"></button>' +
      selHora('a', faixa ? faixa[0] : 540, 'Abre') + selHora('f', faixa ? faixa[1] : 1140, 'Fecha') + '</div>';
  }
  function renderHr(cfg) {
    $('hrEd').innerHTML = DIAS_ORD.map(function (d) { return hrLinha(d, cfg.horarios[d]); }).join('');
    var al = cfg.almoco;
    $('hrAlmoco').className = 'hr' + (al ? '' : ' is-off');
    $('hrAlmoco').innerHTML = '<span class="hr-d">Almoço</span><button class="tg" role="switch" aria-checked="' + !!al + '" aria-label="Pausa de almoço" type="button"></button>' +
      selHora('a', al ? al[0] : 720, 'Início do almoço') + selHora('f', al ? al[1] : 780, 'Fim do almoço');
  }
  document.querySelector('#v-aj').addEventListener('click', function (e) {
    var t = e.target.closest('.tg'); if (!t) return;
    var on = t.getAttribute('aria-checked') !== 'true';
    t.setAttribute('aria-checked', on); t.parentNode.classList.toggle('is-off', !on);
  });
  $('hrSalvar').addEventListener('click', function () {
    var cfg = JSON.parse(JSON.stringify(st.cfg)), ok = true;
    function faixa(el) {
      if (el.querySelector('.tg').getAttribute('aria-checked') !== 'true') return null;
      var a = U.toMin(el.querySelector('[data-k="a"]').value), f = U.toMin(el.querySelector('[data-k="f"]').value);
      if (!(f > a)) ok = false;
      return [a, f];
    }
    $('hrEd').querySelectorAll('.hr').forEach(function (el) { cfg.horarios[el.dataset.d] = faixa(el); });
    cfg.almoco = faixa($('hrAlmoco'));
    if (!ok) return toast('O fechamento precisa ser depois da abertura.');
    var bt = $('hrSalvar'); if (bt.disabled) return; bt.disabled = true;
    DB.salvarConfig(cfg).then(function () { st.cfg = cfg; toast('Horário salvo'); }, function (err) { toast(JC.msgErro(err)); })
      .then(function () { bt.disabled = false; });
  });

  $('restaurarDemo').addEventListener('click', function () {
    if (!DB.restaurarExemplo) return;
    DB.restaurarExemplo().then(function () { toast('Dados da demonstração restaurados'); renderTudo(true); });
  });

  /* ---------- notificações ---------- */
  function suporte() { return 'Notification' in window; }
  function renderNotif() {
    var p = suporte() ? Notification.permission : 'indisponivel';
    $('notifSt').textContent = p === 'granted' ? 'Ativadas. Você recebe um aviso a cada horário novo.'
      : p === 'denied' ? 'Bloqueadas no navegador. Libere nas configurações do site.'
      : p === 'indisponivel' ? 'Este navegador não mostra notificações. No iPhone, adicione o painel à Tela de Início primeiro.'
      : 'Receba um aviso no celular quando um cliente marcar.';
    $('notifBtn').classList.toggle('hidden', p === 'granted' || p === 'indisponivel');
  }
  $('notifBtn').addEventListener('click', function () {
    if (!suporte()) return renderNotif();
    prepararAudio();
    Promise.resolve(Notification.requestPermission()).then(function () {
      renderNotif(); if (Notification.permission === 'granted') toast('Notificações ativadas');
    });
  });
  $('testeBtn').addEventListener('click', function () {
    prepararAudio();
    avisar({ nome: 'Cliente Teste', servicoNome: (st.servicos[0] && st.servicos[0].nome) || 'Corte', data: U.addDias(U.hoje(), 1), inicio: 900 });
  });

  var actx = null;
  function prepararAudio() {
    try { if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === 'suspended') actx.resume(); } catch (e) { actx = null; }
  }
  function bip() {
    if (!actx || actx.state !== 'running') return;
    var t = actx.currentTime;
    [[880, 0], [1320, .16]].forEach(function (n) {
      var o = actx.createOscillator(), g = actx.createGain();
      o.type = 'sine'; o.frequency.value = n[0];
      g.gain.setValueAtTime(0, t + n[1]); g.gain.linearRampToValueAtTime(.18, t + n[1] + .015);
      g.gain.exponentialRampToValueAtTime(.0001, t + n[1] + .22);
      o.connect(g); g.connect(actx.destination); o.start(t + n[1]); o.stop(t + n[1] + .25);
    });
  }
  var avisoT;
  $('aviso').addEventListener('click', function () { this.classList.remove('is-on'); });
  function avisar(a) {
    var quando = U.DIAS3[U.parseISO(a.data).getDay()] + ' ' + U.hhmm(a.inicio);
    var corpo = a.nome + ' · ' + a.servicoNome + ' · ' + quando;
    $('avisoTxt').textContent = corpo;
    var av = $('aviso'); av.classList.remove('is-on'); void av.offsetWidth; av.classList.add('is-on');
    clearTimeout(avisoT); avisoT = setTimeout(function () { av.classList.remove('is-on'); }, 4200);
    bip();
    try { if (navigator.vibrate) navigator.vibrate([120, 60, 120]); } catch (e) {}
    if (suporte() && Notification.permission === 'granted') {
      var opts = { body: corpo, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: 'ag-' + (a.id || 'teste'), data: { url: 'painel.html' } };
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.ready.then(function (reg) { return reg.showNotification('Novo horário', opts); })
          .catch(function () { try { new Notification('Novo horário', opts); } catch (e) {} });
      } else { try { new Notification('Novo horário', opts); } catch (e) {} }
    }
  }

  // Na demo: compara a lista de agendamentos com os já vistos.
  // Produção: Cloud Function onCreate(agendamentos) envia push via FCM, mesmo com o app fechado.
  // Com o painel aberto: compara a lista com os já vistos (ids, sem dado pessoal, no aparelho).
  // App fechado: Cloud Function + FCM (ver README).
  function iniciarVistos() {
    try { st.vistos = JSON.parse(localStorage.getItem(K_VISTOS)); } catch (e) { st.vistos = null; }
    if (!Array.isArray(st.vistos)) {
      return DB.agendamentos().then(function (l) { st.vistos = l.map(function (a) { return a.id; }); salvarVistos(); }).catch(falhaLeitura);
    }
    return checarNovos();
  }
  function salvarVistos() { try { localStorage.setItem(K_VISTOS, JSON.stringify(st.vistos.slice(-500))); } catch (e) {} }
  function checarNovos() {
    if (!st.vistos || !st.autorizado) return Promise.resolve();
    return DB.agendamentos().then(function (l) {
      if (!st.autorizado || !st.vistos) return;
      var novos = l.filter(function (a) { return st.vistos.indexOf(a.id) < 0; });
      if (!novos.length) return;
      novos.forEach(function (a) { st.vistos.push(a.id); st.novos[a.id] = 1; st.flash[a.id] = 1; });
      salvarVistos();
      novos.filter(function (a) { return a.origem !== 'painel'; }).slice(-3).forEach(avisar);
    }).catch(falhaLeitura);
  }

  /* ---------- início ---------- */
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () {}); });
  }
  setInterval(function () {   // move a linha do "agora" e o "Próximo"
    if (st.autorizado && !document.hidden && st.view === 'agenda' && st.dia === U.hoje()) renderAgenda();
  }, 60000);
  window.addEventListener('resize', function () { document.querySelectorAll('.tabs').forEach(moverInd); });
  document.addEventListener('visibilitychange', function () { if (!document.hidden && st.autorizado) { checarNovos(); renderTudo(); } });

  DB.aoMudarAuth(function (info) {
    if (!info) {   // saiu (ou nunca entrou)
      if (st.autorizado) limparTela();
      mostrarLogin();
      return;
    }
    if (info.barbeiro === true) { liberar(); return; }
    if (st.autorizado) limparTela();
    mostrarLogin();
    if (info.barbeiro === false) {   // logado, mas não é o barbeiro: fora
      loginMsg('Acesso não autorizado. Esta conta não tem permissão para o painel.');
      DB.sair().catch(function () {});
    } else {   // não deu para conferir (sem internet)
      loginMsg('Sem internet para conferir seu acesso. Confira a conexão e recarregue a página.');
    }
  });
  DB.iniciar({ painel: true }).then(function () {
    DB.aoMudar(function () {
      if (!st.autorizado) return;
      checarNovos().then(function () { if (st.view !== 'aj') renderTudo(); });
    });
  }).catch(function (err) {
    if (err && err.code === 'sem-config') { JC.pendente(true); return; }
    console.warn('[painel] iniciar:', err && (err.code || err.message));
    mostrarLogin();
    loginMsg(JC.semRede(err) ? 'Sem internet. Confira a conexão e recarregue a página.' : 'Não foi possível abrir o painel agora. Recarregue a página.');
    $('entrar').disabled = true;
  });
})();
