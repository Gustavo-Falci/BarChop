import type { ServicoSerializado } from "@barchop/types";

export interface GrupoDeServicos {
  // null só quando nenhum serviço tem categoria: aí a lista é uma só,
  // sem subtítulo, como era antes das categorias existirem.
  titulo: string | null;
  servicos: ServicoSerializado[];
}

// Agrupa na ordem em que cada categoria aparece primeiro. "Cabelo" e
// " cabelo " são a mesma seção — a categoria é texto livre, digitado à
// mão, e duas seções quase iguais na página pública leriam como erro.
// Os sem categoria vão por último, em "Outros serviços".
export function agruparPorCategoria(servicos: ServicoSerializado[]): GrupoDeServicos[] {
  if (servicos.every((servico) => !servico.categoria?.trim())) {
    return servicos.length > 0 ? [{ titulo: null, servicos }] : [];
  }

  const grupos = new Map<string, GrupoDeServicos>();
  const semCategoria: ServicoSerializado[] = [];
  for (const servico of servicos) {
    const titulo = servico.categoria?.trim();
    if (!titulo) {
      semCategoria.push(servico);
      continue;
    }
    const chave = titulo.toLocaleLowerCase("pt-BR");
    if (!grupos.has(chave)) grupos.set(chave, { titulo, servicos: [] });
    grupos.get(chave)!.servicos.push(servico);
  }
  return [
    ...grupos.values(),
    ...(semCategoria.length > 0 ? [{ titulo: "Outros serviços", servicos: semCategoria }] : []),
  ];
}
