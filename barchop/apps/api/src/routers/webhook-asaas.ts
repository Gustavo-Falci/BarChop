import { prisma } from "@barchop/database";
import { tokenConfere } from "../lib/cifra";
import { ErroHttp } from "../lib/erro-http";
import { PADRAO_UUID } from "../lib/padroes";
import { recorrente, type EventoDoProvedor } from "../lib/provedores";
import { receberEvento } from "../lib/webhook-dos-planos";
import type { App } from "../tipos";

// O webhook do Asaas (Onda 2, marco 3, PR 10a do plano
// planos-de-assinatura): cada conta conectada tem o seu endereço
// (`/webhooks/asaas/<conexão>`) e o seu token, gerado ao conectar e
// guardado só como hash. Sem login: quem prova a origem é o token no
// cabeçalho `asaas-access-token`.
//
// Conexão desligada ou desconhecida vai pro log e responde 200: um erro
// aí faria o Asaas tentar até parar a fila de eventos da conta. Lido o
// evento, o resto (releitura, dedupe, transação) é o `receberEvento` de
// lib/webhook-dos-planos.ts, o mesmo da Stripe.

const paramsDoWebhook = {
  type: "object",
  required: ["conexaoId"],
  additionalProperties: false,
  properties: { conexaoId: { type: "string", pattern: PADRAO_UUID } },
} as const;

export function registrarRotaWebhookAsaas(app: App): void {
  app.post("/webhooks/asaas/:conexaoId", { schema: { params: paramsDoWebhook } }, async (request, reply) => {
    // Só a conexão do Asaas, ligada e do modo aceito. A desligada não tem
    // mais a chave pra reler nada: o evento dela é de ninguém.
    const conexao = await prisma.conexaoDePagamento.findFirst({
      where: { id: request.params.conexaoId, provedor: "asaas", desconectadaEm: null, modo: app.provedores.modoAceito },
    });
    if (!conexao) {
      request.log.warn({ conexaoId: request.params.conexaoId }, "webhook do Asaas sem conexão ligada");
      return reply.send({ recebido: true });
    }
    const token = request.headers["asaas-access-token"];
    if (typeof token !== "string" || !tokenConfere(token, conexao.webhookTokenHash)) {
      throw new ErroHttp(401, "token_invalido", "o token do webhook não confere");
    }

    const provedor = recorrente(app.provedores.daConexao(conexao));
    let evento: EventoDoProvedor;
    try {
      evento = provedor.lerEvento(request.body);
    } catch {
      throw new ErroHttp(400, "evento_invalido", "o corpo não é um evento do Asaas");
    }
    await receberEvento({ conexao, provedor, evento, log: request.log });
    return reply.send({ recebido: true });
  });
}
