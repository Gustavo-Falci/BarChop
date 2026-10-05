import Link from "next/link";
import type { ReactNode } from "react";
import estilos from "./LinkDeAcao.module.css";

type Variante = "primario" | "contorno";

interface Props {
  href: string;
  variante?: Variante;
  grande?: boolean;
  children: ReactNode;
}

// O convite do site tem a cara do Botao, mas é link: leva pra outra
// página, e o Botao é <button> e client component — o site é todo
// server, estático (ADR-0006).
export function LinkDeAcao({ href, variante = "primario", grande = false, children }: Props) {
  const classes = [estilos.link, estilos[variante], grande ? estilos.grande : ""]
    .filter(Boolean)
    .join(" ");
  return (
    <Link href={href} className={classes}>
      {children}
    </Link>
  );
}
