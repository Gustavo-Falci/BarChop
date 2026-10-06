import type { HorarioSerializado } from "@barchop/types";

// A rotina da semana dos Horários (painel v2, marco 2): os dias em que a
// barbearia abre e um horário só. É um atalho pra preencher a semana —
// quem vai pra API continua sendo a semana de sete dias, que pode ter um
// dia com horário diferente da rotina.
export interface Rotina {
  // 0 = domingo … 6 = sábado, como `diaSemana`.
  dias: number[];
  abre: string;
  fecha: string;
}

const HORARIO_PADRAO = { abre: "09:00", fecha: "18:00" };

// A semana começa na segunda pro dono, como na tela e no concorrente.
export const ORDEM_DA_SEMANA = [1, 2, 3, 4, 5, 6, 0];

export const SIGLA_DO_DIA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

// A rotina que a semana salva já segue: os dias abertos e o horário que
// mais se repete entre eles (empate: o do primeiro dia na ordem da
// semana). Semana toda fechada: sem dias, com o horário padrão.
export function rotinaDaSemana(semana: HorarioSerializado[]): Rotina {
  const abertos = ORDEM_DA_SEMANA.map((dia) => semana.find((h) => h.diaSemana === dia)).filter(
    (h): h is HorarioSerializado => !!h && !h.fechado && !!h.horaAbertura && !!h.horaFechamento
  );
  if (abertos.length === 0) return { dias: [], ...HORARIO_PADRAO };

  const contagem = new Map<string, number>();
  for (const dia of abertos) {
    const chave = `${dia.horaAbertura}-${dia.horaFechamento}`;
    contagem.set(chave, (contagem.get(chave) ?? 0) + 1);
  }
  // `Map` guarda a ordem de inserção: no empate, fica o que apareceu antes.
  const [maisComum] = [...contagem.entries()].reduce((melhor, atual) => (atual[1] > melhor[1] ? atual : melhor));
  const [abre, fecha] = maisComum.split("-") as [string, string];

  return { dias: abertos.map((dia) => dia.diaSemana).sort((a, b) => a - b), abre, fecha };
}

// A semana inteira a partir da rotina: os dias marcados abrem no horário
// dela, os outros fecham. Fechado vai sem horas, como a API guarda.
export function aplicarRotina(semana: HorarioSerializado[], rotina: Rotina): HorarioSerializado[] {
  return semana.map((dia) =>
    rotina.dias.includes(dia.diaSemana)
      ? { diaSemana: dia.diaSemana, horaAbertura: rotina.abre, horaFechamento: rotina.fecha, fechado: false }
      : { diaSemana: dia.diaSemana, horaAbertura: null, horaFechamento: null, fechado: true }
  );
}

// O dia não é o que a rotina faria com ele: aberto fora dela, fechado
// num dia dela, ou aberto em outro horário.
export function difereDaRotina(dia: HorarioSerializado, rotina: Rotina): boolean {
  const naRotina = rotina.dias.includes(dia.diaSemana);
  if (dia.fechado) return naRotina;
  return !naRotina || dia.horaAbertura !== rotina.abre || dia.horaFechamento !== rotina.fecha;
}

// "Seg a sex, 09:00–18:00" — os dias em trechos seguidos na ordem da
// semana (três ou mais viram "x a y"), unidos por vírgula e "e".
export function fraseDaRotina(rotina: Rotina): string {
  if (rotina.dias.length === 0) return "Fechado a semana toda";
  const horario = `${rotina.abre}–${rotina.fecha}`;
  if (rotina.dias.length === 7) return `Todos os dias, ${horario}`;

  const posicoes = ORDEM_DA_SEMANA.map((dia, posicao) => (rotina.dias.includes(dia) ? posicao : -1)).filter(
    (posicao) => posicao >= 0
  );
  const trechos: number[][] = [];
  for (const posicao of posicoes) {
    const ultimo = trechos[trechos.length - 1];
    if (ultimo && ultimo[ultimo.length - 1] === posicao - 1) ultimo.push(posicao);
    else trechos.push([posicao]);
  }

  const sigla = (posicao: number) => SIGLA_DO_DIA[ORDEM_DA_SEMANA[posicao]!]!.toLowerCase();
  const partes = trechos.flatMap((trecho) =>
    trecho.length >= 3 ? [`${sigla(trecho[0]!)} a ${sigla(trecho[trecho.length - 1]!)}`] : trecho.map(sigla)
  );
  const lista = partes.length === 1 ? partes[0]! : `${partes.slice(0, -1).join(", ")} e ${partes[partes.length - 1]}`;

  return `${lista.charAt(0).toUpperCase()}${lista.slice(1)}, ${horario}`;
}
