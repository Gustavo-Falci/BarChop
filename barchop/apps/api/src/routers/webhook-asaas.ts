import { Prisma, prisma } from "@barchop/database";
import { tokenConfere } from "../lib/cifra";
import { ErroHttp } from "../lib/erro-http";
import { PADRAO_UUID } from "../lib/padroes";
import { ErroDoProvedor, type CobrancaNoProvedor, type EventoDoProvedor } from "../lib/provedores";
import { aplicar } from "../lib/webhook-dos-planos";
import type { App } from "../tipos";

// O webhook do Asaas (Onda 2, marco 3, PR 10a do plano
// planos-de-assinatura): cada conta conectada tem o seu endereço
// (`/webhooks/asaas/<conexão>`) e o seu token, gerado ao conectar e
// guardado só como hash. Sem login: quem prova a origem é o token no
// cabeçalho `asaas-access-token`.
//
// Regras, as do webhook da Stripe:
// - o estado vem relido no provedor, nunca do evento, porque os eventos
//   chegam fora de ordem;
// - a releitura (rede) fica fora da transação; falhou, 500 sem gravar o
//   evento, e o Asaas tenta de novo;
// - o evento é gravado na mesma transação da mudança: o mesmo evento
//   entregue duas vezes só vale uma;
// - dado estranho (conexão desligada, assinatura que o BarChop não
//   conhece) vai pro log e responde 200: um erro aí faria o Asaas tentar
//   até parar a fila de eventos da conta.

const paramsDoWebhook = {
  type: "object",
  required: ["conexaoId"],
  additionalProperties: false,
  properties: { conexaoId: { type: "string", pattern: PADRAO_UUID } },
} as const;

export function registrarRotaWebhookAsaas(app: App): void {
  app.post("/webhooks/asaas/:conexaoId", { schema: { params: paramsDoWebhook } }, async (request, reply) => {
    // Só a conexão ligada e do modo aceito. A desligada não tem mais a
    // chave pra reler nada: o evento dela é de ninguém.
    const conexao = await prisma.conexaoDePagamento.findFirst({
      where: { id: request.params.conexaoId, desconectadaEm: null, modo: app.provedores.modoAceito },
    });
    if (!conexao) {
      request.log.warn({ conexaoId: request.params.conexaoId }, "webhook do Asaas sem conexão ligada");
      return reply.send({ recebido: true });
    }
    const token = request.headers["asaas-access-token"];
    if (typeof token !== "string" || !tokenConfere(token, conexao.webhookTokenHash)) {
      throw new ErroHttp(401, "token_invalido", "o token do webhook não confere");
    }

    const provedor = app.provedores.daConexao(conexao);
    let evento: EventoDoProvedor;
    try {
      evento = provedor.lerEvento(request.body);
    } catch {
      throw new ErroHttp(400, "evento_invalido", "o corpo não é um evento do Asaas");
    }
    const chave = { provedor: conexao.provedor, id: evento.id };
    if (await prisma.eventoDoProvedor.findUnique({ where: { provedor_id: chave } })) {
      return reply.send({ recebido: true });
    }

    // Fora da transação: é rede. Falhou, lança (500) sem gravar o evento.
    // A cobrança que o provedor não acha (apagada) não tem o que reler:
    // o evento entra, e nada muda. A assinatura que ele não acha parou.
    let cobranca: CobrancaNoProvedor | null = null;
    let parou: boolean | null = null;
    try {
      if (evento.cobrancaId) {
        cobranca = await provedor.lerCobranca(evento.cobrancaId);
      } else if (evento.assinaturaId) {
        const noProvedor = await provedor.lerAssinatura(evento.assinaturaId);
        parou = noProvedor.removida || noProvedor.situacao !== "ativa";
      }
    } catch (erro) {
      if (!(erro instanceof ErroDoProvedor) || erro.codigo !== "nao_encontrado") throw erro;
      if (!evento.cobrancaId) parou = true;
      request.log.warn({ evento: evento.id }, "webhook do Asaas sobre o que o Asaas não acha mais");
    }
    const idDaAssinatura = evento.cobrancaId ? (cobranca?.assinaturaId ?? null) : evento.assinaturaId;

    try {
      await prisma.$transaction(async (tx) => {
        await tx.eventoDoProvedor.create({ data: { ...chave, tipo: evento.tipo.slice(0, 100) } });
        if (idDaAssinatura) {
          await aplicar(tx, { conexao, provedor: provedor.nome, idDaAssinatura, cobranca, parou, evento, log: request.log });
        }
      });
    } catch (erro) {
      // Duas entregas do mesmo evento ao mesmo tempo: a segunda bate na
      // chave e já foi aplicada pela primeira.
      if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === "P2002") {
        return reply.send({ recebido: true });
      }
      throw erro;
    }
    return reply.send({ recebido: true });
  });
}
