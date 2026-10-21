"use client";

import { LazyMotion, MotionConfig } from "motion/react";
import type { ReactNode } from "react";

// Fora do componente: uma função nova a cada render faria o LazyMotion
// buscar as features de novo.
const carregarFeatures = () => import("./features").then((modulo) => modulo.default);

// A raiz do movimento (ADR-0011), no layout raiz.
//
// `LazyMotion` + `domAnimation`: os componentes usam `m.div`, que sai
// leve no bundle, e as features de animação chegam por import() — fora
// do JS inicial de toda rota, inclusive do site, que quase não anima.
// Até elas chegarem, um `m.div` só renderiza parado no estado final.
// `strict` faz qualquer `motion.div` cheio quebrar no dev — é ele que
// traria a lib inteira de volta pra toda página.
//
// `reducedMotion="user"`: quem pediu menos movimento no sistema não vê
// nada deslizar nem escalar; sobra o fade. É o par da regra global de
// `prefers-reduced-motion` do globals.css, que cuida do que é CSS.
export function ProvedorDeMovimento({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={carregarFeatures} strict>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  );
}
