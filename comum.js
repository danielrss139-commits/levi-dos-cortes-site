/* =====================================================================
   Utilidades comuns (agendar.html/index.html e painel.html)
   Ordem no <head>: loja.config.js, boot.js (síncronos) e, com defer: firebase-config.js, comum.js,
   db-firebase.js (ou db-demo.js), e a página.
   - JC.loja: loja.config.js normalizado (serviços com id, horário em minutos, textos seguros).
   - JC.marca(): logo ou monograma (SVG) da loja. JC.icone(): ícone de serviço.
   - Emulador local (só testes): ?emulador=1 funciona APENAS em localhost/127.0.0.1.
   - JC.configOk() / JC.pendente(): tela "Configuração pendente" quando firebase-config.js está vazio.
   - JC.esc(): escapa texto para HTML. JC.msgErro(): erro -> frase em pt-BR.
   - JC.abertura(): abertura animada (monograma/logo, nome, brilho) 1x por sessão.
   ===================================================================== */
(function (w) {
  'use strict';
  var d = document, html = d.documentElement;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }
  function txt(v, max) { return String(v == null ? '' : v).trim().slice(0, max || 200); }
  // caminho de arquivo do próprio site (sem http, sem ../, sem javascript:)
  function caminhoOk(p) { return typeof p === 'string' && /^[\w\-./]+\.(webp|jpe?g|png|avif|svg)$/i.test(p) && p.indexOf('..') < 0 && p.charAt(0) !== '/'; }
  function slug(s) {
    return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
      .replace(/\+/g, ' ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'servico';
  }
  function hm(s) {   // '09:15' -> 555 (arredonda para cima em blocos de 15 min, exigência das regras)
    var p = /^(\d{1,2}):(\d{2})$/.exec(String(s || '').trim()); if (!p) return null;
    var m = (+p[1]) * 60 + (+p[2]); if (m < 0 || m > 1440) return null;
    return Math.ceil(m / 15) * 15;
  }

  /* ---------- loja.config.js normalizado ---------- */
  var L0 = w.LOJA || {};
  function normalizar(L) {
    var nome = txt(L.nomeLoja, 60) || 'Sua Barbearia';
    var zap = String(L.whatsapp || '').replace(/\D/g, '');
    if (zap && zap.length <= 11) zap = '55' + zap;
    var insta = txt(L.instagram, 40).replace(/^@/, '').replace(/[^\w.]/g, '');
    var ids = {};
    var servicos = (Array.isArray(L.servicos) ? L.servicos : []).map(function (s, i) {
      var id = /^[A-Za-z0-9_-]{1,60}$/.test(s.id || '') ? s.id : slug(s.nome);
      while (ids[id]) id = id + '-' + (i + 1);
      ids[id] = 1;
      var min = parseInt(s.minutos != null ? s.minutos : s.duracao, 10);
      return { id: id, nome: txt(s.nome, 60) || 'Serviço', preco: Math.max(0, Math.min(100000, Number(s.preco) || 0)),
        duracao: Math.max(5, Math.min(240, isFinite(min) ? min : 30)), ordem: i + 1, ativo: true,
        icone: txt(s.icone, 20), descricao: txt(s.descricao, 90), foto: caminhoOk(s.foto) ? s.foto : '' };
    }).filter(function (s) { return s.nome; });
    var CH = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'], horarios = {};
    var H = L.horario || {};
    CH.forEach(function (k, i) {
      var f = H[k], a = f && hm(f[0]), b = f && hm(f[1]);
      horarios[i] = (a != null && b != null && b > a) ? [a, b] : null;
    });
    var al = L.almoco && hm(L.almoco[0]), af = L.almoco && hm(L.almoco[1]);
    var passo = parseInt(L.intervaloMinutos, 10);
    if (!(passo >= 15 && passo <= 240 && passo % 15 === 0)) passo = 15;   // regras: horários em blocos de 15 min
    var ant = parseInt(L.diasAntecedencia, 10); if (!(ant >= 1 && ant <= 60)) ant = 60;
    var av = L.avaliacao || {};
    var galeria = (Array.isArray(L.galeria) ? L.galeria : []).filter(function (g) { return g && caminhoOk(g.foto); })
      .map(function (g) { return { foto: g.foto, legenda: txt(g.legenda, 40) }; });
    var mono = txt(L.monograma, 2).toUpperCase();
    if (!mono) {
      var conect = { de: 1, da: 1, do: 1, dos: 1, das: 1, e: 1, o: 1, a: 1, the: 1, '&': 1 };
      mono = nome.split(/\s+/).filter(function (p) { return p && !conect[p.toLowerCase()]; })
        .slice(0, 2).map(function (p) { return p.charAt(0); }).join('').toUpperCase() || nome.charAt(0).toUpperCase();
    }
    var mapa = /^https:\/\//.test(L.mapa || '') ? L.mapa : (L.endereco ? 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(nome + ' ' + L.endereco) : '');
    return {
      nome: nome, nomeCurto: txt(L.nomeCurto, 20) || nome, slogan: txt(L.slogan, 90),
      logo: caminhoOk(L.logo) ? L.logo : '', monograma: mono,
      cor: /^#[0-9a-f]{6}$/i.test(L.corDestaque || '') ? L.corDestaque : '#d9b77e',
      whatsapp: zap.length >= 12 && zap.length <= 13 ? zap : '', ddd: zap.length >= 12 ? zap.slice(2, 4) : '',
      instagram: insta, email: /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/.test(L.email || '') ? L.email : '',
      endereco: txt(L.endereco, 120), bairroCidade: txt(L.bairroCidade, 60), mapa: mapa,
      avaliacao: av.nota ? { nota: txt(av.nota, 5), total: txt(av.total, 8), fonte: txt(av.fonte, 20) || 'Google' } : null,
      servicos: servicos, config: { horarios: horarios, almoco: (al != null && af != null && af > al) ? [al, af] : null, folgas: [], intervalo: passo },
      diasAntecedencia: ant, galeria: galeria, demo: L.demo === true
    };
  }
  var loja = normalizar(L0);

  /* ---------- emulador (só em localhost) ---------- */
  var local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(w.location.hostname);
  var pediu = /(^|[?&])emulador=1(&|$)/.test(w.location.search.slice(1));
  try { if (local && pediu) sessionStorage.setItem('jc_emulador', '1'); } catch (e) {}
  var usarEmu = false;
  try { usarEmu = local && (pediu || sessionStorage.getItem('jc_emulador') === '1' || !!w.FIREBASE_EMULADOR); } catch (e) { usarEmu = local && pediu; }
  if (usarEmu) {
    w.FIREBASE_EMULADOR = w.FIREBASE_EMULADOR || { host: '127.0.0.1', firestore: 8080, auth: 9099 };
    // sempre o projeto de teste 'demo-barbearia' no emulador: nunca usa (nem grava) um projeto real
    w.FIREBASE_CONFIG = { apiKey: 'demo-api-key', authDomain: 'demo-barbearia.firebaseapp.com', projectId: 'demo-barbearia', appId: '1:000000000000:web:demo' };
  } else {
    w.FIREBASE_EMULADOR = null;   // produção: nunca liga no emulador
  }

  function configOk() {
    if (loja.demo) return true;   // demonstração: dados no próprio aparelho, sem Firebase
    var c = w.FIREBASE_CONFIG || {};
    return !!(c.apiKey && c.projectId && c.appId);
  }

  function semRede(e) {
    var c = (e && e.code) || '';
    return (typeof navigator !== 'undefined' && navigator.onLine === false) ||
      c === 'unavailable' || c === 'deadline-exceeded' || c === 'auth/network-request-failed' || c === 'rede' ||
      /Failed to fetch|NetworkError|dynamically imported module|offline/i.test((e && e.message) || '');
  }
  function msgErro(e) {
    var c = (e && e.code) || '';
    if (semRede(e)) return 'Sem conexão com a internet. Confira e tente de novo.';
    if (c === 'ocupado') return 'Esse horário já foi ocupado por outro cliente.';
    if (c === 'permission-denied') return 'Sem permissão para isso. Saia e entre de novo no painel.';
    if (c === 'nao-encontrado') return 'Esse registro não existe mais.';
    if (c === 'invalido') return 'Algum dado não foi aceito. Confira e tente de novo.';
    return 'Não foi possível concluir agora. Tente de novo.';
  }

  /* ---------- marca: logo da loja ou monograma tipográfico ---------- */
  function monograma(cls) {
    var m = esc(loja.monograma), dois = loja.monograma.length > 1;
    return '<svg class="mono ' + (cls || '') + '" viewBox="0 0 120 120" role="img" aria-label="' + esc(loja.nome) + '">' +
      '<circle class="mono-anel" cx="60" cy="60" r="56" pathLength="1" transform="rotate(-90 60 60)"/>' +
      '<circle class="mono-anel2" cx="60" cy="60" r="49"/>' +
      '<text class="mono-t" x="60" y="61" text-anchor="middle" dominant-baseline="central"' + (dois ? ' letter-spacing="2"' : '') + '>' + m + '</text>' +
      '<circle class="mono-ponto" cx="60" cy="4" r="2.6"/></svg>';
  }
  function marca(cls) {
    if (loja.logo) return '<img class="logo ' + (cls || '') + '" src="' + esc(loja.logo) + '" alt="' + esc(loja.nome) + '" decoding="async">';
    return monograma(cls);
  }

  /* ---------- ícones de serviço (traço fino, sem rostos) ---------- */
  var IC = {
    tesoura: '<circle cx="7" cy="17" r="3"/><circle cx="17" cy="17" r="3"/><path d="M9.2 14.8L18 3.5M14.8 14.8L6 3.5"/>',
    navalha: '<path d="M3.5 15.5L14 5a2.1 2.1 0 0 1 3 3L6.5 18.5z"/><path d="M14 15.5l5.5 5M6.5 18.5l-2 2"/>',
    barba: '<path d="M5 6v3.5a7 7 0 0 0 14 0V6"/><path d="M9 13.5c1.8 1 4.2 1 6 0M8.5 18.5c2.2 1.6 4.8 1.6 7 0"/>',
    pente: '<path d="M3.5 9.5h17v3h-17z"/><path d="M5.5 12.5v5M8.5 12.5v5M11.5 12.5v5M14.5 12.5v5M17.5 12.5v5"/>',
    maquina: '<rect x="7.5" y="7" width="9" height="14" rx="3"/><path d="M7 4h10M8.5 4v3M12 4v3M15.5 4v3M12 12.5v3"/>',
    sobrancelha: '<path d="M3.5 13c3-4.2 9.5-5.6 17-2.6"/><path d="M6 16.5c2.6-1.6 6.6-2.2 11-1"/>',
    combo: '<circle cx="6.5" cy="17" r="2.6"/><circle cx="13.5" cy="17" r="2.6"/><path d="M8.4 15l7-10M11.6 15l-7-10M16.5 9.5h5M19 7v5"/>',
    infantil: '<circle cx="12" cy="12" r="8.5"/><path d="M8.8 14c1.8 1.7 4.6 1.7 6.4 0M9 9.8h.01M15 9.8h.01"/>',
    estrela: '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>'
  };
  function iconeDe(s) {
    var c = (loja.servicos.filter(function (x) { return x.id === s.id; })[0] || {}).icone;
    if (IC[c]) return c;
    var n = String(s.nome || '').toLowerCase();
    if (/\+|combo/.test(n)) return 'combo';
    if (/barba/.test(n)) return 'barba';
    if (/sobrancelha/.test(n)) return 'sobrancelha';
    if (/pezinho|m[aá]quina|acabamento/.test(n)) return 'maquina';
    if (/infantil|crian/.test(n)) return 'infantil';
    if (/navalha/.test(n)) return 'navalha';
    if (/corte|cabelo|degrad/.test(n)) return 'tesoura';
    return 'estrela';
  }
  function icone(s, cls) {
    return '<svg class="ico ' + (cls || '') + '" viewBox="0 0 24 24" aria-hidden="true">' + IC[iconeDe(s)] + '</svg>';
  }
  function extraServico(s) {   // descrição e foto do loja.config.js (pelo id ou nome)
    var c = loja.servicos.filter(function (x) { return x.id === s.id; })[0] ||
      loja.servicos.filter(function (x) { return x.nome.toLowerCase() === String(s.nome || '').toLowerCase(); })[0] || {};
    return { descricao: c.descricao || '', foto: c.foto || '' };
  }

  /* ---------- cabeçalho da página (título, descrição, cor) ---------- */
  function aplicarHead(pagina) {
    d.title = (pagina ? pagina + ' · ' : '') + loja.nome;
    var md = d.querySelector('meta[name="description"]');
    if (md) md.setAttribute('content', 'Agende seu horário na ' + loja.nome + (loja.bairroCidade ? ', ' + loja.bairroCidade : '') + '.');
    var at = d.querySelector('meta[name="apple-mobile-web-app-title"]');
    if (at) at.setAttribute('content', loja.nomeCurto);
  }
  // preenche elementos marcados com data-loja="nome|endereco|..." (sempre textContent)
  function preencher(raiz) {
    (raiz || d).querySelectorAll('[data-loja]').forEach(function (el) {
      var k = el.getAttribute('data-loja'), v = loja[k];
      if (typeof v === 'string') { el.textContent = v; el.classList.toggle('hidden', !v); }
    });
    (raiz || d).querySelectorAll('[data-marca]').forEach(function (el) { el.innerHTML = marca(el.getAttribute('data-marca')); });
  }

  // Tela limpa quando firebase-config.js ainda está vazio (ou o SDK não carrega por configuração)
  function pendente(painel) {
    var main = d.createElement('main');
    main.className = 'wrap pendente';
    main.setAttribute('role', 'alert');
    var mk = d.createElement('div'); mk.className = 'pendente-marca'; mk.innerHTML = marca('marca-lg');
    var card = d.createElement('div'); card.className = 'gl pendente-card';
    var h = d.createElement('h1'); h.textContent = 'Configuração pendente';
    var p = d.createElement('p'); p.className = 'muted';
    p.textContent = painel
      ? 'O painel ainda não foi ligado ao banco de dados. Falta preencher o arquivo firebase-config.js com a configuração do Firebase (veja o README).'
      : 'O agendamento online está sendo configurado. Enquanto isso, fale com a barbearia pelo WhatsApp.';
    card.appendChild(h); card.appendChild(p);
    if (!painel && loja.whatsapp) {
      var a = d.createElement('a');
      a.className = 'btn btn-primary btn-block'; a.href = 'https://wa.me/' + loja.whatsapp;
      a.target = '_blank'; a.rel = 'noopener noreferrer'; a.textContent = 'Chamar no WhatsApp';
      card.appendChild(a);
    }
    main.appendChild(mk); main.appendChild(card);
    function trocar() {
      Array.prototype.forEach.call(d.body.children, function (el) {
        if (el.tagName !== 'SCRIPT') el.classList.add('hidden');
      });
      html.classList.remove('intro');
      var i = d.getElementById('intro'); if (i) i.remove();
      d.body.insertBefore(main, d.body.firstChild);
    }
    if (d.body) trocar(); else d.addEventListener('DOMContentLoaded', trocar);
  }

  /* ---------- abertura animada (html.intro decidido em boot.js) ----------
     Tela cheia escura: o anel do monograma se desenha e as iniciais (ou o logo) surgem, o nome da loja abre
     com o espaçamento entre letras diminuindo, um brilho suave atravessa e a tela se dissolve na página.
     ~1,4 s · toque/tecla/rolagem pula · 1x por sessão em cada página · nunca com "reduzir movimento".
     Só transform/opacity/stroke/letter-spacing (num texto curto). window.__jcIntro fica para os testes. */
  function abertura(aoSoltar) {
    var el = d.getElementById('intro');
    if (!html.classList.contains('intro') || !el) { if (el) el.remove(); html.classList.remove('intro'); if (aoSoltar) aoSoltar(); return; }
    try { sessionStorage.setItem((w.JC_BOOT && w.JC_BOOT.chaveIntro) || 'bt_intro_', '1'); } catch (e) {}
    el.classList.add('on');
    el.innerHTML = '<span class="intro-luz" aria-hidden="true"></span>' +
      '<div class="intro-c"><div class="intro-marca">' + marca('marca-intro') + '</div>' +
      '<div class="intro-nome"></div><div class="intro-sub"></div></div>';
    el.querySelector('.intro-nome').textContent = loja.nome;
    if (loja.nome.length > 18) el.querySelector('.intro-nome').style.fontSize = (loja.nome.length > 26 ? 12 : 14) + 'px';
    el.querySelector('.intro-sub').textContent = el.getAttribute('data-sub') || '';
    if (!el.animate) { el.remove(); html.classList.remove('intro'); if (aoSoltar) aoSoltar(); return; }
    var T = 1400, E = 'cubic-bezier(.2,.8,.2,1)', anims = [];
    var mk = el.querySelector('.intro-marca'), anel = el.querySelector('.mono-anel'), mt = el.querySelector('.mono-t'),
      pt = el.querySelector('.mono-ponto'), a2 = el.querySelector('.mono-anel2'), nome = el.querySelector('.intro-nome'),
      sub = el.querySelector('.intro-sub'), luz = el.querySelector('.intro-luz');
    function A(alvo, k, o) { if (!alvo) return; var a = alvo.animate(k, Object.assign({ duration: T, fill: 'both' }, o)); anims.push(a); return a; }
    // marca: aproxima e acende (0–600 ms)
    A(mk, [{ opacity: 0, transform: 'scale(.86)', easing: E }, { opacity: 1, transform: 'scale(1)', offset: .43 }, { opacity: 1, transform: 'scale(1)' }]);
    if (anel) A(anel, [{ strokeDashoffset: 1, easing: 'cubic-bezier(.6,0,.25,1)' }, { strokeDashoffset: 0, offset: .5 }, { strokeDashoffset: 0 }]);
    if (a2) A(a2, [{ opacity: 0 }, { opacity: 0, offset: .3 }, { opacity: 1, offset: .55 }, { opacity: 1 }]);
    if (mt) A(mt, [{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 0, transform: 'translateY(6px)', offset: .2, easing: E }, { opacity: 1, transform: 'none', offset: .5 }, { opacity: 1, transform: 'none' }]);
    if (pt) A(pt, [{ opacity: 0 }, { opacity: 0, offset: .45 }, { opacity: 1, offset: .55 }, { opacity: 1 }]);
    // nome: espaçamento entre letras fecha (300–900 ms)
    A(nome, [{ opacity: 0, letterSpacing: '.9em', easing: E }, { opacity: 0, letterSpacing: '.9em', offset: .2, easing: E },
      { opacity: 1, letterSpacing: '.3em', offset: .64 }, { opacity: 1, letterSpacing: '.3em' }]);
    A(sub, [{ opacity: 0 }, { opacity: 0, offset: .5 }, { opacity: 1, offset: .72 }, { opacity: 1 }]);
    // brilho suave atravessando (650–1100 ms)
    A(luz, [{ transform: 'translateX(-190%) skewX(-16deg)' }, { transform: 'translateX(-190%) skewX(-16deg)', offset: .46, easing: 'cubic-bezier(.4,0,.2,1)' },
      { transform: 'translateX(360%) skewX(-16deg)', offset: .8 }, { transform: 'translateX(360%) skewX(-16deg)' }]);
    // a tela se dissolve na página (1080–1400 ms)
    A(el, [{ opacity: 1, transform: 'none' }, { opacity: 1, transform: 'none', offset: .77, easing: 'ease' }, { opacity: 0, transform: 'scale(1.03)' }]);
    var soltou = false;
    function soltar() { if (soltou) return; soltou = true; html.classList.remove('intro'); if (aoSoltar) aoSoltar(); }
    var tSolta = setTimeout(soltar, 1080);   // a página começa a entrar por baixo enquanto a abertura some
    var acabou = false;
    function fim() {
      if (acabou) return; acabou = true; clearTimeout(tSolta); soltar();
      anims.forEach(function (a) { try { a.cancel(); } catch (e) {} });
      el.remove();
      ['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach(function (ev) { w.removeEventListener(ev, pular, true); });
    }
    function pular() { anims.forEach(function (a) { try { a.finish(); } catch (e) {} }); fim(); }
    anims[anims.length - 1].onfinish = fim;
    ['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach(function (ev) { w.addEventListener(ev, pular, { capture: true, passive: true }); });
    w.__jcIntro = { pular: pular, anims: anims, total: T };
  }

  /* ---------- números que contam (count-up) ---------- */
  function contar(el, alvo, fmt, de) {
    if (!el) return;
    if (el._raf) cancelAnimationFrame(el._raf);
    var ini = de != null ? de : (el._v != null ? el._v : 0);
    el._v = alvo;
    var calmo = !!(w.matchMedia && w.matchMedia('(prefers-reduced-motion: reduce)').matches);
    if (calmo || ini === alvo) { el.textContent = fmt(alvo); return; }
    var t0 = performance.now(), dur = 850;
    function passo(t) {
      var k = Math.min(1, (t - t0) / dur); k = 1 - Math.pow(1 - k, 3);
      el.textContent = fmt(k < 1 ? Math.round(ini + (alvo - ini) * k) : alvo);
      if (k < 1) el._raf = requestAnimationFrame(passo); else el._raf = 0;
    }
    el._raf = requestAnimationFrame(passo);
  }

  /* ---------- anel (gauge) em SVG: p de 0 a 100 ---------- */
  function anel(p, centro, rotulo, cls) {
    p = Math.max(0, Math.min(100, Math.round(Number(p) || 0)));
    return '<div class="rgx ' + (cls || '') + '" style="--p:' + p + '" role="img" aria-label="' + esc(rotulo + ': ' + p + '%') + '">' +
      '<svg viewBox="0 0 120 120" aria-hidden="true"><circle class="tk" cx="60" cy="60" r="56" pathLength="100"/>' +
      '<circle class="tr" cx="60" cy="60" r="47"/><circle class="vl" cx="60" cy="60" r="47" pathLength="100"/></svg>' +
      '<div class="rgc"><b class="num">' + centro + '</b><span>' + esc(rotulo) + '</span></div></div>';
  }

  /* ---------- profundidade 3D nas opções tocáveis ----------
     Só ao TOCAR/CLICAR: inclina de leve na direção do dedo e "afunda" (.is-press). Sem ouvintes contínuos.
     Desligado com prefers-reduced-motion e no modo leve (html.lite). Um único ouvinte delegado. */
  var SEL3D = '.opt, .t3d, .ag, .ibtn, .chip, .bc, .tg';
  var MAX = 5;
  var reduz = !!(w.matchMedia && w.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var lite = html.classList.contains('lite');
  function alvo3d(t) {
    var el = t && t.closest ? t.closest(SEL3D) : null;
    if (!el || el.disabled) return null;
    var ctl = t.closest('button, a, input, select, textarea, label');
    if (ctl && ctl !== el && el.contains(ctl)) return null;
    return el;
  }
  var preso = null;
  function soltarP() {
    if (!preso) return; var el = preso; preso = null;
    el.classList.remove('is-press');
    el.style.removeProperty('--rx'); el.style.removeProperty('--ry');
  }
  d.addEventListener('pointerdown', function (e) {
    var el = alvo3d(e.target); if (!el) return;
    soltarP(); preso = el;
    if (!reduz && !lite) {
      var r = el.getBoundingClientRect();
      if (r.width && r.height) {
        var px = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width) * 2 - 1));
        var py = Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height) * 2 - 1));
        var k = r.width > 220 ? .45 : 1;
        el.style.setProperty('--ry', (px * MAX * k).toFixed(2) + 'deg');
        el.style.setProperty('--rx', (-py * MAX * k).toFixed(2) + 'deg');
      }
    }
    el.classList.add('is-press');
  }, { passive: true });
  d.addEventListener('pointerup', soltarP, { passive: true });
  d.addEventListener('pointercancel', soltarP, { passive: true });

  w.JC = { loja: loja, configOk: configOk, esc: esc, msgErro: msgErro, semRede: semRede, pendente: pendente, emulador: usarEmu,
    reduz: reduz, lite: lite, marca: marca, monograma: monograma, icone: icone, extraServico: extraServico,
    aplicarHead: aplicarHead, preencher: preencher, abertura: abertura, contar: contar, anel: anel, slug: slug };
})(window);
