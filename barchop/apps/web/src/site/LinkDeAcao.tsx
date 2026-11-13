import type { ReactNode } from "react";
import { LinkDoSite } from "./LinkDoSite";
import estilos from "./LinkDeAcao.module.css";

type Variante = "primario" | "contorno";

interface Props {
  href: string;
  variante?: Variante;
  grande?: boolean;
  // Ajuste de quem chama (o topo escuro da home troca a borda clara).
  className?: string;
  children: ReactNode;
}

// O convite do site tem a cara do Botao, mas é link: leva pra outra
// página, e o Botao é <button> e client component — o site é todo
// server, estático (ADR-0006).
export function LinkDeAcao({ href, variante = "primario", grande = false, className, children }: Props) {
  const classes = [estilos.link, estilos[variante], grande ? estilos.grande : "", className]
    .filter(Boolean)
    .join(" ");
  return (
    <LinkDoSite href={href} className={classes}>
      {children}
    </LinkDoSite>
  );
}
