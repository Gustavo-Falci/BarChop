import type { ReactNode } from "react";
import estilos from "./Chip.module.css";

// `ok`, `atencao` e `erro` são os estados do painel ("Configurado",
// "Faltando", o que deu errado). `pequeno` é o selo que mora ao lado de
// um título — o chip normal é etiqueta de linha de lista.
export function Chip({
  children,
  tom = "acento",
  tamanho = "normal",
}: {
  children: ReactNode;
  tom?: "acento" | "neutro" | "ok" | "atencao" | "erro";
  tamanho?: "normal" | "pequeno";
}) {
  const classes = [estilos.chip, estilos[tom], tamanho === "pequeno" ? estilos.pequeno : ""];
  return <span className={classes.filter(Boolean).join(" ")}>{children}</span>;
}
