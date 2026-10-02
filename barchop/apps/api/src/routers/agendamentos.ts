import { prisma } from "@barchop/database";
import { criarAgendamento, INCLUDE_AGENDAMENTO } from "../lib/agendamento";
import { ErroDeNegocio } from "../lib/erro-negocio";
import { ErroHttp, naoEncontrado } from "../lib/erro-http";
import { dataParaDate } from "../lib/horas";
import {
  PADRAO_DATA,
  PADRAO_HORA,
  PADRAO_SLUG,
  PADRAO_TELEFONE,
  PADRAO_UUID,
} from "../lib/padroes";
import {
  serializarAgendamento,
  serializarAgendamentoComCliente,
} from "../lib/serializar";
import { comRetryDeDeadlock } from "../lib/transacao";
import { normalizarTelefoneObrigatorio } from "../lib/telefone";
import type { App } from "../tipos";

// Sem `barbeariaId` e sem `origem`: os dois seriam forjáveis. O
// barbeariaId sai do token e a origem é fixa em "barbeiro" — é o que
// separa o walk-in do agendamento que o cliente fez sozinho, e a tela de
// Agenda distingue os dois.
const corpoNovoAgendamento = {
  type: "object",
  additionalProperties: false,
  required: ["barbeiroId", "clienteId", "servicoIds", "data", "horaInicio"],
  properties: {
    barbeiroId: { type: "string", pattern: PADRAO_UUID },
    clienteId: { type: "string", pattern: PADRAO_UUID },
    servicoIds: {
      type: "array",
      minItems: 1,
      maxItems: 10,
      items: { type: "string", pattern: PADRAO_UUID },
    },
    data: { type: "string", pattern: PADRAO_DATA },
    horaInicio: { type: "string", pattern: PADRAO_HORA },
    observacoes: { type: "string", maxLength: 500 },
  },
} as const;

const paramsComId = {
  type: "object",
  required: ["id"],
  additionalProperties: false,
  properties: { id: { type: "string", pattern: PADRAO_UUID } },
} as const;

// Só status e observações. Data, hora e serviços ficam de fora: remarcar
// está fora de escopo (cancela e cria outro), e aceitar data/hora aqui
// pularia a checagem de disponibilidade inteira.
const corpoPatchAgendamento = {
  type: "object",
  additionalProperties: false,
  minProperties: 1,
  properties: {
    status: {
      type: "string",
      enum: ["pendente", "confirmado", "concluido", "cancelado", "no_show"],
    },
    observacoes: { type: ["string", "null"], maxLength: 500 },
  },
} as const;

const filtroAgendamentos = {
  type: "object",
  additionalProperties: false,
  properties: {
    data: { type: "string", pattern: PADRAO_DATA },
    de: { type: "string", pattern: PADRAO_DATA },
    ate: { type: "string", pattern: PADRAO_DATA },
  },
} as const;

// Um dia em milissegundos — o intervalo é fechado nas duas pontas, daí
// o `+ 1` na contagem.
const UM_DIA = 24 * 60 * 60 * 1000;
const MAXIMO_DE_DIAS = 92;

// O pattern do schema garante a forma "YYYY-MM-DD", não que a data
// exista: "2026-02-31" passa por ele e explode no dataParaDate. Sem este
// wrapper isso seria um RangeError não tratado, ou seja, um 500 por
// culpa de quem chamou.
function dataDoFiltro(valor: string): Date {
  try {
    return dataParaDate(valor);
  } catch {
    throw new ErroDeNegocio(`a data ${valor} não existe`, "data_invalida");
  }
}

const paramsSlug = {
  type: "object",
  required: ["slug"],
  additionalProperties: false,
  properties: { slug: { type: "string", pattern: PADRAO_SLUG } },
} as const;

// Sem `clienteId`: quem agenda pelo link não tem conta nem sabe o id de
// ninguém. Manda nome e telefone, e o telefone é o que casa com um
// cadastro existente daquela barbearia.
const corpoNovoAgendamentoPublico = {
  type: "object",
  additionalProperties: false,
  required: ["barbeiroId", "servicoIds", "data", "horaInicio", "cliente"],
  properties: {
    barbeiroId: { type: "string", pattern: PADRAO_UUID },
    servicoIds: {
      type: "array",
      minItems: 1,
      maxItems: 10,
      items: { type: "string", pattern: PADRAO_UUID },
    },
    data: { type: "string", pattern: PADRAO_DATA },
    horaInicio: { type: "string", pattern: PADRAO_HORA },
    cliente: {
      type: "object",
      additionalProperties: false,
      required: ["nome", "telefone"],
      properties: {
        nome: { type: "string", minLength: 2, maxLength: 120 },
        telefone: { type: "string", pattern: PADRAO_TELEFONE, maxLength: 20 },
      },
    },
    observacoes: { type: "string", maxLength: 500 },
  },
} as const;

export function registrarRotasAgendamentos(app: App): void {
  app.post(
    "/agendamentos",
    { schema: { body: corpoNovoAgendamento } },
    async (request, reply) => {
      const barbeariaId = request.user.barbeariaId;
      const { clienteId, ...resto } = request.body;

      // O retry existe porque dois pedidos simultâneos no mesmo horário
      // podem virar impasse no Postgres em vez de violação da
      // constraint — e aí a resposta certa (409) viraria 500.
      const agendamento = await comRetryDeDeadlock(() =>
        prisma.$transaction(async (tx) => {
          // O cliente também tem que ser desta barbearia. Mesma resposta
          // que GET /clientes/:id dá pro cliente alheio: 404, sem
          // confirmar que o id existe em algum lugar da plataforma.
          const cliente = await tx.cliente.findFirst({
            where: { id: clienteId, barbeariaId },
            select: { id: true },
          });
          if (!cliente) throw naoEncontrado("cliente não encontrado");

          return criarAgendamento(tx, {
            ...resto,
            barbeariaId,
            clienteId,
            origem: "barbeiro",
          });
        })
      );

      return reply.code(201).send(serializarAgendamentoComCliente(agendamento));
    }
  );

  app.get(
    "/agendamentos",
    { schema: { querystring: filtroAgendamentos } },
    async (request) => {
      const { data, de, ate } = request.query;

      const temDia = data !== undefined;
      const temIntervalo = de !== undefined || ate !== undefined;

      // Exatamente uma das duas formas. As duas juntas seriam ambíguas;
      // nenhuma devolveria a base inteira, e a tela não pagina isso.
      if (temDia === temIntervalo) {
        throw new ErroHttp(
          400,
          "requisicao_invalida",
          "informe ou `data`, ou o par `de` e `ate`"
        );
      }

      if (temIntervalo && (de === undefined || ate === undefined)) {
        throw new ErroHttp(
          400,
          "requisicao_invalida",
          "o intervalo precisa de `de` e `ate`"
        );
      }

      const inicio = dataDoFiltro(temDia ? data : de!);
      const fim = dataDoFiltro(temDia ? data : ate!);

      if (fim.getTime() < inicio.getTime()) {
        throw new ErroDeNegocio(
          "`ate` não pode ser antes de `de`",
          "intervalo_invalido"
        );
      }

      // Teto de 92 dias: a agenda é uma tela de dia ou de trimestre, e
      // sem limite um `de=2020&ate=2030` puxaria a base inteira.
      const dias = (fim.getTime() - inicio.getTime()) / UM_DIA + 1;
      if (dias > MAXIMO_DE_DIAS) {
        throw new ErroDeNegocio(
          `o intervalo não pode passar de ${MAXIMO_DE_DIAS} dias`,
          "intervalo_longo_demais"
        );
      }

      const agendamentos = await prisma.agendamento.findMany({
        // Sempre o barbeariaId do token.
        where: {
          barbeariaId: request.user.barbeariaId,
          data: { gte: inicio, lte: fim },
        },
        orderBy: [{ data: "asc" }, { horaInicio: "asc" }],
        include: INCLUDE_AGENDAMENTO,
      });

      return {
        agendamentos: agendamentos.map(serializarAgendamentoComCliente),
      };
    }
  );

  app.get(
    "/agendamentos/:id",
    { schema: { params: paramsComId } },
    async (request) => {
      const agendamento = await prisma.agendamento.findFirstOrThrow({
        where: {
          id: request.params.id,
          barbeariaId: request.user.barbeariaId,
        },
        include: INCLUDE_AGENDAMENTO,
      });

      return serializarAgendamentoComCliente(agendamento);
    }
  );

  app.patch(
    "/agendamentos/:id",
    { schema: { params: paramsComId, body: corpoPatchAgendamento } },
    async (request) => {
      // Qualquer transição de status é aceita: o barbeiro é a autoridade
      // sobre o próprio dia. A única recusa vem do banco — reativar um
      // cancelado cujo horário já foi tomado faz a linha voltar pro
      // escopo da constraint parcial, o Postgres re-checa, e o conflito
      // sai como 409.
      const agendamento = await prisma.agendamento.update({
        where: {
          id: request.params.id,
          barbeariaId: request.user.barbeariaId,
        },
        data: request.body,
        include: INCLUDE_AGENDAMENTO,
      });

      return serializarAgendamentoComCliente(agendamento);
    }
  );
}

// Pública: é a tela "Confirma e agenda", aberta pelo link do WhatsApp.
// Fica fora do escopo protegido do app.ts.
export function registrarRotasAgendamentosPublicas(app: App): void {
  app.post(
    "/barbearias/:slug/agendamentos",
    { schema: { params: paramsSlug, body: corpoNovoAgendamentoPublico } },
    async (request, reply) => {
      const { cliente: dadosCliente, ...resto } = request.body;
      // O mesmo número em formatos diferentes tem que cair no mesmo
      // cadastro — é o que faz o barbeiro reconhecer o cliente
      // recorrente, e o que a chave única não garantia sozinha.
      const telefone = normalizarTelefoneObrigatorio(dadosCliente.telefone);

      // Mesmo motivo da rota do walk-in: impasse concorrente não pode
      // sair como 500.
      const agendamento = await comRetryDeDeadlock(() =>
        prisma.$transaction(async (tx) => {
          // findUniqueOrThrow: slug inexistente vira P2025 -> 404.
          const barbearia = await tx.barbearia.findUniqueOrThrow({
            where: { slug: request.params.slug },
            select: { id: true },
          });

          // Telefone já cadastrado nesta barbearia reaproveita o
          // registro — é o que faz o barbeiro reconhecer o cliente
          // recorrente.
          //
          // `update: {}` vazio de propósito: nome divergente NÃO
          // sobrescreve o cadastrado. Quem digita o nome abreviado no
          // celular não renomeia o cadastro que o barbeiro ajustou.
          const cliente = await tx.cliente.upsert({
            where: {
              barbeariaId_telefone: {
                barbeariaId: barbearia.id,
                telefone,
              },
            },
            create: {
              barbeariaId: barbearia.id,
              nome: dadosCliente.nome,
              telefone,
            },
            update: {},
          });

          // Mesma transação do upsert: agendamento recusado desfaz o
          // cliente recém-criado junto, senão cada tentativa inválida
          // deixaria um cadastro fantasma.
          return criarAgendamento(tx, {
            ...resto,
            barbeariaId: barbearia.id,
            clienteId: cliente.id,
            origem: "cliente",
          });
        })
      );

      // Só o agendamento recém-criado, sem o cliente e sem histórico:
      // quem sabe o telefone de alguém não pode puxar a agenda dessa
      // pessoa por aqui.
      return reply.code(201).send(serializarAgendamento(agendamento));
    }
  );
}
