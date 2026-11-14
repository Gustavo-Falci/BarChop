import type { ReactNode } from "react";
import { LinkDoSite } from "./LinkDoSite";
import estilos from "./LinkDeAcao.module.css";

type Variante = "primario" | "contorno";

interface Props {
  href: string;
  variante?: Variante;
  grande?: boolean;
  // O efeito dos botões do protótipo da home (barchop-prototipo,
  // base.css): no hover e no foco do teclado o rótulo sobe e uma cópia
  // entra por baixo; o ouro clareia e o contorno acende.
  rotuloQueSobe?: boolean;
  // Ajuste de quem chama (o topo escuro da home troca a borda clara).
  className?: string;
  children: ReactNode;
}

// O convite do site tem a cara do Botao, mas é link: leva pra outra
// página, e o Botao é <button> e client component — o site é todo
// server, estático (ADR-0006).
export function LinkDeAcao({
  href,
  variante = "primario",
  grande = false,
  rotuloQueSobe = false,
  className,
  children,
}: Props) {
  const classes = [
    estilos.link,
    estilos[variante],
    grande ? estilos.grande : "",
    rotuloQueSobe ? estilos.efeito : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <LinkDoSite href={href} className={classes} {...(rotuloQueSobe ? { "data-rotulo": "sobe" } : {})}>
      {rotuloQueSobe ? (
        // A cópia é desenho: com aria-hidden o nome do link é lido uma
        // vez só (o protótipo usava ::after, que alguns leitores leem).
        <span className={estilos.rotulo}>
          <span className={estilos.texto}>{children}</span>
          <span className={estilos.copia} aria-hidden="true">
            {children}
          </span>
        </span>
      ) : (
        children
      )}
    </LinkDoSite>
  );
}
