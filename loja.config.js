/* =====================================================================
   BARBEARIA LEVI DOS CORTES — Itapuã
   ---------------------------------------------------------------------
   Cópia do site de agendamento (demo do AEGO Barber) adaptada para o Levi.
   Campos marcados com "TROCAR" ainda estão com valores PROVISÓRIOS da demo
   e precisam ser substituídos pelos dados reais antes de publicar.
   demo: true -> não usa Firebase; agendamentos ficam só no aparelho de quem abre.
   ===================================================================== */
window.LOJA = {
  nomeLoja: 'Barbearia Levi Dos Cortes',
  nomeCurto: 'Levi Dos Cortes',
  slogan: 'Vai além de um corte de cabelo, é autocuidado, é autoestima!',
  logo: 'img/logo-levi.png',
  monograma: 'LC',
  corDestaque: '#151515',
  fundo: { imagem: '', escurecer: 0.55 },
  whatsapp: '5571984563623',
  instagram: 'barbearia.levicortes',
  email: '',
  endereco: '',                       // TROCAR: rua e número
  bairroCidade: 'Itapuã',             // TROCAR: confirmar cidade (ex.: Itapuã · Salvador)
  mapa: '',                           // TROCAR: link do Google Maps
  avaliacao: null,                    // TROCAR: { nota: '4,9', total: '120', fonte: 'Google' } (vazio = não mostra)
  servicos: [                         // TROCAR: serviços, preços e tempos reais do Levi
    { nome: 'Corte',          preco: 40, minutos: 40, icone: 'tesoura', foto: 'img/svc/corte.webp',     descricao: 'Corte social na tesoura e no pente' },
    { nome: 'Barba',          preco: 30, minutos: 30, icone: 'barba', foto: 'img/svc/barba.webp',       descricao: 'Toalha quente, navalha e contorno alinhado' },
    { nome: 'Corte + Barba',  preco: 60, minutos: 60, icone: 'combo', foto: 'img/svc/corte-barba.webp',       descricao: 'O combo completo, com calma' },
    { nome: 'Degradê',        preco: 45, minutos: 45, icone: 'maquina', foto: 'img/svc/degrade.webp',     descricao: 'Transição suave na máquina e na navalha' },
    { nome: 'Sobrancelha',    preco: 15, minutos: 15, icone: 'sobrancelha', foto: 'img/svc/sobrancelha.webp', descricao: 'Desenho limpo, sem exagero' },
    { nome: 'Corte infantil', preco: 35, minutos: 30, icone: 'infantil', foto: 'img/svc/infantil.webp',    descricao: 'Paciência e capricho para os pequenos' }
  ],
  horario: {                          // TROCAR: horários reais (null = fechado)
    seg: ['09:00', '19:00'], ter: ['09:00', '19:00'], qua: ['09:00', '19:00'], qui: ['09:00', '19:00'],
    sex: ['09:00', '19:00'], sab: ['09:00', '17:00'], dom: null
  },
  almoco: ['12:00', '13:00'],         // TROCAR
  intervaloMinutos: 15,               // TROCAR
  diasAntecedencia: 60,               // TROCAR
  galeria: [],
  demo: true
};
