import { CATEGORIAS_DE_SERVICO, type CategoriaDeServico } from "@barchop/formato";
import type { ServicoSerializado } from "@barchop/types";
import { ROTULO_DA_CATEGORIA } from "../formato/pagina";

export interface GrupoDeServicos {
  // null só quando nenhum serviço tem categoria: aí a lista é uma só,
  // sem subtítulo, como era antes das categorias existirem.
  titulo: string | null;
  // Pro ícone; null no grupo da sobra ("Outros serviços") e na lista única.
  categoria: CategoriaDeServico | null;
  servicos: ServicoSerializado[];
}

// Agrupa na ordem de CATEGORIAS_DE_SERVICO, que é a ordem das seções na
// página; dentro de cada seção, a ordem da API fica. Os sem categoria
// vão por último, em "Outros serviços".
export function agruparPorCategoria(servicos: ServicoSerializado[]): GrupoDeServicos[] {
  if (servicos.every((servico) => !servico.categoria)) {
    return servicos.length > 0 ? [{ titulo: null, categoria: null, servicos }] : [];
  }

  const grupos: GrupoDeServicos[] = CATEGORIAS_DE_SERVICO.map((categoria) => ({
    titulo: ROTULO_DA_CATEGORIA[categoria],
    categoria,
    servicos: servicos.filter((servico) => servico.categoria === categoria),
  }));
  const semCategoria = servicos.filter((servico) => !servico.categoria);
  return [
    ...grupos.filter((grupo) => grupo.servicos.length > 0),
    ...(semCategoria.length > 0
      ? [{ titulo: "Outros serviços", categoria: null, servicos: semCategoria }]
      : []),
  ];
}
