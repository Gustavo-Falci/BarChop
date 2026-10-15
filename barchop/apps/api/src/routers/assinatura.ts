import { prisma } from "@barchop/database";
import { CICLOS, PLANOS, limiteDeProfissionais } from "@barchop/formato";
import { contarProfissionais, resumoDaAssinatura } from "../lib/assinatura";
import { fimDoTesteNaCobranca } from "../lib/cobranca";
import { conflito } from "../lib/erro-http";
import { ErroDeNegocio } from "../lib/erro-negocio";
import { exigirPapel } from "../plugins/auth";
import type { App } from "../tipos";

// A assinatura do BarChop no painel (Onda 2, marco 1). Só o dono vê e
// mexe nela (decisão 7 do plano cobranca-do-barchop). O pagamento é
// todo nas páginas da Stripe: aqui só se abre o Checkout e o Portal.

const corpoCheckout = {
  type: "object",
  required: ["plano", "ciclo", "profissionais"],
  additionalProperties: false,
  properties: {
    // O Grátis não se compra.
    plano: { type: "string", enum: ["essencial", "completo"] },
    ciclo: { type: "string", enum: CICLOS },
    profissionais: { type: "integer", minimum: 1, maximum: 99 },
  },
} as const;

// Pra onde a Stripe devolve o dono. Em desenvolvimento, o `pnpm dev` do web.
function telaDeFaturas(): string {
  const painel = (process.env.URL_DO_PAINEL ?? "http://localhost:3000").replace(/\/+$/, "");
  return `${painel}/painel/faturas`;
}

export function registrarRotasAssinatura(app: App): void {
  app.get("/barbearias/me/assinatura", { onRequest: exigirPapel("dono") }, async (request) =>
    resumoDaAssinatura(request.user.barbeariaId, new Date())
  );

  app.post(
    "/barbearias/me/assinatura/checkout",
    { onRequest: exigirPapel("dono"), schema: { body: corpoCheckout } },
    async (request) => {
      const { barbeariaId, barbeiroId } = request.user;
      const { plano, ciclo, profissionais } = request.body;

      const linha = await prisma.assinatura.findUniqueOrThrow({ where: { barbeariaId } });
      if (linha.stripeSubscriptionId && (linha.situacao === "ativa" || linha.situacao === "em_atraso")) {
        throw conflito("a barbearia já tem assinatura: mude o plano em Gerenciar pagamento");
      }

      // Nunca menos que a equipe de hoje, nem mais que o plano permite.
      const contados = await contarProfissionais(barbeariaId);
      if (profissionais < contados) {
        throw new ErroDeNegocio(
          `a equipe tem ${contados} profissionais: assine para pelo menos ${contados}`,
          "quantidade_menor_que_a_equipe"
        );
      }
      const limite = limiteDeProfissionais(plano);
      if (limite !== null && profissionais > limite) {
        throw new ErroDeNegocio(
          `o ${PLANOS[plano].nome} vai até ${limite} profissionais: escolha o Completo`,
          "limite_do_plano"
        );
      }

      // O cliente na Stripe nasce no primeiro Checkout e fica gravado: o
      // Portal e as faturas precisam dele, e dois Checkouts seguidos caem
      // no mesmo cliente.
      let customerId = linha.stripeCustomerId;
      if (!customerId) {
        const [barbearia, dono] = await Promise.all([
          prisma.barbearia.findUniqueOrThrow({ where: { id: barbeariaId }, select: { nome: true } }),
          prisma.barbeiro.findUniqueOrThrow({ where: { id: barbeiroId }, select: { email: true } }),
        ]);
        customerId = await app.cobranca.criarCliente({ email: dono.email, nome: barbearia.nome, barbeariaId });
        await prisma.assinatura.update({ where: { barbeariaId }, data: { stripeCustomerId: customerId } });
      }

      const tela = telaDeFaturas();
      const url = await app.cobranca.criarCheckout({
        customerId,
        barbeariaId,
        plano,
        ciclo,
        profissionais,
        testeTerminaEm:
          linha.situacao === "teste" ? fimDoTesteNaCobranca(linha.testeTerminaEm, new Date()) : null,
        urlDeSucesso: `${tela}?ok=1`,
        urlDeCancelamento: `${tela}/cancelado`,
      });
      return { url };
    }
  );

  // As faturas na tela de Faturas. Sem cliente na Stripe ainda não há
  // fatura nenhuma, e nem vale perguntar.
  app.get("/barbearias/me/assinatura/faturas", { onRequest: exigirPapel("dono") }, async (request) => {
    const linha = await prisma.assinatura.findUniqueOrThrow({
      where: { barbeariaId: request.user.barbeariaId },
      select: { stripeCustomerId: true },
    });
    if (!linha.stripeCustomerId) return [];
    return app.cobranca.listarFaturas(linha.stripeCustomerId);
  });

  // Trocar cartão, ver faturas e cancelar no fim do período: tudo no
  // Portal da Stripe, configurado pelo dono no painel dela.
  app.post("/barbearias/me/assinatura/portal", { onRequest: exigirPapel("dono") }, async (request) => {
    const linha = await prisma.assinatura.findUniqueOrThrow({
      where: { barbeariaId: request.user.barbeariaId },
      select: { stripeCustomerId: true },
    });
    if (!linha.stripeCustomerId) throw conflito("a barbearia ainda não assinou um plano");
    const url = await app.cobranca.criarPortal({ customerId: linha.stripeCustomerId, urlDeVolta: telaDeFaturas() });
    return { url };
  });
}
