"use client";

import { AnimatePresence, m } from "motion/react";
import { CURVA, DESLIZE, DURACAO } from "../movimento/tokens";
import estilos from "./Estatistica.module.css";

// O valor novo sobe 4px com fade e o velho sai subindo (motion PR 4): o
// número do Hoje que muda depois de um cancelamento chama o olho sem
// rolar contador. `popLayout`: o que sai deixa o lugar na hora, e os
// dois não empurram a legenda. `initial={false}`: o primeiro valor só
// aparece.
const ENTRAR = { opacity: 1, y: 0, transition: { duration: DURACAO.curta, ease: CURVA.entrada } };
const SAIR = { opacity: 0, y: -DESLIZE.curto, transition: { duration: DURACAO.instante, ease: CURVA.saida } };

export function Estatistica({
  numero,
  legenda,
}: {
  numero: string;
  legenda: string;
}) {
  return (
    <div className={estilos.bloco}>
      <span className={estilos.numero}>
        <AnimatePresence mode="popLayout" initial={false}>
          <m.span
            key={numero}
            className={estilos.valor}
            initial={{ opacity: 0, y: DESLIZE.curto }}
            animate={ENTRAR}
            exit={SAIR}
          >
            {numero}
          </m.span>
        </AnimatePresence>
      </span>
      <span className={estilos.legenda}>{legenda}</span>
    </div>
  );
}
