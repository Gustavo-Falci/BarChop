import { useApi } from "../api/ProvedorDaApi";
import { useRequisicao } from "../api/useRequisicao";
import { formatarPreco } from "../componentes/ItemDeServico";

// O que já foi escolhido, pro `Resumo` dos passos 2 e 3 (onda B): os
// nomes, a duração somada e o total. `null` enquanto a lista não chega,
// ou se ela falhar — o passo segue sem o resumo, que é lembrete e não
// conteúdo.
export function useResumoDaEscolha(slug: string, servicoIds: string[], pronto: boolean): string[] | null {
  const api = useApi();
  const servicos = useRequisicao(
    async () => (pronto ? api.publico.servicos(slug) : null),
    [slug, pronto]
  );
  const escolhidos = (servicos.dados ?? []).filter((servico) => servicoIds.includes(servico.id));
  if (escolhidos.length === 0) return null;

  const minutos = escolhidos.reduce((soma, servico) => soma + servico.duracaoMinutos, 0);
  // Em centavos, pra soma de "40.10" + "25.20" não sair 65.30000000000001.
  const centavos = escolhidos.reduce((soma, servico) => soma + Math.round(Number(servico.preco) * 100), 0);
  return [
    escolhidos.map((servico) => servico.nome).join(", "),
    `${minutos} min`,
    formatarPreco((centavos / 100).toFixed(2)),
  ];
}
