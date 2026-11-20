import type { FastifyRequest } from "fastify";
import { Prisma, prisma } from "@barchop/database";
import { CICLOS, limiteDeProfissionais } from "@barchop/formato";
import { conferirPedidoDoPlano, contarProfissionais, resumoDaAssinatura } from "../lib/assinatura";
import { fimDoTesteNaCobranca } from "../lib/cobranca";
import { ErroHttp, conflito } from "../lib/erro-http";
import { PADRAO_UUID } from "../lib/padroes";
import { enviarConvite } from "../lib/convite";
import {
  cotar,
  cotarDiferenca,
  exigirPix,
  liberarAguardando,
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

interface Liberado {
  email: string | null;
  senhaHash: string | null;
}

// Quem entrou pelo Pix e ainda não tem senha recebe o convite agora (o
// convite não saiu enquanto aguardava). Depois do commit, como na equipe.
async function convidarLiberados(
  app: App,
  request: FastifyRequest,
  barbeariaId: string,
  liberados: Liberado[]
): Promise<void> {
  for (const membro of liberados) {
    if (membro.senhaHash === null && membro.email) await enviarConvite(app, request, { email: membro.email, barbeariaId });
  }
}

function emConferencia(): ErroHttp {
  return new ErroHttp(409, "pix_em_conferencia", "já há um Pix em conferência: espere o suporte ou desfaça");
}

// O "Já paguei" libera o plano na hora e a recusa do Suporte só desfaz.
// Sem teto, dava pra declarar de novo depois de cada recusa e usar o
// plano pago sem pagar, pelo tempo que a conferência levasse (auditoria
// de 15/11, SEC-005). Duas recusas em 30 dias fecham o Pix da barbearia
// até o Suporte ser procurado: uma só não fecha, porque quem errou o
// valor precisa conseguir pagar de novo. O cartão continua aberto.
//
// Só a recusa do Suporte conta. O "desfazer" do próprio dono não: é ele
// corrigindo o pedido antes de alguém conferir.
const MAX_RECUSAS_DO_PIX = 2;
const JANELA_DAS_RECUSAS_MS = 30 * 24 * 60 * 60 * 1000;

async function garantirPoucasRecusas(
  tx: Prisma.TransactionClient,
  barbeariaId: string,
  agora: Date
): Promise<void> {
  const recusas = await tx.pagamentoPix.count({
    where: {
      barbeariaId,
      situacao: "recusado",
      decididoEm: { gt: new Date(agora.getTime() - JANELA_DAS_RECUSAS_MS) },
    },
  });
  if (recusas >= MAX_RECUSAS_DO_PIX) {
    throw new ErroHttp(
      409,
      "pix_recusado_demais",
      "O Suporte não achou os seus últimos Pix. Para pagar por Pix de novo, fale com o Suporte do BarChop."
    );
  }
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
      const convidar: Liberado[] = [];
      try {
        const pagamento = await prisma.$transaction(async (tx) => {
          // A linha da assinatura travada: dois "Já paguei" ao mesmo
          // tempo, ou um webhook da Stripe, esperam.
          await tx.$queryRaw`SELECT id FROM assinatura WHERE barbearia_id = ${barbeariaId}::uuid FOR UPDATE`;
          if (await tx.pagamentoPix.findFirst({ where: { barbeariaId, situacao: "aguardando" } })) {
            throw emConferencia();
          }
          await garantirPoucasRecusas(tx, barbeariaId, agora);
          const { cotacao, linha } = await cotar(tx, config, barbeariaId, pedido, agora);
          // Quem aguarda pagamento (plano profissional-novo-pago): um
          // período que começa agora o libera; a renovação adiantada não
          // paga o período de agora, então a diferença vem antes.
          const comecaAgora = cotacao.periodoComecaEm.getTime() <= agora.getTime();
          if (!comecaAgora && (await tx.barbeiro.count({ where: { barbeariaId, aguardaPagamento: true } })) > 0) {
            throw new ErroHttp(
              409,
              "diferenca_pendente",
              "há profissional aguardando o Pix da diferença: pague a diferença antes de renovar"
            );
          }
          const liberados = comecaAgora ? await liberarAguardando(tx, barbeariaId) : [];
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
              liberados: liberados.map((m) => m.id),
            },
          });
          convidar.push(...liberados);
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
        await convidarLiberados(app, request, barbeariaId, convidar);
        return reply.code(201).send(serializarPagamentoPix(pagamento, config));
      } catch (erro) {
        // O índice parcial: outro "Já paguei" passou na frente, ou (raro)
        // o identificador bateu com o de outro Pix em conferência.
        if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === "P2002") {
          if (String(erro.meta?.target ?? "").includes("identificador")) {
            throw new ErroHttp(409, "identificador_repetido", "outro Pix em conferência tem o mesmo identificador: tente de novo em alguns minutos");
          }
          throw emConferencia();
        }
        throw erro;
      }
    }
  );

  // O Pix da diferença (plano profissional-novo-pago): quem passou das
  // vagas pagas no Pix vigente aguarda; o QR cobra o extra deles até o
  // fim do período já pago.
  app.get("/barbearias/me/assinatura/pix/diferenca", { onRequest: exigirPapel("dono") }, async (request) => {
    const config = exigirPix(app.pix);
    const { cotacao } = await cotarDiferenca(prisma, config, request.user.barbeariaId, new Date());
    return serializarCotacao(config, cotacao);
  });

  // "Já paguei" da diferença: quem aguardava entra na hora (com convite)
  // e as vagas pagas sobem, à espera da conferência do Suporte, como o
  // Pix do período. A recusa volta tudo, e quem entrou volta a aguardar.
  app.post("/barbearias/me/assinatura/pix/diferenca", { onRequest: exigirPapel("dono") }, async (request, reply) => {
    const config = exigirPix(app.pix);
    const { barbeariaId } = request.user;
    const agora = new Date();
    const convidar: Liberado[] = [];
    try {
      const pagamento = await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM assinatura WHERE barbearia_id = ${barbeariaId}::uuid FOR UPDATE`;
        if (await tx.pagamentoPix.findFirst({ where: { barbeariaId, situacao: "aguardando" } })) {
          throw emConferencia();
        }
        // O mesmo teto do Pix do período, e contando as recusas dos dois
        // tipos: aqui o "Já paguei" libera gente na hora (SEC-005).
        await garantirPoucasRecusas(tx, barbeariaId, agora);
        const { cotacao, linha, profissionais } = await cotarDiferenca(tx, config, barbeariaId, agora);
        const liberados = await liberarAguardando(tx, barbeariaId);
        convidar.push(...liberados);
        const criado = await tx.pagamentoPix.create({
          data: {
            barbeariaId,
            tipo: "diferenca",
            identificador: cotacao.identificador,
            plano: linha.plano,
            ciclo: linha.ciclo,
            profissionais,
            valorCentavos: cotacao.valorCentavos,
            periodoComecaEm: cotacao.periodoComecaEm,
            periodoTerminaEm: cotacao.periodoTerminaEm,
            antesSituacao: linha.situacao,
            antesPlano: linha.plano,
            antesCiclo: linha.ciclo,
            antesForma: linha.forma,
            antesPeriodoTerminaEm: linha.periodoTerminaEm,
            antesProfissionais: linha.profissionaisContratados,
            liberados: liberados.map((m) => m.id),
          },
        });
        await tx.assinatura.update({ where: { barbeariaId }, data: { profissionaisContratados: profissionais } });
        return criado;
      });
      await convidarLiberados(app, request, barbeariaId, convidar);
      return reply.code(201).send(serializarPagamentoPix(pagamento, config));
    } catch (erro) {
      // O índice parcial: outro "Já paguei" passou na frente.
      if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === "P2002") throw emConferencia();
      throw erro;
    }
  });

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

  // A lista "Pagamentos" de Faturas: os Pix da barbearia, do mais novo
  // pro mais velho. O desfeito ("Ainda não paguei") não foi pagamento
  // nenhum e fica de fora. Responde mesmo com o Pix desligado.
  app.get("/barbearias/me/assinatura/pix/pagamentos", { onRequest: exigirPapel("dono") }, async (request) => {
    const linhas = await prisma.pagamentoPix.findMany({
      where: { barbeariaId: request.user.barbeariaId, situacao: { not: "desfeito" } },
      orderBy: [{ criadoEm: "desc" }, { id: "desc" }],
    });
    return linhas.map((linha) => serializarPagamentoPix(linha, app.pix));
  });

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
