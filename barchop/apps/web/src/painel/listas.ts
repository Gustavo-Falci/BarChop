import { CATEGORIAS_DE_SERVICO, ordenarCategorias } from "@barchop/formato";
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

// Junta por categoria na ordem que o dono arrastou (`ordemCategorias`
// da barbearia; sem ela, a de CATEGORIAS_DE_SERVICO), a mesma das seções
// da página pública. Dentro do grupo, a ordem da API (ativos antes, na
// ordem arrastada) fica. Quem não tem categoria vai pro fim: é a sobra,
// não uma categoria que o dono escolheu. Categoria fora da lista conta
// como sem categoria (ver categoriaConhecida).
export function agruparPorCategoria(
  servicos: ServicoSerializado[],
  ordemCategorias: readonly string[] = CATEGORIAS_DE_SERVICO
): GrupoDeServicos[] {
  const grupos = ordenarCategorias(ordemCategorias).map((categoria) => ({
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

// A lista inteira que o PUT /servicos/ordem pede (arrastar e reordenar):
// os do agendamento grupo a grupo, como a tela os mostra — o grupo que o
// dono mexeu já na ordem nova —, e os inativos no fim. O inativo não
// aparece na página, então não entra na lista de arrastar; reativado,
// volta no fim da categoria.
export function ordemDosServicos(
  servicos: ServicoSerializado[],
  ordemCategorias: readonly string[],
  grupoMexido: string,
  idsDoGrupo: string[]
): string[] {
  const doAgendamento = agruparPorCategoria(
    servicos.filter((servico) => servico.ativo),
    ordemCategorias
  ).flatMap((grupo) =>
    grupo.id === grupoMexido ? idsDoGrupo : grupo.servicos.map((servico) => servico.id)
  );
  const inativos = servicos.filter((servico) => !servico.ativo).map((servico) => servico.id);
  return [...doAgendamento, ...inativos];
}

// Os `primeiros` na ordem dada e o resto de `todos` na ordem que já
// tinha: a equipe da página arrastada e quem não aparece nela, as
// categorias com serviço e as vazias.
export function primeirosEResto(primeiros: string[], todos: readonly string[]): string[] {
  return [...primeiros, ...todos.filter((item) => !primeiros.includes(item))];
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
