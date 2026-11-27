import { agendaDoPeriodo, descartarPassados, type ClientePrisma } from "./disponibilidade";
import { dataParaDate, dateParaData } from "./horas";
import { oQueOLinkOferece } from "./proximos-horarios";
import { gradeDe } from "./regras";

const UM_DIA = 24 * 60 * 60 * 1000;

// A agenda está cheia quando o link não oferece mais nenhum horário até o
// fim da janela de agendamento (PRD agenda-cheia). A conta é a mesma dos
// próximos horários — o "qualquer um" de cada serviço, com as regras do
// cliente —, só que olhando a janela inteira e parando no primeiro
// horário livre que achar, do serviço mais curto pro mais longo.
//
// Não é cheia:
// - sem limite de dias (`janelaDias` nulo): não há "fim" pra encher;
// - sem serviço que alguém do link faça: a página nem mostra serviços;
// - sem nenhum agendamento no período: a barbearia está fechada ou
//   bloqueada, e "todos os horários estão reservados" seria mentira.
export async function agendaCheia(
  db: ClientePrisma,
  params: { barbeariaId: string; agora: { data: string; hora: string } }
): Promise<boolean> {
  return (await agendaCheiaAte(db, params)) !== null;
}

// A mesma conta, devolvendo o último dia cheio ("2026-12-04") pros
// avisos do dono (lib/agenda-cheia-avisos.ts); null = não está cheia.
export async function agendaCheiaAte(
  db: ClientePrisma,
  params: { barbeariaId: string; agora: { data: string; hora: string } }
): Promise<string | null> {
  const { barbeariaId, agora } = params;
  const { servicos, doLink, regras, candidatosDe } = await oQueOLinkOferece(db, barbeariaId);
  if (regras.janelaDias === null) return null;

  const feitos = servicos
    .map((servico) => ({ ...servico, candidatos: candidatosDe(servico.id) }))
    .filter((servico) => servico.candidatos.length > 0)
    .sort((a, b) => a.duracaoMinutos - b.duracaoMinutos);
  if (feitos.length === 0) return null;

  // O último dia que o cliente ainda marca: hoje + janelaDias, como na
  // regraQueRecusa (@barchop/formato).
  const primeiroDia = dataParaDate(agora.data);
  const ultimoDia = new Date(primeiroDia.getTime() + regras.janelaDias * UM_DIA);
  const barbeiroIds = doLink.map((membro) => membro.id);

  const [horariosDoDia, reservados] = await Promise.all([
    agendaDoPeriodo(db, { barbeariaId, barbeiroIds, primeiroDia, ultimoDia, grade: gradeDe(regras, true) }),
    db.agendamento.count({
      where: {
        barbeiroId: { in: barbeiroIds },
        data: { gte: primeiroDia, lte: ultimoDia },
        status: { not: "cancelado" },
      },
    }),
  ]);
  if (reservados === 0) return null;

  for (let i = 0; i <= regras.janelaDias; i++) {
    const data = new Date(primeiroDia.getTime() + i * UM_DIA);
    const chave = dateParaData(data);
    for (const servico of feitos) {
      const livres = servico.candidatos.flatMap((id) => horariosDoDia(id, data, servico.duracaoMinutos));
      if (descartarPassados({ data: chave, horarios: livres, agora, regras }).length > 0) return null;
    }
  }
  return dateParaData(ultimoDia);
}
