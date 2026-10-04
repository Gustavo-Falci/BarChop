// Endereços da página da barbearia, com e sem o tenant por host
// (ADR-0002). Puro: quem lê a config e o cabeçalho do proxy é quem chama.

// O endereço que o dono vê e divulga. Com o site configurado
// (NEXT_PUBLIC_URL_DO_SITE), o host próprio; sem ele, o caminho /<slug>
// — que é onde a página mora em desenvolvimento.
export function enderecoDaBarbearia(slug: string, urlDoSite: string | undefined): string {
  if (!urlDoSite) return `/${slug}`;
  const { protocol, host } = new URL(urlDoSite);
  return `${protocol}//${slug}.${host}`;
}

// "/gr-barber/agendar?x" → "/agendar?x"; "/gr-barber" → "/"; null
// quando o caminho não começa pelo segmento inteiro do slug.
function semOSlug(caminho: string, slug: string): string | null {
  const prefixo = `/${slug}`;
  if (caminho === prefixo) return "/";
  if (caminho.startsWith(`${prefixo}/`)) return caminho.slice(prefixo.length);
  if (caminho.startsWith(`${prefixo}?`)) return `/${caminho.slice(prefixo.length)}`;
  return null;
}

// As telas montam os caminhos com o slug na frente (`/gr-barber/agendar`),
// que é o que vale em /[slug]. Pelo host da barbearia o slug já está no
// host: o caminho sai limpo, e o proxy o reescreve de volta. Só quando o
// host é DESTA barbearia — o cabeçalho do proxy dizendo outra não corta
// nada.
export function noHostDaBarbearia(
  caminho: string,
  slug: string,
  barbeariaDoHost: string | null
): string {
  if (barbeariaDoHost !== slug) return caminho;
  return semOSlug(caminho, slug) ?? caminho;
}

// Pra onde mandar quem chegou por um slug antigo (a API achou a
// barbearia e disse o atual). O caminho inteiro vai junto: o link do
// lembrete num e-mail já enviado é /<antigo>/lembrete/<token>, e sem
// ele o token se perderia. Null quando o slug pedido já é o atual.
export function destinoDoSlugAntigo({
  pedido,
  atual,
  caminho,
  barbeariaDoHost,
  site,
}: {
  pedido: string;
  atual: string;
  // O que o navegador pediu, com a query — antes da reescrita do proxy.
  caminho: string;
  barbeariaDoHost: string | null;
  site: string | undefined;
}): string | null {
  if (pedido === atual) return null;

  const resto = semOSlug(caminho, pedido) ?? caminho;
  if (barbeariaDoHost === pedido && site) {
    return `${enderecoDaBarbearia(atual, site)}${resto}`;
  }
  // No caminho, a raiz da barbearia é /<atual> e não /<atual>/: "/" some
  // e "/?x=1" vira "?x=1".
  const sufixo = resto === "/" ? "" : resto.startsWith("/?") ? resto.slice(1) : resto;
  return `/${atual}${sufixo}`;
}
