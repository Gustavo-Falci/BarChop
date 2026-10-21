"use client";

import { m } from "motion/react";
import { CURVA, DURACAO, MOLAS } from "../movimento/tokens";
import estilos from "./MarcaDeConfirmado.module.css";

// O ✓ do "Agendamento confirmado" (motion PR 5): o círculo aparece com a
// mola firme e o traço se desenha por cima. É o único momento de
// comemoração do fluxo, e é curto. Decorativo — quem diz que deu certo
// é o título logo abaixo. Com "reduzir movimento", o MotionConfig tira a
// escala; o traço aparece sem desenhar.
export function MarcaDeConfirmado() {
  return (
    <m.span
      className={estilos.marca}
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1, transition: MOLAS.firme }}
    >
      <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true" focusable="false">
        <m.path
          d="M5 12.5l4.5 4.5L19 7.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 0 }}
          animate={{
            pathLength: 1,
            transition: { duration: DURACAO.longa, ease: CURVA.entrada, delay: DURACAO.instante },
          }}
        />
      </svg>
    </m.span>
  );
}
