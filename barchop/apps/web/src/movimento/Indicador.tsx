"use client";

import { m } from "motion/react";
import { MOLAS } from "./tokens";

// O fundo (ou o traço) do item ativo de um seletor, um só por grupo
// (motion PR 3). Quem usa o põe dentro do item ativo; trocou a escolha,
// ele sai de um item e nasce no outro com o mesmo `layoutId`, e a lib
// faz parecer que deslizou. Antes o ativo só trocava de cor.
//
// `grupo` sai de um useId de quem usa: com um nome fixo, duas pílulas
// na mesma tela disputariam o mesmo indicador. Decorativo — quem diz o
// que está escolhido é o aria-pressed/selected/checked do item.
//
// No HTML do servidor ele já nasce no lugar, e com "reduzir movimento"
// o MotionConfig desliga o deslize: só troca.
export function Indicador({ grupo, className }: { grupo: string; className: string }) {
  return (
    <m.span
      aria-hidden="true"
      data-indicador=""
      layoutId={`indicador-${grupo}`}
      className={className}
      transition={MOLAS.firme}
    />
  );
}
