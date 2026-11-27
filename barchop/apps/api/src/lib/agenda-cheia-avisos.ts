import { prisma } from "@barchop/database";
import { lotacaoDoLink, type LotacaoDoLink } from "./agenda-cheia";
import type { CanalDeMensagem } from "./canal";
import type { Fila } from "./fila";
import { agoraNaBarbearia, dataParaDate } from "./horas";
import { notificarDonos } from "./notificacoes";
import { primeiroNomeParaEmail } from "./texto-de-email";

// Os avisos de agenda cheia (PRD agenda-cheia): pro dono quando a
// barbearia lota (plano agenda-cheia-dono, marco 2) e pro profissional
// quando a agenda dele lota (plano agenda-cheia-profissional, marco 3).
// Toda mudança de agendamento pede uma conferência pela fila
// (pedirConferenciaDaAgenda); o trabalho faz a mesma conta da página
// pública (lotacaoDoLink) e, na passagem de "tem horário" pra "cheia",
// avisa: sininho e e-mail. Um aviso por lotação, no máximo um por dia —
// guardado na barbearia e no profissional, e não em memória.

export const TRABALHO_AGENDA_CHEIA = "conferir-agenda-cheia";
export const TRABALHO_LIMPAR_AGENDAS_CHEIAS = "limpar-agendas-cheias";
// Logo depois da meia-noite de São Paulo, quando a janela anda um dia.
export const CRON_DA_AGENDA_CHEIA = "5 0 * * *";

const HORARIOS = "/painel/configuracoes/horarios";
const AGENDA = "/painel/agenda";
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

function linkDoPainel(urlDoPainel: string | undefined, caminho: string): string | null {
  return urlDoPainel ? `${urlDoPainel.replace(/\/$/, "")}${caminho}` : null;
}

// O último dia cheio e o que abre amanhã, nos dois formatos dos textos.
function datas(ate: string) {
  const ultimo = dataParaDate(ate);
  const proximo = new Date(ultimo.getTime() + UM_DIA);
  return {
    ultimo: DIA_E_MES.format(ultimo),
    ultimoPorExtenso: DIA_DA_SEMANA.format(ultimo),
    proximo: DIA_E_MES.format(proximo),
  };
}

async function enviar(deps: DepsDaAgendaCheia, para: string, assunto: string, texto: string, quem: object) {
  try {
    // Assunto fixo: não leva texto de terceiro (lib/texto-de-email.ts).
    await deps.canal.enviar({ para, assunto, texto });
  } catch (erro) {
    deps.log.warn({ ...quem, erro: String(erro) }, "o e-mail de agenda cheia não saiu");
  }
}

// Confere uma barbearia e cada profissional do link. Idempotente: a fila
// repete o trabalho que lança, e cada marca só é gravada uma vez por
// lotação (`updateMany` condicional).
export async function conferirAgendaCheia(barbeariaId: string, deps: DepsDaAgendaCheia): Promise<void> {
  const agora = deps.agora ?? new Date();
  const naBarbearia = agoraNaBarbearia(agora);
  const hoje = dataParaDate(naBarbearia.data);
  const lotacao = await lotacaoDoLink(prisma, { barbeariaId, agora: naBarbearia });

  await conferirBarbearia(barbeariaId, lotacao.barbearia, { agora, hoje }, deps);
  await conferirProfissionais(barbeariaId, lotacao, { agora, hoje }, deps);
}

async function conferirBarbearia(
  barbeariaId: string,
  ate: string | null,
  { agora, hoje }: { agora: Date; hoje: Date },
  deps: DepsDaAgendaCheia
): Promise<void> {
  if (ate === null) {
    // Voltou a ter horário: a próxima lotação é outra.
    await prisma.barbearia.updateMany({
      where: { id: barbeariaId, agendaCheiaDesde: { not: null } },
      data: { agendaCheiaDesde: null },
    });
    return;
  }

  const { ultimo, ultimoPorExtenso, proximo } = datas(ate);
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
        texto: `Todos os horários até ${ultimo} estão reservados. O dia ${proximo} abre amanhã.`,
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
  const onde = "em Configurações › Horários (ou aumente a janela em Regras de agendamento)";
  const link = linkDoPainel(deps.urlDoPainel, HORARIOS);
  const texto =
    `Olá! Todos os horários que o link de agendamento oferece, até ${ultimoPorExtenso}, ` +
    `estão reservados. A página da barbearia já mostra o aviso de agenda cheia.\n\n` +
    `O dia ${proximo} abre amanhã. Pra abrir mais horários antes disso, ajuste no painel, ` +
    (link ? `${onde}: ${link}` : `${onde}.`);
  for (const { email } of donos) {
    await enviar(deps, email!, "A agenda da sua barbearia está cheia", texto, { barbeariaId });
  }
}

// O dono que atende, com a barbearia toda cheia, já tem o aviso da
// barbearia (de agora ou de antes): o dele de profissional repetiria a
// mesma notícia. A agenda dele fica marcada do mesmo jeito.
async function conferirProfissionais(
  barbeariaId: string,
  lotacao: LotacaoDoLink,
  { agora, hoje }: { agora: Date; hoje: Date },
  deps: DepsDaAgendaCheia
): Promise<void> {
  const cheios = [...lotacao.profissionais].filter((par): par is [string, string] => par[1] !== null);

  // Quem vagou, ou saiu do link (desativado, fora do plano): a próxima
  // lotação dele é outra.
  await prisma.barbeiro.updateMany({
    where: { barbeariaId, agendaCheiaDesde: { not: null }, id: { notIn: cheios.map(([id]) => id) } },
    data: { agendaCheiaDesde: null },
  });
  if (cheios.length === 0) return;

  const membros = await prisma.barbeiro.findMany({
    where: { id: { in: cheios.map(([id]) => id) } },
    select: { id: true, nome: true, email: true, papel: true },
  });
  const porId = new Map(membros.map((membro) => [membro.id, membro]));

  for (const [barbeiroId, ate] of cheios) {
    const membro = porId.get(barbeiroId);
    if (!membro) continue;
    const silenciar = membro.papel === "dono" && lotacao.barbearia !== null;
    const { ultimo, ultimoPorExtenso, proximo } = datas(ate);

    const avisou = await prisma.$transaction(async (tx) => {
      const lotou = await tx.barbeiro.updateMany({
        where: { id: barbeiroId, agendaCheiaDesde: null },
        data: { agendaCheiaDesde: agora },
      });
      if (lotou.count === 0 || silenciar) return false;
      const doDia = await tx.barbeiro.updateMany({
        where: { id: barbeiroId, OR: [{ agendaCheiaAvisadaEm: null }, { agendaCheiaAvisadaEm: { lt: hoje } }] },
        data: { agendaCheiaAvisadaEm: hoje },
      });
      if (doDia.count === 0) return false;
      await tx.notificacao.create({
        data: {
          barbeiroId,
          tipo: "agendamento",
          titulo: "Sua agenda está cheia",
          texto: `Todos os seus horários até ${ultimo} estão reservados. O dia ${proximo} abre amanhã.`,
          link: AGENDA,
        },
      });
      return true;
    });
    if (!avisou || !membro.email) continue;

    const link = linkDoPainel(deps.urlDoPainel, AGENDA);
    const texto =
      `Olá, ${primeiroNomeParaEmail(membro.nome)}! Todos os seus horários que o link de agendamento ` +
      `oferece, até ${ultimoPorExtenso}, estão reservados.\n\n` +
      `O dia ${proximo} abre amanhã. ` +
      (link ? `Sua agenda no painel: ${link}` : "Sua agenda está no painel, em Agenda.");
    await enviar(deps, membro.email, "Sua agenda está cheia", texto, { barbeariaId, barbeiroId });
  }
}

// Às 00:05 a janela já andou um dia: quem estava cheio pode ter ganhado um
// dia livre sem ninguém mexer num agendamento. Só apaga as marcas, sem
// avisar — avisar é da conferência, quando um agendamento lota.
export async function limparAgendasQueVagaram(deps: DepsDaAgendaCheia): Promise<void> {
  const agora = deps.agora ?? new Date();
  const naBarbearia = agoraNaBarbearia(agora);
  const marcadas = await prisma.barbearia.findMany({
    where: {
      OR: [{ agendaCheiaDesde: { not: null } }, { barbeiros: { some: { agendaCheiaDesde: { not: null } } } }],
    },
    select: { id: true },
    orderBy: { id: "asc" },
  });
  for (const { id } of marcadas) {
    try {
      const lotacao = await lotacaoDoLink(prisma, { barbeariaId: id, agora: naBarbearia });
      if (lotacao.barbearia === null) {
        await prisma.barbearia.updateMany({ where: { id }, data: { agendaCheiaDesde: null } });
      }
      const cheios = [...lotacao.profissionais].filter(([, ate]) => ate !== null).map(([barbeiroId]) => barbeiroId);
      await prisma.barbeiro.updateMany({
        where: { barbeariaId: id, agendaCheiaDesde: { not: null }, id: { notIn: cheios } },
        data: { agendaCheiaDesde: null },
      });
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
