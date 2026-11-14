// O status do topo da home: o próximo horário livre de uma barbearia de
// EXEMPLO, calculado pela hora de verdade (o status.js do protótipo): de
// 20 em 20 minutos, com 20 de folga. Diz sempre que é exemplo: o site do
// BarChop não mostra número que não mediu. A hora é a de Brasília, a da
// barbearia de exemplo, qualquer que seja o fuso de quem visita.

// Dia da semana (0 = domingo) → [abre, fecha], em horas cheias.
const HORARIO: Record<number, [number, number] | null> = {
  0: null,
  1: [9, 20],
  2: [9, 20],
  3: [9, 20],
  4: [9, 20],
  5: [9, 20],
  6: [9, 18],
};
const DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const PASSO = 20;

export type StatusDoTopo = { aberto: boolean; texto: string };

const hhmm = (minutos: number) => `${Math.floor(minutos / 60)}:${String(minutos % 60).padStart(2, "0")}`;

// O dia da semana e os minutos do dia em São Paulo.
function emSaoPaulo(quando: Date): { dia: number; minutos: number } {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    weekday: "short",
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  }).formatToParts(quando);
  const valor = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? "0";
  const dia = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(valor("weekday"));
  return { dia, minutos: Number(valor("hour")) * 60 + Number(valor("minute")) };
}

export function statusDoTopo(quando: Date): StatusDoTopo {
  const { dia, minutos } = emSaoPaulo(quando);
  const hoje = HORARIO[dia];
  if (hoje) {
    const [abre, fecha] = hoje;
    if (minutos < abre * 60) return { aberto: false, texto: `abre hoje às ${hhmm(abre * 60)}` };
    const proximo = Math.ceil((minutos + PASSO) / PASSO) * PASSO;
    if (proximo <= fecha * 60 - PASSO) return { aberto: true, texto: `próximo horário livre ${hhmm(proximo)}` };
  }
  for (let i = 1; i <= 7; i += 1) {
    const outro = (dia + i) % 7;
    const horario = HORARIO[outro];
    if (horario) {
      const quandoAbre = i === 1 ? "amanhã" : `na ${DIAS[outro]}`;
      return { aberto: false, texto: `abre ${quandoAbre} às ${hhmm(horario[0] * 60)}` };
    }
  }
  return { aberto: false, texto: "fechado" };
}
