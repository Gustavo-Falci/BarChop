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
import Stripe from "stripe";
import { modoDaChave, precosParaStripe, type PrecoNaStripe } from "../src/lib/cobranca";

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

async function main() {
  const chave = process.env.STRIPE_SECRET_KEY;
  if (!chave) throw new Error("STRIPE_SECRET_KEY ausente");
  const stripe = new Stripe(chave);
  console.log(`modo: ${modoDaChave(chave) === "real" ? "REAL" : "teste"}`);

  for (const esperado of precosParaStripe()) {
    await garantirProduto(stripe, esperado.produto);

    const { data } = await stripe.prices.list({
      lookup_keys: [esperado.chave],
      active: true,
      expand: ["data.tiers"],
      limit: 1,
    });
    const atual = data[0];
    if (atual && mesmosDegraus(atual, esperado)) {
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
    if (atual) await stripe.prices.update(atual.id, { active: false });
    console.log(`${esperado.chave}: ${atual ? `trocado (${atual.id} arquivado)` : "criado"} → ${novo.id}`);
  }
}

main().catch((erro: unknown) => {
  console.error(erro instanceof Error ? erro.message : erro);
  process.exitCode = 1;
});
