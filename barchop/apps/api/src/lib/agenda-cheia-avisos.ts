import { prisma } from "@barchop/database";
import { agendaCheiaAte } from "./agenda-cheia";
import type { CanalDeMensagem } from "./canal";
import type { Fila } from "./fila";
import { agoraNaBarbearia, dataParaDate } from "./horas";
import { notificarDonos } from "./notificacoes";

// O aviso de agenda cheia pro dono (plano agenda-cheia-dono, marco 2 do
// PRD agenda-cheia). Toda mudança de agendamento pede uma conferência
// pela fila (pedirConferenciaDaAgenda); o trabalho faz a mesma conta da
// página pública (agenda-cheia.ts) e, na passagem de "tem horário" pra
// "cheia", avisa os donos ativos: sininho e e-mail. Um aviso por lotação,
// no máximo um por dia — guardado na barbearia, e não em memória.

export const TRABALHO_AGENDA_CHEIA = "conferir-agenda-cheia";
export const TRABALHO_LIMPAR_AGENDAS_CHEIAS = "limpar-agendas-cheias";
// Logo depois da meia-noite de São Paulo, quando a janela anda um dia.
export const CRON_DA_AGENDA_CHEIA = "5 0 * * *";

const HORARIOS = "/painel/configuracoes/horarios";
const UM_DIA = 24 * 60 * 60 * 1000;

interface Log {
  warn: (dados: object, mensagem: string) => void;
  error: (dados: object, mensagem: string) => void;
}

export interface DepsDaAgendaCheia {
  canal: CanalDeMensagem;
  log: Log;
  urlDoPainel?: string;
  // Injetável pros testes; ausente = agora.
  agora?: Date;
}

// `@db.Date` e o "2026-12-04" viram meia-noite UTC: formatar em UTC é ler
// o dia, sem o fuso da máquina puxar pra véspera.
const DIA_E_MES = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" });
const DIA_DA_SEMANA = new Intl.DateTimeFormat("pt-BR", {
  weekday: "long",
  day: "2-digit",
  month: "2-digit",
  timeZone: "UTC",
});

function ondeAbrir(urlDoPainel: string | undefined): string {
  const onde = "em Configurações › Horários (ou aumente a janela em Regras de agendamento)";
  return urlDoPainel ? `${onde}: ${urlDoPainel.replace(/\/$/, "")}${HORARIOS}` : `${onde}.`;
}

// Confere uma barbearia. Idempotente: a fila repete o trabalho que lança,
// e a marca só é gravada uma vez por lotação (`updateMany` condicional).
export async function conferirAgendaCheia(barbeariaId: string, deps: DepsDaAgendaCheia): Promise<void> {
  const agora = deps.agora ?? new Date();
  const naBarbearia = agoraNaBarbearia(agora);
  const ate = await agendaCheiaAte(prisma, { barbeariaId, agora: naBarbearia });

  if (ate === null) {
    // Voltou a ter horário: a próxima lotação é outra.
    await prisma.barbearia.updateMany({
      where: { id: barbeariaId, agendaCheiaDesde: { not: null } },
      data: { agendaCheiaDesde: null },
    });
    return;
  }

  const hoje = dataParaDate(naBarbearia.data);
  const ultimo = dataParaDate(ate);
  const proximo = new Date(ultimo.getTime() + UM_DIA);

  const avisou = await prisma.$transaction(async (tx) => {
    const lotou = await tx.barbearia.updateMany({
      where: { id: barbeariaId, agendaCheiaDesde: null },
      data: { agendaCheiaDesde: agora },
    });
    if (lotou.count === 0) return false;
    // Encher, vagar e encher de novo no mesmo dia: a lotação fica
    // marcada, mas o aviso de hoje já saiu.
    const doDia = await tx.barbearia.updateMany({
      where: { id: barbeariaId, OR: [{ agendaCheiaAvisadaEm: null }, { agendaCheiaAvisadaEm: { lt: hoje } }] },
      data: { agendaCheiaAvisadaEm: hoje },
    });
    if (doDia.count === 0) return false;
    await notificarDonos(
      tx,
      barbeariaId,
      {
        titulo: "Agenda cheia",
        texto: `Todos os horários até ${DIA_E_MES.format(ultimo)} estão reservados. O dia ${DIA_E_MES.format(proximo)} abre amanhã.`,
        link: HORARIOS,
      },
      "agendamento"
    );
    return true;
  });
  if (!avisou) return;

  // Depois do commit, como os avisos do Pix: o sininho já está gravado, e
  // um provedor fora do ar fica no log.
  const donos = await prisma.barbeiro.findMany({
    where: { barbeariaId, ativo: true, papel: "dono", email: { not: null } },
    select: { email: true },
  });
  const texto =
    `Olá! Todos os horários que o link de agendamento oferece, até ${DIA_DA_SEMANA.format(ultimo)}, ` +
    `estão reservados. A página da barbearia já mostra o aviso de agenda cheia.\n\n` +
    `O dia ${DIA_E_MES.format(proximo)} abre amanhã. Pra abrir mais horários antes disso, ajuste no painel, ` +
    ondeAbrir(deps.urlDoPainel);
  for (const { email } of donos) {
    try {
      // Fixo: assunto não leva texto de terceiro (lib/texto-de-email.ts).
      await deps.canal.enviar({ para: email!, assunto: "A agenda da sua barbearia está cheia", texto });
    } catch (erro) {
      deps.log.warn({ barbeariaId, erro: String(erro) }, "o e-mail de agenda cheia não saiu");
    }
  }
}

// Às 00:05 a janela já andou um dia: quem estava cheio pode ter ganhado um
// dia livre sem ninguém mexer num agendamento. Só apaga a marca, sem
// avisar — avisar é da conferência, quando um agendamento lota.
export async function limparAgendasQueVagaram(deps: DepsDaAgendaCheia): Promise<void> {
  const agora = deps.agora ?? new Date();
  const naBarbearia = agoraNaBarbearia(agora);
  const cheias = await prisma.barbearia.findMany({
    where: { agendaCheiaDesde: { not: null } },
    select: { id: true },
    orderBy: { id: "asc" },
  });
  for (const { id } of cheias) {
    try {
      if ((await agendaCheiaAte(prisma, { barbeariaId: id, agora: naBarbearia })) === null) {
        await prisma.barbearia.updateMany({ where: { id }, data: { agendaCheiaDesde: null } });
      }
    } catch (erro) {
      deps.log.warn({ barbeariaId: id, erro: String(erro) }, "a limpeza da agenda cheia falhou nesta barbearia");
    }
  }
}

// Chamado pelas rotas depois do commit de qualquer mudança de agendamento.
// Sem chave de deduplicação: a política da fila é `exclusive`, e uma
// conferência pedida enquanto outra roda seria descartada — perdendo a
// lotação que o agendamento novo causou. Falhar aqui não derruba a rota.
export async function pedirConferenciaDaAgenda(
  { fila, log }: { fila: Fila; log: Pick<Log, "error"> },
  barbeariaId: string
): Promise<void> {
  try {
    await fila.agendar(TRABALHO_AGENDA_CHEIA, { barbeariaId });
  } catch (erro) {
    log.error({ err: erro, barbeariaId }, "conferência da agenda cheia não agendada");
  }
}

export async function registrarAgendaCheia(fila: Fila, deps: Omit<DepsDaAgendaCheia, "agora">): Promise<void> {
  await fila.trabalhar<{ barbeariaId: string }>(TRABALHO_AGENDA_CHEIA, ({ barbeariaId }) =>
    conferirAgendaCheia(barbeariaId, deps)
  );
  await fila.trabalhar(TRABALHO_LIMPAR_AGENDAS_CHEIAS, () => limparAgendasQueVagaram(deps));
  await fila.repetir(TRABALHO_LIMPAR_AGENDAS_CHEIAS, CRON_DA_AGENDA_CHEIA);
}
