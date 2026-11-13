import Link from "next/link";
import type { AnchorHTMLAttributes } from "react";

// No host do site, /painel/* é 308 pro host `painel.` (src/tenant/rota.ts).
// O <Link> do Next pré-carrega e navega por fetch: seguia o 308 pra outra
// origem e o navegador barrava (CORS). Pro painel, <a> comum — o
// navegador segue o redirect sozinho. O resto do site segue com o Link.
export function eDoPainel(href: string): boolean {
  return href === "/painel" || href.startsWith("/painel/") || href.startsWith("/painel?");
}

type Props = AnchorHTMLAttributes<HTMLAnchorElement> & { href: string };

export function LinkDoSite({ href, ...resto }: Props) {
  if (eDoPainel(href)) return <a href={href} {...resto} />;
  return <Link href={href} {...resto} />;
}
