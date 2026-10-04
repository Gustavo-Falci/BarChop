import { prisma } from "@barchop/database";
import { clienteDoToken } from "../plugins/auth";
import { normalizarEmail } from "@barchop/formato";
import { criarAgendamento, INCLUDE_AGENDAMENTO } from "../lib/agendamento";
import {
  garantirAlteravel,
  garantirFuturo,
} from "../lib/agendamento-alteravel";
import { ErroDeNegocio } from "../lib/erro-negocio";
import { dataParaDate } from "../lib/horas";
import { agendarLembrete } from "../lib/lembrete";
import { comRetryDeDeadlock } from "../lib/transacao";
import { PADRAO_DATA, PADRAO_EMAIL, PADRAO_HORA, PADRAO_UUID } from "../lib/padroes";
import { serializarAgendamento, serializarCliente } from "../lib/serializar";
import type { App } from "../tipos";

// Telefone fica de fora: é a chave do login e do upsert do agendamento
// público. Trocar por aqui separaria a conta do histórico sem aviso.
// `additionalProperties: false` é o que transforma "fora da lista" em
// 400 em vez de silêncio.
const corpoPatch = {
  type: "object",
  additionalProperties: false,
  // Corpo vazio seria um UPDATE sem efeito respondendo 200.
  minProperties: 1,
  properties: {
    nome: { type: "string", minLength: 2, maxLength: 120 },
    email: { type: ["string", "null"], pattern: PADRAO_EMAIL, maxLength: 160 },
  },
} as const;

const paramsComId = {
  type: "object",
  required: ["id"],
  additionalProperties: false,
  properties: { id: { type: "string", pattern: PADRAO_UUID } },
} as const;

const filtroAgendamentos = {
  type: "object",
  additionalProperties: false,
  properties: {
    de: { type: "string", pattern: PADRAO_DATA },
    ate: { type: "string", pattern: PADRAO_DATA },
  },
} as const;

const corpoRemarcar = {
  type: "object",
  required: ["data", "horaInicio"],
  additionalProperties: false,
  properties: {
    data: { type: "string", pattern: PADRAO_DATA },
    horaInicio: { type: "string", pattern: PADRAO_HORA },
    // Opcional: sem ele, o remarcar herda os serviços do agendamento
    // antigo. Com ele, o cliente troca de serviço e a duração muda
    // junto — que é o caminho quando o serviço antigo foi desativado.
    servicoIds: {
      type: "array",
      minItems: 1,
      maxItems: 10,
      items: { type: "string", pattern: PADRAO_UUID },
    },
  },
} as const;

// O pattern garante a forma "YYYY-MM-DD", não que a data exista:
// "2026-02-31" passa por ele e explode no dataParaDate. Sem este
// wrapper seria um RangeError não tratado, ou seja, 500 por culpa de
// quem chamou.
function dataDoFiltro(valor: string): Date {
  try {
    return dataParaDate(valor);
  } catch {
    throw new ErroDeNegocio(`a data ${valor} não existe`, "data_invalida");
  }
}

// Sem `onRequest` aqui: quem autentica é o escopo do cliente, no app.ts.
export function registrarRotasClientesMe(app: App): void {
  app.get("/clientes/me", async (request) => {
    const { clienteId } = clienteDoToken(request);

    // O id vem do token, nunca da URL — é o que impede um cliente de
    // ler o cadastro de outro.
    const cliente = await prisma.cliente.findUniqueOrThrow({
      where: { id: clienteId },
    });

    return { cliente: serializarCliente(cliente) };
  });

  app.patch("/clientes/me", { schema: { body: corpoPatch } }, async (request) => {
    const { clienteId } = clienteDoToken(request);
    const { nome, email } = request.body;

    const cliente = await prisma.cliente.update({
      where: { id: clienteId },
      data: {
        ...(nome !== undefined ? { nome } : {}),
        // `email` tem tratamento próprio porque passa pela
        // normalização — e porque `null` aqui significa "limpar", não
        // "não mexer". `!== undefined` distingue "campo ausente" (não
        // mexe) de "campo presente" (grava, mesmo que seja null).
        ...(email !== undefined ? { email: normalizarEmail(email) } : {}),
      },
    });

    return { cliente: serializarCliente(cliente) };
  });

  app.get(
    "/clientes/me/agendamentos",
    { schema: { querystring: filtroAgendamentos } },
    async (request) => {
      const { clienteId } = clienteDoToken(request);
      const { de, ate } = request.query;

      const agendamentos = await prisma.agendamento.findMany({
        where: {
          // O clienteId sai do token, nunca da query: é o que faz o
          // histórico de outra pessoa ser inalcançável, e não só
          // escondido.
          clienteId,
          ...(de || ate
            ? {
                data: {
                  ...(de ? { gte: dataDoFiltro(de) } : {}),
                  ...(ate ? { lte: dataDoFiltro(ate) } : {}),
                },
              }
            : {}),
        },
        include: INCLUDE_AGENDAMENTO,
        // Mais recente primeiro: a tela "Meus agendamentos" abre no que
        // está por vir, não no corte do ano passado.
        orderBy: [{ data: "desc" }, { horaInicio: "desc" }],
      });

      return { agendamentos: agendamentos.map(serializarAgendamento) };
    }
  );

  app.post(
    "/clientes/me/agendamentos/:id/cancelar",
    { schema: { params: paramsComId } },
    async (request) => {
      const { clienteId } = clienteDoToken(request);

      // O clienteId no where é o que faz o agendamento de outra pessoa
      // responder 404 (P2025) em vez de 403.
      const agendamento = await prisma.agendamento.findFirstOrThrow({
        where: { id: request.params.id, clienteId },
      });

      garantirAlteravel(agendamento);

      const cancelado = await prisma.agendamento.update({
        where: { id: agendamento.id },
        data: { status: "cancelado" },
        include: INCLUDE_AGENDAMENTO,
      });

      return { agendamento: serializarAgendamento(cancelado) };
    }
  );

  app.post(
    "/clientes/me/agendamentos/:id/remarcar",
    { schema: { params: paramsComId, body: corpoRemarcar } },
    async (request, reply) => {
      const { clienteId } = clienteDoToken(request);
      const { data, horaInicio, servicoIds } = request.body;

      // O destino, antes de tocar no banco. A origem é conferida lá
      // dentro, pelo garantirAlteravel.
      garantirFuturo(data, horaInicio);

      // Mesmo motivo das rotas de criação: impasse concorrente não pode
      // sair como 500.
      const agendamento = await comRetryDeDeadlock(() =>
        prisma.$transaction(async (tx) => {
          const antigo = await tx.agendamento.findFirstOrThrow({
            where: { id: request.params.id, clienteId },
            include: { servicos: { select: { servicoId: true } } },
          });

          garantirAlteravel(antigo);

          // O cancelamento vem ANTES da criação, e é o que permite
          // remarcar pra um horário que sobrepõe o próprio agendamento
          // (10:00 -> 10:15). Sem ele, o agendamento antigo bloquearia a
          // si mesmo duas vezes: no cálculo de disponibilidade, que só
          // ignora cancelado, e na EXCLUDE constraint, que é parcial no
          // mesmo predicado.
          //
          // E é a transação que torna isso seguro: se a criação falhar,
          // este update desfaz junto e o cliente continua com o
          // agendamento que tinha.
          //
          // `updateMany` com o status no WHERE — e não `update({ where:
          // { id } })` — é o que impede um clique duplo em "remarcar" de
          // gerar dois agendamentos novos a partir de um só: se duas
          // transações concorrentes leem o mesmo `antigo` confirmado, a
          // primeira a commitar já deixou o status em "cancelado", e o
          // recheck do Postgres (EPQ) na segunda vê essa versão nova da
          // linha — o predicado de status não bate mais e `count` volta
          // 0. Sem o status aqui, as duas passariam, cada uma seguindo
          // pra criar seu próprio agendamento novo.
          const { count } = await tx.agendamento.updateMany({
            where: { id: antigo.id, status: { in: ["pendente", "confirmado"] } },
            data: { status: "cancelado" },
          });
          if (count === 0) {
            throw new ErroDeNegocio(
              "esse agendamento já foi alterado",
              "status_nao_permite"
            );
          }

          return criarAgendamento(tx, {
            barbeariaId: antigo.barbeariaId,
            // Herdado: trocar de barbeiro é agendar outro, e a
            // barbearia do MVP tem um só.
            barbeiroId: antigo.barbeiroId,
            clienteId,
            servicoIds:
              servicoIds ?? antigo.servicos.map((servico) => servico.servicoId),
            data,
            horaInicio,
            origem: "cliente",
          });
        })
      );

      // O agendamento novo ganha o seu; o do antigo se descarta ao reler
      // o status cancelado.
      await agendarLembrete({ fila: app.fila, log: request.log }, agendamento);

      return reply.code(201).send({
        agendamento: serializarAgendamento(agendamento),
      });
    }
  );
}
