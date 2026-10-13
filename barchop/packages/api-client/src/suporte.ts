import type {
  AvisoPublicado,
  NovoAviso,
  SessaoSuporte,
  SolicitacaoDeLink,
  SolicitacaoNaFila,
} from "@barchop/types";
import type { Requisicao } from "./requisicao";

// O suporte da plataforma (Onda 1, F4): conta própria, fora de qualquer
// equipe, que avalia os pedidos de troca de link. O painel do suporte
// monta um client só dele, com o `obterToken` da sessão do suporte — o
// token do barbeiro não abre estas rotas, nem este abre as do painel.
export function criarApiSuporte(requisicao: Requisicao) {
  return {
    // Sem token: não existe sessão ainda.
    login(email: string, senha: string): Promise<SessaoSuporte> {
      return requisicao("/suporte/login", { metodo: "POST", corpo: { email, senha } });
    },

    // Só os pendentes, do mais antigo pro mais novo.
    async solicitacoes(): Promise<SolicitacaoNaFila[]> {
      const resposta = await requisicao<{ solicitacoes: SolicitacaoNaFila[] }>(
        "/suporte/solicitacoes",
        { comToken: true }
      );
      return resposta.solicitacoes;
    },

    // Aprovar troca o link na hora. 409 = o link foi tomado depois do
    // pedido: o pedido continua pendente, pra ser recusado com resposta.
    aprovar(id: string): Promise<SolicitacaoDeLink> {
      return requisicao(`/suporte/solicitacoes/${id}/aprovar`, {
        metodo: "POST",
        comToken: true,
      });
    },

    // Os avisos da plataforma: os publicados, do mais novo, e publicar
    // um (cai no sino de todos os membros ativos).
    async avisos(): Promise<AvisoPublicado[]> {
      const resposta = await requisicao<{ avisos: AvisoPublicado[] }>("/suporte/avisos", {
        comToken: true,
      });
      return resposta.avisos;
    },

    async publicarAviso(aviso: NovoAviso): Promise<AvisoPublicado> {
      const resposta = await requisicao<{ aviso: AvisoPublicado }>("/suporte/avisos", {
        metodo: "POST",
        corpo: aviso,
        comToken: true,
      });
      return resposta.aviso;
    },

    // A resposta é obrigatória: é o que o dono lê em Configurações.
    recusar(id: string, resposta: string): Promise<SolicitacaoDeLink> {
      return requisicao(`/suporte/solicitacoes/${id}/recusar`, {
        metodo: "POST",
        corpo: { resposta },
        comToken: true,
      });
    },
  };
}
