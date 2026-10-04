// Onde mora a página pública de cada barbearia. Em produção cada uma tem
// o próprio host (`<slug>.barchop.com.br`, ADR-0002): URL_DAS_BARBEARIAS
// é o molde, com `{slug}` no lugar do nome. Sem ela — desenvolvimento,
// testes — a página continua no caminho `/<slug>` do host do painel,
// que é onde o site morava antes do tenant por subdomínio.
//
// Devolve uma função e não a URL pronta: o molde é conferido uma vez, na
// subida, e cada link só troca o slug.
export function enderecoDasBarbearias(env: {
  URL_DAS_BARBEARIAS?: string;
  URL_DO_PAINEL?: string;
}): ((slug: string) => string) | undefined {
  const molde = env.URL_DAS_BARBEARIAS?.replace(/\/+$/, "");
  if (molde) {
    // Sem o {slug}, todo link iria pro mesmo endereço — e o cliente de
    // uma barbearia abriria a página de outra. Melhor a API não subir.
    if (!molde.includes("{slug}")) {
      throw new Error("URL_DAS_BARBEARIAS precisa do {slug} no lugar do nome da barbearia");
    }
    return (slug) => molde.replace("{slug}", slug);
  }

  const painel = env.URL_DO_PAINEL?.replace(/\/+$/, "");
  if (painel) return (slug) => `${painel}/${slug}`;

  return undefined;
}
