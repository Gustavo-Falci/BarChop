import type { Prisma } from "@barchop/database";
import type { PreviaDaMudanca, ProximoCompromisso } from "@barchop/types";
import { duracaoDaMudanca, fimDaMudanca, limiteDepois } from "@barchop/scheduling";
import { diaEstaFechado } from "./caixa";
import { aplicarBloqueios, carregarServicos, contextoDoDia, garantirServicosDoProfissional } from "./disponibilidade";
import { ErroDeNegocio } from "./erro-negocio";
import { ErroHttp } from "./erro-http";
import { agoraNaBarbearia, dateParaData, dateParaHora, horaParaDate } from "./horas";
import { carregarRegras } from "./regras";
import { nomeParaEmail, primeiroNomeParaEmail } from "./texto-de-email";

// Mudar os serviços de um agendamento que já existe (pedido do dono,
// 22/11/2026; plano `mudar-servicos-do-agendamento`). O corpo é a lista
// final: o que já estava e ficou mantém o preço e a duração congelados;
// o que sai, sai; o que entra, entra com o preço e a duração de hoje. A
// conta do tempo mora em @barchop/scheduling (limiteDepois,
// duracaoDaMudanca, fimDaMudanca).

// Os tipos da resposta moram em @barchop/types, com o client.
export type { PreviaDaMudanca, ProximoCompromisso, ServicoDaMudanca } from "@barchop/types";

const INCLUDE_DA_MUDANCA = {
  servicos: { include: { servico: { select: { nome: true } } } },
  pagamento: { select: { id: true } },
} as const;

const STATUS_QUE_MUDAM = new Set(["pendente", "confirmado", "concluido"]);

const MINUTO = 60_000;

function centavos(preco: Prisma.Decimal | string): number {
  return Math.round(Number(preco.toString()) * 100);
}

function emDecimal(totalEmCentavos: number): string {
  return (totalEmCentavos / 100).toFixed(2);
}

// Tudo que decide a mudança, sem gravar: a prévia é isto, e o PUT
// também passa por aqui (dentro da transação, depois de travar a linha).
// Recusa com ErroDeNegocio/ErroHttp; serve, devolve a prévia e o que a
// gravação precisa.
export async function prepararMudanca(
  tx: Prisma.TransactionClient,
  params: { barbeariaId: string; onde: Prisma.AgendamentoWhereInput; servicoIds: string[] }
) {
  const { barbeariaId, onde, servicoIds } = params;

  // O do colega não existe pro profissional: 404, como no GET (o `onde`
  // vem com o agendaVisivel da rota).
  const agendamento = await tx.agendamento.findFirstOrThrow({ where: onde, include: INCLUDE_DA_MUDANCA });

  // Antes do status: o pagamento conclui o atendimento, e "concluido não
  // pode" não diria o que fazer (mesma frase do remarcar).
  if (agendamento.pagamento) {
    throw new ErroHttp(
      409,
      "com_pagamento",
      "esse atendimento já tem pagamento no caixa: tire o pagamento antes de mudar os serviços"
    );
  }
  if (!STATUS_QUE_MUDAM.has(agendamento.status)) {
    throw new ErroDeNegocio(`agendamento ${agendamento.status} não pode ser alterado`, "status_nao_permite");
  }
  // De hoje em diante, mesmo já começado: o cliente na cadeira pede mais
  // um serviço. Comparação de string, como no garantirAlteravel.
  if (dateParaData(agendamento.data) < agoraNaBarbearia().data) {
    throw new ErroDeNegocio("esse agendamento já passou", "agendamento_passado");
  }
  if (await diaEstaFechado(tx, barbeariaId, agendamento.data)) {
    throw new ErroHttp(409, "dia_fechado", "o caixa deste dia está fechado: o dono precisa reabrir");
  }

  const pedidos = new Set(servicoIds);
  const ficam = agendamento.servicos.filter((servico) => pedidos.has(servico.servicoId));
  const saem = agendamento.servicos.filter((servico) => !pedidos.has(servico.servicoId));
  const jaTem = new Set(agendamento.servicos.map((servico) => servico.servicoId));
  const idsNovos = servicoIds.filter((id) => !jaTem.has(id));

  // Só os novos passam pelas regras de hoje (ativo, da barbearia, o
  // profissional faz). O que já estava fica, mesmo inativo hoje.
  const novos = idsNovos.length > 0 ? (await carregarServicos(tx, barbeariaId, idsNovos)).servicos : [];
  if (idsNovos.length > 0) await garantirServicosDoProfissional(tx, agendamento.barbeiroId, idsNovos);
  // Na ordem pedida: é a ordem da tela e do e-mail.
  novos.sort((a, b) => idsNovos.indexOf(a.id) - idsNovos.indexOf(b.id));

  const horaInicio = dateParaHora(agendamento.horaInicio);
  const horaFimAtual = dateParaHora(agendamento.horaFim);
  const duracaoAtual = (agendamento.horaFim.getTime() - agendamento.horaInicio.getTime()) / MINUTO;
  const somaQueFica = ficam.reduce((soma, servico) => soma + servico.duracaoNoMomento, 0);
  const somaNova = novos.reduce((soma, servico) => soma + servico.duracaoMinutos, 0);
  const previstoMinutos = duracaoDaMudanca({ duracaoAtual, somaQueFica, somaNova });

  // O dia do profissional, como na criação: a janela cruzada com a
  // jornada, as pausas, os bloqueios e os outros atendimentos (sem o
  // próprio e sem os cancelados, como a EXCLUDE).
  const contexto = await contextoDoDia(tx, {
    barbeariaId,
    barbeiroId: agendamento.barbeiroId,
    data: agendamento.data,
  });
  const { janela, ocupados: bloqueados } = aplicarBloqueios(contexto.janela, contexto.bloqueios, agendamento.data);
  const atendimentos = await tx.agendamento.findMany({
    where: {
      barbeiroId: agendamento.barbeiroId,
      data: agendamento.data,
      status: { not: "cancelado" },
      id: { not: agendamento.id },
    },
    select: { horaInicio: true, horaFim: true, cliente: { select: { nome: true } } },
  });
  const regras = await carregarRegras(tx, barbeariaId);

  const ocupados: { horaInicio: string; horaFim: string; proximo: ProximoCompromisso }[] = [
    ...atendimentos.map((outro) => ({
      horaInicio: dateParaHora(outro.horaInicio),
      horaFim: dateParaHora(outro.horaFim),
      proximo: {
        tipo: "atendimento" as const,
        cliente: outro.cliente.nome,
        horaInicio: dateParaHora(outro.horaInicio),
      },
    })),
    ...contexto.pausas.map((pausa) => ({
      horaInicio: dateParaHora(pausa.horaInicio),
      horaFim: dateParaHora(pausa.horaFim),
      proximo: { tipo: "pausa" as const, horaInicio: dateParaHora(pausa.horaInicio) },
    })),
    ...bloqueados.map((bloqueio) => ({
      horaInicio: dateParaHora(bloqueio.horaInicio),
      horaFim: dateParaHora(bloqueio.horaFim),
      proximo: { tipo: "bloqueio" as const, horaInicio: dateParaHora(bloqueio.horaInicio) },
    })),
  ];

  const { limite, indice } = limiteDepois({
    horarioFuncionamento: {
      horaAbertura: janela.horaAbertura ? dateParaHora(janela.horaAbertura) : null,
      horaFechamento: janela.horaFechamento ? dateParaHora(janela.horaFechamento) : null,
      fechado: janela.fechado,
    },
    ocupados,
    horaFimAtual,
    cabeAntesDeFechar: regras.cabeAntesDeFechar,
  });
  const fim = fimDaMudanca({ horaInicio, previstoMinutos, limite });

  const somaDosServicos = somaQueFica + somaNova;
  const duracaoGravada = horaParaDate(fim.horaFim).getTime() / MINUTO - horaParaDate(horaInicio).getTime() / MINUTO;
  const totalAntes = agendamento.servicos.reduce((soma, servico) => soma + centavos(servico.precoNoMomento), 0);
  const totalDepois =
    ficam.reduce((soma, servico) => soma + centavos(servico.precoNoMomento), 0) +
    novos.reduce((soma, servico) => soma + centavos(servico.preco), 0);

  const previa: PreviaDaMudanca = {
    cabe: fim.cabe,
    previstoMinutos,
    terminaPrevisto: fim.terminaPrevisto,
    horaFim: fim.horaFim,
    limite,
    proximo: indice === null ? { tipo: "expediente" } : ocupados[indice]!.proximo,
    duracaoDosServicos: somaDosServicos,
    encaixe: duracaoGravada < somaDosServicos,
    entram: novos.map((servico) => ({
      servicoId: servico.id,
      nome: servico.nome,
      duracaoMinutos: servico.duracaoMinutos,
      preco: servico.preco.toFixed(2),
    })),
    saem: saem.map((servico) => ({
      servicoId: servico.servicoId,
      nome: servico.servico.nome,
      duracaoMinutos: servico.duracaoNoMomento,
      preco: servico.precoNoMomento.toFixed(2),
    })),
    totalAntes: emDecimal(totalAntes),
    totalDepois: emDecimal(totalDepois),
  };

  return { agendamento, previa, novos, saem };
}

export type MudancaPreparada = Awaited<ReturnType<typeof prepararMudanca>>;

// Grava o que o prepararMudanca decidiu. Sem nada que entre ou saia, não
// toca no banco (o clique duplo, depois da trava, cai aqui).
export async function gravarMudanca(tx: Prisma.TransactionClient, mudanca: MudancaPreparada): Promise<boolean> {
  const { agendamento, previa, novos, saem } = mudanca;
  if (novos.length === 0 && saem.length === 0) return false;

  if (saem.length > 0) {
    await tx.agendamentoServico.deleteMany({ where: { id: { in: saem.map((servico) => servico.id) } } });
  }
  if (novos.length > 0) {
    await tx.agendamentoServico.createMany({
      data: novos.map((servico) => ({
        agendamentoId: agendamento.id,
        servicoId: servico.id,
        // Congelados, como na criação: o histórico diz quanto foi cobrado.
        precoNoMomento: servico.preco,
        duracaoNoMomento: servico.duracaoMinutos,
      })),
    });
  }
  // `periodo` é coluna gerada: o UPDATE recalcula, e a EXCLUDE
  // sem_conflito_horario segue valendo (migration init).
  await tx.agendamento.update({
    where: { id: agendamento.id },
    data: { horaFim: horaParaDate(previa.horaFim) },
  });
  return true;
}

const DIA_DA_SEMANA = new Intl.DateTimeFormat("pt-BR", {
  weekday: "long",
  day: "2-digit",
  month: "2-digit",
  // `@db.Date` chega como meia-noite UTC (ver lembrete.ts).
  timeZone: "UTC",
});

function reais(preco: string): string {
  return `R$ ${preco.replace(".", ",")}`;
}

function linhasDaMudanca(previa: PreviaDaMudanca, servicosAgora: string[]): string {
  const linhas = [
    ...previa.entram.map((servico) => `Entrou: ${nomeParaEmail(servico.nome, "serviço")} (${reais(servico.preco)}).`),
    ...previa.saem.map((servico) => `Saiu: ${nomeParaEmail(servico.nome, "serviço")} (${reais(servico.preco)}).`),
    `Agora: ${servicosAgora.map((nome) => nomeParaEmail(nome, "serviço")).join(" + ")}.`,
    `Total: ${reais(previa.totalDepois)}.`,
  ];
  return linhas.join("\n");
}

export interface DadosDoAviso {
  previa: PreviaDaMudanca;
  servicosAgora: string[];
  data: Date;
  horaInicio: string;
  cliente: string;
  barbearia: string;
  barbeiro: string;
}

// Pro cliente: os serviços e o total. Sem hora de término e sem a
// palavra encaixe — isso é da agenda da barbearia (decisão do dono).
export function textoDosServicosMudados(dados: DadosDoAviso): string {
  return (
    `Olá, ${primeiroNomeParaEmail(dados.cliente)}! A ${nomeParaEmail(dados.barbearia)} mudou os serviços do seu ` +
    `horário de ${DIA_DA_SEMANA.format(dados.data)}, às ${dados.horaInicio}, ` +
    `com ${nomeParaEmail(dados.barbeiro, "a equipe")}.\n\n` +
    `${linhasDaMudanca(dados.previa, dados.servicosAgora)}\n\n` +
    "Se tiver alguma dúvida, fale com a barbearia."
  );
}

// Pro barbeiro do atendimento, quando quem mudou foi outra pessoa: a
// mudança e como ficou a agenda dele, com o encaixe.
export function textoDosServicosMudadosProBarbeiro(dados: DadosDoAviso & { quemMudou: string }): string {
  const { previa } = dados;
  const encaixe = previa.encaixe ? `, como encaixe (os serviços têm ${previa.duracaoDosServicos} min)` : "";
  return (
    `Olá, ${primeiroNomeParaEmail(dados.barbeiro)}! ${nomeParaEmail(dados.quemMudou, "a equipe")} mudou os serviços ` +
    `do atendimento de ${nomeParaEmail(dados.cliente, "um cliente")}: ${DIA_DA_SEMANA.format(dados.data)}, ` +
    `às ${dados.horaInicio}.\n\n` +
    `${linhasDaMudanca(previa, dados.servicosAgora)}\n\n` +
    `Na sua agenda: ${dados.horaInicio} – ${previa.horaFim}${encaixe}.`
  );
}

