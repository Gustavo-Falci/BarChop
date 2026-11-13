// O status do topo: o próximo horário livre de uma barbearia de EXEMPLO, calculado pela hora de verdade (de 20 em 20
// minutos, com 20 de folga). Diz sempre que é exemplo: o site do BarChop não mostra número que não mediu.
// ?hora=14:20 simula a hora (para gravar a prévia com a barbearia aberta).
const HORARIO = { 0: null, 1: [9, 20], 2: [9, 20], 3: [9, 20], 4: [9, 20], 5: [9, 20], 6: [9, 18] };
const fmt = (m) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;

function agora() {
  const d = new Date();
  const h = new URLSearchParams(location.search).get('hora');
  if (h && /^\d{1,2}:\d{2}$/.test(h)) { const [a, b] = h.split(':').map(Number); d.setHours(a, b, 0, 0); }
  return d;
}

function proximoLivre(quando = agora()) {
  const dia = quando.getDay();
  const min = quando.getHours() * 60 + quando.getMinutes();
  const hoje = HORARIO[dia];
  if (hoje) {
    const [abre, fecha] = hoje;
    if (min < abre * 60) return { aberto: false, texto: `abre hoje às ${fmt(abre * 60)}` };
    const prox = Math.ceil((min + 20) / 20) * 20;
    if (prox <= fecha * 60 - 20) return { aberto: true, texto: `próximo horário livre ${fmt(prox)}` };
  }
  for (let i = 1; i <= 7; i++) {
    const d = (dia + i) % 7;
    if (HORARIO[d]) return { aberto: false, texto: `abre ${i === 1 ? 'amanhã' : 'na ' + ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'][d]} às ${fmt(HORARIO[d][0] * 60)}` };
  }
  return { aberto: false, texto: 'fechado' };
}

export function status() {
  const p = proximoLivre();
  const alvo = document.querySelector('[data-status]');
  const ponto = document.querySelector('.hero__status .ponto');
  if (alvo) alvo.textContent = `Exemplo · ${p.texto}`;
  ponto?.classList.toggle('is-fechado', !p.aberto);
}
