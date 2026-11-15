import { ErroDaApi } from "@barchop/api-client";
import { normalizarAparencia, type Aparencia } from "@barchop/formato";
import { apiPublica } from "../sessao/cliente-da-api";
import { eSlugDeBarbearia } from "../tenant/rota";

// O mesmo teto da metadata: com a API travada, a página abre sem o
// redirect em vez de esperar.
const TEMPO_MAXIMO_MS = 3000;

// O slug atual da barbearia que este slug acha — o próprio, ou o novo
// quando ele é um antigo (a API acha pelos dois). Qualquer falha devolve
// null e a página segue. Pra saber se é 404, procurarBarbearia, abaixo.
//
// Todo caminho sem rota própria cai em /[slug] — o favicon.ico que o
// navegador pede sozinho, os robôs atrás de /wp-login.php. O que não
// pode ser link de barbearia nem vai à API.
export async function slugAtual(
  slug: string,
  fetchInjetado: typeof globalThis.fetch = globalThis.fetch
): Promise<string | null> {
  return (await barbeariaDoLayout(slug, fetchInjetado))?.slug ?? null;
}

// O que o layout de /[slug] precisa, numa busca só: o slug atual (pro
// redirect do link antigo) e a Aparência publicada (o <style> e o modo,
// marco C). A aparência sai normalizada: uma API de antes dela, sem o
// campo, dá o padrão.
//
// Sem cache: o fetch do Next 16 não guarda por padrão, e o layout lê
// headers() antes — renderiza a cada pedido. Publicar na Aparência e
// recarregar a página já mostra o visual novo.
export async function barbeariaDoLayout(
  slug: string,
  fetchInjetado: typeof globalThis.fetch = globalThis.fetch
): Promise<{ slug: string; aparencia: Aparencia } | null> {
  const achado = await procurarBarbearia(slug, fetchInjetado);
  return achado.tipo === "achada" ? { slug: achado.slug, aparencia: achado.aparencia } : null;
}

export type BarbeariaProcurada =
  | { tipo: "achada"; slug: string; aparencia: Aparencia }
  | { tipo: "nao_existe" }
  | { tipo: "sem_resposta" };

// A mesma busca, dizendo por que não achou: o layout só responde 404
// quando sabe que a barbearia não existe — o texto não pode ser link de
// barbearia, ou a API respondeu 404. API fora do ar, lenta ou com erro
// é `sem_resposta`: a página abre e a tela explica, sem 404.
export async function procurarBarbearia(
  slug: string,
  fetchInjetado: typeof globalThis.fetch = globalThis.fetch
): Promise<BarbeariaProcurada> {
  if (!eSlugDeBarbearia(slug)) return { tipo: "nao_existe" };

  const comTeto: typeof globalThis.fetch = (entrada, init) =>
    fetchInjetado(entrada, { ...init, signal: AbortSignal.timeout(TEMPO_MAXIMO_MS) });
  try {
    const perfil = await apiPublica(comTeto).perfilDaBarbearia(slug);
    return { tipo: "achada", slug: perfil.slug, aparencia: normalizarAparencia(perfil.aparencia) };
  } catch (erro) {
    if (erro instanceof ErroDaApi && erro.status === 404) return { tipo: "nao_existe" };
    return { tipo: "sem_resposta" };
  }
}
