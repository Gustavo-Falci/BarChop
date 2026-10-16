import { prisma } from "@barchop/database";
import { FORMAS_DE_PAGAMENTO } from "@barchop/formato";
import type { PagamentoDoAtendimento } from "@barchop/types";
import { garantirRecurso } from "../lib/assinatura";
import {
  diaEstaFechado,
  garantirDiaAberto,
  INCLUDE_PAGAMENTO,
  registrarPagamento,
  serializarPagamento,
} from "../lib/caixa";
import { PADRAO_UUID } from "../lib/padroes";
import { agendaVisivel, membroDoToken } from "../plugins/auth";
import type { App } from "../tipos";

// O caixa do dia (Onda 2, marco 2, plano caixa-do-dia). Por enquanto, o
// pagamento de cada atendimento; o caixa do dia e as regras de divisão
// chegam nos PRs 4 e 5. Dono e recepção mexem em qualquer atendimento,
// o profissional só nos próprios (`agendaVisivel`, como no PATCH do
// agendamento): o do colega é 404. Plano sem `caixa` é 403.

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
}
