import type { OcupacaoDoDia } from "@barchop/types";
import { dateParaHora } from "./horas";
import {
  aplicarBloqueios,
  janelaEfetiva,
  pausaComoOcupado,
  PODE_ATENDER,
  type ClientePrisma,
  type IntervaloOcupado,
  type LinhaDeHorario,
} from "./disponibilidade";

// A ocupação do Hoje (painel v2, marco 4): quanto do dia de trabalho de
// cada profissional já está agendado. A janela é a mesma da agenda
// pública — data especial, jornada, pausa e bloqueios —, e por isso sai
// das funções de disponibilidade.ts, nunca de uma cópia no painel.

// Os mesmos do "previsto do dia" do painel: cancelado e falta devolvem
// o horário.
const OCUPAM = ["pendente", "confirmado", "concluido"] as const;

const MINUTO = 60_000;

// Horas como Date em 1970-01-01 UTC (horaParaDate): getTime ordena igual
// ao relógio, e a diferença dá os minutos.
function emMinutos(hora: Date): number {
  return hora.getTime() / MINUTO;
}

// A janela menos a união dos descontos (pausa e bloqueios de horas):
// pausa e bloqueio que se sobrepõem descontam uma vez só, e o que cai
// fora da janela não desconta nada.
export function minutosDeTrabalho(janela: LinhaDeHorario, descontos: IntervaloOcupado[]): number {
  if (janela.fechado || !janela.horaAbertura || !janela.horaFechamento) return 0;
  const inicio = emMinutos(janela.horaAbertura);
  const fim = emMinutos(janela.horaFechamento);

  const recortados = descontos
    .map((faixa) => [Math.max(inicio, emMinutos(faixa.horaInicio)), Math.min(fim, emMinutos(faixa.horaFim))])
    .filter(([de, ate]) => de < ate)
    .sort((a, b) => a[0] - b[0]);

  let descontado = 0;
  let cobertoAte = inicio;
  for (const [de, ate] of recortados) {
    const comeco = Math.max(de, cobertoAte);
    if (ate > comeco) descontado += ate - comeco;
    cobertoAte = Math.max(cobertoAte, ate);
  }
  return fim - inicio - descontado;
}

export function minutosAgendados(
  agendamentos: { horaInicio: Date; horaFim: Date; status: string }[]
): number {
  return agendamentos
    .filter((agendamento) => (OCUPAM as readonly string[]).includes(agendamento.status))
    .reduce((total, agendamento) => total + emMinutos(agendamento.horaFim) - emMinutos(agendamento.horaInicio), 0);
}

// Uma consulta por tabela, como o `agendaDoPeriodo`, e o resto em
// memória. `somente` restringe a um membro: o profissional vê só a dele.
export async function ocupacaoDoDia(
  db: ClientePrisma,
  params: { barbeariaId: string; data: Date; dataIso: string; somente?: string }
): Promise<OcupacaoDoDia> {
  const { barbeariaId, data, dataIso, somente } = params;
  // getUTCDay: a Date foi construída em UTC por dataParaDate.
  const diaSemana = data.getUTCDay();

  const membros = await db.barbeiro.findMany({
    where: { barbeariaId, ...PODE_ATENDER, ...(somente ? { id: somente } : {}) },
    orderBy: [{ criadoEm: "asc" }, { id: "asc" }],
    select: { id: true, nome: true },
  });
  const ids = membros.map((membro) => membro.id);

  const [funcionamento, excecao, jornadas, bloqueios, agendamentos] = await Promise.all([
    db.horarioFuncionamento.findUnique({
      where: { barbeariaId_diaSemana: { barbeariaId, diaSemana } },
    }),
    db.excecaoHorario.findUnique({
      where: { barbeariaId_data: { barbeariaId, data } },
      select: { horaAbertura: true, horaFechamento: true, fechado: true },
    }),
    db.jornadaProfissional.findMany({ where: { barbeiroId: { in: ids }, diaSemana } }),
    db.bloqueio.findMany({
      where: { barbeiroId: { in: ids }, dataInicio: { lte: data }, dataFim: { gte: data } },
      select: { barbeiroId: true, dataInicio: true, dataFim: true, horaInicio: true, horaFim: true },
    }),
    db.agendamento.findMany({
      where: { barbeariaId, barbeiroId: { in: ids }, data, status: { in: [...OCUPAM] } },
      select: { barbeiroId: true, horaInicio: true, horaFim: true, status: true },
    }),
  ]);

  const profissionais = membros.map((membro) => {
    const jornada = jornadas.find((dia) => dia.barbeiroId === membro.id) ?? null;
    const expediente = janelaEfetiva(excecao ?? funcionamento, jornada);
    const { janela, ocupados: bloqueados } = aplicarBloqueios(
      expediente,
      bloqueios.filter((bloqueio) => bloqueio.barbeiroId === membro.id),
      data
    );
    const [pausa] = pausaComoOcupado(jornada);
    const aberto = !expediente.fechado && expediente.horaAbertura && expediente.horaFechamento;
    return {
      id: membro.id,
      nome: membro.nome,
      minutosDeTrabalho: minutosDeTrabalho(janela, [...bloqueados, ...pausaComoOcupado(jornada)]),
      minutosAgendados: minutosAgendados(
        agendamentos.filter((agendamento) => agendamento.barbeiroId === membro.id)
      ),
      // O expediente ANTES dos bloqueios: a agenda desenha o bloqueio
      // por cima, com o motivo, e sombreia só o que é fechado de fato.
      janela: aberto
        ? { abre: dateParaHora(expediente.horaAbertura!), fecha: dateParaHora(expediente.horaFechamento!) }
        : null,
      pausa: aberto && pausa ? { inicio: dateParaHora(pausa.horaInicio), fim: dateParaHora(pausa.horaFim) } : null,
    };
  });

  return {
    data: dataIso,
    casa: {
      minutosDeTrabalho: profissionais.reduce((total, p) => total + p.minutosDeTrabalho, 0),
      minutosAgendados: profissionais.reduce((total, p) => total + p.minutosAgendados, 0),
    },
    profissionais,
  };
}
