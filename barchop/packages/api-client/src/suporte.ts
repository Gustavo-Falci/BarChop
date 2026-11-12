import type {
  AvisoPublicado,
  NovoAviso,
  NumerosDoSite,
  PagamentoPix,
  PixNaFila,
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

    // A linha de base da home nova (marco 1): os últimos `dias` (1 a 90),
    // um por dia, com os totais e a taxa do período.
    numeros(dias = 30): Promise<NumerosDoSite> {
      return requisicao("/suporte/numeros", { query: { dias: String(dias) }, comToken: true });
    },

    async publicarAviso(aviso: NovoAviso): Promise<AvisoPublicado> {
      const resposta = await requisicao<{ aviso: AvisoPublicado }>("/suporte/avisos", {
        metodo: "POST",
        corpo: aviso,
        comToken: true,
      });
      return resposta.aviso;
    },

    // O Pix do BarChop (plano pix-do-barchop): os aguardando, do mais
    // velho pro mais novo, com a barbearia e o dono, pra achar no extrato.
    async pixNaFila(): Promise<PixNaFila[]> {
      const resposta = await requisicao<{ pagamentos: PixNaFila[] }>("/suporte/pix", { comToken: true });
      return resposta.pagamentos;
    },

    // Achou no extrato: o plano já vale; só o pagamento muda.
    confirmarPix(id: string): Promise<PagamentoPix> {
      return requisicao(`/suporte/pix/${id}/confirmar`, { metodo: "POST", comToken: true });
    },

    // Não achou: a assinatura volta ao que era. A resposta é o que o dono
    // lê em Faturas.
    recusarPix(id: string, resposta: string): Promise<PagamentoPix> {
      return requisicao(`/suporte/pix/${id}/recusar`, { metodo: "POST", corpo: { resposta }, comToken: true });
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
