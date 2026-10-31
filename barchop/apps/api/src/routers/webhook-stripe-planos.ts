import { prisma } from "@barchop/database";
import { ErroHttp } from "../lib/erro-http";
import { PADRAO_UUID } from "../lib/padroes";
import type { EventoDoProvedor } from "../lib/provedores";
import { receberEvento } from "../lib/webhook-dos-planos";
import type { App } from "../tipos";

// O webhook da Stripe nos planos de assinatura (plano
// pagamentos-online-stripe, PR 4): cada conta conectada tem o seu
// endereço (`/webhooks/stripe/<conexão>`), criado pela API ao conectar.
// Sem login: quem prova a origem é a assinatura do evento
// (`stripe-signature`), conferida com o segredo daquele webhook, que fica
// cifrado na conexão. Não é o webhook da cobrança do BarChop
// (`/stripe/webhook`, routers/webhook-stripe.ts), que é da conta da
// Stripe do BarChop.
//
// Conexão desligada ou desconhecida vai pro log e responde 200, como no
// Asaas. Lido o evento, o resto é o `receberEvento` de
// lib/webhook-dos-planos.ts.

const paramsDoWebhook = {
  type: "object",
  required: ["conexaoId"],
  additionalProperties: false,
  properties: { conexaoId: { type: "string", pattern: PADRAO_UUID } },
} as const;

export function registrarRotaWebhookStripePlanos(app: App): void {
  // O corpo cru, só neste escopo: a assinatura é sobre os bytes.
  app.removeContentTypeParser("application/json");
  app.addContentTypeParser("application/json", { parseAs: "buffer" }, (_request, corpo, feito) => {
    feito(null, corpo);
  });

  app.post("/webhooks/stripe/:conexaoId", { schema: { params: paramsDoWebhook } }, async (request, reply) => {
    const conexao = await prisma.conexaoDePagamento.findFirst({
      where: { id: request.params.conexaoId, provedor: "stripe", desconectadaEm: null, modo: app.provedores.modoAceito },
    });
    if (!conexao) {
      request.log.warn({ conexaoId: request.params.conexaoId }, "webhook da Stripe sem conexão ligada");
      return reply.send({ recebido: true });
    }

    const provedor = app.provedores.daConexao(conexao);
    const assinatura = request.headers["stripe-signature"];
    let evento: EventoDoProvedor;
    try {
      evento = provedor.lerEvento(request.body, typeof assinatura === "string" ? assinatura : undefined);
    } catch {
      throw new ErroHttp(400, "assinatura_invalida", "a assinatura do evento da Stripe não confere");
    }

    await receberEvento({ conexao, provedor, evento, log: request.log });
    return reply.send({ recebido: true });
  });
}
