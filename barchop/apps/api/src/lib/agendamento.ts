import type { Prisma } from "@barchop/database";
import type { HorarioNaoCabe } from "@barchop/scheduling";
import {
  aplicarBloqueios,
  caiEmBloqueio,
  candidatosDoQualquerUm,
  carregarServicos,
  contextoDoDia,
  garantirBarbeiro,
  garantirServicosDoProfissional,
  horariosDoProfissionalNoDia,
  horariosLivres,
  horarioQueNaoCabe,
  pausaQueBate,
} from "./disponibilidade";
import { foraDoLink, garantirNoLink } from "./assinatura";
import { ErroDeNegocio } from "./erro-negocio";
import { dataParaDate, dateParaHora, horaParaDate, somarMinutos } from "./horas";
import { carregarRegras, garantirRegrasDoCliente, gradeDe } from "./regras";

// O que as rotas precisam junto do agendamento: o nome de cada serviço
// (o preço vem congelado no AgendamentoServico) e o cliente, que a
// agenda do barbeiro mostra na linha.
export const INCLUDE_AGENDAMENTO = {
  servicos: { include: { servico: { select: { nome: true } } } },
  cliente: true,
  // Com quem: o "qualquer um" só sabe depois de marcar, e a agenda da
  // equipe desenha uma coluna por profissional.
  barbeiro: { select: { id: true, nome: true } },
} as const;

// O "qualquer um" do fluxo público: entre os candidatos livres no
// horário pedido, o que tem menos agendamentos no dia — espalha o
// movimento pela equipe; empate fica com quem entrou primeiro. Roda
// dentro da transação, depois de `travarQualquerUm`, e usa a mesma
// função (e a mesma grade do cliente) que montou os horários oferecidos.
export async function escolherProfissional(
  tx: Prisma.TransactionClient,
  params: { barbeariaId: string; servicoIds: string[]; data: string; horaInicio: string }
): Promise<string> {
  const { barbeariaId, servicoIds, data, horaInicio } = params;
  const { duracaoTotalMinutos } = await carregarServicos(tx, barbeariaId, servicoIds);

  let dataDate: Date;
  try {
    dataDate = dataParaDate(data);
  } catch {
    throw new ErroDeNegocio(`a data ${data} não existe`, "data_invalida");
  }

  // Só o link escolhe: quem ficou fora pelo limite do plano não entra.
  const ocultos = await foraDoLink(tx, barbeariaId, new Date());
  const candidatos = (await candidatosDoQualquerUm(tx, barbeariaId, servicoIds)).filter(
    (id) => !ocultos.includes(id)
  );
  const grade = gradeDe(await carregarRegras(tx, barbeariaId), true);
  const livres: string[] = [];
  for (const barbeiroId of candidatos) {
    const horarios = await horariosDoProfissionalNoDia(tx, {
      barbeariaId,
      barbeiroId,
      data: dataDate,
      duracaoTotalMinutos,
      grade,
    });
    if (horarios.includes(horaInicio)) livres.push(barbeiroId);
  }

  if (livres.length === 0) {
    throw new ErroDeNegocio("esse horário não está disponível", "horario_indisponivel");
  }

  const contagem = await tx.agendamento.groupBy({
    by: ["barbeiroId"],
    where: { barbeiroId: { in: livres }, data: dataDate, status: { not: "cancelado" } },
    _count: { _all: true },
  });
  const doDia = (barbeiroId: string) =>
    contagem.find((linha) => linha.barbeiroId === barbeiroId)?._count._all ?? 0;

  // `livres` já vem na ordem de entrada: o reduce mantém o primeiro em
  // caso de empate.
  return livres.reduce((melhor, atual) => (doDia(atual) < doDia(melhor) ? atual : melhor));
}

export interface CriarAgendamentoParams {
  barbeariaId: string;
  barbeiroId: string;
  clienteId: string;
  servicoIds: string[];
  data: string; // "YYYY-MM-DD"
  horaInicio: string; // "HH:mm"
  origem: "cliente" | "barbeiro";
  observacoes?: string;
  // Só do fluxo público e do remarcar (ver lembrete.ts): o e-mail pro
  // lembrete deste agendamento, já normalizado.
  emailLembrete?: string | null;
  // Só do remarcar do cliente: o profissional é o do agendamento antigo,
  // então quem ficou fora do link pelo limite do plano ainda vale.
  remarcando?: boolean;
  // Só do painel: o encaixe, menor que a soma dos serviços. Sem ele, a
  // duração é a dos serviços.
  duracaoMinutos?: number;
}

// Recebe o `tx` em vez de abrir a própria transação: o fluxo público
// precisa do upsert do cliente na mesma transação, senão um cliente novo
// ficaria cadastrado mesmo quando o agendamento é recusado.
export async function criarAgendamento(
  tx: Prisma.TransactionClient,
  params: CriarAgendamentoParams
) {
  const { barbeariaId, barbeiroId, clienteId, horaInicio, origem, observacoes, emailLembrete } = params;

  const { servicos, dataDate, horaFim } = await conferirHorario(tx, params);

  return tx.agendamento.create({
    data: {
      barbeariaId,
      barbeiroId,
      clienteId,
      data: dataDate,
      // horaParaDate e nada de `new Date(...)`: é o que impede o fuso da
      // máquina de entrar na coluna e corromper junto o `periodo`, de
      // onde sai a trava de conflito.
      horaInicio: horaParaDate(horaInicio),
      horaFim: horaParaDate(horaFim),
      origem,
      observacoes: observacoes ?? null,
      emailLembrete: emailLembrete ?? null,
      servicos: {
        create: servicos.map((servico) => ({
          servicoId: servico.id,
          // Congelados: o histórico tem que continuar dizendo quanto foi
          // cobrado no dia, mesmo depois de o preço mudar.
          precoNoMomento: servico.preco,
          duracaoNoMomento: servico.duracaoMinutos,
        })),
      },
    },
    include: INCLUDE_AGENDAMENTO,
  });
}

export type AgendamentoCriado = Awaited<ReturnType<typeof criarAgendamento>>;

export type ConferirHorarioParams = Pick<
  CriarAgendamentoParams,
  "barbeariaId" | "barbeiroId" | "servicoIds" | "data" | "horaInicio" | "origem" | "remarcando" | "duracaoMinutos"
>;

// Tudo que decide se o horário serve, antes de gravar: o POST e a
// conferência do "Outro horário" (GET /agendamentos/cabe) passam por
// aqui, então o campo que diz "cabe" nunca leva a um 422. Recusa com
// ErroDeNegocio; serve, devolve o que a criação grava.
export async function conferirHorario(tx: Prisma.TransactionClient, params: ConferirHorarioParams) {
  const { barbeariaId, barbeiroId, servicoIds, data, horaInicio, origem, remarcando, duracaoMinutos } = params;

  await garantirBarbeiro(tx, barbeariaId, barbeiroId);
  // O cliente não marca horário novo pelo link com quem ficou fora pelo
  // limite do plano; remarcar o que já tinha, sim (decisão do dono,
  // 14/10/2026). O painel marca com qualquer um.
  if (origem === "cliente" && !remarcando) await garantirNoLink(tx, barbeariaId, barbeiroId, new Date());

  const { servicos, duracaoTotalMinutos } = await carregarServicos(
    tx,
    barbeariaId,
    servicoIds
  );

  // Do encaixe, quando o painel pede; senão a dos serviços. É ela que
  // mede tudo daqui pra baixo — o vão, a pausa, o bloqueio e o horaFim.
  const duracao = duracaoDoAtendimento(duracaoTotalMinutos, duracaoMinutos, origem === "cliente");

  // Antes do horário: com quem não faz o serviço, nenhum horário serve.
  await garantirServicosDoProfissional(tx, barbeiroId, servicoIds);

  let horaFim: string;
  try {
    horaFim = somarMinutos(horaInicio, duracao);
  } catch {
    // somarMinutos lança quando a soma passa da meia-noite. Isso é
    // pedido inválido, não bug: 422 em vez de 500.
    throw new ErroDeNegocio(
      "os serviços escolhidos passam da meia-noite",
      "duracao_invalida"
    );
  }

  // O pattern do schema garante a forma "YYYY-MM-DD", não que a data
  // exista: "2026-02-31" passa por ele e o dataParaDate lança. Sem este
  // try, seria um RangeError não tratado — 500 por culpa de quem chamou.
  let dataDate: Date;
  try {
    dataDate = dataParaDate(data);
  } catch {
    throw new ErroDeNegocio(`a data ${data} não existe`, "data_invalida");
  }

  // As regras da barbearia valem só pro cliente (marcar ou remarcar pelo
  // link). O painel encaixa livre: grade de 15 e nada de antecedência,
  // mesmo dia ou janela — e registrar um walk-in depois do fato é
  // legítimo. Antes da agenda: a recusa pela regra explica melhor que
  // "indisponível".
  const regras = await carregarRegras(tx, barbeariaId);
  const paraCliente = origem === "cliente";
  if (paraCliente) garantirRegrasDoCliente(regras, data, horaInicio);

  // A janela já cruzada com a jornada do membro, e os bloqueios do dia.
  const contexto = await contextoDoDia(tx, { barbeariaId, barbeiroId, data: dataDate });

  // Antes do cálculo dos livres: o bloqueio também sumiria de lá, mas a
  // recusa sairia como `horario_indisponivel`, sem dizer o motivo.
  if (caiEmBloqueio(contexto.bloqueios, dataDate, horaInicio, horaFim)) {
    throw new ErroDeNegocio(
      "esse horário está bloqueado na agenda do profissional",
      "horario_bloqueado"
    );
  }
  const pausa = pausaQueBate(contexto.pausa, horaInicio, horaFim);
  if (pausa) {
    throw new ErroDeNegocio(
      `esse horário cai na pausa do profissional (${faixa(pausa)})`,
      "horario_na_pausa"
    );
  }
  const { janela, ocupados: bloqueados } = aplicarBloqueios(
    contexto.janela,
    contexto.bloqueios,
    dataDate
  );

  // Só o que a trava do banco também considera: cancelado não ocupa
  // horário, o resto ocupa. As duas regras têm que concordar, senão o
  // cálculo oferece um horário que o banco recusa.
  const ocupados = await tx.agendamento.findMany({
    where: { barbeiroId, data: dataDate, status: { not: "cancelado" } },
    select: { horaInicio: true, horaFim: true, cliente: { select: { nome: true } } },
  });

  // Esta checagem e a EXCLUDE constraint do banco são redundantes de
  // propósito, e as duas ficam. Esta dá a mensagem que a tela mostra e
  // cobre o que o banco não sabe — dia fechado, fora do expediente, fora
  // da grade. A do banco é a única garantia real contra dois clientes
  // confirmando ao mesmo tempo, porque entre esta leitura e o insert
  // existe uma janela.
  const entradas = {
    janela,
    atendimentos: ocupados,
    ocupados: [...bloqueados, ...contexto.pausa],
    duracaoTotalMinutos: duracao,
    grade: gradeDe(regras, paraCliente),
  };
  if (paraCliente) {
    // O cliente só marca o que a lista dele oferece, e a recusa não diz
    // com quem bate: o nome do outro cliente não é dele.
    if (!horariosLivres(entradas).includes(horaInicio)) {
      throw new ErroDeNegocio("esse horário não está disponível", "horario_indisponivel");
    }
  } else {
    // O painel marca qualquer minuto que caiba (o "Outro horário",
    // 08/11/2026), e a recusa diz por quê.
    const recusa = horarioQueNaoCabe(entradas, horaInicio);
    if (recusa) throw new ErroDeNegocio(motivoDoPainel(recusa, janela, ocupados), "horario_indisponivel");
  }

  return { servicos, dataDate, horaFim };
}

function faixa(intervalo: { horaInicio: Date; horaFim: Date }): string {
  return `${dateParaHora(intervalo.horaInicio)} – ${dateParaHora(intervalo.horaFim)}`;
}

// A frase da recusa no painel. Bloqueio e pausa já recusaram antes com o
// código deles, então o que bate aqui é um atendimento; o resto cai na
// frase geral.
function motivoDoPainel(
  recusa: HorarioNaoCabe,
  janela: { horaAbertura: Date | null; horaFechamento: Date | null },
  atendimentos: { horaInicio: Date; horaFim: Date; cliente: { nome: string } }[]
): string {
  if (recusa.motivo === "fechado") return "o profissional não atende nesse dia";
  if (recusa.motivo === "fora_do_expediente" && janela.horaAbertura && janela.horaFechamento) {
    return `fica fora do expediente (${faixa({ horaInicio: janela.horaAbertura, horaFim: janela.horaFechamento })})`;
  }
  const outro = recusa.motivo === "ocupado" ? atendimentos[recusa.indice] : undefined;
  if (outro) {
    return `bate com ${outro.cliente.nome}, marcado das ${dateParaHora(outro.horaInicio)} às ${dateParaHora(outro.horaFim)}`;
  }
  return "esse horário não está disponível";
}

// A duração do atendimento: a dos serviços, ou a do encaixe que o painel
// escolheu (pedido do barbeiro, 08/11/2026). O encaixe é sempre menor
// que os serviços — do tamanho deles não é encaixe, e maior o painel
// marca de outro jeito. O preço não muda.
export function duracaoDoAtendimento(
  duracaoDosServicos: number,
  duracaoMinutos: number | undefined,
  paraCliente: boolean
): number {
  if (duracaoMinutos === undefined) return duracaoDosServicos;
  if (paraCliente) {
    throw new ErroDeNegocio("só a barbearia marca encaixe", "encaixe_so_no_painel");
  }
  if (duracaoMinutos >= duracaoDosServicos) {
    throw new ErroDeNegocio(
      `o encaixe tem que ser menor que os ${duracaoDosServicos} min dos serviços`,
      "encaixe_invalido"
    );
  }
  return duracaoMinutos;
}

// O encaixe não tem coluna: é o agendamento que dura menos que os
// serviços dele (a duração congelada de cada um). Devolve a duração do
// encaixe, ou null. Só o criarAgendamento grava o horaFim, e nada muda
// os serviços depois — conferido em produção em 08/11/2026: nenhum
// agendamento de antes passa por encaixe.
export function duracaoDoEncaixe(agendamento: {
  horaInicio: Date;
  horaFim: Date;
  servicos: { duracaoNoMomento: number }[];
}): number | null {
  const duracao = (agendamento.horaFim.getTime() - agendamento.horaInicio.getTime()) / 60_000;
  const dosServicos = agendamento.servicos.reduce((soma, servico) => soma + servico.duracaoNoMomento, 0);
  return duracao < dosServicos ? duracao : null;
}
