import { agendaDoPeriodo, descartarPassados, type ClientePrisma } from "./disponibilidade";
import { dataParaDate, dateParaData } from "./horas";
import { oQueOLinkOferece } from "./proximos-horarios";
import { gradeDe } from "./regras";

const UM_DIA = 24 * 60 * 60 * 1000;

type Agora = { data: string; hora: string };

// A agenda está cheia quando o link não oferece mais nenhum horário até o
// fim da janela de agendamento (PRD agenda-cheia). A conta é a mesma dos
// próximos horários — o "qualquer um" de cada serviço, com as regras do
// cliente —, só que olhando a janela inteira.
//
// Não é cheia:
// - sem limite de dias (`janelaDias` nulo): não há "fim" pra encher;
// - sem serviço que alguém do link faça: a página nem mostra serviços;
// - sem nenhum agendamento no período: a barbearia está fechada ou
//   bloqueada, e "todos os horários estão reservados" seria mentira.
export async function agendaCheia(db: ClientePrisma, params: { barbeariaId: string; agora: Agora }): Promise<boolean> {
  return (await agendaCheiaAte(db, params)) !== null;
}

// A mesma conta, devolvendo o último dia cheio ("2026-12-04") pros
// avisos do dono (lib/agenda-cheia-avisos.ts); null = não está cheia.
export async function agendaCheiaAte(
  db: ClientePrisma,
  params: { barbeariaId: string; agora: Agora }
): Promise<string | null> {
  return (await lotacaoDoLink(db, params)).barbearia;
}

export interface LotacaoDoLink {
  // O último dia cheio da barbearia; null = o link ainda oferece horário.
  barbearia: string | null;
  // O mesmo, por profissional do link (plano agenda-cheia-profissional):
  // cheio quando o link não oferece horário dele pra nenhum serviço que
  // ele faz, e ele tem agendamento no período (as regras de cima, por
  // profissional).
  profissionais: Map<string, string | null>;
}

// A barbearia e cada profissional numa passada só, com as mesmas
// consultas: a barbearia está cheia exatamente quando nenhum profissional
// tem horário — as duas contas não têm como discordar.
export async function lotacaoDoLink(
  db: ClientePrisma,
  params: { barbeariaId: string; agora: Agora }
): Promise<LotacaoDoLink> {
  const { barbeariaId, agora } = params;
  const { servicos, doLink, regras, candidatosDe } = await oQueOLinkOferece(db, barbeariaId);
  const barbeiroIds = doLink.map((membro) => membro.id);
  const ninguemCheio: LotacaoDoLink = {
    barbearia: null,
    profissionais: new Map(barbeiroIds.map((id) => [id, null])),
  };
  if (regras.janelaDias === null) return ninguemCheio;

  // Do mais curto pro mais longo: o serviço curto é o que acha um buraco
  // primeiro.
  const feitos = servicos
    .map((servico) => ({ ...servico, candidatos: candidatosDe(servico.id) }))
    .filter((servico) => servico.candidatos.length > 0)
    .sort((a, b) => a.duracaoMinutos - b.duracaoMinutos);
  if (feitos.length === 0) return ninguemCheio;

  // O último dia que o cliente ainda marca: hoje + janelaDias, como na
  // regraQueRecusa (@barchop/formato).
  const primeiroDia = dataParaDate(agora.data);
  const ultimoDia = new Date(primeiroDia.getTime() + regras.janelaDias * UM_DIA);

  const [horariosDoDia, comAgendamento] = await Promise.all([
    agendaDoPeriodo(db, { barbeariaId, barbeiroIds, primeiroDia, ultimoDia, grade: gradeDe(regras, true) }),
    db.agendamento.findMany({
      where: {
        barbeiroId: { in: barbeiroIds },
        data: { gte: primeiroDia, lte: ultimoDia },
        status: { not: "cancelado" },
      },
      select: { barbeiroId: true },
      distinct: ["barbeiroId"],
    }),
  ]);
  const reservados = new Set(comAgendamento.map((linha) => linha.barbeiroId));

  // Para no primeiro horário livre que achar.
  const temHorario = (barbeiroId: string): boolean => {
    const dele = feitos.filter((servico) => servico.candidatos.includes(barbeiroId));
    for (let i = 0; i <= regras.janelaDias!; i++) {
      const data = new Date(primeiroDia.getTime() + i * UM_DIA);
      const chave = dateParaData(data);
      for (const servico of dele) {
        const livres = horariosDoDia(barbeiroId, data, servico.duracaoMinutos);
        if (descartarPassados({ data: chave, horarios: livres, agora, regras }).length > 0) return true;
      }
    }
    return false;
  };

  const ate = dateParaData(ultimoDia);
  const profissionais = new Map<string, string | null>();
  let alguemComHorario = false;
  for (const id of barbeiroIds) {
    const faz = feitos.some((servico) => servico.candidatos.includes(id));
    const livre = faz && temHorario(id);
    if (livre) alguemComHorario = true;
    profissionais.set(id, faz && !livre && reservados.has(id) ? ate : null);
  }

  return { barbearia: !alguemComHorario && reservados.size > 0 ? ate : null, profissionais };
}
