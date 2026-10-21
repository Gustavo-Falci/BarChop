// Os números do movimento, num lugar só (ADR-0011). O CSS lê daqui as
// mesmas durações e curvas (`varsDeMovimento`, em app/tokens-css.ts), e
// todo componente que anima com a lib `motion` também — nenhum número
// solto em componente. Se o painel precisar ficar mais rápido ou mais
// lento, muda aqui e muda tudo junto.
//
// Sem import de `motion/react` neste arquivo: o tokens-css.ts roda no
// servidor e não pode puxar a lib pro layout raiz.

// Em segundos, que é o que a lib usa; o CSS converte pra ms. Nada acima
// de 280ms: o painel é ferramenta de trabalho, aberta o dia todo, e
// movimento que atrasa clique é pior do que nenhum.
export const DURACAO = {
  instante: 0.1,
  curta: 0.16,
  media: 0.2,
  longa: 0.28,
} as const;

// `entrada` desacelera ao chegar; `saida` acelera ao ir embora (quem
// sai não precisa ser acompanhado com o olho); `padrao` pra quem só
// muda de lugar.
export const CURVA = {
  entrada: [0.2, 0.8, 0.2, 1],
  saida: [0.4, 0, 1, 1],
  padrao: [0.4, 0, 0.2, 1],
} as const;

// Em px. O suficiente pro olho ler "veio de baixo" sem a tela parecer
// que escorrega.
export const DESLIZE = {
  curto: 4,
  normal: 8,
} as const;

export const ESCALA = {
  aperto: 0.97,
  janela: 0.98,
} as const;

// Molas por duração visual e `bounce: 0`, e não por rigidez/amortecimento:
// a duração fica legível ao lado das outras, e nenhuma mola quica — o
// pedido é sutil. `firme` pra UI (pílula, indicador, ✓), `suave` pra
// janela e cartão, `solta` pro item que se solta no fim de um arrasto.
export const MOLAS = {
  firme: { type: "spring", visualDuration: DURACAO.curta, bounce: 0 },
  suave: { type: "spring", visualDuration: DURACAO.media, bounce: 0 },
  solta: { type: "spring", visualDuration: DURACAO.longa, bounce: 0 },
} as const;

export function curvaCss(curva: readonly number[]): string {
  return `cubic-bezier(${curva.join(", ")})`;
}

export function emMs(segundos: number): string {
  return `${Math.round(segundos * 1000)}ms`;
}
