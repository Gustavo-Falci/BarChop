import type { ReactNode } from "react";
import estilos from "./Colunas.module.css";

// As telas usam a largura (pedido do dono, 2026-10-07): seções lado a
// lado no desktop, empilhadas no celular — `auto-fit` decide sozinho,
// sem media query. Cada coluna com no mínimo 380px.
export function LadoALado({ children }: { children: ReactNode }) {
  return <div className={estilos.ladoALado}>{children}</div>;
}

// Campos de um formulário dividindo a linha (mín. 240px cada), alinhados
// pela base: um campo com frase de apoio não fica com a caixa mais baixa
// que os vizinhos.
export function CamposLadoALado({ children }: { children: ReactNode }) {
  return <div className={estilos.campos}>{children}</div>;
}
