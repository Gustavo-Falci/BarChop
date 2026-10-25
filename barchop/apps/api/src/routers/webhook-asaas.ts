import { Prisma, prisma } from "@barchop/database";
import {
  assinanteUsaOPlano,
  cicloPagoOnline,
  dividirMensalidade,
  type CicloDoCliente,
  type SituacaoDoAssinante,
} from "@barchop/formato";
import { tokenConfere } from "../lib/cifra";
import { ErroHttp } from "../lib/erro-http";
import { agoraNaBarbearia, dataParaDate, dateParaData } from "../lib/horas";
import { notificarQuemVende } from "../lib/notificacoes";
import { PADRAO_UUID } from "../lib/padroes";
import { proximoDiaAberto } from "../lib/planos-do-cliente";
import { ErroDoProvedor, type CobrancaNoProvedor, type EventoDoProvedor } from "../lib/provedores";
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

interface Log {
  info(objeto: object, mensagem: string): void;
  warn(objeto: object, mensagem: string): void;
}

const INCLUDE_ASSINATURA = {
  cliente: { select: { nome: true } },
  plano: { select: { nome: true, vendedorId: true, vendedor: { select: { parteDaCasa: true } } } },
} satisfies Prisma.AssinaturaDoClienteInclude;

type AssinaturaDoWebhook = Prisma.AssinaturaDoClienteGetPayload<{ include: typeof INCLUDE_ASSINATURA }>;

type Avisar = (aviso: { titulo: string; texto: string }) => Promise<void>;

// Paga: a mensalidade entra no caixa do dia (ou do próximo aberto) e o
// ciclo segue o vencimento da cobrança. O CONFIRMED do cartão e o
// RECEIVED, quando o dinheiro cai, falam da mesma cobrança: ela entra
// uma vez.
async function registrarPagamento(
  tx: Prisma.TransactionClient,
  assinatura: AssinaturaDoWebhook,
  cobranca: CobrancaNoProvedor,
  avisar: Avisar
): Promise<void> {
  const ja = await tx.recebimentoDoPlano.count({ where: { assinaturaId: assinatura.id, idExterno: cobranca.id } });
  if (ja > 0) return;
  const primeira = (await tx.recebimentoDoPlano.count({ where: { assinaturaId: assinatura.id } })) === 0;

  const hoje = agoraNaBarbearia().data;
  // A parte da casa congelada agora, como no "recebi" do balcão, sobre o
  // valor que o provedor cobrou.
  const { plano } = assinatura;
  const partes = dividirMensalidade({
    precoCentavos: cobranca.valorCentavos,
    vendedor: plano.vendedorId,
    parteDaCasa: plano.vendedor?.parteDaCasa ?? 0,
  });
  const dia = await proximoDiaAberto(tx, assinatura.barbeariaId, hoje);
  await tx.recebimentoDoPlano.create({
    data: {
      barbeariaId: assinatura.barbeariaId,
      assinaturaId: assinatura.id,
      data: dataParaDate(dia),
      // O dono da conta que recebeu: a casa (null) no plano da casa.
      recebidoPorId: plano.vendedorId,
      valorCentavos: cobranca.valorCentavos,
      casaCentavos: partes.find((parte) => parte.beneficiario === null)?.valorCentavos ?? 0,
      forma: "online",
      meio: cobranca.forma,
      idExterno: cobranca.id,
    },
  });

  const ciclo = cicloPagoOnline(
    {
      cicloComecaEm: assinatura.cicloComecaEm ? dateParaData(assinatura.cicloComecaEm) : null,
      cicloTerminaEm: assinatura.cicloTerminaEm ? dateParaData(assinatura.cicloTerminaEm) : null,
    },
    cobranca.vencimento,
    assinatura.ciclo as CicloDoCliente,
    hoje
  );
  // `null`: a cobrança é de um ciclo que já passou, paga atrasada. Entra
  // no caixa, e o ciclo de agora fica como está.
  if (ciclo) {
    await tx.assinaturaDoCliente.update({
      where: { id: assinatura.id },
      data: {
        situacao: "ativa",
        cicloComecaEm: dataParaDate(ciclo.cicloComecaEm),
        cicloTerminaEm: dataParaDate(ciclo.cicloTerminaEm),
        pagoAte: ciclo.pagoAte ? dataParaDate(ciclo.pagoAte) : null,
      },
    });
  }

  // "Nova assinatura" só quando o dinheiro entra: assinar e nunca pagar
  // não avisa ninguém.
  if (primeira) {
    await avisar({
      titulo: "Nova assinatura",
      texto: `${assinatura.cliente.nome} assinou o plano ${plano.nome} e pagou a primeira mensalidade.`,
    });
  }
}

// Vencida: só a cobrança da renovação deixa a assinatura em atraso. A de
// um ciclo velho, a já paga, ou com o ciclo seguinte já pago, não.
async function marcarAtraso(
  tx: Prisma.TransactionClient,
  assinatura: AssinaturaDoWebhook,
  cobranca: CobrancaNoProvedor,
  avisar: Avisar
): Promise<void> {
  if (!assinanteUsaOPlano(assinatura.situacao as SituacaoDoAssinante) || assinatura.pagoAte !== null) return;
  const termina = assinatura.cicloTerminaEm ? dateParaData(assinatura.cicloTerminaEm) : null;
  if (termina !== null && cobranca.vencimento < termina) return;
  const paga = await tx.recebimentoDoPlano.count({ where: { assinaturaId: assinatura.id, idExterno: cobranca.id } });
  if (paga > 0) return;

  await tx.assinaturaDoCliente.update({ where: { id: assinatura.id }, data: { situacao: "em_atraso" } });
  await avisar({
    titulo: "Pagamento em atraso",
    texto: `A mensalidade de ${assinatura.cliente.nome} no plano ${assinatura.plano.nome} venceu e não foi paga.`,
  });
}

async function aplicar(
  tx: Prisma.TransactionClient,
  params: {
    conexao: { id: string; barbeariaId: string };
    idDaAssinatura: string;
    cobranca: CobrancaNoProvedor | null;
    // Só no evento da assinatura: se ela parou no provedor.
    parou: boolean | null;
    evento: EventoDoProvedor;
    log: Log;
  }
): Promise<void> {
  const { conexao, idDaAssinatura, cobranca, parou, evento, log } = params;
  // A linha da barbearia é o cadeado: o fechar do dia trava a mesma (o
  // recebimento vai pro dia aberto), e duas entregas da mesma cobrança ao
  // mesmo tempo viram uma só.
  await tx.$queryRaw`SELECT id FROM barbearia WHERE id = ${conexao.barbeariaId}::uuid FOR NO KEY UPDATE`;
  const assinatura = await tx.assinaturaDoCliente.findFirst({
    where: { conexaoId: conexao.id, idExterno: idDaAssinatura },
    include: INCLUDE_ASSINATURA,
  });
  // A conta do vendedor recebe também o que ele vende fora do BarChop, e
  // o webhook ouve tudo: não é erro.
  if (!assinatura) {
    log.info({ evento: evento.id, assinatura: idDaAssinatura }, "webhook do Asaas de assinatura que não é do BarChop");
    return;
  }

  const avisar: Avisar = (aviso) =>
    notificarQuemVende(
      tx,
      { barbeariaId: assinatura.barbeariaId, vendedorId: assinatura.plano.vendedorId },
      { ...aviso, link: `/painel/clientes/${assinatura.clienteId}` }
    );

  // A assinatura parou no provedor (apagada pelo vendedor, ou expirada):
  // aqui também.
  if (parou !== null) {
    if (parou && assinatura.situacao !== "cancelada") {
      await tx.assinaturaDoCliente.update({
        where: { id: assinatura.id },
        data: { situacao: "cancelada", canceladaEm: new Date() },
      });
    }
    return;
  }
  if (!cobranca || cobranca.removida) return;

  // O estorno não mexe no caixa (o dia pode estar fechado): avisa quem
  // vende, pra acertar à mão.
  if (cobranca.situacao === "estornada") {
    const entrou = await tx.recebimentoDoPlano.count({ where: { assinaturaId: assinatura.id, idExterno: cobranca.id } });
    if (entrou > 0) {
      await avisar({
        titulo: "Pagamento estornado",
        texto: `O Asaas estornou a mensalidade de ${assinatura.cliente.nome} no plano ${assinatura.plano.nome}. O caixa não mudou: acerte à mão se precisar.`,
      });
    }
    return;
  }

  if (assinatura.situacao === "cancelada") {
    if (cobranca.situacao === "paga") {
      log.warn({ evento: evento.id, assinatura: assinatura.id }, "cobrança paga numa assinatura cancelada no BarChop");
    }
    return;
  }
  if (cobranca.situacao === "paga") await registrarPagamento(tx, assinatura, cobranca, avisar);
  if (cobranca.situacao === "vencida") await marcarAtraso(tx, assinatura, cobranca, avisar);
}

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
          await aplicar(tx, { conexao, idDaAssinatura, cobranca, parou, evento, log: request.log });
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
