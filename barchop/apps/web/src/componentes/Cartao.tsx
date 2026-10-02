import type { ReactNode } from "react";
import estilos from "./Cartao.module.css";

export function Cartao({ children }: { children: ReactNode }) {
  return <div className={estilos.cartao}>{children}</div>;
}
