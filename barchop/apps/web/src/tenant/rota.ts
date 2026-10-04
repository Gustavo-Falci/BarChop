import { PADRAO_SLUG, slugReservado } from "@barchop/formato";

// Cada barbearia no próprio host, `<slug>.barchop.com.br` (ADR-0002); o
// painel em `painel.`; a raiz e o `www` ficam pro site. As páginas
// continuam em `app/(publico)/[slug]`: o host da barbearia reescreve pra
// elas, e por isso o `/[slug]` segue funcionando sozinho em
// desenvolvimento, sem site configurado.
//
// A decisão é pura — host, caminho e config entram, uma de três saídas
// sai — e o proxy.ts só a executa.

// O endereço do site, lido de NEXT_PUBLIC_URL_DO_SITE. Os redirects
// saem daqui e nunca do host que chegou: atrás do Caddy ele pode trazer
// a porta interna.
export interface Site {
  protocolo: string;
  host: string;
}

export type Decisao =
  | { tipo: "seguir"; barbearia?: string }
  | { tipo: "reescrever"; destino: string; barbearia: string }
  | { tipo: "redirecionar"; url: string; status: 308 };

// Como o app fica sabendo, no servidor, que a página foi pedida pelo
// host da barbearia — os links de lá não levam o slug na frente.
export const CABECALHO_DA_BARBEARIA = "x-barchop-barbearia";

// O caminho que o navegador pediu, com a query, antes da reescrita. O
// layout de /[slug] não recebe o caminho, e o redirect do slug antigo
// precisa dele inteiro — o token do link do lembrete mora ali.
export const CABECALHO_DO_CAMINHO = "x-barchop-caminho";

const SUBDOMINIO_DO_PAINEL = "painel";
const FORMATO_DO_SLUG = new RegExp(PADRAO_SLUG);

function eSlugDeBarbearia(texto: string): boolean {
  return FORMATO_DO_SLUG.test(texto) && !slugReservado(texto);
}

function eDoPainel(caminho: string): boolean {
  return caminho === "/painel" || caminho.startsWith("/painel/");
}

// "/gr-barber/agendar" → ["gr-barber", "/agendar"]; "/gr-barber" → ["gr-barber", "/"].
function primeiroSegmento(caminho: string): [string, string] {
  const [, primeiro = "", ...resto] = caminho.split("/");
  return [primeiro, `/${resto.join("/")}`];
}

export function decidirRota(
  pedido: { host: string; caminho: string; busca: string },
  site: Site | undefined
): Decisao {
  if (!site) return { tipo: "seguir" };

  const host = pedido.host.toLowerCase();
  const { caminho, busca } = pedido;
  const raiz = site.host.toLowerCase();
  const url = (subdominio: string, resto: string) =>
    `${site.protocolo}//${subdominio}.${site.host}${resto}${busca}`;

  // O caminho antigo `/<slug>/…` — links que já circularam antes do
  // tenant por host — vai pro host da barbearia, com o resto e a query.
  // 308: esse endereço não muda mais, e o navegador pode guardar.
  const levarProHostDaBarbearia = (): Decisao => {
    const [slug, resto] = primeiroSegmento(caminho);
    if (!eSlugDeBarbearia(slug)) return { tipo: "seguir" };
    return { tipo: "redirecionar", url: url(slug, resto), status: 308 };
  };

  if (host === raiz || host === `www.${raiz}`) {
    if (eDoPainel(caminho)) {
      return { tipo: "redirecionar", url: url(SUBDOMINIO_DO_PAINEL, caminho), status: 308 };
    }
    return levarProHostDaBarbearia();
  }

  if (host === `${SUBDOMINIO_DO_PAINEL}.${raiz}`) {
    // As rotas do painel já começam em /painel; reescrever as tiraria
    // do lugar e obrigaria a mudar todos os links de lá.
    if (caminho === "/") {
      return { tipo: "redirecionar", url: url(SUBDOMINIO_DO_PAINEL, "/painel"), status: 308 };
    }
    if (eDoPainel(caminho)) return { tipo: "seguir" };
    return levarProHostDaBarbearia();
  }

  if (!host.endsWith(`.${raiz}`)) return { tipo: "seguir" };
  const slug = host.slice(0, -(raiz.length + 1));
  // Um nível só, no formato do slug e fora dos reservados: `api.`,
  // `a.b.` e `x.` não são barbearia nenhuma.
  if (!eSlugDeBarbearia(slug)) return { tipo: "seguir" };

  if (eDoPainel(caminho)) {
    return { tipo: "redirecionar", url: url(SUBDOMINIO_DO_PAINEL, caminho), status: 308 };
  }

  // Caminho que já traz o slug segue como está: os links das telas
  // ainda são `/<slug>/…`, e reescrever dobraria o nome. Por isso
  // `agendar` e `lembrete` são reservados — `agendar.barchop.com.br/agendar`
  // seria ambíguo.
  if (primeiroSegmento(caminho)[0] === slug) return { tipo: "seguir", barbearia: slug };

  return {
    tipo: "reescrever",
    destino: `/${slug}${caminho === "/" ? "" : caminho}${busca}`,
    barbearia: slug,
  };
}
