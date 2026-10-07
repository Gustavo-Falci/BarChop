import type { MetadataRoute } from "next";

// O que os buscadores e as prévias de link (WhatsApp, Google) leem do
// site. Puro: quem lê NEXT_PUBLIC_URL_DO_SITE é quem chama. Sem o site
// configurado (desenvolvimento), nada de endereço inteiro — relativo
// não vale em sitemap nem em Open Graph.

// As páginas públicas do site (ADR-0006). As das barbearias ficam de
// fora: moram cada uma no próprio host.
const PAGINAS_DO_SITE = ["/", "/termos", "/privacidade"];

export function baseDoSite(urlDoSite: string | undefined): URL | undefined {
  if (!urlDoSite) return undefined;
  return new URL("/", urlDoSite);
}

// O mesmo robots.txt sai em todo host — o proxy não o reescreve. Fecha
// o painel (que em `painel.` também mora em /painel) e o link do
// lembrete, que leva um token no caminho: no host da barbearia,
// /lembrete/<token>; no /[slug] do desenvolvimento, /<slug>/lembrete/.
export function regrasDoRobots(urlDoSite: string | undefined): MetadataRoute.Robots {
  const base = baseDoSite(urlDoSite);
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/painel", "/lembrete/", "/*/lembrete/"],
    },
    sitemap: base ? new URL("/sitemap.xml", base).toString() : undefined,
  };
}

export function paginasDoSitemap(urlDoSite: string | undefined): MetadataRoute.Sitemap {
  const base = baseDoSite(urlDoSite);
  if (!base) return [];
  return PAGINAS_DO_SITE.map((caminho) => ({ url: new URL(caminho, base).toString() }));
}
