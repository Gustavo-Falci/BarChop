import type { Metadata } from "next";
import { apiPublica } from "../sessao/cliente-da-api";
import { eSlugDeBarbearia } from "../tenant/rota";

// O limite que os buscadores e as prévias de link costumam mostrar
// antes de cortar sozinhos — e cortar aqui, na palavra, fica melhor do
// que o corte deles no meio de uma.
const LIMITE_DA_DESCRICAO = 160;

// Robô de prévia (WhatsApp, Telegram) espera o <head> inteiro antes de
// ler, e o Next não faz streaming do metadata pra eles. Com a API
// travada, sem este teto a prévia esperaria até o robô desistir — e
// sairia sem nada. Três segundos e cai no título padrão.
const TEMPO_MAXIMO_MS = 3000;

// Título e prévia do link da barbearia. O link circula por WhatsApp, e
// antes disto toda página do fluxo se chamava "BarChop": a prévia não
// dizia de qual barbearia era, e a aba aberta também não.
//
// Qualquer falha (slug que sumiu, API fora) devolve `{}`, que herda o
// título do layout raiz. Lançar aqui derrubaria a página inteira por
// causa de uma etiqueta — e a tela, do lado do cliente, já sabe dizer
// "não encontramos essa barbearia" melhor do que um erro de servidor.
export async function metadataDaBarbearia(
  slug: string,
  fetchInjetado: typeof globalThis.fetch = globalThis.fetch
): Promise<Metadata> {
  // O favicon.ico, o apple-touch-icon.png e os robôs também caem em
  // /[slug]: o que não pode ser link de barbearia nem vai à API.
  if (!eSlugDeBarbearia(slug)) return {};

  const comTeto: typeof globalThis.fetch = (entrada, init) =>
    fetchInjetado(entrada, {
      ...init,
      signal: AbortSignal.timeout(TEMPO_MAXIMO_MS),
    });

  try {
    const perfil = await apiPublica(comTeto).perfilDaBarbearia(slug);
    const descricao = perfil.sobre
      ? resumir(perfil.sobre)
      : `Agende seu horário na ${perfil.nome}.`;

    return {
      title: perfil.nome,
      description: descricao,
      openGraph: {
        title: perfil.nome,
        description: descricao,
        type: "website",
        locale: "pt_BR",
      },
    };
  } catch {
    return {};
  }
}

// A apresentação tem as quebras de linha que o barbeiro digitou — na
// página elas viram parágrafo pelo `pre-line`, mas numa prévia de link
// não existe parágrafo. Vira uma linha só.
function resumir(texto: string): string {
  const linha = texto.replace(/\s+/g, " ").trim();
  if (linha.length <= LIMITE_DA_DESCRICAO) return linha;

  // -1 pra caber a reticência dentro do limite.
  const corte = linha.slice(0, LIMITE_DA_DESCRICAO - 1);
  const ultimoEspaco = corte.lastIndexOf(" ");
  const inteiro = ultimoEspaco > 0 ? corte.slice(0, ultimoEspaco) : corte;
  return `${inteiro.replace(/[\s.,;:!?-]+$/, "")}…`;
}
