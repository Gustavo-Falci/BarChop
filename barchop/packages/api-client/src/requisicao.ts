import { ErroDaApi } from "./erro";

export interface OpcoesDoClient {
  baseUrl: string;
  // Função, não valor: o token muda no meio da vida do client (login,
  // logout, expiração) e quem guarda é o app, não este pacote.
  obterToken?: () => string | null;
  // No navegador, a sessão mora no cookie httpOnly que a API põe
  // (auditoria de 15/11, SEC-003): o client só pede ao fetch que leve o
  // cookie, e nunca manda Authorization. O app mobile segue no token.
  sessaoPorCookie?: boolean;
  // A sessão do cliente é por barbearia, um cookie pra cada uma: o
  // cabeçalho diz à API qual delas ler.
  barbeariaDaSessao?: string;
  aoExpirarSessao?: () => void;
  // Injetável pra o teste não precisar de rede nem de MSW.
  fetch?: typeof globalThis.fetch;
}

export interface OpcoesDaChamada {
  metodo?: string;
  corpo?: unknown;
  // Upload de arquivo: vai como multipart, e o Content-Type (com o
  // boundary) quem põe é o fetch — um à mão quebraria o corpo.
  formulario?: FormData;
  query?: Record<string, string | string[] | undefined>;
  comToken?: boolean;
  // A chamada que cria a sessão (login, cadastro, nova senha, convite):
  // não manda sessão nenhuma, mas, com a sessão por cookie, precisa das
  // credenciais pra o navegador guardar o cookie da resposta.
  abreSessao?: boolean;
}

export type Requisicao = <T>(
  caminho: string,
  opcoes?: OpcoesDaChamada
) => Promise<T>;

function montarQuery(query: OpcoesDaChamada["query"]): string {
  if (!query) return "";

  const params = new URLSearchParams();
  for (const [chave, valor] of Object.entries(query)) {
    if (valor === undefined) continue;
    // Array vira o mesmo parâmetro repetido — é o formato que o AJV do
    // Fastify lê como array em /disponibilidade.
    for (const item of Array.isArray(valor) ? valor : [valor]) {
      params.append(chave, item);
    }
  }

  const texto = params.toString();
  return texto ? `?${texto}` : "";
}

export function criarRequisicao(opcoes: OpcoesDoClient): Requisicao {
  const executar = opcoes.fetch ?? globalThis.fetch;

  return async function requisicao<T>(
    caminho: string,
    chamada: OpcoesDaChamada = {}
  ): Promise<T> {
    const cabecalhos: Record<string, string> = { Accept: "application/json" };

    if (chamada.corpo !== undefined) {
      cabecalhos["Content-Type"] = "application/json";
    }

    // Só onde a rota pede: mandar o token do barbeiro numa rota pública
    // não autentica nada e amplia o alcance de um token vazado.
    // O mesmo vale pro cookie: só vai onde a rota pede.
    let credenciais: "include" | "omit" | undefined;
    if (opcoes.sessaoPorCookie) {
      credenciais = chamada.comToken || chamada.abreSessao ? "include" : "omit";
      if (chamada.comToken && opcoes.barbeariaDaSessao) {
        cabecalhos["X-BarChop-Barbearia"] = opcoes.barbeariaDaSessao;
      }
    } else if (chamada.comToken) {
      const token = opcoes.obterToken?.();
      if (token) cabecalhos.Authorization = `Bearer ${token}`;
    }

    const resposta = await executar(
      `${opcoes.baseUrl}${caminho}${montarQuery(chamada.query)}`,
      {
        method: chamada.metodo ?? "GET",
        headers: cabecalhos,
        ...(credenciais ? { credentials: credenciais } : {}),
        ...(chamada.formulario !== undefined
          ? { body: chamada.formulario }
          : chamada.corpo !== undefined
            ? { body: JSON.stringify(chamada.corpo) }
            : {}),
      }
    );

    if (resposta.status === 204) return null as T;

    // Corpo ilegível existe: 502 de proxy, HTML de gateway. Sem o
    // catch, o JSON.parse estouraria e a tela veria SyntaxError no
    // lugar do status.
    const corpo = (await resposta.json().catch(() => null)) as {
      erro?: string;
      mensagem?: string;
    } | null;

    if (!resposta.ok) {
      if (resposta.status === 401) opcoes.aoExpirarSessao?.();

      throw new ErroDaApi(
        resposta.status,
        corpo?.erro ??
          (resposta.status >= 500 ? "erro_interno" : "requisicao_invalida"),
        corpo?.mensagem ?? ""
      );
    }

    return corpo as T;
  };
}
