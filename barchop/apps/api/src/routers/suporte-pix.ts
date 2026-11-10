import { prisma } from "@barchop/database";
import type { PixNaFila } from "@barchop/types";
import { PADRAO_UUID } from "../lib/padroes";
import { pagamentoAguardando, serializarPagamentoPix, voltarAoQueEra } from "../lib/pix";
import { operadorDoToken } from "../plugins/auth";
import type { App } from "../tipos";

// O Suporte confere o Pix do BarChop no extrato (plano pix-do-barchop):
// confirma ou recusa com uma resposta, que o dono lê em Faturas. Fica no
// escopo do suporte (app.ts), atrás do autenticarSuporte.

const paramsComId = {
  type: "object",
  required: ["id"],
  additionalProperties: false,
  properties: { id: { type: "string", pattern: PADRAO_UUID } },
} as const;

const corpoRecusa = {
  type: "object",
  required: ["resposta"],
  additionalProperties: false,
  properties: { resposta: { type: "string", minLength: 1, maxLength: 500, pattern: "\\S" } },
} as const;

export function registrarRotasSuportePix(app: App): void {
  // Os aguardando, do mais velho pro mais novo, com a barbearia e o dono:
  // o que o Suporte procura no extrato.
  app.get("/suporte/pix", async (request) => {
    operadorDoToken(request);
    const aguardando = await prisma.pagamentoPix.findMany({
      where: { situacao: "aguardando" },
      orderBy: [{ criadoEm: "asc" }, { id: "asc" }],
      include: {
        barbearia: {
          select: {
            id: true,
            nome: true,
            slug: true,
            barbeiros: {
              where: { papel: "dono", ativo: true },
              orderBy: [{ criadoEm: "asc" }, { id: "asc" }],
              take: 1,
              select: { nome: true, email: true },
            },
          },
        },
      },
    });
    const pagamentos: PixNaFila[] = aguardando.map(({ barbearia, ...pagamento }) => {
      const { copiaECola: _semCodigo, ...resto } = serializarPagamentoPix(pagamento, null);
      const { barbeiros, ...dados } = barbearia;
      return { ...resto, barbearia: dados, dono: barbeiros[0] ?? null };
    });
    return { pagamentos };
  });

  // Achou no extrato: o plano já vale desde o "Já paguei"; só o
  // pagamento muda.
  app.post("/suporte/pix/:id/confirmar", { schema: { params: paramsComId } }, async (request) => {
    const { operadorId } = operadorDoToken(request);
    const decidido = await prisma.$transaction(async (tx) => {
      const pagamento = await pagamentoAguardando(tx, request.params.id, null);
      return tx.pagamentoPix.update({
        where: { id: pagamento.id },
        data: { situacao: "confirmado", decididoEm: new Date(), decididoPor: operadorId },
      });
    });
    return serializarPagamentoPix(decidido, null);
  });

  // Não achou: a assinatura volta ao que era antes do Pix.
  app.post(
    "/suporte/pix/:id/recusar",
    { schema: { params: paramsComId, body: corpoRecusa } },
    async (request) => {
      const { operadorId } = operadorDoToken(request);
      const decidido = await prisma.$transaction(async (tx) => {
        const pagamento = await pagamentoAguardando(tx, request.params.id, null);
        await voltarAoQueEra(tx, pagamento);
        return tx.pagamentoPix.update({
          where: { id: pagamento.id },
          data: {
            situacao: "recusado",
            resposta: request.body.resposta.trim(),
            decididoEm: new Date(),
            decididoPor: operadorId,
          },
        });
      });
      return serializarPagamentoPix(decidido, null);
    }
  );
}
