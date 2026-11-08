/* =====================================================================
   Camada de dados do MODO DEMONSTRAÇÃO (loja.config.js -> demo: true)
   ---------------------------------------------------------------------
   Mesma API do db-firebase.js (window.DB), mas tudo fica no localStorage do próprio aparelho:
   serve para mostrar o sistema a uma barbearia sem criar projeto no Firebase.
   - Abas abertas no mesmo navegador se atualizam sozinhas (evento 'storage'), então dá para
     abrir a página do cliente e o painel lado a lado e ver o agendamento chegar ao vivo.
   - Login do painel na demo: demo@barbearia.app / demo1234.
   - Mesmas regras de horário (sem horário duplicado, almoço, folga, domingo fechado).
   - Começa com alguns agendamentos e lançamentos fictícios para a demo não ficar vazia.
   Nada disso vai para servidor nenhum. Em loja de verdade, deixe demo: false.
   ===================================================================== */
(function (root) {
  'use strict';
  if (!(root.JC && root.JC.loja && root.JC.loja.demo) || !root.DBBase) return;
  var base = root.DBBase.criarDB(function () { return Promise.reject(new Error('demo')); });
  var U = base.util, P = 'bt_demo_', EMAIL = 'demo@barbearia.app', SENHA = 'demo1234';
  function ler(k, def) { try { var v = JSON.parse(localStorage.getItem(P + k)); return v == null ? def : v; } catch (e) { return def; } }
  function gravar(k, v) { localStorage.setItem(P + k, JSON.stringify(v)); emitir(); }
  function erro(code, msg) { var e = new Error(msg); e.code = code; return e; }
  function ok(v) { return new Promise(function (r) { setTimeout(function () { r(v); }, 60); }); }   // simula a rede (assíncrono)
  var ouvintes = [], ouvintesAuth = [], emitT;
  function emitir() { clearTimeout(emitT); emitT = setTimeout(function () { ouvintes.forEach(function (f) { try { f(); } catch (e) {} }); }, 60); }
  root.addEventListener('storage', function (e) {
    if (!e.key || e.key.indexOf(P) !== 0) return;
    if (e.key === P + 'sessao') avisarAuth(); else emitir();
  });
  function ocupa(s) { return s !== 'faltou' && s !== 'cancelado'; }
  function cfgPadrao() { return JSON.parse(JSON.stringify(root.DBBase.CONFIG_PADRAO)); }

  // dados de exemplo (só na 1ª abertura): serviços/horário do loja.config.js + alguns clientes fictícios
  function semear() {
    if (ler('semeado', false)) return;
    var svcs = root.DBBase.SERVICOS_PADRAO.slice(), cfg = cfgPadrao(), h = U.hoje();
    localStorage.setItem(P + 'servicos', JSON.stringify(svcs));
    localStorage.setItem(P + 'config', JSON.stringify(cfg));
    var nomes = ['Rafael Lima', 'Bruno Costa', 'Diego Santos', 'Lucas Rocha', 'André Melo', 'Caio Nunes', 'Vitor Alves', 'Igor Pires'];
    var ags = [], cortes = [], saidas = [], n = 0;
    for (var dd = -6; dd <= 2; dd++) {
      var data = U.addDias(h, dd), dow = U.parseISO(data).getDay(), f = cfg.horarios[dow];
      if (!f) continue;
      [0, 2, 5, 8].forEach(function (k, i) {
        if ((dd + i) % 3 === 2) return;
        var s = svcs[(n + i) % svcs.length], ini = f[0] + k * 45;
        if (ini + s.duracao > f[1] || (cfg.almoco && ini < cfg.almoco[1] && cfg.almoco[0] < ini + s.duracao)) return;
        var agora = new Date().getHours() * 60 + new Date().getMinutes();
        var st = dd < 0 || (dd === 0 && ini + s.duracao <= agora) ? ((n + i) % 7 === 3 ? 'faltou' : 'atendido') : 'marcado';
        var id = 'demo' + (++n);
        ags.push({ id: id, nome: nomes[n % nomes.length], telefone: '7199999' + String(1000 + n), servicoId: s.id, servicoNome: s.nome,
          preco: s.preco, duracao: s.duracao, data: data, inicio: ini, fim: ini + s.duracao, status: st, criadoEm: Date.now(), origem: 'online' });
        if (st === 'atendido') cortes.push({ id: 'ag_' + id, agendamentoId: id, data: data, hora: U.hhmm(ini),
          descricao: s.nome + ' · ' + nomes[n % nomes.length].split(' ')[0], valor: s.preco, criadoEm: Date.now() });
      });
      if (dd === -4) saidas.push({ id: 'sd1', agendamentoId: null, data: data, hora: '18:10', descricao: 'Lâminas e produtos', valor: 48, criadoEm: Date.now() });
      if (dd === -1) saidas.push({ id: 'sd2', agendamentoId: null, data: data, hora: '19:00', descricao: 'Conta de luz', valor: 95, criadoEm: Date.now() });
    }
    localStorage.setItem(P + 'agendamentos', JSON.stringify(ags));
    localStorage.setItem(P + 'cortes', JSON.stringify(cortes));
    localStorage.setItem(P + 'saidas', JSON.stringify(saidas));
    localStorage.setItem(P + 'semeado', 'true');
  }
  function sessao() { return ler('sessao', null); }
  function avisarAuth() { var s = sessao(); ouvintesAuth.forEach(function (f) { try { f(s ? { uid: 'demo', email: EMAIL, barbeiro: true } : null); } catch (e) {} }); }
  function faixas(data, exceto) {
    return ler('agendamentos', []).filter(function (a) { return a.data === data && ocupa(a.status) && a.id !== exceto; })
      .map(function (a) { return [a.inicio, a.fim]; });
  }
  function livre(data, ini, fim, exceto) {
    return faixas(data, exceto).every(function (f) { return !(ini < f[1] && f[0] < fim); });
  }

  var DB = {
    util: U,
    iniciar: function (opts) {
      try { semear(); } catch (e) { return Promise.reject(erro('indisponivel', 'Armazenamento do navegador indisponível.')); }
      if (opts && opts.painel) setTimeout(avisarAuth, 0);
      return ok();
    },
    restaurarExemplo: function () {
      Object.keys(localStorage).filter(function (k) { return k.indexOf(P) === 0 && k !== P + 'sessao'; }).forEach(function (k) { localStorage.removeItem(k); });
      semear(); emitir(); return ok();
    },
    aoMudar: function (fn) { ouvintes.push(fn); return function () { ouvintes = ouvintes.filter(function (f) { return f !== fn; }); }; },
    entrar: function (email, senha) {
      if (String(email).trim().toLowerCase() !== EMAIL || senha !== SENHA) return Promise.reject(erro('auth/invalid-credential', 'login'));
      localStorage.setItem(P + 'sessao', '1'); setTimeout(avisarAuth, 0);
      return ok({ uid: 'demo', email: EMAIL, barbeiro: true });
    },
    redefinirSenha: function () { return ok(); },
    sair: function () { localStorage.removeItem(P + 'sessao'); setTimeout(avisarAuth, 0); return ok(); },
    usuario: function () { return ok(sessao() ? { uid: 'demo', email: EMAIL, barbeiro: true } : null); },
    aoMudarAuth: function (fn) { ouvintesAuth.push(fn); return function () { ouvintesAuth = ouvintesAuth.filter(function (f) { return f !== fn; }); }; },

    servicos: function () { return ok(ler('servicos', []).slice().sort(function (a, b) { return a.ordem - b.ordem; })); },
    salvarServicos: function (l) { gravar('servicos', l.map(function (s, i) { return { id: s.id, nome: s.nome, preco: Number(s.preco), duracao: parseInt(s.duracao, 10), ordem: i + 1, ativo: s.ativo !== false }; })); return ok(); },
    config: function () { var c = ler('config', null); var o = c || cfgPadrao(); o.existe = !!c; return ok(o); },
    salvarConfig: function (cfg) { var c = JSON.parse(JSON.stringify(cfg)); delete c.existe; gravar('config', c); return ok(); },
    primeiraConfiguracao: function () { return ok({ servicos: 0, config: false }); },
    ocupados: function (data) { return ok(faixas(data)); },
    agendamentos: function (data) {
      var desde = U.addDias(U.hoje(), -90);
      return ok(ler('agendamentos', []).filter(function (a) { return data ? a.data === data : a.data >= desde; })
        .map(function (a) { return Object.assign({}, a, { whatsapp: a.telefone }); })
        .sort(function (a, b) { return a.data === b.data ? a.inicio - b.inicio : (a.data < b.data ? -1 : 1); }));
    },
    criarAgendamento: function (x) {
      var ini = Number(x.inicio), dur = Number(x.duracao), fim = ini + dur, cfg = ler('config', cfgPadrao());
      var s = ler('servicos', []).filter(function (y) { return y.id === x.servicoId; })[0];
      var f = cfg.horarios[U.parseISO(x.data).getDay()];
      if (!s || s.preco !== x.preco || s.duracao !== dur || !f || ini < f[0] || fim > f[1] || (cfg.folgas || []).indexOf(x.data) >= 0 ||
        (cfg.almoco && ini < cfg.almoco[1] && cfg.almoco[0] < fim)) return Promise.reject(erro('invalido', 'inválido'));
      if (!livre(x.data, ini, fim)) return new Promise(function (r, j) { setTimeout(function () { j(erro('ocupado', 'ocupado')); }, 60); });
      var a = { id: U.uid(), nome: String(x.nome).trim().replace(/\s+/g, ' '), telefone: U.soDigitos(x.telefone || x.whatsapp),
        servicoId: x.servicoId, servicoNome: x.servicoNome, preco: x.preco, duracao: dur, data: x.data, inicio: ini, fim: fim,
        status: 'marcado', criadoEm: Date.now(), origem: x.origem === 'painel' ? 'painel' : 'online' };
      var l = ler('agendamentos', []); l.push(a); gravar('agendamentos', l);
      return ok(Object.assign({}, a, { whatsapp: a.telefone }));
    },
    atualizarAgendamento: function (id, patch) {
      var l = ler('agendamentos', []), i = l.map(function (a) { return a.id; }).indexOf(id);
      if (i < 0) return Promise.reject(erro('nao-encontrado', 'não existe'));
      var n = Object.assign({}, l[i], patch); n.fim = Number(n.inicio) + Number(n.duracao);
      if (ocupa(n.status) && !ocupa(l[i].status) && !livre(n.data, n.inicio, n.fim, id)) return Promise.reject(erro('ocupado', 'ocupado'));
      l[i] = n; gravar('agendamentos', l); return ok(Object.assign({}, n, { whatsapp: n.telefone }));
    },
    marcarAtendido: function (id) {
      return DB.atualizarAgendamento(id, { status: 'atendido' }).then(function (a) {
        var c = ler('cortes', []).filter(function (x) { return x.id !== 'ag_' + id; });
        c.push({ id: 'ag_' + id, agendamentoId: id, data: a.data, hora: U.hhmm(a.inicio), descricao: (a.servicoNome + ' · ' + String(a.nome).split(' ')[0]).slice(0, 120), valor: Number(a.preco) || 0, criadoEm: Date.now() });
        gravar('cortes', c); return a;
      });
    },
    desfazerStatus: function (id) {
      return DB.atualizarAgendamento(id, { status: 'marcado' }).then(function () { gravar('cortes', ler('cortes', []).filter(function (x) { return x.id !== 'ag_' + id; })); });
    },
    removerAgendamento: function (id) { gravar('agendamentos', ler('agendamentos', []).filter(function (a) { return a.id !== id; })); return ok(); },
    cortes: function (de, ate) { return ok(ler('cortes', []).filter(function (c) { return c.data >= de && c.data <= ate; })); },
    saidas: function (de, ate) { return ok(ler('saidas', []).filter(function (c) { return c.data >= de && c.data <= ate; })); },
    addCorte: function (x) { return add('cortes', x); },
    addSaida: function (x) { return add('saidas', x); },
    removerLancamento: function (t, id) { gravar(t, ler(t, []).filter(function (x) { return x.id !== id; })); return ok(); }
  };
  function add(t, x) {
    var n = { id: U.uid(), agendamentoId: x.agendamentoId || null, data: x.data, hora: x.hora || '00:00', descricao: String(x.descricao || '').slice(0, 120), valor: Number(x.valor) || 0, criadoEm: Date.now() };
    var l = ler(t, []); l.push(n); gravar(t, l); return ok(n);
  }
  DB.demo = { email: EMAIL, senha: SENHA };
  root.DB = DB;
})(window);
