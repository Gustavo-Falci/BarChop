import { createHmac } from "node:crypto";
import { prisma, type PagamentoPix as LinhaDoPix, type Prisma } from "@barchop/database";
import {
  brCodeDoPix,
  chaveMascarada,
  fimDoPeriodoDoPix,
  inicioDoDiaEmSaoPaulo,
  precoDoPlano,
  type Ciclo,
} from "@barchop/formato";
import type { CotacaoDoPix, PagamentoPix, ResumoDaAssinatura, SituacaoDoPix } from "@barchop/types";
import { conferirPedidoDoPlano } from "./assinatura";
import { ErroHttp } from "./erro-http";

// O Pix do BarChop (plano pix-do-barchop, PR 1). Sem integração com
// banco: a API gera o QR com o valor exato na chave do BarChop, o dono
// toca "Já paguei" e o plano vale na hora; o Suporte confere no extrato.

// A chave, o nome e a cidade do recebedor, e o segredo do identificador.
// Vêm do ambiente (infra/api.env) e nunca do repositório. Falta uma, e
// o Pix fica desligado: a web segue com "Pix · Em breve".
export interface ConfigDoPix {
  chave: string;
  nomeDoRecebedor: string;
  cidadeDoRecebedor: string;
  segredo: string;
}

export function pixDoAmbiente(ambiente: Record<string, string | undefined>): ConfigDoPix | null {
  const chave = ambiente.PIX_CHAVE?.trim();
  const nomeDoRecebedor = ambiente.PIX_NOME_DO_RECEBEDOR?.trim();
  const cidadeDoRecebedor = ambiente.PIX_CIDADE_DO_RECEBEDOR?.trim();
  const segredo = ambiente.PIX_SEGREDO_DO_IDENTIFICADOR?.trim();
  if (!chave || !nomeDoRecebedor || !cidadeDoRecebedor || !segredo) return null;
  return { chave, nomeDoRecebedor, cidadeDoRecebedor, segredo };
}

export function exigirPix(config: ConfigDoPix | null): ConfigDoPix {
  if (!config) throw new ErroHttp(409, "pix_desligado", "o pagamento por Pix ainda não está ligado");
  return config;
}

// 32 símbolos sem os que se confundem (0/O, 1/I): 256 é múltiplo de 32,
// então o resto do byte não puxa pra nenhum.
const SIMBOLOS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

interface PedidoDoPix {
  plano: "essencial" | "completo";
  ciclo: Ciclo;
  profissionais: number;
}

// O txid do QR: 6 símbolos derivados do pedido e do início do período,
// com o segredo do servidor. Estável: recarregar Faturas mostra o mesmo
// QR que o dono pagou, e o "Já paguei" recalcula sem o corpo mandar.
export function identificadorDoPix(
  segredo: string,
  barbeariaId: string,
  periodoComecaEm: Date,
  pedido: PedidoDoPix
): string {
  const texto = [barbeariaId, periodoComecaEm.toISOString(), pedido.plano, pedido.ciclo, pedido.profissionais].join("|");
  const bytes = createHmac("sha256", segredo).update(texto).digest();
  let identificador = "";
  for (let i = 0; i < 6; i += 1) identificador += SIMBOLOS[bytes[i]! % SIMBOLOS.length];
  return identificador;
}

export function copiaEColaDoPix(
  config: ConfigDoPix,
  pagamento: { valorCentavos: number; identificador: string }
): string {
  return brCodeDoPix({
    chave: config.chave,
    nome: config.nomeDoRecebedor,
    cidade: config.cidadeDoRecebedor,
    valorCentavos: pagamento.valorCentavos,
    identificador: pagamento.identificador,
  });
}

interface LinhaDaAssinatura {
  situacao: string;
  forma: string;
  stripeSubscriptionId: string | null;
  testeTerminaEm: Date | null;
  periodoTerminaEm: Date | null;
}

// Cartão vivo na Stripe (inclusive cancelando no fim do período): o Pix
// espera. Trocar de forma no meio do período fica pra depois.
export function garantirSemCartaoVivo(linha: LinhaDaAssinatura): void {
  if (linha.stripeSubscriptionId && (linha.situacao === "ativa" || linha.situacao === "em_atraso")) {
    throw new ErroHttp(
      409,
      "assinatura_no_cartao",
      "a barbearia já paga no cartão: mude o plano em Gerenciar assinatura"
    );
  }
}

export function pixVigente(linha: LinhaDaAssinatura, agora: Date): boolean {
  return (
    linha.forma === "pix" &&
    linha.situacao === "ativa" &&
    linha.periodoTerminaEm !== null &&
    agora < linha.periodoTerminaEm
  );
}

// Onde começa o período que este Pix paga. Teste vigente: no fim do
// teste, sem perder dias. Pix vigente: no fim do período pago. O resto
// (Grátis, teste vencido, Pix vencido, cartão cancelado): hoje, à
// meia-noite de São Paulo — o mesmo início o dia todo, pro QR não mudar
// a cada recarga.
export function inicioDoPeriodo(linha: LinhaDaAssinatura, agora: Date): Date {
  if (linha.situacao === "teste" && linha.testeTerminaEm && agora < linha.testeTerminaEm) {
    return linha.testeTerminaEm;
  }
  if (pixVigente(linha, agora)) return linha.periodoTerminaEm!;
  return inicioDoDiaEmSaoPaulo(agora);
}

export interface Cotacao {
  valorCentavos: number;
  periodoComecaEm: Date;
  periodoTerminaEm: Date;
  identificador: string;
}

// A cotação e o "Já paguei" passam pelas mesmas regras: sem cartão vivo,
// a equipe cabe no pedido e o pedido cabe no plano. O valor sai do
// precoDoPlano, nunca do corpo.
export async function cotar(
  db: Prisma.TransactionClient,
  config: ConfigDoPix,
  barbeariaId: string,
  pedido: PedidoDoPix,
  agora: Date
) {
  const linha = await db.assinatura.findUniqueOrThrow({ where: { barbeariaId } });
  garantirSemCartaoVivo(linha);
  await conferirPedidoDoPlano(barbeariaId, pedido.plano, pedido.profissionais, db);
  const periodoComecaEm = inicioDoPeriodo(linha, agora);
  return {
    linha,
    cotacao: {
      valorCentavos: precoDoPlano(pedido.plano, pedido.ciclo, pedido.profissionais),
      periodoComecaEm,
      periodoTerminaEm: fimDoPeriodoDoPix(periodoComecaEm, pedido.ciclo),
      identificador: identificadorDoPix(config.segredo, barbeariaId, periodoComecaEm, pedido),
    },
  };
}

export function serializarCotacao(config: ConfigDoPix, cotacao: Cotacao): CotacaoDoPix {
  return {
    valorCentavos: cotacao.valorCentavos,
    periodoComecaEm: cotacao.periodoComecaEm.toISOString(),
    periodoTerminaEm: cotacao.periodoTerminaEm.toISOString(),
    identificador: cotacao.identificador,
    copiaECola: copiaEColaDoPix(config, cotacao),
    recebedor: { nome: config.nomeDoRecebedor, chaveMascarada: chaveMascarada(config.chave) },
  };
}

// O CHECK da migration garante as listas de plano, ciclo e situação.
export function serializarPagamentoPix(linha: LinhaDoPix, config: ConfigDoPix | null): PagamentoPix {
  return {
    id: linha.id,
    identificador: linha.identificador,
    plano: linha.plano as PagamentoPix["plano"],
    ciclo: linha.ciclo as Ciclo,
    profissionais: linha.profissionais,
    valorCentavos: linha.valorCentavos,
    periodoComecaEm: linha.periodoComecaEm.toISOString(),
    periodoTerminaEm: linha.periodoTerminaEm.toISOString(),
    situacao: linha.situacao as SituacaoDoPix,
    resposta: linha.resposta,
    criadoEm: linha.criadoEm.toISOString(),
    decididoEm: linha.decididoEm?.toISOString() ?? null,
    copiaECola: config ? copiaEColaDoPix(config, linha) : null,
  };
}

// Lê e trava o pagamento: duas decisões ao mesmo tempo (o Suporte
// confirmando e o dono desfazendo) esperam uma pela outra.
export async function pagamentoAguardando(
  tx: Prisma.TransactionClient,
  id: string,
  barbeariaId: string | null
): Promise<LinhaDoPix> {
  const [trava] = await tx.$queryRaw<{ situacao: string; barbearia_id: string }[]>`
    SELECT situacao, barbearia_id::text FROM pagamento_pix WHERE id = ${id}::uuid FOR UPDATE`;
  if (!trava || (barbeariaId !== null && trava.barbearia_id !== barbeariaId)) {
    throw new ErroHttp(404, "nao_encontrado", "pagamento não encontrado");
  }
  if (trava.situacao !== "aguardando") {
    throw new ErroHttp(422, "pix_decidido", "esse Pix já foi decidido");
  }
  return tx.pagamentoPix.findUniqueOrThrow({ where: { id } });
}

// Recusa e "Ainda não paguei": a assinatura volta ao retrato de antes do
// Pix — mas só se ela ainda é este Pix. Se um cartão assumiu depois (um
// Checkout aberto antes do Pix e concluído depois), o cartão fica e só o
// pagamento muda.
export async function voltarAoQueEra(tx: Prisma.TransactionClient, pagamento: LinhaDoPix): Promise<void> {
  await tx.$queryRaw`SELECT id FROM assinatura WHERE barbearia_id = ${pagamento.barbeariaId}::uuid FOR UPDATE`;
  const linha = await tx.assinatura.findUniqueOrThrow({ where: { barbeariaId: pagamento.barbeariaId } });
  const aindaEhEstePix =
    linha.forma === "pix" && linha.periodoTerminaEm?.getTime() === pagamento.periodoTerminaEm.getTime();
  if (!aindaEhEstePix) return;
  await tx.assinatura.update({
    where: { barbeariaId: pagamento.barbeariaId },
    data: {
      situacao: pagamento.antesSituacao,
      plano: pagamento.antesPlano,
      ciclo: pagamento.antesCiclo,
      forma: pagamento.antesForma,
      periodoTerminaEm: pagamento.antesPeriodoTerminaEm,
      profissionaisContratados: pagamento.antesProfissionais,
    },
  });
}

// O Pix no resumo da assinatura: o aguardando (o plano já vale) e a
// última recusa, só se o último Pix da barbearia foi recusado — pagou de
// novo, a recusa sai da tela.
export async function resumoDoPix(
  barbeariaId: string,
  config: ConfigDoPix | null
): Promise<ResumoDaAssinatura["pix"]> {
  const [aguardando, ultimo] = await Promise.all([
    prisma.pagamentoPix.findFirst({ where: { barbeariaId, situacao: "aguardando" } }),
    prisma.pagamentoPix.findFirst({
      where: { barbeariaId },
      orderBy: [{ criadoEm: "desc" }, { id: "desc" }],
    }),
  ]);
  return {
    aguardando: aguardando ? serializarPagamentoPix(aguardando, config) : null,
    ultimaRecusa:
      ultimo?.situacao === "recusado" && ultimo.resposta && ultimo.decididoEm
        ? { resposta: ultimo.resposta, decididoEm: ultimo.decididoEm.toISOString() }
        : null,
  };
}
