"use client";

import { useEffect, useState } from "react";
import { direcaoDoPasso, type Passo } from "../fluxo/passos";
import { CURVA, DESLIZE, DURACAO } from "./tokens";

// O passo da última tela do agendamento que montou. Cada passo é uma rota
// que monta do zero, então quem lembra de onde se veio é o módulo, que
// vive enquanto a aba vive. No servidor e na primeira tela é nulo: nada
// desliza na carga da página.
let ultimoPasso: Passo | null = null;

// As props do bloco que desliza na troca de passo (motion PR 5): 8px do
// lado de onde a tela vem — avançar entra pela direita, voltar pela
// esquerda — por cima do fade que o EntradaDaTela já faz no layout. Vai
// num bloco sem barra `position: fixed` dentro: o transform faria dele a
// referência da barra (ver EntradaDaTela).
export function useDeslizeDoPasso(passo: Passo) {
  // Lido uma vez, na montagem: é a direção desta chegada.
  const [direcao] = useState(() => direcaoDoPasso(ultimoPasso, passo));
  useEffect(() => {
    ultimoPasso = passo;
  }, [passo]);

  if (direcao === 0) return { initial: false as const };
  return {
    initial: { x: DESLIZE.normal * direcao },
    animate: { x: 0, transition: { duration: DURACAO.media, ease: CURVA.entrada } },
  };
}
