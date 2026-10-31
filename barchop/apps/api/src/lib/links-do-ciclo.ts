import { randomUUID } from "node:crypto";
import { Prisma, prisma } from "@barchop/database";
import { formatarReais } from "@barchop/formato";
import { enderecoDasBarbearias } from "./endereco";
import { ErroHttp } from "./erro-http";
import { agoraNaBarbearia, dataParaDate, dateParaData, somarDias } from "./horas";
import { notificarQuemVende } from "./notificacoes";
import { ErroDoProvedor, type FabricaDeProvedores, type PagamentoDoLink, type ProvedorDeLink } from "./provedores";
import { INCLUDE_ASSINATURA, registrarMensalidadeOnline, type Avisar, type LogDoWebhook } from "./webhook-dos-planos";

// O link de pagamento de cada ciclo, na InfinitePay (plano
// pagamentos-online-infinitepay, PR 4). Ela não renova sozinha: o
// BarChop gera um link por assinatura e vencimento, e confere cada
// pagamento no `payment_check`, venha o aviso de onde vier (o aviso da
// InfinitePay, a volta do comprador pela página, a varredura do PR 5).

// A InfinitePay não cobra menos de R$ 1,00 (decisão 15). O valor mora no
// formato, que a tela também lê.
export { MINIMO_DA_INFINITEPAY_CENTAVOS } from "@barchop/formato";

// A página da barbearia, pra onde o comprador volta depois de pagar. Em
// produção, sem o endereço configurado, não há pra onde voltar; fora
// dela, o painel local.
export function paginaDaBarbearia(env: Record<string, string | undefined> = process.env): ((slug: string) => string) | null {
  const endereco = enderecoDasBarbearias(env);
  if (endereco) return endereco;
  return env.NODE_ENV === "production" ? null : (slug) => `http://localhost:3000/${slug}`;
}

export interface PedidoDeLink {
  conexaoId: string;
  // A barbearia, pra a volta do comprador.
  slug: string;
  // AAAA-MM-DD: o dia em que o ciclo pago começa.
  vencimento: string;
  valorCentavos: number;
  descricao: string;
  cliente: { nome: string; email: string | null; telefone: string | null };
  // Os dias da conta: o link vale até o dia em que a assinatura cancela
  // (decisões 6 e 7).
  diasParaCancelar: number;
}

export interface LinkCriado {
  orderNsu: string;
  url: string;
  vencimento: string;
  validoAte: string;
  valorCentavos: number;
}

// Pede o link à InfinitePay. É rede: fora da transação. O `orderNsu` é a
// referência que volta no aviso e na página. A volta vai sem query: a
// InfinitePay junta a dela (`order_nsu`, `transaction_nsu`, `slug`).
export async function criarLinkNaInfinitePay(
  fabrica: FabricaDeProvedores,
  provedor: ProvedorDeLink,
  pedido: PedidoDeLink
): Promise<LinkCriado> {
  const pagina = paginaDaBarbearia();
  const aviso = fabrica.urlDoWebhook("infinitepay", pedido.conexaoId);
  if (pagina === null || aviso === null) {
    throw new ErroHttp(
      503,
      "pagamentos_online_sem_endereco",
      "a API não sabe o endereço dela ou o das barbearias, e a InfinitePay não teria pra onde mandar o pagamento"
    );
  }
  const orderNsu = randomUUID();
  const validoAte = somarDias(pedido.vencimento, pedido.diasParaCancelar);
  const { url } = await provedor.criarLink({
    orderNsu,
    valorCentavos: pedido.valorCentavos,
    descricao: pedido.descricao,
    cliente: pedido.cliente,
    redirectUrl: `${pagina(pedido.slug)}/minha-conta`,
    webhookUrl: aviso,
    validoAte,
  });
  return { orderNsu, url, vencimento: pedido.vencimento, validoAte, valorCentavos: pedido.valorCentavos };
}

// O link que as telas mostram: o aberto que vence antes, o que destrava
// o ciclo.
export const LINK_ABERTO = {
  where: { situacao: "aberto" },
  orderBy: { vencimento: "asc" },
  take: 1,
  select: { url: true, vencimento: true },
} satisfies Prisma.AssinaturaDoCliente$linksArgs;

// `enviadoEm`: o link que o cliente já recebeu (o do assinar, na tela)
// não vai de novo por e-mail.
export function linkParaGravar(
  barbeariaId: string,
  assinaturaId: string,
  link: LinkCriado,
  enviadoEm: Date | null = null
): Prisma.LinkDoCicloUncheckedCreateInput {
  return {
    enviadoEm,
    barbeariaId,
    assinaturaId,
    vencimento: dataParaDate(link.vencimento),
    valorCentavos: link.valorCentavos,
    orderNsu: link.orderNsu,
    url: link.url,
    validoAte: dataParaDate(link.validoAte),
  };
}

// O que a conferência deu. `pago`, `valor_diferente` e `estornar` são
// finais: a transação fica em evento_do_provedor e não é conferida de
// novo. `nao_pago` e `sem_conta` podem mudar.
export type ConferenciaDoLink = "pago" | "nao_pago" | "valor_diferente" | "estornar" | "sem_conta";

const FINAIS: readonly ConferenciaDoLink[] = ["pago", "valor_diferente", "estornar"];

// Confere o pagamento de um link na InfinitePay e aplica (decisões 9 e
// 11). Só vale com `paid: true` e o valor do link: entra no caixa o
// `amount`, uma vez por transação, e o ciclo segue o vencimento do link,
// ou recomeça hoje se pago atrasado. Pago numa assinatura cancelada, ou
// num link que o BarChop fechou, não entra: o sino pede o estorno no app,
// porque a API dela não estorna. O erro do provedor sobe: quem chama
// responde (o aviso, 400 pra InfinitePay repetir; a página, 502).
export async function confirmarPagamentoDoLink(params: {
  fabrica: FabricaDeProvedores;
  linkId: string;
  transactionNsu: string;
  slug: string;
  log: LogDoWebhook;
}): Promise<ConferenciaDoLink> {
  const { fabrica, linkId, transactionNsu, slug, log } = params;
  const chave = { provedor: "infinitepay", id: transactionNsu };
  const link = await prisma.linkDoCiclo.findUniqueOrThrow({
    where: { id: linkId },
    include: { assinatura: { select: { conexao: true } } },
  });
  // Atalho: esta transação já foi conferida. A decisão de verdade é
  // dentro da transação, com a barbearia travada.
  const ja = await prisma.eventoDoProvedor.findUnique({ where: { provedor_id: chave } });
  if (ja) return ja.tipo as ConferenciaDoLink;

  // A conta desligada não tem mais a chave: não há como perguntar.
  const conexao = link.assinatura.conexao;
  if (!conexao || conexao.desconectadaEm !== null) {
    log.warn({ linkId, transactionNsu }, "pagamento da InfinitePay numa conta desligada: não há como conferir");
    return "sem_conta";
  }
  const provedor = fabrica.daConexao(conexao);
  if (provedor.cobra !== "link") throw new Error(`o link do ciclo ${linkId} é de uma conexão que não cobra por link`);

  // Rede, fora da transação.
  let pagamento: PagamentoDoLink;
  try {
    pagamento = await provedor.conferirPagamento({ orderNsu: link.orderNsu, transactionNsu, slug });
  } catch (erro) {
    if (erro instanceof ErroDoProvedor) {
      log.warn({ codigo: erro.codigo, mensagem: erro.message, linkId }, "a InfinitePay não conferiu o pagamento");
    }
    throw erro;
  }

  return prisma.$transaction(async (tx) => {
    // A linha da barbearia é o cadeado, como no webhook dos planos: o
    // fechar do dia e duas conferências da mesma transação esperam.
    await tx.$queryRaw`SELECT id FROM barbearia WHERE id = ${link.barbeariaId}::uuid FOR NO KEY UPDATE`;
    const conferida = await tx.eventoDoProvedor.findUnique({ where: { provedor_id: chave } });
    if (conferida) return conferida.tipo as ConferenciaDoLink;
    const atual = await tx.linkDoCiclo.findUniqueOrThrow({ where: { id: link.id } });
    const assinatura = await tx.assinaturaDoCliente.findUniqueOrThrow({
      where: { id: link.assinaturaId },
      include: INCLUDE_ASSINATURA,
    });
    const avisar: Avisar = (aviso) =>
      notificarQuemVende(
        tx,
        { barbeariaId: assinatura.barbeariaId, vendedorId: assinatura.plano.vendedorId },
        { ...aviso, link: `/painel/clientes/${assinatura.clienteId}` }
      );
    const concluir = async (resultado: ConferenciaDoLink) => {
      if (FINAIS.includes(resultado)) await tx.eventoDoProvedor.create({ data: { ...chave, tipo: resultado } });
      return resultado;
    };

    if (!pagamento.pago) {
      // A transação fica no link, uma vez, pra a varredura conferir de
      // novo (o Pix que ainda não caiu).
      if (atual.situacao === "aberto" && atual.transactionNsu === null) {
        await tx.linkDoCiclo.update({ where: { id: atual.id }, data: { transactionNsu, slug } });
      }
      return concluir("nao_pago");
    }
    const { cliente, plano } = assinatura;
    const estornar = async (motivo: string) => {
      await avisar({
        titulo: "Estorne o pagamento",
        texto: `${cliente.nome} pagou ${formatarReais(pagamento.valorCentavos)} do plano ${plano.nome} pela InfinitePay, mas ${motivo}. O caixa não mudou: estorne no app da InfinitePay.`,
      });
      return concluir("estornar");
    };

    // Outra transação confirmada no link já pago é dinheiro a mais (o
    // `single_payment` devia impedir, e sem sandbox não há como ver).
    if (atual.situacao === "pago") {
      if (atual.transactionNsu === transactionNsu) return concluir("pago");
      return estornar("esta mensalidade já tinha sido paga");
    }

    if (pagamento.valorCentavos !== atual.valorCentavos) {
      log.warn(
        { linkId, esperado: atual.valorCentavos, pago: pagamento.valorCentavos },
        "a InfinitePay confirmou um valor diferente do link"
      );
      await avisar({
        titulo: "Pagamento com valor diferente",
        texto: `A InfinitePay confirmou ${formatarReais(pagamento.valorCentavos)} de ${cliente.nome} no plano ${plano.nome}, mas o link era de ${formatarReais(atual.valorCentavos)}. O caixa não mudou: confira no app da InfinitePay.`,
      });
      return concluir("valor_diferente");
    }

    if (assinatura.situacao === "cancelada" || atual.situacao === "fechado") {
      await tx.linkDoCiclo.update({ where: { id: atual.id }, data: { situacao: "fechado", transactionNsu, slug } });
      return estornar(
        assinatura.situacao === "cancelada"
          ? "a assinatura já estava cancelada"
          : "esta mensalidade já tinha sido recebida no BarChop"
      );
    }

    // Pago atrasado, o ciclo recomeça no dia pago (decisão 2); adiantado,
    // segue o vencimento do link.
    const hoje = agoraNaBarbearia().data;
    const doLink = dateParaData(atual.vencimento);
    await registrarMensalidadeOnline(
      tx,
      assinatura,
      {
        idExterno: transactionNsu,
        valorCentavos: pagamento.valorCentavos,
        forma: pagamento.forma,
        vencimento: doLink > hoje ? doLink : hoje,
      },
      avisar
    );
    await tx.linkDoCiclo.update({
      where: { id: atual.id },
      data: { situacao: "pago", transactionNsu, slug, pagoEm: new Date() },
    });
    return concluir("pago");
  });
}
