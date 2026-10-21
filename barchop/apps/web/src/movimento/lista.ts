"use client";

import { useEffect, useState } from "react";
import { CURVA, DESLIZE, DURACAO, ESCALONAMENTO } from "./tokens";

// Listas que se mexem (motion PR 4): a primeira carga entra escalonada,
// o item novo entra e o que saiu sai — e, com `layout` no item, os
// vizinhos fecham o buraco em vez de pular.

// O atraso do item `indice` na primeira carga: um passo por item até o
// limite; dali em diante, todos com o atraso do limite.
export function atrasoDoItem(indice: number): number {
  return Math.min(indice, ESCALONAMENTO.limite) * ESCALONAMENTO.passo;
}

// Verdade até o primeiro render em que a lista está `pronto`: é o que
// separa "a lista chegou" (escalona) de "a lista mudou" (filtro, item
// novo). `pronto` é pra tela que monta antes dos dados ("Carregando…" no
// lugar da lista). Vira falso no quadro seguinte, e não no efeito direto:
// o motion só lê o `initial` na montagem, e os itens da primeira carga
// já montaram com ele.
export function usePrimeiraCarga(pronto = true): boolean {
  const [primeira, setPrimeira] = useState(true);
  useEffect(() => {
    if (!pronto) return;
    const quadro = requestAnimationFrame(() => setPrimeira(false));
    return () => cancelAnimationFrame(quadro);
  }, [pronto]);
  return primeira;
}

const FORA = { opacity: 0, y: DESLIZE.curto };

// As props de um item animado (`m.li`, `m.tr`). Depois da primeira carga,
// o item que aparece só anima se `novosEntram`: na tabela que filtra, a
// linha que volta não é novidade; na lista curta do dia, o agendamento
// que chegou é.
export function entradaDoItem(
  indice: number,
  { primeiraCarga, novosEntram = false }: { primeiraCarga: boolean; novosEntram?: boolean }
) {
  return {
    initial: primeiraCarga || novosEntram ? FORA : (false as const),
    animate: {
      opacity: 1,
      y: 0,
      transition: {
        duration: DURACAO.curta,
        ease: CURVA.entrada,
        delay: primeiraCarga ? atrasoDoItem(indice) : 0,
      },
    },
    exit: { opacity: 0, transition: { duration: DURACAO.instante, ease: CURVA.saida } },
  };
}
