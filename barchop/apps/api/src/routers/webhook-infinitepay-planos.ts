import { prisma } from "@barchop/database";
import { ErroHttp } from "../lib/erro-http";
import { confirmarPagamentoDoLink } from "../lib/links-do-ciclo";
import { PADRAO_UUID } from "../lib/padroes";
import { ErroDoProvedor, lerAvisoDaInfinitePay, type AvisoDoLink } from "../lib/provedores";
import type { App } from "../tipos";

// O aviso de pagamento da InfinitePay nos planos (plano
// pagamentos-online-infinitepay, PR 4). O endereço vai em cada link, com
// o id da conexão. O aviso não é assinado e não tem tipo de evento: o
// BarChop só acredita no `payment_check` (confirmarPagamentoDoLink), que
// também guarda a transação em evento_do_provedor. A InfinitePay repete
// o que não for 2xx: erro de rede ao conferir é 400, e o que não é do
// BarChop é 200, pra ela não insistir.

const paramsDoAviso = {
  type: "object",
  required: ["conexaoId"],
  additionalProperties: false,
  properties: { conexaoId: { type: "string", pattern: PADRAO_UUID } },
} as const;

export function registrarRotaWebhookInfinitePayPlanos(app: App): void {
  app.post("/webhooks/infinitepay/:conexaoId", { schema: { params: paramsDoAviso } }, async (request, reply) => {
    const { conexaoId } = request.params;
    // Só a conexão ligada da InfinitePay, do modo aceito: a desligada não
    // tem a chave pra conferir.
    const conexao = await prisma.conexaoDePagamento.findFirst({
      where: { id: conexaoId, provedor: "infinitepay", desconectadaEm: null, modo: app.provedores.modoAceito },
      select: { id: true },
    });
    if (!conexao) {
      request.log.warn({ conexaoId }, "aviso da InfinitePay sem conexão ligada");
      return reply.send({ recebido: true });
    }

    let aviso: AvisoDoLink;
    try {
      aviso = lerAvisoDaInfinitePay(request.body);
    } catch {
      throw new ErroHttp(400, "aviso_invalido", "o corpo não é um aviso de pagamento da InfinitePay");
    }

    // O link tem que ser desta conexão: o endereço de uma não confirma o
    // link de outra.
    const link = await prisma.linkDoCiclo.findUnique({
      where: { orderNsu: aviso.orderNsu },
      select: { id: true, assinatura: { select: { conexaoId: true } } },
    });
    if (!link || link.assinatura.conexaoId !== conexao.id) {
      request.log.info({ conexaoId, orderNsu: aviso.orderNsu }, "aviso da InfinitePay de link que não é desta conexão");
      return reply.send({ recebido: true });
    }

    try {
      await confirmarPagamentoDoLink({
        fabrica: app.provedores,
        linkId: link.id,
        transactionNsu: aviso.transactionNsu,
        slug: aviso.slug,
        log: request.log,
      });
    } catch (erro) {
      if (erro instanceof ErroDoProvedor) {
        throw new ErroHttp(400, "provedor_indisponivel", "a InfinitePay não conferiu o pagamento agora: repita o aviso");
      }
      throw erro;
    }
    return reply.send({ recebido: true });
  });
}
