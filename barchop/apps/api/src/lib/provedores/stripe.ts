import type { CicloDoCliente } from "@barchop/formato";
import Stripe from "stripe";
import { agoraNaBarbearia, instanteNaBarbearia } from "../horas";
import {
  ErroDoProvedor,
  type AssinaturaNoProvedor,
  type CobrancaNoProvedor,
  type EventoDoProvedor,
  type ModoDoProvedor,
  type Provedor,
} from "./tipos";

// O conector da Stripe nos planos de assinatura (plano
// pagamentos-online-stripe, PR 2): quem vende cola a chave da própria
// conta, sem Stripe Connect. Nada aqui é da cobrança do BarChop
// (lib/cobranca.ts), que usa a conta da Stripe do BarChop.
//
// A "cobrança" do BarChop é a fatura (`invoice`) da Stripe. A assinatura
// nasce incompleta, com a primeira fatura aberta: o cliente paga na
// página da fatura, e o cartão fica guardado para os ciclos seguintes.
// Respostas e eventos na versão da biblioteca (2026-09-30.endive): nela a
// fatura diz a assinatura em `parent.subscription_details` e o pagamento
// em `payments`, e a charge não diz a fatura.

// A secreta (`sk_`) e a restrita (`rk_`); `_test_` é o modo teste.
export function modoDaChaveDaStripe(chave: string): ModoDoProvedor | null {
  if (/^(sk|rk)_live_/.test(chave)) return "real";
  if (/^(sk|rk)_test_/.test(chave)) return "teste";
  return null;
}

// O prazo de cada pedido, bem abaixo dos 15 s da transação do
// desconectar (como o do Asaas). Sem novas tentativas da biblioteca: com
// elas, o prazo de um pedido viraria o de vários.
export const PRAZO_DA_STRIPE_MS = 8_000;

// Os eventos que o webhook do BarChop lê: a fatura paga, a que falhou ou
// foi dada como perdida, a assinatura que mudou ou parou, e o estorno.
const EVENTOS: Stripe.WebhookEndpointCreateParams.EnabledEvent[] = [
  "invoice.paid",
  "invoice.payment_failed",
  "invoice.marked_uncollectible",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "charge.refunded",
];

const RECORRENCIA: Record<CicloDoCliente, { interval: "month" | "year"; interval_count: number }> = {
  mensal: { interval: "month", interval_count: 1 },
  trimestral: { interval: "month", interval_count: 3 },
  anual: { interval: "year", interval_count: 1 },
};

// O produto da Stripe de cada plano do BarChop: o id é escolhido aqui, e
// nada novo vai pro banco.
const idDoProduto = (planoId: string) => `barchop_plano_${planoId}`;

// Os instantes da Stripe (segundos) no dia da barbearia.
const dataDe = (segundos: number): string => agoraNaBarbearia(new Date(segundos * 1000)).data;

const idDe = (valor: string | { id?: string } | null | undefined): string | null =>
  typeof valor === "string" ? valor : (valor?.id ?? null);

function erroDaStripe(erro: unknown): ErroDoProvedor {
  if (erro instanceof ErroDoProvedor) return erro;
  const status = (erro as { statusCode?: unknown } | null)?.statusCode;
  if (typeof status !== "number") return new ErroDoProvedor("indisponivel", "a Stripe não respondeu");
  if (status === 401) return new ErroDoProvedor("chave_invalida", "a Stripe não aceitou a chave", status);
  if (status === 403) {
    return new ErroDoProvedor(
      "chave_invalida",
      "a chave da Stripe não tem permissão para isto: confira as permissões da chave restrita",
      status
    );
  }
  if (status === 400 || status === 402) return new ErroDoProvedor("recusado", "a Stripe recusou o pedido", status);
  if (status === 404) return new ErroDoProvedor("nao_encontrado", "a Stripe não achou o que foi pedido", status);
  if (status === 429) return new ErroDoProvedor("limite", "limite de pedidos à Stripe", status);
  return new ErroDoProvedor("indisponivel", "a Stripe não está respondendo", status);
}

const codigoDaStripe = (erro: unknown): unknown => (erro as { code?: unknown } | null)?.code;

function situacaoDaAssinatura(status: Stripe.Subscription.Status): AssinaturaNoProvedor["situacao"] {
  // Incompleta (a primeira fatura a pagar), em teste e atrasada seguem:
  // quem diz se pagou é a fatura.
  if (status === "canceled") return "inativa";
  if (status === "incomplete_expired") return "expirada";
  return "ativa";
}

function formaDoPagamento(carga: Stripe.Charge | null): CobrancaNoProvedor["forma"] {
  return carga?.payment_method_details?.type === "card" ? "cartao" : "outra";
}

export function provedorStripe(opcoes: {
  chave: string;
  modo: ModoDoProvedor;
  // O segredo que assina os eventos do webhook da conexão; sem ele, todo
  // evento é recusado.
  segredoDoWebhook: string | null;
  fetch?: typeof fetch;
}): Provedor {
  const { modo, segredoDoWebhook } = opcoes;
  const stripe = new Stripe(opcoes.chave, {
    maxNetworkRetries: 0,
    timeout: PRAZO_DA_STRIPE_MS,
    appInfo: { name: "BarChop", url: "https://barchop.com.br" },
    ...(opcoes.fetch ? { httpClient: Stripe.createFetchHttpClient(opcoes.fetch) } : {}),
  });

  // `aceitarAusente`: o 404 de quem apaga o que já foi apagado.
  async function pedir<T>(pedido: () => Promise<T>): Promise<T>;
  async function pedir<T>(pedido: () => Promise<T>, aceitarAusente: true): Promise<T | null>;
  async function pedir<T>(pedido: () => Promise<T>, aceitarAusente = false): Promise<T | null> {
    try {
      return await pedido();
    } catch (erro) {
      const traduzido = erroDaStripe(erro);
      if (aceitarAusente && traduzido.codigo === "nao_encontrado") return null;
      throw traduzido;
    }
  }

  // Lê, cria se não existe, renomeia se o plano mudou de nome e reativa
  // se quem vende arquivou no painel da Stripe (arquivado não assina).
  // Dois assinar ao mesmo tempo criam o mesmo id: o segundo lê o do
  // primeiro.
  async function garantirProduto(planoId: string, nome: string): Promise<string> {
    const id = idDoProduto(planoId);
    let produto = await pedir(() => stripe.products.retrieve(id), true);
    if (!produto) {
      try {
        await stripe.products.create({ id, name: nome, metadata: { barchop: planoId } });
        return id;
      } catch (erro) {
        if (codigoDaStripe(erro) !== "resource_already_exists") throw erroDaStripe(erro);
        produto = await pedir(() => stripe.products.retrieve(id));
      }
    }
    if (produto.name !== nome || !produto.active) {
      await pedir(() => stripe.products.update(id, { name: nome, active: true }));
    }
    return id;
  }

  async function lerFatura(id: string): Promise<CobrancaNoProvedor> {
    const fatura = await pedir(() => stripe.invoices.retrieve(id, { expand: ["payments"] }));
    const base = {
      id: String(fatura.id),
      assinaturaId: idDe(fatura.parent?.subscription_details?.subscription),
      removida: fatura.status === "void",
      // O início do período que a fatura cobra: o vencimento do ciclo.
      vencimento: dataDe(fatura.lines.data[0]?.period.start ?? fatura.created),
      linkDaFatura: fatura.hosted_invoice_url ?? null,
    };
    // A de R$ 0 (a dos dias grátis) sai paga, e não é pagamento.
    if (fatura.status === "paid" && fatura.amount_paid > 0) {
      // A fatura paga não diz se foi estornada: a charge do pagamento diz.
      const pago = fatura.payments?.data.find((pagamento) => pagamento.status === "paid");
      const intencao = idDe(pago?.payment.payment_intent);
      let carga: Stripe.Charge | null = null;
      if (intencao) {
        const lida = await pedir(() => stripe.paymentIntents.retrieve(intencao, { expand: ["latest_charge"] }));
        carga = typeof lida.latest_charge === "object" ? lida.latest_charge : null;
      }
      return {
        ...base,
        situacao: (carga?.amount_refunded ?? 0) > 0 ? "estornada" : "paga",
        valorCentavos: fatura.amount_paid,
        pagaEm: dataDe(fatura.status_transitions.paid_at ?? fatura.created),
        forma: formaDoPagamento(carga),
      };
    }
    // Aberta com tentativa que falhou, ou dada como perdida: vencida.
    const vencida = fatura.status === "uncollectible" || (fatura.status === "open" && fatura.attempt_count > 0);
    return { ...base, situacao: vencida ? "vencida" : "pendente", valorCentavos: fatura.amount_due, pagaEm: null, forma: null };
  }

  return {
    nome: "stripe",
    modo,
    pedeCpf: false,
    // A chave restrita precisa ler clientes e webhooks: as duas leituras
    // conferem as duas permissões antes de conectar.
    async conferirChave() {
      await pedir(() => stripe.customers.list({ limit: 1 }));
      await pedir(() => stripe.webhookEndpoints.list({ limit: 1 }));
    },
    // Sem o token do BarChop: quem prova a origem é a assinatura dos
    // eventos, com o segredo que a Stripe gera aqui e não mostra de novo.
    async registrarWebhook({ url }) {
      const criado = await pedir(() =>
        stripe.webhookEndpoints.create({
          url,
          enabled_events: EVENTOS,
          api_version: Stripe.API_VERSION as Stripe.WebhookEndpointCreateParams.ApiVersion,
          description: "BarChop",
        })
      );
      // Sem o segredo, a conexão recusaria todo evento: o webhook não fica.
      if (!criado.secret) {
        await pedir(() => stripe.webhookEndpoints.del(criado.id), true);
        throw new ErroDoProvedor("indisponivel", "a Stripe não devolveu o segredo do webhook");
      }
      return { id: criado.id, segredo: criado.secret };
    },
    async apagarWebhook(id) {
      await pedir(() => stripe.webhookEndpoints.del(id), true);
    },
    async temWebhook(id) {
      return (await pedir(() => stripe.webhookEndpoints.retrieve(id), true)) !== null;
    },
    // Sem CPF: a Stripe não pede.
    async criarCliente({ nome, email, telefone, referencia }) {
      const criado = await pedir(() =>
        stripe.customers.create({
          name: nome,
          ...(email ? { email } : {}),
          ...(telefone ? { phone: telefone } : {}),
          metadata: { barchop: referencia },
        })
      );
      return criado.id;
    },
    // Com dias grátis, o teste acaba no primeiro vencimento, sem pedir o
    // cartão antes: a fatura do fim do teste sai aberta, e o cliente paga
    // pelo "Pagar" da Minha conta.
    async criarAssinatura({ clienteId, valorCentavos, ciclo, primeiroVencimento, descricao, referencia, planoId }) {
      const produto = await garantirProduto(planoId, descricao);
      const comTeste = primeiroVencimento > agoraNaBarbearia().data;
      const criada = await pedir(() =>
        stripe.subscriptions.create({
          customer: clienteId,
          items: [{ price_data: { currency: "brl", product: produto, unit_amount: valorCentavos, recurring: RECORRENCIA[ciclo] } }],
          payment_behavior: "default_incomplete",
          payment_settings: { save_default_payment_method: "on_subscription", payment_method_types: ["card"] },
          ...(comTeste ? { trial_end: instanteNaBarbearia(primeiroVencimento, "00:00").getTime() / 1000 } : {}),
          description: descricao,
          metadata: { barchop: referencia },
          expand: ["latest_invoice"],
        })
      );
      const fatura = typeof criada.latest_invoice === "object" ? criada.latest_invoice : null;
      return { id: criada.id, linkDaFatura: fatura?.status === "open" ? (fatura.hosted_invoice_url ?? null) : null };
    },
    async linkDaFatura(assinaturaId) {
      const abertas = await pedir(() => stripe.invoices.list({ subscription: assinaturaId, status: "open", limit: 100 }));
      // A Stripe lista a mais nova primeiro.
      return abertas.data.at(-1)?.hosted_invoice_url ?? null;
    },
    async lerAssinatura(id) {
      const assinatura = await pedir(() => stripe.subscriptions.retrieve(id));
      const item = assinatura.items.data[0];
      return {
        id: assinatura.id,
        situacao: situacaoDaAssinatura(assinatura.status),
        removida: false,
        valorCentavos: (item?.price.unit_amount ?? 0) * (item?.quantity ?? 1),
        proximoVencimento: dataDe(item?.current_period_end ?? assinatura.billing_cycle_anchor),
      };
    },
    // O id é o da fatura, ou o do pagamento (o estorno chega pela charge,
    // que só diz o pagamento): aí a fatura vem pelo pagamento.
    async lerCobranca(id) {
      if (!id.startsWith("pi_")) return lerFatura(id);
      const pagamentos = await pedir(() =>
        stripe.invoicePayments.list({ payment: { type: "payment_intent", payment_intent: id } })
      );
      const fatura = idDe(pagamentos.data[0]?.invoice);
      if (!fatura) throw new ErroDoProvedor("nao_encontrado", "a Stripe não achou a fatura deste pagamento", 404);
      return lerFatura(fatura);
    },
    // Já cancelada responde 404: não é erro.
    async cancelarAssinatura(id) {
      await pedir(() => stripe.subscriptions.cancel(id), true);
    },
    // O corpo cru, como chegou: a assinatura é sobre os bytes.
    lerEvento(corpo, assinatura) {
      if (!segredoDoWebhook || !assinatura || !(Buffer.isBuffer(corpo) || typeof corpo === "string")) {
        throw new ErroDoProvedor("recusado", "o corpo não é um evento da Stripe");
      }
      let evento: Stripe.Event;
      try {
        evento = Stripe.webhooks.constructEvent(corpo, assinatura, segredoDoWebhook);
      } catch {
        throw new ErroDoProvedor("recusado", "a assinatura do evento da Stripe não confere");
      }
      return { id: evento.id, tipo: evento.type, ...doEvento(evento) };
    },
  };
}

function doEvento(evento: Stripe.Event): Pick<EventoDoProvedor, "cobrancaId" | "assinaturaId"> {
  const objeto = evento.data.object as {
    id?: string;
    payment_intent?: string | { id: string } | null;
    parent?: { subscription_details?: { subscription?: string | { id: string } } | null } | null;
  };
  if (evento.type.startsWith("invoice.")) {
    return { cobrancaId: objeto.id ?? null, assinaturaId: idDe(objeto.parent?.subscription_details?.subscription) };
  }
  if (evento.type.startsWith("customer.subscription.")) return { cobrancaId: null, assinaturaId: objeto.id ?? null };
  if (evento.type === "charge.refunded") return { cobrancaId: idDe(objeto.payment_intent), assinaturaId: null };
  return { cobrancaId: null, assinaturaId: null };
}
