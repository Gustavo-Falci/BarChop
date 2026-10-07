import { apiPublica } from "../sessao/cliente-da-api";
import { eSlugDeBarbearia } from "../tenant/rota";

// O mesmo teto da metadata: com a API travada, a página abre sem o
// redirect em vez de esperar.
const TEMPO_MAXIMO_MS = 3000;

// O slug atual da barbearia que este slug acha — o próprio, ou o novo
// quando ele é um antigo (a API acha pelos dois). Qualquer falha devolve
// null e a página segue: quem explica slug inexistente é a tela.
//
// Todo caminho sem rota própria cai em /[slug] — o favicon.ico que o
// navegador pede sozinho, os robôs atrás de /wp-login.php. O que não
// pode ser link de barbearia nem vai à API.
export async function slugAtual(
  slug: string,
  fetchInjetado: typeof globalThis.fetch = globalThis.fetch
): Promise<string | null> {
  if (!eSlugDeBarbearia(slug)) return null;

  const comTeto: typeof globalThis.fetch = (entrada, init) =>
    fetchInjetado(entrada, { ...init, signal: AbortSignal.timeout(TEMPO_MAXIMO_MS) });
  try {
    return (await apiPublica(comTeto).perfilDaBarbearia(slug)).slug;
  } catch {
    return null;
  }
}
