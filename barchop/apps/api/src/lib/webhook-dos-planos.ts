import { Prisma, prisma } from "@barchop/database";
import {
  assinanteUsaOPlano,
  cicloPagoOnline,
  dividirMensalidade,
  type CicloDoCliente,
  type SituacaoDoAssinante,
} from "@barchop/formato";
import { agoraNaBarbearia, dataParaDate, dateParaData } from "./horas";
import { notificarQuemVende } from "./notificacoes";
import { proximoDiaAberto } from "./planos-do-cliente";
import {
  comMaiuscula,
  ErroDoProvedor,
  nomeDoProvedor,
  type CobrancaNoProvedor,
  type EventoDoProvedor,
  type NomeDoProvedor,
  type Provedor,
} from "./provedores";

// O que o webhook dos planos faz com o evento, igual pra todos os
// provedores (plano pagamentos-online-stripe, PRs 1 e 4). A rota de cada
// um acha a conexão, confere a origem e lê o evento; daí em diante é
// `receberEvento`.
//
// Regras, as do webhook da cobrança do BarChop:
// - o estado vem relido no provedor, nunca do evento, porque os eventos
//   chegam fora de ordem;
// - a releitura (rede) fica fora da transação; falhou, 500 sem gravar o
//   evento, e o provedor tenta de novo;
// - o evento é gravado na mesma transação da mudança: o mesmo evento
//   entregue duas vezes só vale uma;
// - dado estranho (assinatura que o BarChop não conhece) vai pro log e
//   responde 200: um erro aí faria o provedor tentar até parar a fila.

export interface LogDoWebhook {
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

export async function aplicar(
  tx: Prisma.TransactionClient,
  params: {
    conexao: { id: string; barbeariaId: string };
    provedor: NomeDoProvedor;
    idDaAssinatura: string;
    cobranca: CobrancaNoProvedor | null;
    // Só no evento da assinatura: se ela parou no provedor.
    parou: boolean | null;
    evento: EventoDoProvedor;
    log: LogDoWebhook;
  }
): Promise<void> {
  const { conexao, provedor, idDaAssinatura, cobranca, parou, evento, log } = params;
  const nome = nomeDoProvedor(provedor);
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
    log.info({ evento: evento.id, assinatura: idDaAssinatura }, `webhook ${nome.do} de assinatura que não é do BarChop`);
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
        texto: `${comMaiuscula(nome.o)} estornou a mensalidade de ${assinatura.cliente.nome} no plano ${assinatura.plano.nome}. O caixa não mudou: acerte à mão se precisar.`,
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

export async function receberEvento(params: {
  conexao: { id: string; barbeariaId: string };
  provedor: Provedor;
  evento: EventoDoProvedor;
  log: LogDoWebhook;
}): Promise<void> {
  const { conexao, provedor, evento, log } = params;
  const nome = nomeDoProvedor(provedor.nome);
  const chave = { provedor: provedor.nome, id: evento.id };
  if (await prisma.eventoDoProvedor.findUnique({ where: { provedor_id: chave } })) return;

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
    log.warn({ evento: evento.id }, `webhook ${nome.do} sobre o que ${nome.o} não acha mais`);
  }
  const idDaAssinatura = evento.cobrancaId ? (cobranca?.assinaturaId ?? null) : evento.assinaturaId;

  try {
    await prisma.$transaction(async (tx) => {
      await tx.eventoDoProvedor.create({ data: { ...chave, tipo: evento.tipo.slice(0, 100) } });
      if (idDaAssinatura) {
        await aplicar(tx, { conexao, provedor: provedor.nome, idDaAssinatura, cobranca, parou, evento, log });
      }
    });
  } catch (erro) {
    // Duas entregas do mesmo evento ao mesmo tempo: a segunda bate na
    // chave e já foi aplicada pela primeira.
    if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === "P2002") return;
    throw erro;
  }
}
