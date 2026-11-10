const admin = require("firebase-admin");

function getFirebase() {
  if (admin.apps.length) return admin.app();

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new Error("Configuração do Firebase ausente.");

  const serviceAccount = JSON.parse(raw);

  return admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

module.exports = async (req, res) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  if (req.method !== "POST") {
    return res.status(405).json({ erro: "Método não permitido." });
  }

  try {
    getFirebase();
    return res.status(501).json({
      erro: "API em preparação. Validação ainda não habilitada."
    });
  } catch (error) {
    console.error("Erro de configuração:", error.message);
    return res.status(500).json({
      erro: "Não foi possível inicializar o serviço."
    });
  }
};
