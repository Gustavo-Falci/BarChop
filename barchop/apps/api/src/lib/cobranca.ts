import Stripe from "stripe";
import {
  CICLOS,
  PLANOS,
  precosDoCiclo,
  type Ciclo,
  type IdDoPlano,
  type SituacaoDaAssinatura,
} from "@barchop/formato";
import type { FaturaDaAssinatura, SituacaoDaFatura } from "@barchop/types";
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

// O produto na Stripe tem id fixo: o script acha sem guardar nada, e a
// configuração "sem descida" do Portal filtra por ele.
export function idDoProduto(plano: PlanoPago): string {
  return `barchop_${plano}`;
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
        produto: { id: idDoProduto(plano), nome: `BarChop ${PLANOS[plano].nome}` },
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

// A fatura da Stripe na tela de Faturas. Aberta que já teve tentativa
// de cobrança falhou (o cartão recusou); o rascunho ainda não é do dono.
export function situacaoDaFatura(status: string | null, tentativas: number): SituacaoDaFatura | null {
  if (status === "paid") return "paga";
  if (status === "void") return "anulada";
  if (status === "uncollectible") return "falhou";
  if (status === "open") return tentativas > 0 ? "falhou" : "aberta";
  return null;
}

// A Stripe deixa a fatura `paid` depois do reembolso; quanto voltou mora
// na cobrança do cartão. Só a paga vira reembolsada.
export function situacaoComReembolso(
  situacao: SituacaoDaFatura,
  pagoCentavos: number,
  devolvidoCentavos: number
): SituacaoDaFatura {
  if (situacao !== "paga" || devolvidoCentavos <= 0) return situacao;
  return devolvidoCentavos >= pagoCentavos ? "reembolsada" : "reembolsada_em_parte";
}

// As últimas faturas bastam: o histórico inteiro fica no Portal.
const FATURAS_NA_TELA = 24;

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

export interface PortalAberto {
  url: string;
  semDescida: boolean;
}

export interface Cobranca {
  nome: string;
  // Sem o segredo do webhook, a rota responde 503: em desenvolvimento dá
  // pra abrir o Checkout só com a chave.
  webhookConfigurado: boolean;
  criarCliente(dados: { email: string | null; nome: string; barbeariaId: string }): Promise<string>;
  criarCheckout(pedido: PedidoDeCheckout): Promise<string>;
  // Com `semDescida`, o Portal só oferece o Completo (a equipe passa do
  // limite do Essencial). Devolve se deu: sem a configuração na Stripe
  // (o script criar-precos não rodou), abre o Portal padrão.
  criarPortal(dados: { customerId: string; urlDeVolta: string; semDescida: boolean }): Promise<PortalAberto>;
  atualizarQuantidade(assinaturaId: string, profissionais: number): Promise<void>;
  lerAssinatura(assinaturaId: string): Promise<AssinaturaNaCobranca>;
  // Uma segunda assinatura da mesma barbearia (dois Checkouts antes do
  // webhook): cancela na hora e devolve o que ela já cobrou. Repetir a
  // chamada não cancela nem devolve duas vezes.
  cancelarRepetida(assinaturaId: string): Promise<void>;
  // Da mais nova pra mais velha.
  listarFaturas(customerId: string): Promise<FaturaDaAssinatura[]>;
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
  portais: { customerId: string; urlDeVolta: string; semDescida: boolean }[];
  quantidades: { assinaturaId: string; profissionais: number }[];
  // O que a "Stripe" diz de cada assinatura quando o webhook relê.
  assinaturas: Map<string, AssinaturaNaCobranca>;
  falharQuantidade: boolean;
  cancelamentos: string[];
  falharCancelamento: boolean;
  // As faturas de cada cliente, e quem foi consultado.
  faturas: Map<string, FaturaDaAssinatura[]>;
  consultasDeFaturas: string[];
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
    cancelamentos: [],
    falharCancelamento: false,
    faturas: new Map(),
    consultasDeFaturas: [],
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
      return { url: `https://billing.stripe.test/${cobranca.portais.length}`, semDescida: dados.semDescida };
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
    async cancelarRepetida(assinaturaId) {
      if (cobranca.falharCancelamento) throw new Error("Stripe fora do ar (teste)");
      cobranca.cancelamentos.push(assinaturaId);
      const assinatura = cobranca.assinaturas.get(assinaturaId);
      if (assinatura) cobranca.assinaturas.set(assinaturaId, { ...assinatura, status: "canceled" });
    },
    async listarFaturas(customerId) {
      cobranca.consultasDeFaturas.push(customerId);
      return cobranca.faturas.get(customerId) ?? [];
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

  // O id da configuração "sem descida" não muda: achado uma vez, fica.
  // Não achada, pergunta de novo na próxima (o script pode rodar depois).
  let idSemDescida: string | null = null;
  async function configuracaoDoPortal(semDescida: boolean): Promise<string | null> {
    if (!semDescida) return null;
    idSemDescida ??= (await acharConfiguracaoSemDescida(stripe))?.id ?? null;
    return idSemDescida;
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
    async criarPortal({ customerId, urlDeVolta, semDescida }) {
      const configuracao = await configuracaoDoPortal(semDescida);
      const sessao = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: urlDeVolta,
        ...(configuracao ? { configuration: configuracao } : {}),
      });
      return { url: sessao.url, semDescida: configuracao !== null };
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
    async cancelarRepetida(assinaturaId) {
      // A Stripe tenta de novo quando o webhook dá 500: o que já foi feito
      // numa entrega anterior não se repete.
      let assinatura = await stripe.subscriptions.retrieve(assinaturaId);
      if (assinatura.status !== "canceled") {
        assinatura = await stripe.subscriptions.cancel(assinaturaId, { prorate: false, invoice_now: false });
      }
      // No teste nada foi cobrado; fora dele, a 1ª fatura já foi paga.
      const fatura = idDe(assinatura.latest_invoice);
      if (!fatura) return;
      const { data: pagamentos } = await stripe.invoicePayments.list({ invoice: fatura, status: "paid" });
      for (const { payment } of pagamentos) {
        const intencao = idDe(payment.payment_intent);
        if (!intencao) continue;
        await stripe.refunds.create({ payment_intent: intencao }, { idempotencyKey: `repetida-${intencao}` });
      }
    },
    async listarFaturas(customerId) {
      const { data } = await stripe.invoices.list({
        customer: customerId,
        limit: FATURAS_NA_TELA,
        // Os pagamentos da fatura só vêm quando pedidos: deles sai a
        // intenção de pagamento, que liga a fatura à cobrança do cartão.
        expand: ["data.payments"],
      });
      // Quanto voltou de cada intenção de pagamento. Só pergunta se
      // alguma fatura cobrou de verdade.
      const devolvido = new Map<string, number>();
      if (data.some((fatura) => fatura.status === "paid" && fatura.amount_paid > 0)) {
        const { data: cobrancas } = await stripe.charges.list({ customer: customerId, limit: 100 });
        for (const cobranca of cobrancas) {
          const intencao = idDe(cobranca.payment_intent);
          if (intencao) devolvido.set(intencao, (devolvido.get(intencao) ?? 0) + cobranca.amount_refunded);
        }
      }
      return data.flatMap((fatura) => {
        const lida = situacaoDaFatura(fatura.status, fatura.attempt_count);
        if (lida === null) return [];
        const devolvidoDaFatura = (fatura.payments?.data ?? []).reduce(
          (soma, pagamento) => soma + (devolvido.get(idDe(pagamento.payment.payment_intent) ?? "") ?? 0),
          0
        );
        const situacao = situacaoComReembolso(lida, fatura.amount_paid, devolvidoDaFatura);
        return [
          {
            id: fatura.id!,
            numero: fatura.number,
            emitidaEm: new Date(fatura.created * 1000).toISOString(),
            // Paga (reembolsada ou não): o que entrou; senão, o que ainda deve.
            valorCentavos: lida === "paga" ? fatura.amount_paid : fatura.amount_due,
            situacao,
            pdfUrl: fatura.invoice_pdf ?? null,
            paginaUrl: fatura.hosted_invoice_url ?? null,
          },
        ];
      });
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
    cancelarRepetida: async () => desligada(),
    listarFaturas: async () => desligada(),
    lerEvento: () => desligada(),
  };
}

// A configuração do Portal pra quem tem mais profissionais do que o
// Essencial aceita: a padrão (a que o dono ajusta no painel da Stripe)
// com a troca de plano só entre os preços do Completo. O Checkout já
// barra o Essencial nesse caso; o Portal, sozinho, só troca o preço.
// O script criar-precos cria e atualiza; mudou a padrão, rodar de novo.
const MARCA_SEM_DESCIDA = { barchop: "sem_descida" };

type ProdutoNaTroca = Stripe.BillingPortal.ConfigurationCreateParams.Features.SubscriptionUpdate.Product;

// Quantidade ajustável no produto sem "quantity" na troca: o painel da
// Stripe aceita, a API recusa. Sem a troca, não teria efeito mesmo.
function temQuantidadeNaTroca(configuracao: Stripe.BillingPortal.Configuration): boolean {
  return configuracao.features.subscription_update.default_allowed_updates.includes("quantity");
}

function produtoNaTroca(
  p: Stripe.BillingPortal.Configuration.Features.SubscriptionUpdate.Product,
  precos: string[],
  quantidadeNaTroca: boolean
): ProdutoNaTroca {
  return {
    product: p.product,
    prices: precos,
    adjustable_quantity:
      quantidadeNaTroca && p.adjustable_quantity.enabled
        ? {
            enabled: true,
            minimum: p.adjustable_quantity.minimum,
            ...(p.adjustable_quantity.maximum !== null ? { maximum: p.adjustable_quantity.maximum } : {}),
          }
        : { enabled: false },
  };
}

export function configuracaoSemDescida(
  padrao: Stripe.BillingPortal.Configuration
): Stripe.BillingPortal.ConfigurationCreateParams {
  const { business_profile: perfil, features: f } = padrao;
  const cancelar = f.subscription_cancel;
  const trocar = f.subscription_update;
  const doCompleto = idDoProduto("completo");
  const quantidadeNaTroca = temQuantidadeNaTroca(padrao);
  return {
    name: "BarChop — sem descida (mais de 3 profissionais)",
    metadata: MARCA_SEM_DESCIDA,
    business_profile: {
      ...(perfil.headline ? { headline: perfil.headline } : {}),
      ...(perfil.privacy_policy_url ? { privacy_policy_url: perfil.privacy_policy_url } : {}),
      ...(perfil.terms_of_service_url ? { terms_of_service_url: perfil.terms_of_service_url } : {}),
    },
    ...(padrao.default_return_url ? { default_return_url: padrao.default_return_url } : {}),
    features: {
      customer_update: { allowed_updates: f.customer_update.allowed_updates, enabled: f.customer_update.enabled },
      invoice_history: { enabled: f.invoice_history.enabled },
      payment_method_update: {
        enabled: f.payment_method_update.enabled,
        ...(f.payment_method_update.payment_method_configuration
          ? { payment_method_configuration: f.payment_method_update.payment_method_configuration }
          : {}),
      },
      subscription_cancel: {
        cancellation_reason: {
          enabled: cancelar.cancellation_reason.enabled,
          // Vazio a Stripe só aceita como "".
          options: cancelar.cancellation_reason.options.length > 0 ? cancelar.cancellation_reason.options : "",
        },
        enabled: cancelar.enabled,
        mode: cancelar.mode,
        proration_behavior: cancelar.proration_behavior,
      },
      subscription_update: {
        ...(trocar.billing_cycle_anchor ? { billing_cycle_anchor: trocar.billing_cycle_anchor } : {}),
        default_allowed_updates: trocar.default_allowed_updates.length > 0 ? trocar.default_allowed_updates : "",
        enabled: trocar.enabled,
        products: (trocar.products ?? [])
          .filter((p) => p.product === doCompleto)
          .map((p) => produtoNaTroca(p, p.prices, quantidadeNaTroca)),
        proration_behavior: trocar.proration_behavior,
        schedule_at_period_end: { conditions: trocar.schedule_at_period_end.conditions },
        trial_update_behavior: trocar.trial_update_behavior,
      },
    },
  };
}

// O Portal guarda ids de preço, não a lookup_key, e a Stripe recusa
// salvar configuração com preço arquivado. Quando o script troca um preço
// (planos.ts mudou), `trocas` leva cada id arquivado ao preço novo do
// mesmo produto e ciclo. Devolve os produtos da troca de plano já com os
// ids novos, ou null se nenhum preço do Portal foi trocado.
export function produtosComPrecosNovos(
  configuracao: Stripe.BillingPortal.Configuration,
  trocas: ReadonlyMap<string, string>
): ProdutoNaTroca[] | null {
  const produtos = configuracao.features.subscription_update.products ?? [];
  if (!produtos.some((p) => p.prices.some((id) => trocas.has(id)))) return null;
  const quantidadeNaTroca = temQuantidadeNaTroca(configuracao);
  // Se o novo já estava marcado junto do antigo, fica uma vez só.
  return produtos.map((p) =>
    produtoNaTroca(p, [...new Set(p.prices.map((id) => trocas.get(id) ?? id))], quantidadeNaTroca)
  );
}

// Acha a "sem descida" pelo metadata, ativa ou não (o script reativa).
export async function acharConfiguracaoSemDescida(
  stripe: Stripe
): Promise<Stripe.BillingPortal.Configuration | null> {
  for await (const configuracao of stripe.billingPortal.configurations.list({ limit: 100 })) {
    if (configuracao.metadata?.barchop === MARCA_SEM_DESCIDA.barchop) return configuracao;
  }
  return null;
}

// De que modo da Stripe é a chave: a secreta (`sk_`) e a restrita (`rk_`)
// do modo real começam com `_live_`; qualquer outra conta como teste.
export function modoDaChave(chave: string): "real" | "teste" {
  return /^(sk|rk)_live_/.test(chave) ? "real" : "teste";
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
