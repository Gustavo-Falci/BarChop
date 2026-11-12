import { prisma } from "@barchop/database";
import { agoraNaBarbearia, dataParaDate } from "./horas";

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
