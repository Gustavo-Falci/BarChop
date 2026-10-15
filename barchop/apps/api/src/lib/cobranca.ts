import Stripe from "stripe";
import {
  CICLOS,
  PLANOS,
  precosDoCiclo,
  type Ciclo,
  type IdDoPlano,
  type SituacaoDaAssinatura,
} from "@barchop/formato";
import { ErroHttp } from "./erro-http";

// A cobrança da assinatura do BarChop (ADR-0010; PR 4 do plano
// cobranca-do-barchop). Como o canal de mensagem: quem chama fala só com
// esta interface, os testes usam a de memória, e a Stripe de verdade só
// existe no processo com a chave. O pagamento acontece todo nas páginas
// da Stripe (Checkout e Portal): o BarChop não vê cartão.

export type PlanoPago = Exclude<IdDoPlano, "gratis">;
const PLANOS_PAGOS: readonly PlanoPago[] = ["essencial", "completo"];

// A lookup_key do preço na Stripe: é por ela que o Checkout acha o preço
// e o webhook sabe o plano e o ciclo, sem guardar id de preço nenhum.
export function chaveDoPreco(plano: PlanoPago, ciclo: Ciclo): string {
  return `${plano}_${ciclo}`;
}

export function planoDaChave(chave: string | null | undefined): { plano: PlanoPago; ciclo: Ciclo } | null {
  const [plano, ciclo, ...resto] = (chave ?? "").split("_");
  if (resto.length > 0) return null;
  if (!PLANOS_PAGOS.includes(plano as PlanoPago) || !CICLOS.includes(ciclo as Ciclo)) return null;
  return { plano: plano as PlanoPago, ciclo: ciclo as Ciclo };
}

export interface PrecoNaStripe {
  chave: string;
  produto: { id: string; nome: string };
  intervalo: "month" | "year";
  // Preço graduado: o 1º profissional custa a base, cada um a mais o
  // extra — a mesma conta do precoDoPlano.
  tiers: [{ up_to: 1; unit_amount: number }, { up_to: "inf"; unit_amount: number }];
}

// O que o script criar-precos-no-stripe cria, lido de planos.ts: nenhum
// preço escrito à mão (ADR-0007).
export function precosParaStripe(): PrecoNaStripe[] {
  return PLANOS_PAGOS.flatMap((plano) =>
    CICLOS.map((ciclo) => {
      const { base, extra } = precosDoCiclo(plano, ciclo);
      return {
        chave: chaveDoPreco(plano, ciclo),
        produto: { id: `barchop_${plano}`, nome: `BarChop ${PLANOS[plano].nome}` },
        intervalo: ciclo === "anual" ? ("year" as const) : ("month" as const),
        tiers: [
          { up_to: 1 as const, unit_amount: base },
          { up_to: "inf" as const, unit_amount: extra },
        ] as PrecoNaStripe["tiers"],
      };
    })
  );
}

// A situação da Stripe na nossa lista. `incomplete` (o primeiro
// pagamento ainda não passou) não muda nada: um Checkout que falha não
// pode encerrar o teste de ninguém. Com "cancelar no fim do período" a
// Stripe segue `active` até o fim e só então manda `canceled`.
export function situacaoDaStripe(status: string): SituacaoDaAssinatura | null {
  if (status === "active" || status === "trialing") return "ativa";
  if (status === "past_due" || status === "unpaid") return "em_atraso";
  if (status === "canceled" || status === "incomplete_expired" || status === "paused") return "cancelada";
  return null;
}

// A Stripe exige o fim do teste pelo menos 48h à frente; a folga cobre
// o tempo entre abrir o Checkout e a Stripe conferir.
const FOLGA_MINIMA_DO_TESTE = 48 * 60 * 60 * 1000 + 10 * 60 * 1000;

// Decisão do dono (14/10/2026): assinar durante o teste só cobra quando
// ele acaba. Perto demais do fim, ou sem teste, cobra na hora.
export function fimDoTesteNaCobranca(testeTerminaEm: Date | null, agora: Date): number | null {
  if (!testeTerminaEm || testeTerminaEm.getTime() - agora.getTime() < FOLGA_MINIMA_DO_TESTE) return null;
  return Math.floor(testeTerminaEm.getTime() / 1000);
}

// A assinatura como a Stripe a vê agora — o webhook sempre relê, porque
// os eventos podem chegar fora de ordem.
export interface AssinaturaNaCobranca {
  id: string;
  customerId: string;
  barbeariaId: string | null;
  status: string;
  chave: string | null;
  quantidade: number;
  periodoTerminaEm: Date | null;
  // Cancelada no Portal: segue `active` até aqui. Null sem cancelamento.
  cancelaEm: Date | null;
}

// O que o webhook precisa de um evento: o id (idempotência) e por onde
// achar a assinatura e a barbearia.
export interface EventoDaCobranca {
  id: string;
  tipo: string;
  assinaturaId: string | null;
  customerId: string | null;
  barbeariaId: string | null;
}

export interface PedidoDeCheckout {
  customerId: string;
  barbeariaId: string;
  plano: PlanoPago;
  ciclo: Ciclo;
  profissionais: number;
  // Em segundos, como a Stripe quer; null cobra na hora.
  testeTerminaEm: number | null;
  urlDeSucesso: string;
  urlDeCancelamento: string;
}

export interface Cobranca {
  nome: string;
  // Sem o segredo do webhook, a rota responde 503: em desenvolvimento dá
  // pra abrir o Checkout só com a chave.
  webhookConfigurado: boolean;
  criarCliente(dados: { email: string | null; nome: string; barbeariaId: string }): Promise<string>;
  criarCheckout(pedido: PedidoDeCheckout): Promise<string>;
  criarPortal(dados: { customerId: string; urlDeVolta: string }): Promise<string>;
  atualizarQuantidade(assinaturaId: string, profissionais: number): Promise<void>;
  lerAssinatura(assinaturaId: string): Promise<AssinaturaNaCobranca>;
  // Lança quando a assinatura do evento não confere.
  lerEvento(corpo: Buffer, assinatura: string): EventoDaCobranca;
}

function idDe(valor: string | { id: string } | null | undefined): string | null {
  if (!valor) return null;
  return typeof valor === "string" ? valor : valor.id;
}

// Por onde o webhook acha a assinatura e a barbearia em cada tipo de
// evento. O `barbeariaId` vai no metadata da assinatura e no
// client_reference_id do Checkout: assim os eventos da assinatura acham
// a barbearia mesmo chegando antes do checkout.session.completed.
function eventoDaStripe(evento: Stripe.Event): EventoDaCobranca {
  const objeto = evento.data.object as unknown as Record<string, unknown>;
  const metadata = (objeto.metadata ?? {}) as Record<string, string>;
  const base = { id: evento.id, tipo: evento.type, assinaturaId: null, customerId: null, barbeariaId: null };

  if (evento.type === "checkout.session.completed") {
    return {
      ...base,
      assinaturaId: idDe(objeto.subscription as string | null),
      customerId: idDe(objeto.customer as string | null),
      barbeariaId: (objeto.client_reference_id as string | null) ?? metadata.barbeariaId ?? null,
    };
  }
  if (evento.type.startsWith("customer.subscription.")) {
    return {
      ...base,
      assinaturaId: objeto.id as string,
      customerId: idDe(objeto.customer as string | null),
      barbeariaId: metadata.barbeariaId ?? null,
    };
  }
  if (evento.type.startsWith("invoice.")) {
    const pai = objeto.parent as { subscription_details?: { subscription?: string | { id: string } } } | null;
    return {
      ...base,
      assinaturaId: idDe(pai?.subscription_details?.subscription),
      customerId: idDe(objeto.customer as string | null),
    };
  }
  return base;
}

function lerEventoAssinado(corpo: Buffer, assinatura: string, segredo: string): EventoDaCobranca {
  return eventoDaStripe(Stripe.webhooks.constructEvent(corpo, assinatura, segredo));
}

// O segredo do webhook nos testes: eles assinam o corpo com ele
// (Stripe.webhooks.generateTestHeaderString), e a conferência é a da
// biblioteca da Stripe, a mesma de produção.
export const SEGREDO_DO_WEBHOOK_DE_TESTE = "whsec_teste_do_barchop";

export interface CobrancaDeMemoria extends Cobranca {
  clientes: { id: string; email: string | null; nome: string; barbeariaId: string }[];
  checkouts: PedidoDeCheckout[];
  portais: { customerId: string; urlDeVolta: string }[];
  quantidades: { assinaturaId: string; profissionais: number }[];
  // O que a "Stripe" diz de cada assinatura quando o webhook relê.
  assinaturas: Map<string, AssinaturaNaCobranca>;
  falharQuantidade: boolean;
}

export function cobrancaDeMemoria(): CobrancaDeMemoria {
  const cobranca: CobrancaDeMemoria = {
    nome: "memoria",
    webhookConfigurado: true,
    clientes: [],
    checkouts: [],
    portais: [],
    quantidades: [],
    assinaturas: new Map(),
    falharQuantidade: false,
    async criarCliente(dados) {
      const id = `cus_memoria_${cobranca.clientes.length + 1}`;
      cobranca.clientes.push({ id, ...dados });
      return id;
    },
    async criarCheckout(pedido) {
      cobranca.checkouts.push(pedido);
      return `https://checkout.stripe.test/${cobranca.checkouts.length}`;
    },
    async criarPortal(dados) {
      cobranca.portais.push(dados);
      return `https://billing.stripe.test/${cobranca.portais.length}`;
    },
    async atualizarQuantidade(assinaturaId, profissionais) {
      if (cobranca.falharQuantidade) throw new Error("Stripe fora do ar (teste)");
      cobranca.quantidades.push({ assinaturaId, profissionais });
    },
    async lerAssinatura(assinaturaId) {
      const assinatura = cobranca.assinaturas.get(assinaturaId);
      if (!assinatura) throw new Error(`assinatura ${assinaturaId} não existe na cobrança de memória`);
      return assinatura;
    },
    lerEvento(corpo, assinatura) {
      return lerEventoAssinado(corpo, assinatura, SEGREDO_DO_WEBHOOK_DE_TESTE);
    },
  };
  return cobranca;
}

export function cobrancaDaStripe(opcoes: { chave: string; segredoDoWebhook?: string }): Cobranca {
  const stripe = new Stripe(opcoes.chave);

  async function precoDaChave(chave: string): Promise<string> {
    const { data } = await stripe.prices.list({ lookup_keys: [chave], active: true, limit: 1 });
    if (!data[0]) throw new Error(`preço ${chave} não existe na Stripe: rode o script criar-precos`);
    return data[0].id;
  }

  return {
    nome: "stripe",
    webhookConfigurado: !!opcoes.segredoDoWebhook,
    async criarCliente({ email, nome, barbeariaId }) {
      const cliente = await stripe.customers.create({
        ...(email ? { email } : {}),
        name: nome,
        metadata: { barbeariaId },
      });
      return cliente.id;
    },
    async criarCheckout(pedido) {
      const sessao = await stripe.checkout.sessions.create({
        mode: "subscription",
        customer: pedido.customerId,
        client_reference_id: pedido.barbeariaId,
        line_items: [
          { price: await precoDaChave(chaveDoPreco(pedido.plano, pedido.ciclo)), quantity: pedido.profissionais },
        ],
        subscription_data: {
          metadata: { barbeariaId: pedido.barbeariaId },
          ...(pedido.testeTerminaEm !== null ? { trial_end: pedido.testeTerminaEm } : {}),
        },
        locale: "pt-BR",
        success_url: pedido.urlDeSucesso,
        cancel_url: pedido.urlDeCancelamento,
      });
      if (!sessao.url) throw new Error("a Stripe não devolveu o endereço do Checkout");
      return sessao.url;
    },
    async criarPortal({ customerId, urlDeVolta }) {
      const sessao = await stripe.billingPortal.sessions.create({ customer: customerId, return_url: urlDeVolta });
      return sessao.url;
    },
    async atualizarQuantidade(assinaturaId, profissionais) {
      const assinatura = await stripe.subscriptions.retrieve(assinaturaId);
      const item = assinatura.items.data[0];
      // Cobrança proporcional (o padrão da Stripe) na próxima fatura.
      await stripe.subscriptions.update(assinaturaId, { items: [{ id: item.id, quantity: profissionais }] });
    },
    async lerAssinatura(assinaturaId) {
      const assinatura = await stripe.subscriptions.retrieve(assinaturaId);
      const item = assinatura.items.data[0];
      const periodoTerminaEm = item?.current_period_end ? new Date(item.current_period_end * 1000) : null;
      return {
        id: assinatura.id,
        customerId: idDe(assinatura.customer)!,
        barbeariaId: assinatura.metadata.barbeariaId ?? null,
        status: assinatura.status,
        chave: item?.price.lookup_key ?? null,
        quantidade: item?.quantity ?? 1,
        // Desde 2025 o período mora no item, em segundos.
        periodoTerminaEm,
        // O Portal marca `cancel_at_period_end` ou uma data em `cancel_at`.
        cancelaEm: assinatura.cancel_at
          ? new Date(assinatura.cancel_at * 1000)
          : assinatura.cancel_at_period_end
            ? periodoTerminaEm
            : null,
      };
    },
    lerEvento(corpo, assinatura) {
      if (!opcoes.segredoDoWebhook) throw new Error("STRIPE_WEBHOOK_SECRET ausente");
      return lerEventoAssinado(corpo, assinatura, opcoes.segredoDoWebhook);
    },
  };
}

// Em desenvolvimento sem a chave: o painel sobe, e só o que cobra
// responde que a cobrança não está configurada.
function cobrancaDesligada(): Cobranca {
  const desligada = (): never => {
    throw new ErroHttp(503, "cobranca_desligada", "a cobrança não está configurada neste ambiente");
  };
  return {
    nome: "desligada",
    webhookConfigurado: false,
    criarCliente: async () => desligada(),
    criarCheckout: async () => desligada(),
    criarPortal: async () => desligada(),
    atualizarQuantidade: async () => desligada(),
    lerAssinatura: async () => desligada(),
    lerEvento: () => desligada(),
  };
}

// Escolhe pelo ambiente. Em produção a API não sobe sem as duas chaves:
// sem a do webhook, ninguém ficaria sabendo que a barbearia pagou.
export function cobrancaDoAmbiente(env: Record<string, string | undefined> = process.env): Cobranca {
  if (env.NODE_ENV === "test") return cobrancaDeMemoria();
  const chave = env.STRIPE_SECRET_KEY;
  const segredoDoWebhook = env.STRIPE_WEBHOOK_SECRET;
  if (env.NODE_ENV === "production") {
    if (!chave) throw new Error("STRIPE_SECRET_KEY ausente em produção: a API não cobra sem ela");
    if (!segredoDoWebhook) throw new Error("STRIPE_WEBHOOK_SECRET ausente em produção: o pagamento não chegaria");
  }
  if (!chave) return cobrancaDesligada();
  return cobrancaDaStripe({ chave, segredoDoWebhook });
}
