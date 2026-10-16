import { prisma } from "@barchop/database";
import { FORMAS_DE_PAGAMENTO } from "@barchop/formato";
import type { CaixaDoDia, PagamentoDoAtendimento } from "@barchop/types";
import { garantirRecurso } from "../lib/assinatura";
import {
  caixaDoDia,
  diaDoCaixa,
  diaEstaFechado,
  fecharODia,
  garantirDiaAberto,
  INCLUDE_PAGAMENTO,
  registrarPagamento,
  serializarPagamento,
} from "../lib/caixa";
import { PADRAO_DATA, PADRAO_UUID } from "../lib/padroes";
import { agendaVisivel, exigirPapel, membroDoToken } from "../plugins/auth";
import type { App } from "../tipos";

// O caixa do dia (Onda 2, marco 2, plano caixa-do-dia): o pagamento de
// cada atendimento, o caixa de um dia e o fechamento; as regras de
// divisão chegam no PR 5. Dono e recepção mexem em qualquer atendimento,
// o profissional só nos próprios (`agendaVisivel`, como no PATCH do
// agendamento): o do colega é 404. Só o dono fecha e reabre o dia.
// Plano sem `caixa` é 403.

const filtroDoCaixa = {
  type: "object",
  additionalProperties: false,
  required: ["data"],
  properties: { data: { type: "string", pattern: PADRAO_DATA } },
} as const;

const paramsComId = {
  type: "object",
  required: ["id"],
  additionalProperties: false,
  properties: { id: { type: "string", pattern: PADRAO_UUID } },
} as const;

// R$ 100.000,00 por atendimento: folga de sobra, e longe do limite do
// INTEGER.
const CENTAVOS = { type: "integer", minimum: 0, maximum: 10_000_000 } as const;

// Sem `servicosCentavos`, vale a soma dos serviços do agendamento; sem
// `recebidoPorId`, quem atendeu.
const corpoPagamento = {
  type: "object",
  additionalProperties: false,
  required: ["forma"],
  properties: {
    forma: { type: "string", enum: [...FORMAS_DE_PAGAMENTO] },
    servicosCentavos: CENTAVOS,
    descontoCentavos: CENTAVOS,
    gorjetaCentavos: CENTAVOS,
    recebidoPorId: { type: "string", pattern: PADRAO_UUID },
  },
} as const;

export function registrarRotasCaixa(app: App): void {
  app.get(
    "/agendamentos/:id/pagamento",
    { schema: { params: paramsComId } },
    async (request): Promise<PagamentoDoAtendimento> => {
      const { barbeariaId } = request.user;
      await garantirRecurso(prisma, barbeariaId, "caixa", new Date());
      const agendamento = await prisma.agendamento.findFirstOrThrow({
        where: { id: request.params.id, barbeariaId, ...agendaVisivel(request) },
        select: { data: true, pagamento: { include: INCLUDE_PAGAMENTO } },
      });
      return {
        pagamento: agendamento.pagamento ? serializarPagamento(agendamento.pagamento) : null,
        diaFechado: await diaEstaFechado(prisma, barbeariaId, agendamento.data),
      };
    }
  );

  app.put(
    "/agendamentos/:id/pagamento",
    { schema: { params: paramsComId, body: corpoPagamento } },
    async (request) => {
      const { barbeariaId } = request.user;
      const pagamento = await prisma.$transaction(async (tx) => {
        await garantirRecurso(tx, barbeariaId, "caixa", new Date());
        const agendamento = await tx.agendamento.findFirstOrThrow({
          where: { id: request.params.id, barbeariaId, ...agendaVisivel(request) },
          select: { id: true },
        });
        return registrarPagamento(tx, {
          barbeariaId,
          agendamentoId: agendamento.id,
          registradoPorId: membroDoToken(request).id,
          dados: request.body,
        });
      });
      return serializarPagamento(pagamento);
    }
  );

  // Remover deixa o atendimento concluído e sem pagamento: vira
  // pendência no caixa. Sem pagamento, não é erro.
  app.delete(
    "/agendamentos/:id/pagamento",
    { schema: { params: paramsComId } },
    async (request, reply) => {
      const { barbeariaId } = request.user;
      await prisma.$transaction(async (tx) => {
        await garantirRecurso(tx, barbeariaId, "caixa", new Date());
        const agendamento = await tx.agendamento.findFirstOrThrow({
          where: { id: request.params.id, barbeariaId, ...agendaVisivel(request) },
          select: { id: true, data: true },
        });
        await garantirDiaAberto(tx, barbeariaId, agendamento.data);
        await tx.pagamento.deleteMany({ where: { agendamentoId: agendamento.id } });
      });
      return reply.code(204).send();
    }
  );

  app.get(
    "/barbearias/me/caixa",
    { schema: { querystring: filtroDoCaixa } },
    async (request): Promise<CaixaDoDia> => {
      const { barbeariaId } = request.user;
      await garantirRecurso(prisma, barbeariaId, "caixa", new Date());
      const data = diaDoCaixa(request.query.data);
      return caixaDoDia(prisma, { barbeariaId, data, somente: agendaVisivel(request).barbeiroId });
    }
  );

  // Fechar com pendência pode (decisão 8 do plano): a tela avisa antes.
  app.post(
    "/barbearias/me/caixa/:data/fechamento",
    { onRequest: exigirPapel("dono"), schema: { params: filtroDoCaixa } },
    async (request, reply) => {
      const { barbeariaId } = request.user;
      await garantirRecurso(prisma, barbeariaId, "caixa", new Date());
      const data = diaDoCaixa(request.params.data);
      await prisma.$transaction((tx) =>
        fecharODia(tx, { barbeariaId, data, fechadoPorId: membroDoToken(request).id })
      );
      return reply.code(201).send(await caixaDoDia(prisma, { barbeariaId, data }));
    }
  );

  // Reabrir apaga o fechamento (decisão 9); dia aberto não é erro.
  app.delete(
    "/barbearias/me/caixa/:data/fechamento",
    { onRequest: exigirPapel("dono"), schema: { params: filtroDoCaixa } },
    async (request, reply) => {
      const { barbeariaId } = request.user;
      await garantirRecurso(prisma, barbeariaId, "caixa", new Date());
      const data = diaDoCaixa(request.params.data);
      await prisma.fechamentoDoDia.deleteMany({ where: { barbeariaId, data } });
      return reply.code(204).send();
    }
  );
}
