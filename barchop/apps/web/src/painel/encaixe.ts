// O encaixe na agenda (pedido do barbeiro, 08/11/2026; PR 4 do plano
// encaixe-e-horario-quebrado). Sem coluna nem campo na API: encaixe é o
// agendamento que termina antes do que os serviços somam.

const emMinutos = (hora: string) => {
  const [h, m] = hora.split(":").map(Number);
  return h * 60 + m;
};

const emHora = (minutos: number) =>
  `${String(Math.floor(minutos / 60)).padStart(2, "0")}:${String(minutos % 60).padStart(2, "0")}`;

export interface Encaixe {
  minutos: number;
  dosServicos: number;
  servicos: number;
}

export function encaixeDe(agendamento: {
  horaInicio: string;
  horaFim: string;
  servicos: { duracaoNoMomento: number }[];
}): Encaixe | null {
  const minutos = emMinutos(agendamento.horaFim) - emMinutos(agendamento.horaInicio);
  const dosServicos = agendamento.servicos.reduce((soma, s) => soma + s.duracaoNoMomento, 0);
  return minutos < dosServicos ? { minutos, dosServicos, servicos: agendamento.servicos.length } : null;
}

// "15 min (o serviço tem 30)", ou "(os serviços têm 75)".
export function textoDoEncaixe(encaixe: Encaixe): string {
  const quem = encaixe.servicos > 1 ? "os serviços têm" : "o serviço tem";
  return `${encaixe.minutos} min (${quem} ${encaixe.dosServicos})`;
}

export interface Buraco {
  inicio: string;
  fim: string;
  minutos: number;
  // Com menos de 30 min, o buraco é um encaixe: a duração que o Novo
  // agendamento recebe, de 5 em 5 e até 25 (as do passo Duração).
  duracao?: number;
}

export interface ExpedienteDoDia {
  janela: { abre: string; fecha: string } | null;
  // Uma lista desde já: as várias pausas (passo 4) só mudam o que entra.
  pausas: { inicio: string; fim: string }[];
}

const MENOR_BURACO = 5;
const ATE_ONDE_E_ENCAIXE = 30;
const MAIOR_ENCAIXE = 25;

// Os horários livres entre dois ocupados do mesmo profissional (antes
// do primeiro e depois do último, não: aí é o horário livre de sempre).
// A pausa corta o buraco; a janela o recorta. `desde` (hoje, a hora de
// agora): o buraco que já começou fica de fora — marcar lá seria no
// passado.
export function buracosDoDia(
  ocupados: { inicio: string; fim: string }[],
  expediente: ExpedienteDoDia,
  desde?: string
): Buraco[] {
  const { janela } = expediente;
  if (!janela) return [];
  const abre = emMinutos(janela.abre);
  const fecha = emMinutos(janela.fecha);
  const pausas = expediente.pausas.map((p) => [emMinutos(p.inicio), emMinutos(p.fim)] as const);

  const ordenados = [...ocupados]
    .map((o) => [emMinutos(o.inicio), emMinutos(o.fim)] as const)
    .sort((a, b) => a[0] - b[0]);
  const vaos: [number, number][] = [];
  let cursor: number | null = null;
  for (const [inicio, fim] of ordenados) {
    if (cursor !== null && inicio > cursor) vaos.push([cursor, inicio]);
    cursor = cursor === null ? fim : Math.max(cursor, fim);
  }

  // Cada vão, menos as pausas, dentro da janela.
  const pedacos = vaos.flatMap(([inicio, fim]) => {
    let restos: [number, number][] = [[Math.max(inicio, abre), Math.min(fim, fecha)]];
    for (const [pi, pf] of pausas) {
      restos = restos.flatMap(([a, b]): [number, number][] =>
        pf <= a || b <= pi ? [[a, b]] : ([[a, pi], [pf, b]] as [number, number][]).filter(([x, y]) => y > x)
      );
    }
    return restos;
  });

  const aPartirDe = desde ? emMinutos(desde) : -1;
  return pedacos
    .filter(([inicio, fim]) => fim - inicio >= MENOR_BURACO && inicio >= aPartirDe)
    .map(([inicio, fim]) => {
      const minutos = fim - inicio;
      const buraco: Buraco = { inicio: emHora(inicio), fim: emHora(fim), minutos };
      if (minutos < ATE_ONDE_E_ENCAIXE) buraco.duracao = Math.floor(Math.min(minutos, MAIOR_ENCAIXE) / 5) * 5;
      return buraco;
    });
}
