import type { MembroDaEquipe, ServicoSerializado } from "@barchop/types";
import { formatarPreco } from "../componentes/ItemDeServico";

// As contas das listas do painel (marco 5), à parte da tela pelo mesmo
// motivo de metricas.ts: a regra se testa sem montar nada, e a tela só
// desenha.

export const SEM_CATEGORIA = "Sem categoria";

export interface GrupoDeServicos {
  id: string;
  titulo: string;
  servicos: ServicoSerializado[];
}

// Junta por categoria na ordem em que cada uma aparece pela primeira vez
// — a API já ordena (ativos antes, nome asc), e a tela não reordena.
// Quem não tem categoria vai pro fim: é a sobra, não uma categoria que
// o dono escolheu.
export function agruparPorCategoria(servicos: ServicoSerializado[]): GrupoDeServicos[] {
  const porCategoria = new Map<string, ServicoSerializado[]>();
  const semCategoria: ServicoSerializado[] = [];

  for (const servico of servicos) {
    if (servico.categoria === null) {
      semCategoria.push(servico);
      continue;
    }
    const doGrupo = porCategoria.get(servico.categoria);
    if (doGrupo) doGrupo.push(servico);
    else porCategoria.set(servico.categoria, [servico]);
  }

  // O id leva um prefixo pra uma categoria chamada "Sem categoria" (o
  // dono pode digitar isso) não colidir com o grupo da sobra.
  const grupos = [...porCategoria].map(([categoria, doGrupo]) => ({
    id: `categoria:${categoria}`,
    titulo: categoria,
    servicos: doGrupo,
  }));
  if (semCategoria.length > 0) {
    grupos.push({ id: "sem-categoria", titulo: SEM_CATEGORIA, servicos: semCategoria });
  }
  return grupos;
}

// "R$ 40,00" quando todos custam o mesmo, "R$ 25,00 a R$ 60,00" senão.
// Compara como número: como texto, "100.00" viria antes de "40.00".
export function faixaDePreco(servicos: ServicoSerializado[]): string {
  const precos = servicos.map((servico) => servico.preco);
  const menor = precos.reduce((a, b) => (Number(b) < Number(a) ? b : a));
  const maior = precos.reduce((a, b) => (Number(b) > Number(a) ? b : a));
  return Number(menor) === Number(maior)
    ? formatarPreco(menor)
    : `${formatarPreco(menor)} a ${formatarPreco(maior)}`;
}

// A linha de apoio ao lado do título do grupo.
export function resumoDoGrupo(servicos: ServicoSerializado[]): string {
  const quantos = `${servicos.length} ${servicos.length === 1 ? "serviço" : "serviços"}`;
  return `${quantos} · ${faixaDePreco(servicos)}`;
}

// Uma situação por membro, na ordem do que pesa mais: quem foi
// desativado não entra, e um convite pendente dele não é pendência.
export type SituacaoDoMembro = "ativo" | "convite" | "inativo";

export function situacaoDoMembro(membro: MembroDaEquipe): SituacaoDoMembro {
  if (!membro.ativo) return "inativo";
  return membro.convitePendente ? "convite" : "ativo";
}
