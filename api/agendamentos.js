
const admin = require("firebase-admin");

function obterBanco() {
  if (admin.apps.length) return admin.firestore();

  const chave = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!chave) throw new Error("Configuração do Firebase ausente.");

  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(chave))
  });

  return admin.firestore();
}

function responder(res, status, dados) {
  return res.status(status).json(dados);
}

function falhar(status, codigo, mensagem) {
  const erro = new Error(mensagem);
  erro.status = status;
  erro.code = codigo;
  throw erro;
}

function dataBahia() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bahia",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

function minutoBahia() {
  const partes = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Bahia",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).format(new Date()).split(":").map(Number);

  return partes[0] * 60 + partes[1];
}

function validarData(data) {
  if (typeof data !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    falhar(400, "invalido", "Data inválida.");
  }

  const [ano, mes, dia] = data.split("-").map(Number);
  const teste = new Date(Date.UTC(ano, mes - 1, dia));

  if (
    teste.getUTCFullYear() !== ano ||
    teste.getUTCMonth() !== mes - 1 ||
    teste.getUTCDate() !== dia
  ) {
    falhar(400, "invalido", "Data inválida.");
  }

  if (data < dataBahia()) {
    falhar(400, "invalido", "Não é possível agendar no passado.");
  }
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

module.exports = async function (req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return responder(res, 405, {
      codigo: "metodo",
      erro: "Método não permitido."
    });
  }

  try {
    const db = obterBanco();
    const dados = req.body;

    if (!dados || typeof dados !== "object" || Array.isArray(dados)) {
      falhar(400, "invalido", "Dados inválidos.");
    }

    const nome = String(dados.nome || "")
      .trim()
      .replace(/\s+/g, " ");

    const telefone = String(dados.telefone || dados.whatsapp || "")
      .replace(/\D/g, "");

    if (nome.length < 2 || nome.length > 60) {
      falhar(400, "invalido", "Nome inválido.");
    }

    if (telefone.length < 10 || telefone.length > 13) {
      falhar(400, "invalido", "Telefone inválido.");
    }

    validarData(dados.data);

    const inicio = dados.inicio;

    if (
      !Number.isInteger(inicio) ||
      inicio < 0 ||
      inicio >= 1440 ||
      inicio % 15 !== 0
    ) {
      falhar(400, "invalido", "Horário inválido.");
    }

    let ids = dados.servicoIds;

    if (!Array.isArray(ids)) {
      ids = [dados.servicoId];
    }

    if (
      ids.length < 1 ||
      ids.length > 5 ||
      ids.some(id => typeof id !== "string" || !id.trim()) ||
      new Set(ids).size !== ids.length
    ) {
      falhar(400, "invalido", "Seleção de serviços inválida.");
    }

    const configRef = db.collection("config").doc("loja");

    const servicoRefs = ids.map(id =>
      db.collection("servicos").doc(id)
    );

    const agendamento = await db.runTransaction(async tx => {
      // Todas as leituras são feitas antes das gravações.
      const configSnap = await tx.get(configRef);

      if (!configSnap.exists) {
        falhar(503, "config", "Agenda ainda não configurada.");
      }

      const servicoSnaps = [];

      for (const ref of servicoRefs) {
        servicoSnaps.push(await tx.get(ref));
      }

      const config = configSnap.data();

      const servicos = servicoSnaps.map(snap => {
        if (!snap.exists) {
          falhar(400, "invalido", "Um serviço não existe mais.");
        }

        const s = snap.data();

        if (
          s.ativo === false ||
          typeof s.nome !== "string" ||
          !Number.isFinite(s.preco) ||
          !Number.isInteger(s.duracao) ||
          s.duracao <= 0
        ) {
          falhar(400, "invalido", "Serviço indisponível.");
        }

        return {
          id: snap.id,
          nome: s.nome,
          preco: s.preco,
          duracao: s.duracao
        };
      });

      const horarios = config.horarios || {};
      const diaSemana = new Date(
        dados.data + "T12:00:00Z"
      ).getUTCDay();

      const expediente = horarios[String(diaSemana)];

      if (
        !Array.isArray(expediente) ||
        expediente.length !== 2 ||
        !expediente.every(Number.isInteger) ||
        expediente[0] < 0 ||
        expediente[1] > 1440 ||
        expediente[0] >= expediente[1]
      ) {
        falhar(400, "fechado", "A barbearia não abre nesse dia.");
      }

      if ((config.folgas || []).includes(dados.data)) {
        falhar(400, "fechado", "A barbearia estará fechada nessa data.");
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
        falhar(400, "invalido", "Horário fora do expediente.");
      }

      const intervalo = Number(config.intervalo) || 15;

      if (
        intervalo < 1 ||
        (inicio - expediente[0]) % intervalo !== 0
      ) {
        falhar(400, "invalido", "Horário inválido para a agenda.");
      }

      const almoco = config.almoco;

      if (
        Array.isArray(almoco) &&
        almoco.length === 2 &&
        inicio < almoco[1] &&
        fim > almoco[0]
      ) {
        falhar(400, "fechado", "Horário indisponível durante o almoço.");
      }

      if (dados.data === dataBahia() && inicio <= minutoBahia()) {
        falhar(400, "invalido", "Escolha um horário futuro.");
      }

      // Verifica todos os blocos de 15 minutos.
      const minutos = blocos(inicio, fim);

      const slotRefs = minutos.map(minuto =>
        db.collection("slots").doc(`${dados.data}_${minuto}`)
      );

      const slotSnaps = [];

      for (const ref of slotRefs) {
        slotSnaps.push(await tx.get(ref));
      }

      if (slotSnaps.some(snap => snap.exists)) {
        falhar(409, "ocupado", "Esse horário acabou de ser ocupado.");
      }

      // Confere os valores apresentados pelo site.
      if (
        Number(dados.preco) !== preco ||
        Number(dados.duracao) !== duracao
      ) {
        falhar(
          400,
          "invalido",
          "Os serviços foram alterados. Atualize a página."
        );
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
        origem: "online",
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

    return responder(res, 201, {
      sucesso: true,
      agendamento
    });

  } catch (e) {
    console.error("[API agendamentos]", e);

    return responder(res, e.status || 500, {
      codigo: e.code || "erro",
      erro: e.status
        ? e.message
        : "Não foi possível confirmar o agendamento."
    });
  }
};
