import { prisma } from "@barchop/database";
import type { NumerosDoDia, NumerosDoSite } from "@barchop/types";
import { agoraNaBarbearia, dataParaDate, dateParaData, somarDias } from "./horas";

// Contagens agregadas do site (home nova, marco 1: a linha de base de
// visita → cadastro). Só o total por dia e evento: nada que identifique
// quem visitou, por isso não pede cookie nem consentimento.
export const EVENTOS_DO_SITE = ["visita_home", "cadastro", "cadastro_da_home"] as const;
export type EventoDoSite = (typeof EVENTOS_DO_SITE)[number];

interface Log {
  error: (objeto: object, mensagem: string) => void;
}

// Soma 1 no total do dia (no relógio de São Paulo, como o resto do
// produto). Nunca lança: contar é secundário, e quem chama — o cadastro,
// a visita — já fez o que importava. A falha vai só pro log.
export async function contar(
  evento: EventoDoSite,
  {
    log,
    instante = new Date(),
    banco = prisma,
  }: { log: Log; instante?: Date; banco?: Pick<typeof prisma, "contagemDoSite"> }
): Promise<void> {
  const dia = dataParaDate(agoraNaBarbearia(instante).data);
  try {
    await banco.contagemDoSite.upsert({
      where: { dia_evento: { dia, evento } },
      create: { dia, evento, total: 1 },
      update: { total: { increment: 1 } },
    });
  } catch (erro) {
    log.error({ err: erro, evento }, "contagem do site não gravada");
  }
}

// Qual campo de NumerosDoDia cada evento soma.
const CAMPO_DO_EVENTO: Record<EventoDoSite, keyof Omit<NumerosDoDia, "dia">> = {
  visita_home: "visitas",
  cadastro: "cadastros",
  cadastro_da_home: "cadastrosDaHome",
};

// Os últimos `dias` dias até hoje (São Paulo), um item por dia, do mais
// velho pro de hoje: dia sem nada contado aparece zerado, pra a tela não
// confundir "zero" com "faltou o dia". Os totais levam a taxa de
// cadastros vindos da home por visita da home.
export async function numerosDoSite(
  dias: number,
  { instante = new Date(), banco = prisma }: { instante?: Date; banco?: Pick<typeof prisma, "contagemDoSite"> } = {}
): Promise<NumerosDoSite> {
  const hoje = agoraNaBarbearia(instante).data;
  const inicio = somarDias(hoje, -(dias - 1));
  const linhas = await banco.contagemDoSite.findMany({
    where: { dia: { gte: dataParaDate(inicio), lte: dataParaDate(hoje) } },
  });

  const porDia = new Map<string, NumerosDoDia>();
  for (let i = 0; i < dias; i++) {
    const dia = somarDias(inicio, i);
    porDia.set(dia, { dia, visitas: 0, cadastros: 0, cadastrosDaHome: 0 });
  }
  for (const linha of linhas) {
    const campo = CAMPO_DO_EVENTO[linha.evento as EventoDoSite];
    const doDia = porDia.get(dateParaData(linha.dia));
    // Evento que não é mais contado (renomeado, retirado) fica de fora.
    if (campo && doDia) doDia[campo] += linha.total;
  }

  const lista = [...porDia.values()];
  const soma = (campo: keyof Omit<NumerosDoDia, "dia">) => lista.reduce((total, dia) => total + dia[campo], 0);
  const visitas = soma("visitas");
  const cadastrosDaHome = soma("cadastrosDaHome");
  return {
    dias: lista,
    totais: {
      visitas,
      cadastros: soma("cadastros"),
      cadastrosDaHome,
      taxa: visitas > 0 ? cadastrosDaHome / visitas : null,
    },
  };
}
