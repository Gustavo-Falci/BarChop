import { Prisma, prisma } from "@barchop/database";
import { formatarReais } from "@barchop/formato";
import type { CanalDeMensagem } from "./canal";
import type { Fila } from "./fila";
import { agoraNaBarbearia, dataParaDate, dateParaData, somarDias } from "./horas";
import { confirmarPagamentoDoLink, criarLinkNaInfinitePay, linkParaGravar } from "./links-do-ciclo";
import { notificarQuemVende } from "./notificacoes";
import { marcarAtrasadas } from "./planos-do-cliente";
import { ErroDoProvedor, type FabricaDeProvedores } from "./provedores";
import type { LogDoWebhook } from "./webhook-dos-planos";

// A varredura diária dos ciclos por link (plano
// pagamentos-online-infinitepay, PR 5). A InfinitePay não renova
// sozinha, e quem toca o ciclo é o BarChop, todo dia às 8h de São
// Paulo, assinatura por assinatura:
// 1. o link aberto com a transação conhecida (a página voltou, e a
//    conferência não fechou) é conferido de novo;
// 2. o link aberto que passou da validade sem pagar cancela a assinatura
//    (decisões 2 e 7): o sino avisa quem vende, e o e-mail, o cliente;
// 3. o ciclo vencido sem pagar fica em atraso no dia seguinte, com o
//    sino, e o link vai de novo por e-mail;
// 4. o link do próximo ciclo sai 3 dias antes do vencimento;
// 5. o link que não foi enviado vai por e-mail; sem e-mail, o sino pede
//    pra quem vende mandar pelo WhatsApp (decisão 13).
// Cada passo relê e decide, e marca antes de mandar: rodar duas vezes no
// mesmo dia não repete nada. A falha numa assinatura vai pro log e não
// para as outras; o que não saiu hoje sai amanhã.

export const TRABALHO_CICLOS_POR_LINK = "ciclos-por-link";
const CRON_DOS_CICLOS = "0 8 * * *";
// O link do próximo ciclo sai esses dias antes do vencimento (decisão 2).
const DIAS_DE_ANTECEDENCIA = 3;

export interface DepsDosCiclos {
  fabrica: FabricaDeProvedores;
  canal: CanalDeMensagem;
  log: LogDoWebhook;
}

const INCLUDE_DA_VARREDURA = {
  cliente: { select: { nome: true, email: true, telefone: true } },
  plano: { select: { nome: true, vendedorId: true } },
  barbearia: { select: { nome: true, slug: true } },
  conexao: true,
} satisfies Prisma.AssinaturaDoClienteInclude;

type AssinaturaDaVarredura = Prisma.AssinaturaDoClienteGetPayload<{ include: typeof INCLUDE_DA_VARREDURA }>;
type LinkGravado = Prisma.LinkDoCicloGetPayload<object>;

// "2026-11-03" → "03/11/2026".
function dataCurta(data: string): string {
  const [ano, mes, dia] = data.split("-");
  return `${dia}/${mes}/${ano}`;
}

const primeiroNome = (nome: string) => nome.split(" ")[0];

function quemVende(assinatura: AssinaturaDaVarredura) {
  return { barbeariaId: assinatura.barbeariaId, vendedorId: assinatura.plano.vendedorId };
}

const linkDoPainel = (assinatura: AssinaturaDaVarredura) => `/painel/clientes/${assinatura.clienteId}`;

export async function varrerCiclosPorLink(deps: DepsDosCiclos): Promise<void> {
  const hoje = agoraNaBarbearia().data;
  const vivas = await prisma.assinaturaDoCliente.findMany({
    where: { forma: "online", situacao: { not: "cancelada" }, conexao: { provedor: "infinitepay" } },
    select: { id: true, barbeariaId: true },
    orderBy: { criadoEm: "asc" },
  });
  // O ciclo já pago adiantado (`pagoAte`) entra antes de decidir o resto.
  for (const barbeariaId of new Set(vivas.map((viva) => viva.barbeariaId))) {
    await marcarAtrasadas(prisma, barbeariaId, hoje, { conexao: { provedor: "infinitepay" } });
  }
  for (const { id } of vivas) {
    try {
      await varrerAssinatura(id, hoje, deps);
    } catch (erro) {
      deps.log.warn({ assinaturaId: id, erro: String(erro) }, "a varredura dos ciclos por link falhou nesta assinatura");
    }
  }
}

async function varrerAssinatura(id: string, hoje: string, deps: DepsDosCiclos): Promise<void> {
  const { fabrica, log } = deps;

  // 1. A conferência de novo. Fora do ar, fica pra amanhã.
  const aConferir = await prisma.linkDoCiclo.findMany({
    where: { assinaturaId: id, situacao: "aberto", transactionNsu: { not: null }, slug: { not: null } },
  });
  for (const link of aConferir) {
    try {
      await confirmarPagamentoDoLink({ fabrica, linkId: link.id, transactionNsu: link.transactionNsu!, slug: link.slug!, log });
    } catch (erro) {
      if (!(erro instanceof ErroDoProvedor)) throw erro;
    }
  }

  const assinatura = await prisma.assinaturaDoCliente.findUniqueOrThrow({ where: { id }, include: INCLUDE_DA_VARREDURA });
  if (assinatura.situacao === "cancelada") return;

  // 2. O link aberto que passou da validade: no último dia ele ainda
  // paga, e o cancelamento é no seguinte.
  const vencido = await prisma.linkDoCiclo.findFirst({
    where: { assinaturaId: id, situacao: "aberto", validoAte: { lt: dataParaDate(hoje) } },
  });
  if (vencido) {
    await cancelarPorFaltaDePagamento(assinatura, deps);
    return;
  }

  // 3. O atraso, no dia seguinte ao vencimento.
  const termina = assinatura.cicloTerminaEm ? dateParaData(assinatura.cicloTerminaEm) : null;
  if (termina !== null && termina < hoje && assinatura.pagoAte === null) {
    await marcarAtraso(assinatura);
    await reenviarNoAtraso(assinatura, termina, deps);
  }

  // 4. O link do próximo ciclo. A pendente já tem o dela (o assinar).
  const proximo = assinatura.pagoAte ? dateParaData(assinatura.pagoAte) : termina;
  if (proximo !== null && somarDias(proximo, -DIAS_DE_ANTECEDENCIA) <= hoje) {
    await gerarLink(assinatura, proximo, deps);
  }

  // 5. O que ainda não foi mandado.
  const naoEnviados = await prisma.linkDoCiclo.findMany({ where: { assinaturaId: id, situacao: "aberto", enviadoEm: null } });
  for (const link of naoEnviados) await enviarLink(assinatura, link, deps);
}

async function gerarLink(assinatura: AssinaturaDaVarredura, vencimento: string, deps: DepsDosCiclos): Promise<void> {
  const conexao = assinatura.conexao!;
  if (conexao.desconectadaEm !== null) return;
  const ja = await prisma.linkDoCiclo.count({ where: { assinaturaId: assinatura.id, vencimento: dataParaDate(vencimento) } });
  if (ja > 0) return;
  const provedor = deps.fabrica.daConexao(conexao);
  if (provedor.cobra !== "link") return;

  // Rede, fora de transação. O link criado sem gravar (outra varredura
  // gravou antes) não chega a ninguém.
  let criado;
  try {
    criado = await criarLinkNaInfinitePay(deps.fabrica, provedor, {
      conexaoId: conexao.id,
      slug: assinatura.barbearia.slug,
      vencimento,
      valorCentavos: assinatura.precoCentavos,
      descricao: assinatura.plano.nome,
      cliente: assinatura.cliente,
      diasParaCancelar: conexao.diasParaCancelar!,
    });
  } catch (erro) {
    if (erro instanceof ErroDoProvedor) {
      deps.log.warn(
        { assinaturaId: assinatura.id, codigo: erro.codigo, mensagem: erro.message },
        "a InfinitePay não criou o link do ciclo"
      );
      return;
    }
    throw erro;
  }
  try {
    await prisma.linkDoCiclo.create({ data: linkParaGravar(assinatura.barbeariaId, assinatura.id, criado) });
  } catch (erro) {
    if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === "P2002") return;
    throw erro;
  }
}

// A marca é reivindicada antes do envio e devolvida se ele falhar: a
// próxima varredura tenta de novo.
async function enviarLink(assinatura: AssinaturaDaVarredura, link: LinkGravado, deps: DepsDosCiclos): Promise<void> {
  const { count } = await prisma.linkDoCiclo.updateMany({
    where: { id: link.id, situacao: "aberto", enviadoEm: null },
    data: { enviadoEm: new Date() },
  });
  if (count === 0) return;

  const { cliente, plano, barbearia } = assinatura;
  if (!cliente.email) {
    await notificarQuemVende(prisma, quemVende(assinatura), {
      titulo: "Link do ciclo pronto: mande pelo WhatsApp",
      texto: `${cliente.nome} não tem e-mail. Mande pelo WhatsApp o link da mensalidade do plano ${plano.nome}, que vence em ${dataCurta(dateParaData(link.vencimento))}: ${link.url}`,
      link: linkDoPainel(assinatura),
    });
    return;
  }
  try {
    await deps.canal.enviar({
      para: cliente.email,
      assunto: `Mensalidade do plano ${plano.nome} na ${barbearia.nome}`,
      texto:
        `Olá, ${primeiroNome(cliente.nome)}! A mensalidade do plano ${plano.nome} (${formatarReais(link.valorCentavos)}) ` +
        `vence em ${dataCurta(dateParaData(link.vencimento))}. Pague por Pix ou cartão neste link: ${link.url}\n\n` +
        `O link vale até ${dataCurta(dateParaData(link.validoAte))}. O plano não renova sozinho: a cada mensalidade chega um link novo.`,
    });
  } catch (erro) {
    await prisma.linkDoCiclo.updateMany({ where: { id: link.id }, data: { enviadoEm: null } });
    deps.log.warn({ linkId: link.id, erro: String(erro) }, "o e-mail do link do ciclo não saiu");
  }
}

async function marcarAtraso(assinatura: AssinaturaDaVarredura): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const { count } = await tx.assinaturaDoCliente.updateMany({
      where: { id: assinatura.id, situacao: { in: ["ativa", "teste"] }, pagoAte: null },
      data: { situacao: "em_atraso" },
    });
    if (count === 0) return;
    const { cliente, plano } = assinatura;
    const reenvio = cliente.email
      ? "O link vai de novo para o cliente por e-mail."
      : `${cliente.nome} não tem e-mail: mande o link de novo pelo WhatsApp.`;
    await notificarQuemVende(tx, quemVende(assinatura), {
      titulo: "Pagamento em atraso",
      texto: `A mensalidade de ${cliente.nome} no plano ${plano.nome} venceu e não foi paga. ${reenvio}`,
      link: linkDoPainel(assinatura),
    });
  });
}

// Uma vez por link, só por e-mail: o sino do atraso já avisou quem vende.
async function reenviarNoAtraso(assinatura: AssinaturaDaVarredura, vencimento: string, deps: DepsDosCiclos): Promise<void> {
  const { cliente, plano, barbearia } = assinatura;
  if (!cliente.email) return;
  const link = await prisma.linkDoCiclo.findFirst({
    where: { assinaturaId: assinatura.id, vencimento: dataParaDate(vencimento), situacao: "aberto", reenviadoEm: null },
  });
  if (!link) return;
  const { count } = await prisma.linkDoCiclo.updateMany({
    where: { id: link.id, reenviadoEm: null },
    data: { reenviadoEm: new Date() },
  });
  if (count === 0) return;
  try {
    await deps.canal.enviar({
      para: cliente.email,
      assunto: `Mensalidade em atraso: plano ${plano.nome}`,
      texto:
        `Olá, ${primeiroNome(cliente.nome)}! A mensalidade do plano ${plano.nome} na ${barbearia.nome} venceu em ` +
        `${dataCurta(vencimento)} e ainda não foi paga. Pague por este link até ${dataCurta(dateParaData(link.validoAte))}, ` +
        `ou a assinatura será cancelada: ${link.url}`,
    });
  } catch (erro) {
    await prisma.linkDoCiclo.updateMany({ where: { id: link.id }, data: { reenviadoEm: null } });
    deps.log.warn({ linkId: link.id, erro: String(erro) }, "o e-mail do link em atraso não saiu");
  }
}

async function cancelarPorFaltaDePagamento(assinatura: AssinaturaDaVarredura, deps: DepsDosCiclos): Promise<void> {
  const { cliente, plano, barbearia } = assinatura;
  const primeira = assinatura.situacao === "pendente";
  const cancelou = await prisma.$transaction(async (tx) => {
    const { count } = await tx.assinaturaDoCliente.updateMany({
      where: { id: assinatura.id, situacao: { not: "cancelada" } },
      data: { situacao: "cancelada", canceladaEm: new Date() },
    });
    if (count === 0) return false;
    // O link pago depois disso pede o estorno (decisão 11).
    await tx.linkDoCiclo.updateMany({ where: { assinaturaId: assinatura.id, situacao: "aberto" }, data: { situacao: "fechado" } });
    await notificarQuemVende(tx, quemVende(assinatura), {
      titulo: "Assinatura cancelada por falta de pagamento",
      texto: primeira
        ? `${cliente.nome} não pagou a primeira mensalidade do plano ${plano.nome}, e a assinatura foi cancelada.`
        : `A mensalidade de ${cliente.nome} no plano ${plano.nome} não foi paga até o fim da validade do link, e a assinatura foi cancelada.`,
      link: linkDoPainel(assinatura),
    });
    return true;
  });
  if (!cancelou || !cliente.email) return;
  try {
    await deps.canal.enviar({
      para: cliente.email,
      assunto: `Assinatura cancelada: plano ${plano.nome}`,
      texto:
        `Olá, ${primeiroNome(cliente.nome)}! Sua assinatura do plano ${plano.nome} na ${barbearia.nome} foi cancelada ` +
        `porque a mensalidade não foi paga. Para voltar, é só assinar de novo na página da barbearia.`,
    });
  } catch (erro) {
    deps.log.warn({ assinaturaId: assinatura.id, erro: String(erro) }, "o e-mail do cancelamento não saiu");
  }
}

export async function registrarCiclosPorLink(fila: Fila, deps: DepsDosCiclos): Promise<void> {
  await fila.trabalhar(TRABALHO_CICLOS_POR_LINK, () => varrerCiclosPorLink(deps));
  await fila.repetir(TRABALHO_CICLOS_POR_LINK, CRON_DOS_CICLOS);
}
