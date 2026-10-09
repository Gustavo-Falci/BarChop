import { CATEGORIAS_DE_SERVICO } from "@barchop/formato";
import type { MembroDaEquipe, ServicoSerializado } from "@barchop/types";
import { formatarPreco } from "../componentes/ItemDeServico";
import { categoriaConhecida, ROTULO_DA_CATEGORIA } from "../formato/pagina";

// As contas das listas do painel (marco 5), à parte da tela pelo mesmo
// motivo de metricas.ts: a regra se testa sem montar nada, e a tela só
// desenha.

export const SEM_CATEGORIA = "Sem categoria";

export interface GrupoDeServicos {
  id: string;
  titulo: string;
  servicos: ServicoSerializado[];
}

// Junta por categoria na ordem de CATEGORIAS_DE_SERVICO, a mesma das
// seções da página pública. Dentro do grupo, a ordem da API (ativos
// antes, nome asc) fica. Quem não tem categoria vai pro fim: é a sobra,
// não uma categoria que o dono escolheu. Categoria fora da lista conta
// como sem categoria (ver categoriaConhecida).
export function agruparPorCategoria(servicos: ServicoSerializado[]): GrupoDeServicos[] {
  const grupos = CATEGORIAS_DE_SERVICO.map((categoria) => ({
    id: `categoria:${categoria}`,
    titulo: ROTULO_DA_CATEGORIA[categoria],
    servicos: servicos.filter((servico) => servico.categoria === categoria),
  })).filter((grupo) => grupo.servicos.length > 0);

  const semCategoria = servicos.filter((servico) => categoriaConhecida(servico.categoria) === null);
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
