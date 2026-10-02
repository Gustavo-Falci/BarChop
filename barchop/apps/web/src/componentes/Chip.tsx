import type { ReactNode } from "react";
import estilos from "./Chip.module.css";

export function Chip({
  children,
  tom = "acento",
}: {
  children: ReactNode;
  tom?: "acento" | "neutro";
}) {
  return <span className={`${estilos.chip} ${estilos[tom]}`}>{children}</span>;
}
