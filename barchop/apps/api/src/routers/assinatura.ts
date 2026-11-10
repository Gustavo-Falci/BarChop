import { Prisma, prisma } from "@barchop/database";
import { CICLOS, limiteDeProfissionais } from "@barchop/formato";
import { conferirPedidoDoPlano, contarProfissionais, resumoDaAssinatura } from "../lib/assinatura";
import { fimDoTesteNaCobranca } from "../lib/cobranca";
import { ErroHttp, conflito } from "../lib/erro-http";
import { PADRAO_UUID } from "../lib/padroes";
import {
  cotar,
  exigirPix,
  pagamentoAguardando,
  pixVigente,
  resumoDoPix,
  serializarCotacao,
  serializarPagamentoPix,
  voltarAoQueEra,
} from "../lib/pix";
import { exigirPapel } from "../plugins/auth";
import type { App } from "../tipos";

// A assinatura do BarChop no painel (Onda 2, marco 1). Só o dono vê e
// mexe nela (decisão 7 do plano cobranca-do-barchop). O cartão é todo
// nas páginas da Stripe: aqui só se abre o Checkout e o Portal. O Pix
// (plano pix-do-barchop) é daqui: cotação, "Já paguei" e "Ainda não
// paguei"; quem confere é o Suporte (routers/suporte-pix.ts).

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

const paramsComId = {
  type: "object",
  required: ["id"],
  additionalProperties: false,
  properties: { id: { type: "string", pattern: PADRAO_UUID } },
} as const;

const DATA_CURTA = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  timeZone: "America/Sao_Paulo",
});

function emConferencia(): ErroHttp {
  return new ErroHttp(409, "pix_em_conferencia", "já há um Pix em conferência: espere o suporte ou desfaça");
}

// Pra onde a Stripe devolve o dono. Em desenvolvimento, o `pnpm dev` do web.
function telaDeFaturas(): string {
  const painel = (process.env.URL_DO_PAINEL ?? "http://localhost:3000").replace(/\/+$/, "");
  return `${painel}/painel/faturas`;
}

export function registrarRotasAssinatura(app: App): void {
  app.get("/barbearias/me/assinatura", { onRequest: exigirPapel("dono") }, async (request) => {
    const { barbeariaId } = request.user;
    const [resumo, pix] = await Promise.all([
      resumoDaAssinatura(barbeariaId, new Date()),
      resumoDoPix(barbeariaId, app.pix),
    ]);
    return { ...resumo, pix };
  });

  app.post(
    "/barbearias/me/assinatura/checkout",
    { onRequest: exigirPapel("dono"), schema: { body: corpoCheckout } },
    async (request) => {
      const { barbeariaId, barbeiroId } = request.user;
      const { plano, ciclo, profissionais } = request.body;

      const linha = await prisma.assinatura.findUniqueOrThrow({ where: { barbeariaId } });
      if (linha.stripeSubscriptionId && (linha.situacao === "ativa" || linha.situacao === "em_atraso")) {
        throw conflito("a barbearia já tem assinatura: mude o plano em Gerenciar assinatura");
      }
      // Pix vigente (ou aguardando conferência): o cartão espera o fim do
      // período. Trocar de forma no meio fica pra depois.
      if (pixVigente(linha, new Date())) {
        throw new ErroHttp(
          409,
          "pix_vigente",
          `o Pix vale até ${DATA_CURTA.format(linha.periodoTerminaEm!)}: troque pro cartão depois`
        );
      }

      await conferirPedidoDoPlano(barbeariaId, plano, profissionais);

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

  // A cotação do Pix: o QR (copia e cola) com o valor exato e o período
  // que ele paga. Recarregar dá o mesmo identificador.
  app.get(
    "/barbearias/me/assinatura/pix",
    { onRequest: exigirPapel("dono"), schema: { querystring: corpoCheckout } },
    async (request) => {
      const config = exigirPix(app.pix);
      const { cotacao } = await cotar(prisma, config, request.user.barbeariaId, request.query, new Date());
      return serializarCotacao(config, cotacao);
    }
  );

  // "Já paguei": o plano vale na hora, aguardando a conferência do
  // Suporte. O identificador e o valor são recalculados aqui; o corpo
  // só diz o pedido.
  app.post(
    "/barbearias/me/assinatura/pix",
    { onRequest: exigirPapel("dono"), schema: { body: corpoCheckout } },
    async (request, reply) => {
      const config = exigirPix(app.pix);
      const { barbeariaId } = request.user;
      const pedido = request.body;
      const agora = new Date();
      try {
        const pagamento = await prisma.$transaction(async (tx) => {
          // A linha da assinatura travada: dois "Já paguei" ao mesmo
          // tempo, ou um webhook da Stripe, esperam.
          await tx.$queryRaw`SELECT id FROM assinatura WHERE barbearia_id = ${barbeariaId}::uuid FOR UPDATE`;
          if (await tx.pagamentoPix.findFirst({ where: { barbeariaId, situacao: "aguardando" } })) {
            throw emConferencia();
          }
          const { cotacao, linha } = await cotar(tx, config, barbeariaId, pedido, agora);
          const criado = await tx.pagamentoPix.create({
            data: {
              barbeariaId,
              identificador: cotacao.identificador,
              plano: pedido.plano,
              ciclo: pedido.ciclo,
              profissionais: pedido.profissionais,
              valorCentavos: cotacao.valorCentavos,
              periodoComecaEm: cotacao.periodoComecaEm,
              periodoTerminaEm: cotacao.periodoTerminaEm,
              antesSituacao: linha.situacao,
              antesPlano: linha.plano,
              antesCiclo: linha.ciclo,
              antesForma: linha.forma,
              antesPeriodoTerminaEm: linha.periodoTerminaEm,
              antesProfissionais: linha.profissionaisContratados,
            },
          });
          // A assinatura do cartão, se havia, já morreu (o 409 do cotar
          // garante): o id sai, o cliente na Stripe fica. O fim do teste
          // nunca muda.
          await tx.assinatura.update({
            where: { barbeariaId },
            data: {
              situacao: "ativa",
              forma: "pix",
              plano: pedido.plano,
              ciclo: pedido.ciclo,
              profissionaisContratados: pedido.profissionais,
              periodoTerminaEm: cotacao.periodoTerminaEm,
              stripeSubscriptionId: null,
              cancelaEm: null,
            },
          });
          return criado;
        });
        return reply.code(201).send(serializarPagamentoPix(pagamento, config));
      } catch (erro) {
        // O índice parcial: outro "Já paguei" passou na frente, ou (raro)
        // o identificador bateu com o de outro Pix que vale.
        if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === "P2002") {
          if (String(erro.meta?.target ?? "").includes("identificador")) {
            throw new ErroHttp(409, "identificador_repetido", "tente de novo amanhã ou fale com o suporte");
          }
          throw emConferencia();
        }
        throw erro;
      }
    }
  );

  // "Ainda não paguei": desfaz o aguardando e volta ao que era antes.
  app.post(
    "/barbearias/me/assinatura/pix/:id/desfazer",
    { onRequest: exigirPapel("dono"), schema: { params: paramsComId } },
    async (request) => {
      const desfeito = await prisma.$transaction(async (tx) => {
        const pagamento = await pagamentoAguardando(tx, request.params.id, request.user.barbeariaId);
        await voltarAoQueEra(tx, pagamento);
        return tx.pagamentoPix.update({
          where: { id: pagamento.id },
          data: { situacao: "desfeito", decididoEm: new Date() },
        });
      });
      return serializarPagamentoPix(desfeito, app.pix);
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
  // Portal da Stripe, configurado pelo dono no painel dela. Com mais
  // profissionais do que o Essencial aceita, o Portal não oferece a
  // descida — a mesma regra do Checkout.
  app.post("/barbearias/me/assinatura/portal", { onRequest: exigirPapel("dono") }, async (request) => {
    const { barbeariaId } = request.user;
    const linha = await prisma.assinatura.findUniqueOrThrow({
      where: { barbeariaId },
      select: { stripeCustomerId: true },
    });
    if (!linha.stripeCustomerId) throw conflito("a barbearia ainda não assinou um plano");
    const limiteDoEssencial = limiteDeProfissionais("essencial");
    const semDescida = limiteDoEssencial !== null && (await contarProfissionais(barbeariaId)) > limiteDoEssencial;
    const portal = await app.cobranca.criarPortal({
      customerId: linha.stripeCustomerId,
      urlDeVolta: telaDeFaturas(),
      semDescida,
    });
    if (semDescida && !portal.semDescida) {
      request.log.warn({ barbeariaId }, "Portal sem a configuração sem_descida: rode o script criar-precos");
    }
    return { url: portal.url };
  });
}
