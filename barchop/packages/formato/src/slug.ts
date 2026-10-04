// O slug é o endereço público da barbearia: hoje `/<slug>`, e com o
// tenant por subdomínio (ADR-0002) `<slug>.barchop.com.br`. Mesmo
// pattern na API (JSON Schema) e nas telas (RegExp), por isso string.
export const PADRAO_SLUG = "^[a-z0-9-]{3,80}$";

// Nomes que o próprio sistema usa — subdomínios, rotas do app e páginas
// do site de marketing. Uma barbearia com um deles ficaria com o link
// sombreado pela rota do sistema, sem erro em lugar nenhum (foi o que
// aconteceu com `painel`). A lista mora aqui, e não na API, porque o
// middleware que resolve o subdomínio vai precisar dela também.
const SLUGS_RESERVADOS: ReadonlySet<string> = new Set([
  // subdomínios e infraestrutura
  "www", "admin", "api", "app", "painel", "docs", "ajuda", "suporte",
  "status", "mail", "email", "smtp", "cdn", "static", "assets", "dev",
  "staging", "teste", "demo",
  // rotas de conta
  "entrar", "sair", "cadastro", "cadastrar", "login", "logout", "signup",
  "registro", "conta", "minha-conta", "convite",
  // rotas da página da barbearia: no host dela, `agendar.barchop.com.br/agendar`
  // não diria se o caminho já traz o nome (apps/web/src/tenant/rota.ts)
  "agendar", "lembrete",
  // site de marketing
  "blog", "precos", "planos", "gratis", "funcionalidades", "comparar",
  "sobre", "metodologia", "termos", "privacidade", "contato",
  // a marca
  "barchop",
]);

export function slugReservado(slug: string): boolean {
  return SLUGS_RESERVADOS.has(slug);
}
