/* =====================================================================
   Camada de dados de PRODUÇÃO (Firebase) — modelo de barbearia
   ---------------------------------------------------------------------
   Substitui db.js mantendo a MESMA API (window.DB, funções com Promise).
   Uso nas páginas (script clássico, nada de bundler):

     <script src="loja.config.js"></script> ... <script src="firebase-config.js" defer></script>
     <script src="comum.js" defer></script> <script src="db-firebase.js" defer></script>
     ... DB.iniciar() / DB.iniciar({ painel: true }) no painel ...

   O SDK modular do Firebase (v10) é carregado sob demanda do CDN gstatic
   com import() dinâmico. Coleções:

     servicos/{id}       { nome, preco, duracao, ordem, ativo }          público lê
     config/loja         { horarios:{'0'..'6':[abre,fecha]|null},
                           almoco:[ini,fim]|null, folgas:[], intervalo } público lê
     agendamentos/{id}   { nome, telefone, servicoId, servicoNome, preco,
                           duracao, data:'AAAA-MM-DD', inicio, fim,
                           status, criadoEm }                            PRIVADO
     slots/{data_min}    { agId, data, minuto, criadoEm }  1 doc por bloco de 15 min,
                                                           público lê, SEM dado pessoal
     cortes/{id}, saidas/{id}                                            só barbeiro
     admins/{uid}        (criado no Console) quem é barbeiro

   Agendar = UM batch que cria o agendamento + todos os slots de 15 min
   que ele cobre. As regras só deixam CRIAR slot que não existe, então o
   segundo cliente no mesmo horário recebe erro com code 'ocupado'.

   Diferenças de campo para a demo (db.js):
     - 'whatsapp' virou 'telefone' no banco. criarAgendamento aceita os dois
       e os objetos lidos trazem os dois (whatsapp = telefone).
     - agendamento público não grava 'origem'; na leitura vem origem:'online'
       quando ausente (o painel pode gravar origem:'painel').
     - criadoEm é Timestamp do servidor; na leitura vira milissegundos.
   ===================================================================== */
(function (root) {
  'use strict';

  var SDK_VERSAO = '10.14.1';
  var CDN = 'https://www.gstatic.com/firebasejs/' + SDK_VERSAO + '/';
  var BLOCO = 15;                // minutos por doc em /slots
  var JANELA_PASSADO = 90;       // painel: agendamentos/cortes carregados a partir de hoje-90 dias

  /* ---------- utilidades de data/hora (iguais às do db.js) ---------- */
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function iso(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function hoje() { return iso(new Date()); }
  function parseISO(s) { var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function addDias(s, n) { var d = parseISO(s); d.setDate(d.getDate() + n); return iso(d); }
  function hhmm(min) { return pad(Math.floor(min / 60)) + ':' + pad(min % 60); }
  function horaCurta(min) { var h = Math.floor(min / 60), m = min % 60; return h + 'h' + (m ? pad(m) : ''); }
  function toMin(s) { var p = String(s).split(':'); return (+p[0]) * 60 + (+p[1] || 0); }
  var DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
  var DIAS3 = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
  var MESES3 = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  function brl(v) { return 'R$ ' + Number(v || 0).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
  function brlCurto(v) { var n = Number(v || 0); return n % 1 ? brl(n) : 'R$ ' + String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function soDigitos(s) { return String(s || '').replace(/\D/g, ''); }

  /* ---------- regras de agenda ---------- */
  function sobrepoe(a1, a2, b1, b2) { return a1 < b2 && b1 < a2; }
  function ocupaHorario(status) { return status !== 'faltou' && status !== 'cancelado'; }
  // blocos de 15 min cobertos por [inicio, fim): 09:00–09:40 -> [540, 555, 570]
  function blocos(inicio, fim) {
    var out = [];
    for (var m = Math.floor(inicio / BLOCO) * BLOCO; m < fim; m += BLOCO) out.push(m);
    return out;
  }
  function slotId(data, minuto) { return data + '_' + minuto; }

  function horariosLivres(data, duracao, cfg, faixas, agoraMin) {
    if (!cfg) return [];
    var dow = parseISO(data).getDay();
    var exp = cfg.horarios[dow];
    if (!exp || (cfg.folgas || []).indexOf(data) >= 0) return [];
    var passo = cfg.intervalo || 30, out = [];
    for (var t = exp[0]; t + duracao <= exp[1]; t += passo) {
      var fim = t + duracao;
      if (cfg.almoco && sobrepoe(t, fim, cfg.almoco[0], cfg.almoco[1])) continue;
      if (agoraMin != null && t <= agoraMin) continue;
      var livre = faixas.every(function (f) { return !sobrepoe(t, fim, f[0], f[1]); });
      if (livre) out.push(t);
    }
    return out;
  }
  function diaFechado(data, cfg) {
    if (!cfg) return true;
    return !cfg.horarios[parseISO(data).getDay()] || (cfg.folgas || []).indexOf(data) >= 0;
  }

  // valores iniciais gravados pela 1ª configuração automática do painel (só onde o banco está vazio).
  // No navegador vêm do loja.config.js (JC.loja); nos testes (Node) usam o padrão abaixo.
  var CONFIG_PADRAO = {
    horarios: { 0: null, 1: [540, 1140], 2: [540, 1140], 3: [540, 1140], 4: [540, 1140], 5: [540, 1140], 6: [540, 1020] },
    almoco: [720, 780], folgas: [], intervalo: 15
  };
  var SERVICOS_PADRAO = [
    { id: 'corte', nome: 'Corte', preco: 35, duracao: 40, ordem: 1, ativo: true },
    { id: 'barba', nome: 'Barba', preco: 25, duracao: 30, ordem: 2, ativo: true },
    { id: 'corte-barba', nome: 'Corte + Barba', preco: 55, duracao: 60, ordem: 3, ativo: true }
  ];
  if (root.JC && root.JC.loja) {
    CONFIG_PADRAO = root.JC.loja.config;
    if (root.JC.loja.servicos.length) SERVICOS_PADRAO = root.JC.loja.servicos.map(function (s) {
      return { id: s.id, nome: s.nome, preco: s.preco, duracao: s.duracao, ordem: s.ordem, ativo: true };
    });
  }

  function erro(code, msg, causa) { var e = new Error(msg); e.code = code; if (causa) e.causa = causa; return e; }
  function erroOcupado() { return erro('ocupado', 'Esse horário acabou de ser ocupado.'); }
  function ms(v) { return v && typeof v.toMillis === 'function' ? v.toMillis() : (typeof v === 'number' ? v : Date.now()); }

  /* =================================================================
     criarDB(carregar) — carregar() resolve { F, A, db, auth }:
       F = módulo firebase/firestore, A = módulo firebase/auth (ou null),
       db = instância Firestore, auth = instância Auth (ou null).
     No navegador vem do CDN; nos testes (Node) vem do npm.
     ================================================================= */
  function criarDB(carregar) {
    var ctxP = null, ctxSync = null;
    var opcoes = {};
    function ctx() {
      // se falhar (ex.: sem internet ao baixar o SDK), a próxima chamada tenta de novo
      if (!ctxP) ctxP = Promise.resolve().then(function () { return carregar(opcoes); })
        .then(function (c) { ctxSync = c; return c; }, function (e) { ctxP = null; throw e; });
      return ctxP;
    }

    /* ---------- assinaturas (onSnapshot -> aoMudar) ---------- */
    var ouvintes = [], ouvintesAuth = [], cancelar = {}, emitT = null;
    function emitir() {
      clearTimeout(emitT);   // junta várias mudanças seguidas num só aviso
      emitT = setTimeout(function () { ouvintes.forEach(function (f) { try { f(); } catch (e) { console.error(e); } }); }, 60);
    }
    function vigiar(chave, alvo, c) {
      if (cancelar[chave]) return;
      var primeiro = true;
      cancelar[chave] = c.F.onSnapshot(alvo, function () {
        if (primeiro) { primeiro = false; return; }   // 1º snapshot = estado atual, não é mudança
        emitir();
      }, function (e) { console.warn('[DB] escuta ' + chave + ' falhou:', e && e.code); delete cancelar[chave]; });
    }
    function pararVigia(prefixo) {
      Object.keys(cancelar).forEach(function (k) { if (k.indexOf(prefixo) === 0) { cancelar[k](); delete cancelar[k]; } });
    }

    /* ---------- conversões ---------- */
    function deAg(snap) {
      var d = snap.data();
      return Object.assign({}, d, {
        id: snap.id, whatsapp: d.telefone || '', origem: d.origem || 'online', criadoEm: ms(d.criadoEm)
      });
    }
    function deLanc(snap) { var d = snap.data(); return Object.assign({ agendamentoId: null }, d, { id: snap.id, criadoEm: ms(d.criadoEm) }); }
    function normCfg(d) {
      if (!d) return JSON.parse(JSON.stringify(CONFIG_PADRAO));
      var h = {}; for (var i = 0; i < 7; i++) { var f = d.horarios && d.horarios[String(i)]; h[i] = f && f.length === 2 ? [f[0], f[1]] : null; }
      return { horarios: h, almoco: d.almoco && d.almoco.length === 2 ? [d.almoco[0], d.almoco[1]] : null,
        folgas: (d.folgas || []).slice(), intervalo: d.intervalo || 15 };
    }
    function paraCfg(cfg) {
      var h = {}; for (var i = 0; i < 7; i++) { var f = cfg.horarios[i] || cfg.horarios[String(i)]; h[String(i)] = f ? [Number(f[0]), Number(f[1])] : null; }
      return { horarios: h, almoco: cfg.almoco ? [Number(cfg.almoco[0]), Number(cfg.almoco[1])] : null,
        folgas: (cfg.folgas || []).slice(0, 400), intervalo: Number(cfg.intervalo) || 30 };
    }
    function faixasDeSlots(minutos) {   // [540,555,570,630] -> [[540,585],[630,645]]
      minutos.sort(function (a, b) { return a - b; });
      var out = [];
      minutos.forEach(function (m) {
        var u = out[out.length - 1];
        if (u && u[1] === m) u[1] = m + BLOCO; else out.push([m, m + BLOCO]);
      });
      return out;
    }

    /* ---------- barbeiro: escutas do painel ---------- */
    function ligarPainel(c) {
      var desde = addDias(hoje(), -JANELA_PASSADO);
      vigiar('p:ag', c.F.query(c.F.collection(c.db, 'agendamentos'), c.F.where('data', '>=', desde)), c);
      vigiar('p:cortes', c.F.query(c.F.collection(c.db, 'cortes'), c.F.where('data', '>=', desde)), c);
      vigiar('p:saidas', c.F.query(c.F.collection(c.db, 'saidas'), c.F.where('data', '>=', desde)), c);
    }
    function ehBarbeiro(c, user) {
      if (!user) return Promise.resolve(false);
      // sem permissão = não é barbeiro; falha de rede NÃO vira "não autorizado" (propaga o erro)
      return c.F.getDoc(c.F.doc(c.db, 'admins', user.uid)).then(function (s) { return s.exists(); })
        .catch(function (e) { if (e && e.code === 'permission-denied') return false; throw e; });
    }

    /* ---------- leitura de slots de um agendamento (transação) ---------- */
    function refsSlots(c, data, minutos) { return minutos.map(function (m) { return c.F.doc(c.db, 'slots', slotId(data, m)); }); }

    var DB = {
      util: { iso: iso, hoje: hoje, parseISO: parseISO, addDias: addDias, hhmm: hhmm, horaCurta: horaCurta,
        toMin: toMin, brl: brl, brlCurto: brlCurto, DIAS: DIAS, DIAS3: DIAS3, MESES3: MESES3, soDigitos: soDigitos,
        horariosLivres: horariosLivres, diaFechado: diaFechado, uid: uid, blocos: blocos, slotId: slotId },

      // opts.painel = true no painel.html (carrega Auth e liga escutas privadas quando o barbeiro entra)
      iniciar: function (opts) {
        opcoes = opts || {};
        return ctx().then(function (c) {
          vigiar('pub:servicos', c.F.collection(c.db, 'servicos'), c);
          vigiar('pub:config', c.F.doc(c.db, 'config', 'loja'), c);
          if (c.auth && c.A) {
            c.A.onAuthStateChanged(c.auth, function (user) {
              function avisar(info) { ouvintesAuth.forEach(function (f) { try { f(info); } catch (e) { console.error(e); } }); }
              ehBarbeiro(c, user).then(function (ok) {
                if (ok) ligarPainel(c); else pararVigia('p:');
                avisar(user ? { uid: user.uid, email: user.email, barbeiro: ok } : null);
              }, function (e) {   // não deu para conferir (sem internet): barbeiro = null, erro = código
                pararVigia('p:');
                avisar({ uid: user.uid, email: user.email, barbeiro: null, erro: (e && e.code) || 'rede' });
              });
            });
          }
        });
      },
      restaurarExemplo: function () {
        return Promise.reject(erro('indisponivel', 'Em produção não há dados de exemplo para restaurar.'));
      },
      aoMudar: function (fn) { ouvintes.push(fn); return function () { ouvintes = ouvintes.filter(function (f) { return f !== fn; }); }; },

      /* ---------- login do barbeiro ---------- */
      entrar: function (email, senha) {
        return ctx().then(function (c) {
          if (!c.auth) throw erro('sem-auth', 'Chame DB.iniciar({ painel: true }) antes de entrar.');
          return c.A.signInWithEmailAndPassword(c.auth, String(email || '').trim(), String(senha || ''))
            .then(function (cred) { return ehBarbeiro(c, cred.user); })
            .then(function (ok) {
              if (!ok) return c.A.signOut(c.auth).then(function () { throw erro('nao-autorizado', 'Esta conta não é do barbeiro.'); });
              return { uid: c.auth.currentUser.uid, email: c.auth.currentUser.email, barbeiro: true };
            });
        });
      },
      // "Esqueci a senha": e-mail de redefinição do Firebase (sempre resolve igual, para não revelar contas)
      redefinirSenha: function (email) {
        return ctx().then(function (c) {
          if (!c.auth) throw erro('sem-auth', 'Chame DB.iniciar({ painel: true }) antes.');
          return c.A.sendPasswordResetEmail(c.auth, String(email || '').trim()).catch(function (e) {
            if (e && (e.code === 'auth/user-not-found')) return;   // não revela se o e-mail existe
            throw e;
          });
        });
      },
      sair: function () { return ctx().then(function (c) { pararVigia('p:'); return c.auth ? c.A.signOut(c.auth) : null; }); },
      usuario: function () {
        return ctx().then(function (c) {
          if (!c.auth) return null;
          return (c.auth.authStateReady ? c.auth.authStateReady() : Promise.resolve()).then(function () {
            var u = c.auth.currentUser; if (!u) return null;
            return ehBarbeiro(c, u).then(function (ok) { return { uid: u.uid, email: u.email, barbeiro: ok }; });
          });
        });
      },
      aoMudarAuth: function (fn) { ouvintesAuth.push(fn); return function () { ouvintesAuth = ouvintesAuth.filter(function (f) { return f !== fn; }); }; },

      /* ---------- servicos ---------- */
      servicos: function () {
        return ctx().then(function (c) { return c.F.getDocs(c.F.collection(c.db, 'servicos')); }).then(function (qs) {
          return qs.docs.map(function (s) { return Object.assign({ ativo: true, ordem: 0 }, s.data(), { id: s.id }); })
            .sort(function (a, b) { return a.ordem - b.ordem; });
        });
      },
      salvarServicos: function (lista) {
        return ctx().then(function (c) {
          return c.F.getDocs(c.F.collection(c.db, 'servicos')).then(function (qs) {
            var b = c.F.writeBatch(c.db), manter = {};
            lista.forEach(function (s, i) {
              manter[s.id] = 1;
              b.set(c.F.doc(c.db, 'servicos', s.id), { nome: String(s.nome).slice(0, 60), preco: Number(s.preco),
                duracao: parseInt(s.duracao, 10), ordem: s.ordem != null ? s.ordem : i + 1, ativo: s.ativo !== false });
            });
            qs.docs.forEach(function (d) { if (!manter[d.id]) b.delete(d.ref); });
            return b.commit();
          });
        });
      },

      /* ---------- config/loja ---------- */
      config: function () {
        return ctx().then(function (c) { return c.F.getDoc(c.F.doc(c.db, 'config', 'loja')); })
          .then(function (s) {
            // existe:false = config/loja ainda não foi criada (a página do cliente mostra "abre em breve")
            var cfg = normCfg(s.exists() ? s.data() : null); cfg.existe = s.exists(); return cfg;
          });
      },
      salvarConfig: function (cfg) {
        return ctx().then(function (c) { return c.F.setDoc(c.F.doc(c.db, 'config', 'loja'), paraCfg(cfg)); });
      },

      /* ---------- 1ª configuração (só barbeiro): cria o padrão SÓ onde está vazio ----------
         - servicos: só se a coleção não tem NENHUM documento (se o barbeiro apagou alguns, não recria);
         - config/loja: só se o documento não existe.
         Tudo numa transação que relê os docs: se outro aparelho criou antes, nada é sobrescrito.
         Resolve { servicos: n criados, config: true/false }. */
      primeiraConfiguracao: function () {
        return ctx().then(function (c) {
          if (!c.auth || !c.auth.currentUser) return { servicos: 0, config: false };
          var cfgRef = c.F.doc(c.db, 'config', 'loja');
          return Promise.all([c.F.getDocs(c.F.query(c.F.collection(c.db, 'servicos'), c.F.limit(1))), c.F.getDoc(cfgRef)]).then(function (r) {
            var faltaSvc = r[0].empty, faltaCfg = !r[1].exists();
            if (!SERVICOS_PADRAO.length) faltaSvc = false;
            if (!faltaSvc && !faltaCfg) return { servicos: 0, config: false };
            return c.F.runTransaction(c.db, function (tx) {
              var refs = faltaSvc ? SERVICOS_PADRAO.map(function (s) { return c.F.doc(c.db, 'servicos', s.id); }) : [];
              return Promise.all(refs.concat(faltaCfg ? [cfgRef] : []).map(function (x) { return tx.get(x); })).then(function (ss) {
                var n = 0, cfgCriada = false;
                refs.forEach(function (ref, i) {
                  if (ss[i].exists()) return;
                  var s = SERVICOS_PADRAO[i];
                  tx.set(ref, { nome: s.nome, preco: s.preco, duracao: s.duracao, ordem: s.ordem, ativo: s.ativo }); n++;
                });
                if (faltaCfg && !ss[ss.length - 1].exists()) { tx.set(cfgRef, paraCfg(CONFIG_PADRAO)); cfgCriada = true; }
                return { servicos: n, config: cfgCriada };
              });
            });
          });
        });
      },

      /* ---------- slots: faixas ocupadas do dia (público, sem dado pessoal) ---------- */
      ocupados: function (data) {
        return ctx().then(function (c) {
          var q = c.F.query(c.F.collection(c.db, 'slots'), c.F.where('data', '==', data));
          // escuta só o último dia consultado, para a grade atualizar sozinha
          if (!cancelar['pub:slots:' + data]) { pararVigia('pub:slots:'); vigiar('pub:slots:' + data, q, c); }
          return c.F.getDocs(q);
        }).then(function (qs) { return faixasDeSlots(qs.docs.map(function (d) { return d.data().minuto; })); });
      },

      /* ---------- agendamentos ---------- */
      // barbeiro: com data -> só aquele dia; sem data -> de hoje-90 dias em diante
      agendamentos: function (data) {
        return ctx().then(function (c) {
          var col = c.F.collection(c.db, 'agendamentos');
          var q = data ? c.F.query(col, c.F.where('data', '==', data))
            : c.F.query(col, c.F.where('data', '>=', addDias(hoje(), -JANELA_PASSADO)));
          return c.F.getDocs(q);
        }).then(function (qs) {
          return qs.docs.map(deAg).sort(function (a, b) { return a.data === b.data ? a.inicio - b.inicio : (a.data < b.data ? -1 : 1); });
        });
      },

      // público (ou barbeiro): 1 batch = agendamento + todos os slots de 15 min
      criarAgendamento: function (dados) {
        return ctx().then(function (c) {
          var nome = String(dados.nome || '').trim().replace(/\s+/g, ' ');
          var tel = soDigitos(dados.telefone || dados.whatsapp);
          var inicio = Number(dados.inicio), duracao = Number(dados.duracao), fim = inicio + duracao;
          var agRef = c.F.doc(c.F.collection(c.db, 'agendamentos'));
          var reg = { nome: nome, telefone: tel, servicoId: dados.servicoId, servicoNome: dados.servicoNome,
            preco: dados.preco, duracao: duracao, data: dados.data, inicio: inicio, fim: fim,
            status: 'marcado', criadoEm: c.F.serverTimestamp() };
          if (dados.origem === 'painel') reg.origem = 'painel';   // só o barbeiro consegue gravar isto
          var mins = blocos(inicio, fim);
          // checagem rápida: se algum bloco já está ocupado, nem tenta gravar (a garantia real é a regra)
          return Promise.all(refsSlots(c, dados.data, mins).map(function (r) { return c.F.getDoc(r); })).then(function (ss) {
            if (ss.some(function (s) { return s.exists(); })) throw erroOcupado();
            return gravar();
          });
          function gravar() {
          var b = c.F.writeBatch(c.db);
          b.set(agRef, reg);
          refsSlots(c, dados.data, mins).forEach(function (r, i) {
            b.set(r, { agId: agRef.id, data: dados.data, minuto: mins[i], criadoEm: c.F.serverTimestamp() });
          });
          return b.commit().then(function () {
            return Object.assign({}, reg, { id: agRef.id, whatsapp: tel, origem: reg.origem || 'online', criadoEm: Date.now() });
          }, function (e) {
            if (!e || e.code !== 'permission-denied') throw e;
            // negado: foi porque algum bloco já existe (ocupado) ou por dado inválido?
            return Promise.all(refsSlots(c, dados.data, mins).map(function (r) { return c.F.getDoc(r); })).then(function (ss) {
              if (ss.some(function (s) { return s.exists(); })) throw erroOcupado();
              throw erro('invalido', 'Não foi possível confirmar esse horário.', e);
            }, function () { throw erro('invalido', 'Não foi possível confirmar esse horário.', e); });
          });
          }
        });
      },

      // barbeiro: muda campos; se o horário deixa de ocupar (faltou/cancelado) apaga os slots,
      // se volta a ocupar ou muda de data/hora, cria os novos (erro 'ocupado' se outro já pegou).
      atualizarAgendamento: function (id, patch) {
        return ctx().then(function (c) {
          var agRef = c.F.doc(c.db, 'agendamentos', id);
          return c.F.runTransaction(c.db, function (tx) {
            return tx.get(agRef).then(function (s) {
              if (!s.exists()) throw erro('nao-encontrado', 'Agendamento não encontrado.');
              var velho = s.data(), novo = Object.assign({}, velho, patch);
              delete novo.id; delete novo.whatsapp;
              if (patch.whatsapp != null && patch.telefone == null) novo.telefone = soDigitos(patch.whatsapp);
              if (patch.inicio != null || patch.duracao != null) novo.fim = Number(novo.inicio) + Number(novo.duracao);
              var antes = ocupaHorario(velho.status) ? blocos(velho.inicio, velho.fim).map(function (m) { return slotId(velho.data, m); }) : [];
              var depois = ocupaHorario(novo.status) ? blocos(novo.inicio, novo.fim).map(function (m) { return slotId(novo.data, m); }) : [];
              var criar = depois.filter(function (x) { return antes.indexOf(x) < 0; });
              var apagar = antes.filter(function (x) { return depois.indexOf(x) < 0; });
              var refsCriar = criar.map(function (x) { return c.F.doc(c.db, 'slots', x); });
              return Promise.all(refsCriar.map(function (r) { return tx.get(r); })).then(function (ss) {
                if (ss.some(function (x) { return x.exists() && x.data().agId !== id; })) throw erroOcupado();
                novo.atualizadoEm = c.F.serverTimestamp();
                tx.set(agRef, novo);
                refsCriar.forEach(function (r, i) {
                  if (ss[i].exists()) return;   // já é deste agendamento
                  var m = Number(criar[i].split('_')[1]);
                  tx.set(r, { agId: id, data: novo.data, minuto: m, criadoEm: c.F.serverTimestamp() });
                });
                apagar.forEach(function (x) { tx.delete(c.F.doc(c.db, 'slots', x)); });
                return Object.assign({}, novo, { id: id, whatsapp: novo.telefone || '', origem: novo.origem || 'online', criadoEm: ms(velho.criadoEm) });
              });
            });
          });
        });
      },

      // Atendido: muda o status E lança o corte no caixa (corte com id fixo 'ag_<id>')
      marcarAtendido: function (id) {
        return DB.atualizarAgendamento(id, { status: 'atendido' }).then(function (a) {
          return ctx().then(function (c) {
            return c.F.setDoc(c.F.doc(c.db, 'cortes', 'ag_' + id), {
              agendamentoId: id, data: a.data, hora: hhmm(a.inicio),
              descricao: (a.servicoNome + ' · ' + String(a.nome).split(' ')[0]).slice(0, 120),
              valor: Number(a.preco) || 0, criadoEm: c.F.serverTimestamp() });
          }).then(function () { return a; });
        });
      },
      desfazerStatus: function (id) {
        return DB.atualizarAgendamento(id, { status: 'marcado' }).then(function () {
          return ctx().then(function (c) { return c.F.deleteDoc(c.F.doc(c.db, 'cortes', 'ag_' + id)); });
        });
      },
      removerAgendamento: function (id) {   // apaga o agendamento e libera os slots
        return DB.atualizarAgendamento(id, { status: 'cancelado' }).then(function () {
          return ctx().then(function (c) { return c.F.deleteDoc(c.F.doc(c.db, 'agendamentos', id)); });
        });
      },

      /* ---------- caixa ---------- */
      cortes: function (de, ate) { return lancamentos('cortes', de, ate); },
      saidas: function (de, ate) { return lancamentos('saidas', de, ate); },
      addCorte: function (x) { return addLanc('cortes', x); },
      addSaida: function (x) { return addLanc('saidas', x); },
      removerLancamento: function (tipo, id) {
        if (tipo !== 'cortes' && tipo !== 'saidas') return Promise.reject(erro('invalido', 'tipo inválido'));
        return ctx().then(function (c) { return c.F.deleteDoc(c.F.doc(c.db, tipo, id)); });
      }
    };

    function lancamentos(col, de, ate) {
      return ctx().then(function (c) {
        return c.F.getDocs(c.F.query(c.F.collection(c.db, col), c.F.where('data', '>=', de), c.F.where('data', '<=', ate)));
      }).then(function (qs) { return qs.docs.map(deLanc); });
    }
    function addLanc(col, x) {
      return ctx().then(function (c) {
        var ref = c.F.doc(c.F.collection(c.db, col));
        var reg = { agendamentoId: x.agendamentoId || null, data: x.data, hora: x.hora || hhmm(0),
          descricao: String(x.descricao || '').slice(0, 120), valor: Number(x.valor) || 0, criadoEm: c.F.serverTimestamp() };
        return c.F.setDoc(ref, reg).then(function () { return Object.assign({}, reg, { id: ref.id, criadoEm: Date.now() }); });
      });
    }

    DB._ctx = ctx;   // uso interno/testes
    return DB;
  }

  /* ---------- carregador do navegador (CDN gstatic) ---------- */
  function carregarCDN(opts) {
    var cfg = root.FIREBASE_CONFIG || {};
    if (!cfg.apiKey || !cfg.projectId || !cfg.appId) {
      return Promise.reject(erro('sem-config', 'Preencha firebase-config.js com a configuração do app web do Firebase.'));
    }
    var imp = function (m) { return import(CDN + 'firebase-' + m + '.js'); };
    return Promise.all([imp('app'), imp('firestore'), opts.painel ? imp('auth') : null]).then(function (r) {
      var app = r[0].initializeApp(cfg);
      var extra = Promise.resolve();
      var ac = root.FIREBASE_APP_CHECK || {};
      if (ac.ativo && ac.siteKey) {   // App Check (desligado por padrão)
        extra = imp('app-check').then(function (m) {
          var Prov = ac.enterprise ? m.ReCaptchaEnterpriseProvider : m.ReCaptchaV3Provider;
          m.initializeAppCheck(app, { provider: new Prov(ac.siteKey), isTokenAutoRefreshEnabled: true });
        });
      }
      return extra.then(function () {
        var db = r[1].getFirestore(app);
        // initializeAuth sem popup/redirect: não carrega iframe nem scripts de terceiros (CSP mais estrita);
        // sessão fica salva no aparelho (IndexedDB, com localStorage de reserva).
        var auth = null;
        if (r[2]) {
          auth = r[2].initializeAuth(app, { persistence: [r[2].indexedDBLocalPersistence, r[2].browserLocalPersistence] });
          auth.languageCode = 'pt-BR';
        }
        var c = { F: r[1], A: r[2], db: db, auth: auth };
        var em = root.FIREBASE_EMULADOR;   // { host:'127.0.0.1', firestore:8080, auth:9099 } p/ testes locais
        if (em && em.host) {
          r[1].connectFirestoreEmulator(db, em.host, em.firestore || 8080);
          if (c.auth) r[2].connectAuthEmulator(c.auth, 'http://' + em.host + ':' + (em.auth || 9099), { disableWarnings: true });
        }
        return c;
      });
    });
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { criarDB: criarDB, util: { blocos: blocos, slotId: slotId, horariosLivres: horariosLivres }, CONFIG_PADRAO: CONFIG_PADRAO, SERVICOS_PADRAO: SERVICOS_PADRAO };
  } else {
    root.DBBase = { criarDB: criarDB, CONFIG_PADRAO: CONFIG_PADRAO, SERVICOS_PADRAO: SERVICOS_PADRAO };
    if (!(root.JC && root.JC.loja && root.JC.loja.demo)) root.DB = criarDB(carregarCDN);   // modo demonstração: db-demo.js
  }
})(typeof window !== 'undefined' ? window : globalThis);
