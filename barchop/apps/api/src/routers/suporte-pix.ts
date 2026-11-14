import { prisma } from "@barchop/database";
import type { AntesDoPix, PixNaFila } from "@barchop/types";
import { PLANOS, formatarReais } from "@barchop/formato";
import { notificarDonos } from "../lib/notificacoes";
import { PADRAO_UUID } from "../lib/padroes";
import { pagamentoAguardando, serializarPagamentoPix, voltarAoQueEra } from "../lib/pix";
import { diaEMesNoAno, emailAosDonos, ondePagar } from "../lib/pix-avisos";
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

function nomeDoPlano(plano: string): string {
  return PLANOS[plano as keyof typeof PLANOS]?.nome ?? plano;
}

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
            assinatura: { select: { testeTerminaEm: true } },
          },
        },
      },
    });
    const pagamentos: PixNaFila[] = aguardando.map(({ barbearia, ...pagamento }) => {
      const { copiaECola: _semCodigo, ...resto } = serializarPagamentoPix(pagamento, null);
      const { barbeiros, assinatura, ...dados } = barbearia;
      const antes: AntesDoPix = {
        situacao: pagamento.antesSituacao as AntesDoPix["situacao"],
        plano: pagamento.antesPlano as AntesDoPix["plano"],
        forma: pagamento.antesForma as AntesDoPix["forma"],
        periodoTerminaEm: pagamento.antesPeriodoTerminaEm?.toISOString() ?? null,
        testeTerminaEm:
          pagamento.antesSituacao === "teste" ? (assinatura?.testeTerminaEm?.toISOString() ?? null) : null,
      };
      return { ...resto, barbearia: dados, dono: barbeiros[0] ?? null, antes };
    });
    return { pagamentos };
  });

  // Achou no extrato: o plano já vale desde o "Já paguei"; só o
  // pagamento muda.
  app.post("/suporte/pix/:id/confirmar", { schema: { params: paramsComId } }, async (request) => {
    const { operadorId } = operadorDoToken(request);
    const decidido = await prisma.$transaction(async (tx) => {
      const pagamento = await pagamentoAguardando(tx, request.params.id, null);
      const confirmado = await tx.pagamentoPix.update({
        where: { id: pagamento.id },
        data: { situacao: "confirmado", decididoEm: new Date(), decididoPor: operadorId },
      });
      // Só no sino: o plano já valia desde o "Já paguei".
      await notificarDonos(tx, pagamento.barbeariaId, {
        titulo: "Pix confirmado",
        texto: `O Suporte achou o seu Pix de ${formatarReais(pagamento.valorCentavos)}. O ${nomeDoPlano(pagamento.plano)} vale até ${diaEMesNoAno(pagamento.periodoTerminaEm)}.`,
        link: "/painel/faturas",
      });
      return confirmado;
    });
    return serializarPagamentoPix(decidido, null);
  });

  // Não achou: a assinatura volta ao que era antes do Pix.
  app.post(
    "/suporte/pix/:id/recusar",
    { schema: { params: paramsComId, body: corpoRecusa } },
    async (request) => {
      const { operadorId } = operadorDoToken(request);
      const resposta = request.body.resposta.trim();
      const decidido = await prisma.$transaction(async (tx) => {
        const pagamento = await pagamentoAguardando(tx, request.params.id, null);
        await voltarAoQueEra(tx, pagamento);
        const recusado = await tx.pagamentoPix.update({
          where: { id: pagamento.id },
          data: { situacao: "recusado", resposta, decididoEm: new Date(), decididoPor: operadorId },
        });
        // O texto do sino tem 500 caracteres, e a resposta também: ela
        // inteira vai no e-mail e em Faturas; o sino só aponta.
        await notificarDonos(tx, pagamento.barbeariaId, {
          titulo: "Pix não encontrado",
          texto: `O Suporte não achou o seu Pix de ${formatarReais(pagamento.valorCentavos)}. A resposta está em Faturas.`,
          link: "/painel/faturas",
        });
        return recusado;
      });
      // Depois do commit: o e-mail que não sai não desfaz a recusa.
      await emailAosDonos(
        decidido.barbeariaId,
        {
          assunto: "Não achamos o seu Pix do BarChop",
          texto:
            `Olá! O Suporte do BarChop não achou no extrato o seu Pix de ${formatarReais(decidido.valorCentavos)} ` +
            `(${nomeDoPlano(decidido.plano)}). A resposta:\n\n${resposta}\n\n` +
            `A barbearia voltou ao que era antes do Pix. A resposta fica ${ondePagar(process.env.URL_DO_PAINEL)}, onde dá pra pagar de novo.`,
        },
        { canal: app.canal, log: request.log }
      );
      return serializarPagamentoPix(decidido, null);
    }
  );
}
