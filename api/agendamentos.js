const admin = require("firebase-admin");

function firebase() {
  if (admin.apps.length) return admin.firestore();

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new Error("Configuração do Firebase ausente.");

  const credentials = JSON.parse(raw);

  admin.initializeApp({
    credential: admin.credential.cert(credentials)
  });

  return admin.firestore();
}

function resposta(res, status, dados) {
  return res.status(status).json(dados);
}

function erro(status, codigo, mensagem) {
  const e = new Error(mensagem);
  e.status = status;
  e.code = codigo;
  return e;
}

function dataLocal() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bahia",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

function blocos(inicio, fim) {
  const resultado = [];

  for (
    let minuto = Math.floor(inicio / 15) * 15;
    minuto < fim;
    minuto += 15
  ) {
    resultado.push(minuto);
  }

  return resultado;
}

function validarData(data) {
  if (typeof data !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    throw erro(400, "invalido", "Data inválida.");
  }

  const [ano, mes, dia] = data.split("-").map(Number);
  const teste = new Date(Date.UTC(ano, mes - 1, dia));

  if (
    teste.getUTCFullYear() !== ano ||
    teste.getUTCMonth() !== mes - 1 ||
    teste.getUTCDate() !== dia
  ) {
    throw erro(400, "invalido", "Data inválida.");
  }

  if (data < dataLocal()) {
    throw erro(400, "invalido", "Não é possível agendar no passado.");
  }
}

module.exports = async (req, res) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  if (req.method !== "POST") {
    return resposta(res, 405, {
      erro: "Método não permitido."
    });
  }

  try {
    const db = firebase();
    const dados = req.body;

    if (!dados || typeof dados !== "object" || Array.isArray(dados)) {
      throw erro(400, "invalido", "Dados inválidos.");
    }

    const nome = String(dados.nome || "")
      .trim()
      .replace(/\s+/g, " ");

    const telefone = String(dados.telefone || dados.whatsapp || "")
      .replace(/\D/g, "");

    if (nome.length < 2 || nome.length > 60) {
      throw erro(400, "invalido", "Nome inválido.");
    }

    if (telefone.length < 10 || telefone.length > 13) {
      throw erro(400, "invalido", "Telefone inválido.");
    }

    validarData(dados.data);

    const inicio = dados.inicio;

    if (
      !Number.isInteger(inicio) ||
      inicio < 0 ||
      inicio >= 1440
    ) {
      throw erro(400, "invalido", "Horário inválido.");
    }

    let ids = dados.servicoIds;

    // Compatibilidade temporária com a versão atual do site.
    if (!Array.isArray(ids)) {
      ids = [dados.servicoId];
    }

    if (
      ids.length < 1 ||
      ids.length > 5 ||
      ids.some(id => typeof id !== "string" || !id.trim()) ||
      new Set(ids).size !== ids.length
    ) {
      throw erro(400, "invalido", "Seleção de serviços inválida.");
    }

    const servicoRefs = ids.map(id =>
      db.collection("servicos").doc(id)
    );

    const configRef = db.collection("config").doc("loja");

    const resultado = await db.runTransaction(async tx => {
      // Primeiro fazemos todas as leituras.
      const servicoSnaps = [];

      for (const ref of servicoRefs) {
        servicoSnaps.push(await tx.get(ref));
      }

      const configSnap = await tx.get(configRef);

      if (!configSnap.exists) {
        throw erro(503, "config", "Agenda ainda não configurada.");
      }

      const servicos = servicoSnaps.map(snap => {
        if (!snap.exists) {
          throw erro(400, "invalido", "Um serviço não existe mais.");
        }

        const s = snap.data();

        if (
          s.ativo === false ||
          typeof s.nome !== "string" ||
          !Number.isFinite(s.preco) ||
          !Number.isInteger(s.duracao) ||
          s.duracao <= 0
        ) {
          throw erro(400, "invalido", "Serviço indisponível.");
        }

        return {
          id: snap.id,
          nome: s.nome,
          preco: s.preco,
          duracao: s.duracao
        };
      });

      const config = configSnap.data();
      const horarios = config.horarios || {};
      const diaSemana = new Date(
        dados.data + "T12:00:00"
      ).getDay();

      const expediente = horarios[String(diaSemana)];

      if (
        !Array.isArray(expediente) ||
        expediente.length !== 2 ||
        !expediente.every(Number.isInteger)
      ) {
        throw erro(400, "fechado", "A barbearia não abre nesse dia.");
      }

      if ((config.folgas || []).includes(dados.data)) {
        throw erro(400, "fechado", "A barbearia estará fechada nessa data.");
      }

      const duracao = servicos.reduce(
        (total, s) => total + s.duracao,
        0
      );

      const preco = servicos.reduce(
        (total, s) => total + s.preco,
        0
      );

      const fim = inicio + duracao;

      if (
        duracao > 480 ||
        inicio < expediente[0] ||
        fim > expediente[1]
      ) {
        throw erro(400, "invalido", "Horário fora do expediente.");
      }

      const intervalo = Number(config.intervalo) || 30;

      if (
        intervalo < 1 ||
        (inicio - expediente[0]) % intervalo !== 0
      ) {
        throw erro(400, "invalido", "Horário inválido para a agenda.");
      }

      const almoco = config.almoco;

      if (
        Array.isArray(almoco) &&
        inicio < almoco[1] &&
        fim > almoco[0]
      ) {
        throw erro(400, "invalido", "Horário indisponível durante o almoço.");
      }

      const agora = new Date();
      const hoje = dataLocal();

      if (dados.data === hoje) {
        const horaAtual = Number(
          new Intl.DateTimeFormat("en-GB", {
            timeZone: "America/Bahia",
            hour: "2-digit",
            minute: "2-digit",
            hourCycle: "h23"
          }).format(agora).replace(":", "")
        );

        const minutoAtual =
          Math.floor(horaAtual / 100) * 60 + horaAtual % 100;

        if (inicio <= minutoAtual) {
          throw erro(400, "invalido", "Escolha um horário futuro.");
        }
      }

      const minutos = blocos(inicio, fim);

      const slotRefs = minutos.map(minuto =>
        db.collection("slots").doc(`${dados.data}_${minuto}`)
      );

      const slotSnaps = [];

      for (const ref of slotRefs) {
        slotSnaps.push(await tx.get(ref));
      }

      if (slotSnaps.some(snap => snap.exists)) {
        throw erro(409, "ocupado", "Esse horário acabou de ser ocupado.");
      }

      // Confere os dados enviados pelo site na versão atual.
      if (
        ids.length === 1 &&
        (
          Number(dados.preco) !== preco ||
          Number(dados.duracao) !== duracao
        )
      ) {
        throw erro(400, "invalido", "Os dados do serviço foram alterados. Atualize a página.");
      }

      const agRef = db.collection("agendamentos").doc();

      const registro = {
        nome,
        telefone,
        servicoId: ids[0],
        servicoIds: ids,
        servicoNome: servicos.map(s => s.nome).join(" + "),
        preco,
        duracao,
        data: dados.data,
        inicio,
        fim,
        status: "marcado",
        criadoEm: admin.firestore.FieldValue.serverTimestamp()
      };

      tx.create(agRef, registro);

      slotRefs.forEach((ref, i) => {
        tx.create(ref, {
          agId: agRef.id,
          data: dados.data,
          minuto: minutos[i],
          criadoEm: admin.firestore.FieldValue.serverTimestamp()
        });
      });

      return {
        id: agRef.id,
        ...registro,
        criadoEm: Date.now()
      };
    });

    return resposta(res, 201, {
      sucesso: true,
      agendamento: resultado
    });

  } catch (e) {
    console.error("[API agendamentos]", e);

    return resposta(res, e.status || 500, {
      codigo: e.code || "erro",
      erro: e.status
        ? e.message
        : "Não foi possível confirmar o agendamento."
    });
  }
};
