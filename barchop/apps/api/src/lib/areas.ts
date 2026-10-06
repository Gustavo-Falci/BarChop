import { prisma } from "@barchop/database";
import { juntarAreas, type AreaDeConfiguracao } from "@barchop/formato";

// Marca áreas das Configurações como decididas (painel v2, marco 2).
// Chamada DEPOIS da escrita que a decide ter dado certo: um salvar
// recusado não é decisão. Ler e regravar a lista inteira, e não `push`,
// porque push repetiria a área a cada salvar.
//
// O PATCH /barbearias/me não passa por aqui: ele já lê e grava a
// barbearia, e junta as áreas no mesmo update.
export async function marcarAreas(barbeariaId: string, novas: AreaDeConfiguracao[]): Promise<void> {
  const { areasDecididas } = await prisma.barbearia.findUniqueOrThrow({
    where: { id: barbeariaId },
    select: { areasDecididas: true },
  });
  const juntas = juntarAreas(areasDecididas, novas);
  if (juntas.length === areasDecididas.length) return;

  await prisma.barbearia.update({ where: { id: barbeariaId }, data: { areasDecididas: juntas } });
}
