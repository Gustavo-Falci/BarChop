// Cria na Stripe os produtos e os preços do BarChop, lidos de
// @barchop/formato/planos (ADR-0007 e ADR-0010). Pode rodar de novo sem
// duplicar nada: o produto tem id fixo (`barchop_essencial`) e o preço é
// achado pela lookup_key (`essencial_mensal`).
//
// Uso (de barchop/), com STRIPE_SECRET_KEY no ambiente ou no apps/api/.env:
//   pnpm --filter @barchop/api criar-precos
// Em produção, dentro do contêiner da API: `node dist/criar-precos-no-stripe.js`.
// Os preços são por modo: os do modo de teste não existem no modo real,
// então o script roda uma vez com cada chave.
//
// Preço na Stripe não muda. Se planos.ts mudar, o script cria um preço
// novo, leva a lookup_key pra ele (`transfer_lookup_key`) e arquiva o
// antigo: quem assinar dali em diante paga o novo; as assinaturas que já
// existem continuam no preço antigo até alguém trocá-las.
//
// Depois dos preços, o Portal. Ele guarda ids de preço, então na
// configuração padrão cada preço arquivado vira o novo do mesmo produto e
// ciclo. Em seguida, a configuração "sem descida" (quem tem mais de 3
// profissionais só troca entre os preços do Completo): uma cópia da
// padrão. Mudou o Portal no painel da Stripe? Rodar de novo.
import Stripe from "stripe";
import {
  acharConfiguracaoSemDescida,
  configuracaoSemDescida,
  modoDaChave,
  precosParaStripe,
  produtosComPrecosNovos,
  type PrecoNaStripe,
} from "../src/lib/cobranca";

function mesmosDegraus(preco: Stripe.Price, esperado: PrecoNaStripe): boolean {
  const degraus = (preco.tiers ?? []).map((t) => ({ up_to: t.up_to ?? "inf", unit_amount: t.unit_amount }));
  return (
    preco.currency === "brl" &&
    preco.recurring?.interval === esperado.intervalo &&
    JSON.stringify(degraus) === JSON.stringify(esperado.tiers)
  );
}

async function garantirProduto(stripe: Stripe, produto: PrecoNaStripe["produto"]): Promise<void> {
  try {
    await stripe.products.retrieve(produto.id);
  } catch (erro) {
    if ((erro as { statusCode?: number }).statusCode !== 404) throw erro;
    await stripe.products.create({ id: produto.id, name: produto.nome });
    console.log(`produto criado: ${produto.id}`);
  }
}

// `ativos`: produto e intervalo → id do preço ativo, do laço dos preços.
async function trocarPrecosArquivadosNoPadrao(
  stripe: Stripe,
  ativos: ReadonlyMap<string, string>
): Promise<Stripe.BillingPortal.Configuration> {
  // Os produtos da troca de plano só vêm quando pedidos.
  const expand = ["features.subscription_update.products"];
  const { data } = await stripe.billingPortal.configurations.list({
    is_default: true,
    limit: 1,
    expand: expand.map((campo) => `data.${campo}`),
  });
  const padrao = data[0];
  if (!padrao) throw new Error("o Portal não tem configuração padrão: salve-o uma vez no painel da Stripe");

  const trocas = new Map<string, string>();
  const ids = new Set((padrao.features.subscription_update.products ?? []).flatMap((p) => p.prices));
  for (const id of ids) {
    const preco = await stripe.prices.retrieve(id);
    const produto = typeof preco.product === "string" ? preco.product : preco.product.id;
    const novo = ativos.get(`${produto}:${preco.recurring?.interval}`);
    if (!preco.active && novo) trocas.set(id, novo);
  }
  const produtos = produtosComPrecosNovos(padrao, trocas);
  if (!produtos) return padrao;

  const atualizada = await stripe.billingPortal.configurations.update(padrao.id, {
    features: { subscription_update: { products: produtos } },
    expand,
  });
  console.log(`portal padrão: ${trocas.size} preço(s) arquivado(s) trocado(s) pelos novos (${padrao.id})`);
  return atualizada;
}

async function garantirPortalSemDescida(stripe: Stripe, padrao: Stripe.BillingPortal.Configuration): Promise<void> {
  const parametros = configuracaoSemDescida(padrao);
  const produtos = parametros.features.subscription_update?.products;
  if (!Array.isArray(produtos) || produtos.length === 0) {
    throw new Error("o Portal padrão não oferece o Completo na troca de plano: nada pra copiar");
  }
  const atual = await acharConfiguracaoSemDescida(stripe);
  if (atual) {
    await stripe.billingPortal.configurations.update(atual.id, { ...parametros, active: true });
    console.log(`portal sem descida: atualizado (${atual.id})`);
  } else {
    const nova = await stripe.billingPortal.configurations.create(parametros);
    console.log(`portal sem descida: criado → ${nova.id}`);
  }
}

async function main() {
  const chave = process.env.STRIPE_SECRET_KEY;
  if (!chave) throw new Error("STRIPE_SECRET_KEY ausente");
  const stripe = new Stripe(chave);
  console.log(`modo: ${modoDaChave(chave) === "real" ? "REAL" : "teste"}`);

  const ativos = new Map<string, string>();
  for (const esperado of precosParaStripe()) {
    await garantirProduto(stripe, esperado.produto);

    const { data } = await stripe.prices.list({
      lookup_keys: [esperado.chave],
      active: true,
      expand: ["data.tiers"],
      limit: 1,
    });
    const atual = data[0];
    const onde = `${esperado.produto.id}:${esperado.intervalo}`;
    if (atual && mesmosDegraus(atual, esperado)) {
      ativos.set(onde, atual.id);
      console.log(`${esperado.chave}: já está certo (${atual.id})`);
      continue;
    }

    const novo = await stripe.prices.create({
      product: esperado.produto.id,
      currency: "brl",
      recurring: { interval: esperado.intervalo },
      billing_scheme: "tiered",
      tiers_mode: "graduated",
      tiers: esperado.tiers,
      lookup_key: esperado.chave,
      transfer_lookup_key: true,
    });
    ativos.set(onde, novo.id);
    if (atual) await stripe.prices.update(atual.id, { active: false });
    console.log(`${esperado.chave}: ${atual ? `trocado (${atual.id} arquivado)` : "criado"} → ${novo.id}`);
  }

  await garantirPortalSemDescida(stripe, await trocarPrecosArquivadosNoPadrao(stripe, ativos));
}

main().catch((erro: unknown) => {
  console.error(erro instanceof Error ? erro.message : erro);
  process.exitCode = 1;
});
