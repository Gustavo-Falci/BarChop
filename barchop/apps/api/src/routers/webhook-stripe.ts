import { Prisma, prisma } from "@barchop/database";
import { PLANOS, type SituacaoDaAssinatura } from "@barchop/formato";
import {
  planoDaChave,
  situacaoDaStripe,
  type AssinaturaNaCobranca,
  type Cobranca,
  type EventoDaCobranca,
} from "../lib/cobranca";
import { ErroHttp } from "../lib/erro-http";
import { notificarDonos } from "../lib/notificacoes";
import { PADRAO_UUID } from "../lib/padroes";
import type { App } from "../tipos";

// O webhook da Stripe (PR 4 do plano cobranca-do-barchop): mantém a
// cópia da situação da assinatura. Sem login — quem prova a origem é a
// assinatura do corpo, conferida pela biblioteca da Stripe. Por isso o
// corpo chega cru: um byte reformatado e a assinatura não confere.
//
// Regras:
// - o estado vem sempre da assinatura relida na Stripe, nunca do evento,
//   porque os eventos chegam fora de ordem;
// - a releitura (rede) fica fora da transação; falhou, 500 sem gravar o
//   evento, e a Stripe tenta de novo;
// - o evento é gravado na mesma transação da mudança: o mesmo evento
//   entregue duas vezes só vale uma;
// - dado estranho (preço desconhecido, barbearia que não existe) vai pro
//   log e responde 200: um 500 aí faria a Stripe tentar pra sempre;
// - uma segunda assinatura viva da mesma barbearia (dois Checkouts antes
//   do webhook) é cancelada, com o valor devolvido: vale a primeira.

const UUID = new RegExp(PADRAO_UUID);

interface Log {
  warn(objeto: object, mensagem: string): void;
}

const AVISOS: Partial<Record<SituacaoDaAssinatura, (plano: string) => { titulo: string; texto: string }>> = {
  ativa: (plano) => ({ titulo: "Assinatura ativa", texto: `O plano ${plano} da barbearia está ativo.` }),
  em_atraso: () => ({
    titulo: "Pagamento pendente",
    texto: "Não conseguimos cobrar a assinatura. Atualize o cartão em Gerenciar pagamento para não perder o plano.",
  }),
  cancelada: () => ({
    titulo: "Assinatura cancelada",
    texto: "A barbearia voltou para o plano Grátis. Nada foi apagado.",
  }),
};

// A linha da assinatura desta barbearia: pelo metadata (o caminho
// normal), ou pelos ids que o Checkout já gravou.
function acharLinha(
  tx: Prisma.TransactionClient | typeof prisma,
  assinatura: AssinaturaNaCobranca,
  evento: EventoDaCobranca
) {
  // Metadata torto não pode virar 500 no Postgres (uuid inválido).
  const candidato = assinatura.barbeariaId ?? evento.barbeariaId;
  const barbeariaId = candidato && UUID.test(candidato) ? candidato : null;
  return tx.assinatura.findFirst({
    where: {
      OR: [
        ...(barbeariaId ? [{ barbeariaId }] : []),
        { stripeSubscriptionId: assinatura.id },
        { stripeCustomerId: assinatura.customerId },
      ],
    },
  });
}

const VIVAS: readonly (SituacaoDaAssinatura | null)[] = ["ativa", "em_atraso"];

// Repetida: chega viva, e a barbearia já tem outra gravada que segue viva
// na Stripe. A gravada é relida, e não lida do banco: se ela acabou de
// ser cancelada e o evento ainda não chegou, a nova é quem vale.
async function ehRepetida(
  cobranca: Cobranca,
  assinatura: AssinaturaNaCobranca,
  evento: EventoDaCobranca
): Promise<boolean> {
  if (!VIVAS.includes(situacaoDaStripe(assinatura.status))) return false;
  const linha = await acharLinha(prisma, assinatura, evento);
  if (!linha?.stripeSubscriptionId || linha.stripeSubscriptionId === assinatura.id) return false;
  const gravada = await cobranca.lerAssinatura(linha.stripeSubscriptionId);
  return VIVAS.includes(situacaoDaStripe(gravada.status));
}

async function aplicar(
  tx: Prisma.TransactionClient,
  assinatura: AssinaturaNaCobranca,
  evento: EventoDaCobranca,
  log: Log
): Promise<void> {
  const situacao = situacaoDaStripe(assinatura.status);
  if (situacao === null) return;

  const plano = planoDaChave(assinatura.chave);
  if (!plano) {
    log.warn({ evento: evento.id, chave: assinatura.chave }, "webhook da Stripe com preço desconhecido");
    return;
  }

  const linha = await acharLinha(tx, assinatura, evento);
  if (!linha) {
    log.warn({ evento: evento.id, assinatura: assinatura.id }, "webhook da Stripe sem barbearia");
    return;
  }

  // Uma assinatura antiga (cancelada e trocada por outra) não derruba a
  // nova: só a que está gravada, ou uma nova que chega ativa, mudam a
  // situação.
  if (linha.stripeSubscriptionId && linha.stripeSubscriptionId !== assinatura.id && situacao !== "ativa") return;

  await tx.assinatura.update({
    where: { id: linha.id },
    data: {
      situacao,
      plano: plano.plano,
      ciclo: plano.ciclo,
      stripeCustomerId: assinatura.customerId,
      stripeSubscriptionId: assinatura.id,
      profissionaisContratados: assinatura.quantidade,
      periodoTerminaEm: assinatura.periodoTerminaEm,
      // Cancelada de vez, a data em que ia acabar já passou: a Stripe
      // ainda a mostra, mas não diz mais nada.
      cancelaEm: situacao === "cancelada" ? null : assinatura.cancelaEm,
    },
  });

  if (situacao !== linha.situacao) {
    const aviso = AVISOS[situacao]?.(`${PLANOS[plano.plano].nome} ${plano.ciclo}`);
    if (aviso) await notificarDonos(tx, linha.barbeariaId, { ...aviso, link: "/painel/assinatura" });
  }
}

export function registrarRotaWebhookStripe(app: App): void {
  // O corpo cru, só neste escopo: o resto da API segue com o JSON.
  app.removeContentTypeParser("application/json");
  app.addContentTypeParser("application/json", { parseAs: "buffer" }, (_request, corpo, feito) => {
    feito(null, corpo);
  });

  app.post("/stripe/webhook", async (request, reply) => {
    if (!app.cobranca.webhookConfigurado) {
      request.log.warn("webhook da Stripe sem STRIPE_WEBHOOK_SECRET: evento recusado");
      throw new ErroHttp(503, "webhook_desligado", "o webhook da Stripe não está configurado");
    }

    const assinaturaDoCorpo = request.headers["stripe-signature"];
    let evento: EventoDaCobranca;
    try {
      evento = app.cobranca.lerEvento(request.body as Buffer, String(assinaturaDoCorpo ?? ""));
    } catch {
      throw new ErroHttp(400, "assinatura_invalida", "a assinatura do webhook não confere");
    }

    if (await prisma.eventoStripe.findUnique({ where: { id: evento.id } })) {
      return reply.send({ recebido: true });
    }

    // Fora da transação: é rede. Falhou, lança (500) sem gravar o evento.
    const assinatura = evento.assinaturaId ? await app.cobranca.lerAssinatura(evento.assinaturaId) : null;
    const repetida = assinatura !== null && (await ehRepetida(app.cobranca, assinatura, evento));
    if (repetida) {
      await app.cobranca.cancelarRepetida(assinatura.id);
      request.log.warn({ evento: evento.id, assinatura: assinatura.id }, "assinatura repetida cancelada na Stripe");
    }

    try {
      await prisma.$transaction(async (tx) => {
        await tx.eventoStripe.create({ data: { id: evento.id, tipo: evento.tipo.slice(0, 100) } });
        if (assinatura && !repetida) await aplicar(tx, assinatura, evento, request.log);
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
