"use client";

import { createElement, useEffect, useRef, type HTMLAttributes, type ReactNode } from "react";
import { CURVA, DESLIZE, DURACAO, curvaCss, emMs } from "../movimento/tokens";

// Uma seção do site que sobe 8px com fade quando entra na tela (motion
// PR 6), uma vez só.
//
// O HTML do servidor sai visível: o estado escondido só é aplicado depois
// de montar, e só no que está abaixo da primeira dobra. Crawler, quem
// está sem JS e o print do link compartilhado veem tudo; o que a pessoa
// já está vendo nunca some pra reaparecer.
//
// Direto no elemento, pelo IntersectionObserver e uma transição CSS, e
// não com a lib: o site quase não anima, e assim não baixa o motor dela.
// Sem o observer ou com "reduzir movimento" no sistema, fica parado.
export function Revelar({
  como = "div",
  children,
  ...resto
}: { como?: "section" | "div"; children: ReactNode } & HTMLAttributes<HTMLElement>) {
  const elemento = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = elemento.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    if (el.getBoundingClientRect().top < window.innerHeight) return;

    el.style.opacity = "0";
    el.style.translate = `0 ${DESLIZE.normal}px`;
    const observador = new IntersectionObserver(
      (entradas) => {
        if (!entradas.some((entrada) => entrada.isIntersecting)) return;
        observador.disconnect();
        const tempo = `${emMs(DURACAO.longa)} ${curvaCss(CURVA.entrada)}`;
        el.style.transition = `opacity ${tempo}, translate ${tempo}`;
        el.style.opacity = "";
        el.style.translate = "";
      },
      // Só depois de 80px pra dentro: entrar rente à borda de baixo, a
      // pessoa nem veria a subida.
      { rootMargin: "0px 0px -80px 0px" }
    );
    observador.observe(el);
    return () => {
      observador.disconnect();
      el.style.opacity = "";
      el.style.translate = "";
    };
  }, []);

  return createElement(como, { ref: elemento, ...resto }, children);
}
