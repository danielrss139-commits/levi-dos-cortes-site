/* =====================================================================
   CONFIGURAÇÃO DO FIREBASE (app web) — preencha UMA vez por loja
   ---------------------------------------------------------------------
   Onde copiar: console.firebase.google.com > seu projeto > engrenagem (Configurações do projeto)
   > Geral > "Seus apps" > App da Web (</>) > "Configuração do SDK" > opção "Config".
   Copie cada valor para dentro das aspas abaixo.

   Enquanto estiver vazio, as páginas mostram a tela "Configuração pendente" (nada quebra).
   Esses valores NÃO são senha (ficam visíveis no site de qualquer jeito); quem protege os
   dados são as regras do Firestore (firestore.rules). Nunca cole aqui chave de conta de serviço.
   No modo demonstração (loja.config.js > demo: true) este arquivo é ignorado.
   ===================================================================== */
window.FIREBASE_CONFIG = {
  apiKey: '',
  authDomain: '',
  projectId: '',
  storageBucket: '',
  messagingSenderId: '',
  appId: ''
};

/* App Check (proteção contra robôs/spam de agendamento) — DESLIGADO.
   Para ligar: Console > App Check > registrar o app web com reCAPTCHA v3, colar a chave do SITE aqui,
   ativo: true, acrescentar o reCAPTCHA ao CSP das páginas (ver README), testar e só então "Aplicar". */
window.FIREBASE_APP_CHECK = {
  ativo: false,
  enterprise: false,       // true = ReCaptchaEnterpriseProvider; false = ReCaptchaV3Provider
  siteKey: ''              // chave do SITE do reCAPTCHA (não a secreta)
};

/* Emulador local (testes): abra a página com ?emulador=1 em localhost/127.0.0.1.
   Nesse modo a configuração acima é trocada pela do projeto de teste 'demo-barbearia'. */
window.FIREBASE_EMULADOR = null;
