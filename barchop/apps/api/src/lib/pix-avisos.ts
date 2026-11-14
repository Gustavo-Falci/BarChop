import { prisma } from "@barchop/database";
import { PLANOS } from "@barchop/formato";
import type { CanalDeMensagem } from "./canal";
import type { Fila } from "./fila";
import { agoraNaBarbearia } from "./horas";
import { notificarDonos } from "./notificacoes";
import type { LogDoWebhook } from "./webhook-dos-planos";

// Avisos e vencimento do Pix do BarChop (plano pix-do-barchop, PR 4).
// O Pix não renova sozinho, e quem toca o período é o BarChop, todo dia
// às 8h de São Paulo, assinatura por assinatura:
// 1. passado o fim sem o próximo pago, a assinatura cai no Grátis (forma
//    e fim ficam: Faturas mostra "vencido" com o QR do próximo), com
//    aviso no sino e por e-mail;
// 2. no dia que Faturas promete (5 dias antes do fim, em dias de São
//    Paulo), o aviso de renovar, no sino e por e-mail.
// O plano já vale pelo fim do período sem esperar esta varredura
// (`planoEfetivo`): ela só arruma a linha e avisa. Marca antes de mandar
// e relê dentro da transação: rodar duas vezes, ou um "Já paguei" no
// meio, não repete nem erra o aviso. A falha numa barbearia vai pro log
// e não para as outras.

export const TRABALHO_PIX_DO_BARCHOP = "pix-do-barchop";
const CRON_DO_PIX = "0 8 * * *";
// O mesmo DIAS_DO_AVISO_DO_PIX da web (apps/web/src/painel/assinatura.ts):
// Faturas promete "Avisamos no sino e por e-mail no dia …" com ele.
const DIAS_DO_AVISO = 5;
const UM_DIA = 24 * 60 * 60 * 1000;
const FATURAS = "/painel/faturas";

export interface DepsDoPix {
  canal: CanalDeMensagem;
  log: LogDoWebhook;
  // Sem ela, o e-mail não leva link (nunca um localhost).
  urlDoPainel?: string;
  // O relógio de quem testa.
  agora?: Date;
}

const DIA_E_MES = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  timeZone: "America/Sao_Paulo",
});

const ANO = new Intl.DateTimeFormat("pt-BR", { year: "numeric", timeZone: "America/Sao_Paulo" });

// "15/12", no fuso da barbearia.
export function diaEMes(instante: Date): string {
  return DIA_E_MES.format(instante);
}

// "15/12", ou "27/11/2027" quando o ano não é o de agora (o anual):
// "vale até 27/11" leria como daqui a duas semanas.
export function diaEMesNoAno(instante: Date, agora: Date = new Date()): string {
  const ano = ANO.format(instante);
  return ano === ANO.format(agora) ? diaEMes(instante) : `${diaEMes(instante)}/${ano}`;
}

function linkDeFaturas(urlDoPainel: string | undefined): string | null {
  const base = urlDoPainel?.trim().replace(/\/+$/, "");
  return base ? `${base}${FATURAS}` : null;
}

// "em Faturas, no painel do BarChop: https://…/painel/faturas", ou sem o
// link quando a URL do painel não está configurada.
export function ondePagar(urlDoPainel: string | undefined): string {
  const link = linkDeFaturas(urlDoPainel);
  return link ? `em Faturas, no painel do BarChop: ${link}` : "em Faturas, no painel do BarChop";
}

// O e-mail aos donos ativos, depois do commit: o sino é o aviso que fica,
// e o e-mail que não sai vai pro log sem desfazer nada.
export async function emailAosDonos(
  barbeariaId: string,
  mensagem: { assunto: string; texto: string },
  deps: Pick<DepsDoPix, "canal" | "log">
): Promise<void> {
  const donos = await prisma.barbeiro.findMany({
    where: { barbeariaId, ativo: true, papel: "dono", email: { not: null } },
    select: { email: true },
  });
  for (const { email } of donos) {
    try {
      await deps.canal.enviar({ para: email!, ...mensagem });
    } catch (erro) {
      deps.log.warn({ barbeariaId, erro: String(erro) }, "o e-mail do Pix do BarChop não saiu");
    }
  }
}

export async function varrerPixDoBarChop(deps: DepsDoPix): Promise<void> {
  const agora = deps.agora ?? new Date();
  const hoje = agoraNaBarbearia(agora).data;
  const noPix = await prisma.assinatura.findMany({
    where: { forma: "pix", situacao: "ativa", periodoTerminaEm: { not: null } },
    select: { barbeariaId: true, periodoTerminaEm: true, plano: true },
    orderBy: { barbeariaId: "asc" },
  });
  for (const assinatura of noPix) {
    const fim = assinatura.periodoTerminaEm!;
    try {
      if (fim <= agora) {
        await vencer(assinatura.barbeariaId, fim, assinatura.plano, deps);
      } else if (agoraNaBarbearia(new Date(fim.getTime() - DIAS_DO_AVISO * UM_DIA)).data <= hoje) {
        await avisarDaRenovacao(assinatura.barbeariaId, fim, assinatura.plano, agora, deps);
      }
    } catch (erro) {
      deps.log.warn(
        { barbeariaId: assinatura.barbeariaId, erro: String(erro) },
        "a varredura do Pix do BarChop falhou nesta barbearia"
      );
    }
  }
}

function nomeDoPlano(plano: string): string {
  return PLANOS[plano as keyof typeof PLANOS]?.nome ?? plano;
}

// O filtro relê: um "Já paguei" da renovação no meio moveu o fim, e a
// barbearia não vence.
async function vencer(barbeariaId: string, fim: Date, plano: string, deps: DepsDoPix): Promise<void> {
  const nome = nomeDoPlano(plano);
  const dia = diaEMes(fim);
  const venceu = await prisma.$transaction(async (tx) => {
    const { count } = await tx.assinatura.updateMany({
      where: { barbeariaId, forma: "pix", situacao: "ativa", periodoTerminaEm: fim },
      data: { situacao: "gratis" },
    });
    if (count === 0) return false;
    await notificarDonos(tx, barbeariaId, {
      titulo: "Seu plano voltou pro Grátis",
      texto: `O Pix do ${nome} venceu em ${dia}. Nada foi apagado: pague o próximo período em Faturas pra voltar.`,
      link: FATURAS,
    });
    return true;
  });
  if (!venceu) return;
  await emailAosDonos(
    barbeariaId,
    {
      assunto: "Seu plano do BarChop voltou pro Grátis",
      texto:
        `Olá! O ${nome} pago por Pix venceu em ${dia}, e a barbearia voltou pro Grátis. Nada foi apagado.\n\n` +
        `Pra voltar ao ${nome}, pague o próximo período ${ondePagar(deps.urlDoPainel)}.`,
    },
    deps
  );
}

// O aviso vai no pagamento do período (`avisado_em`), uma vez só. Sem
// pagamento do período (não devia acontecer), fica no log.
async function avisarDaRenovacao(
  barbeariaId: string,
  fim: Date,
  plano: string,
  agora: Date,
  deps: DepsDoPix
): Promise<void> {
  const nome = nomeDoPlano(plano);
  const dia = diaEMes(fim);
  const avisou = await prisma.$transaction(async (tx) => {
    const atual = await tx.assinatura.findUnique({
      where: { barbeariaId },
      select: { forma: true, situacao: true, periodoTerminaEm: true },
    });
    if (atual?.forma !== "pix" || atual.situacao !== "ativa" || atual.periodoTerminaEm?.getTime() !== fim.getTime()) {
      return false;
    }
    const pagamento = await tx.pagamentoPix.findFirst({
      where: { barbeariaId, periodoTerminaEm: fim, situacao: { in: ["aguardando", "confirmado"] } },
      orderBy: { criadoEm: "desc" },
      select: { id: true },
    });
    if (!pagamento) {
      deps.log.warn({ barbeariaId }, "Pix do BarChop sem o pagamento do período: aviso não saiu");
      return false;
    }
    const { count } = await tx.pagamentoPix.updateMany({
      where: { id: pagamento.id, avisadoEm: null },
      data: { avisadoEm: agora },
    });
    if (count === 0) return false;
    await notificarDonos(tx, barbeariaId, {
      titulo: `Seu ${nome} vence em ${dia}`,
      texto: `O Pix não renova sozinho. Pague o próximo período em Faturas, com o QR de lá, pra não voltar pro Grátis.`,
      link: FATURAS,
    });
    return true;
  });
  if (!avisou) return;
  await emailAosDonos(
    barbeariaId,
    {
      assunto: `Seu plano do BarChop vence em ${dia}`,
      texto:
        `Olá! O ${nome} pago por Pix vale até ${dia}. O Pix não renova sozinho: pague o próximo período ` +
        `${ondePagar(deps.urlDoPainel)}, com o QR que o painel gera.\n\n` +
        `Sem o pagamento, a barbearia volta pro Grátis depois dessa data, sem perder nada.`,
    },
    deps
  );
}

export async function registrarPixDoBarChop(fila: Fila, deps: Omit<DepsDoPix, "agora">): Promise<void> {
  await fila.trabalhar(TRABALHO_PIX_DO_BARCHOP, () => varrerPixDoBarChop(deps));
  await fila.repetir(TRABALHO_PIX_DO_BARCHOP, CRON_DO_PIX);
}
