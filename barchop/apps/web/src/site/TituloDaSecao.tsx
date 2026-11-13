"use client";

import { Fragment, useEffect, useRef, type CSSProperties } from "react";
import estilos from "./TituloDaSecao.module.css";

// O título das seções da home nova (marco 4, linguagem do protótipo): o
// rótulo pequeno em cima e a frase em duas metades, a leve e a pesada da
// Clash. As palavras sobem do desfoque uma a uma quando o título entra na
// tela, a leve antes da pesada, e saem de novo quando a pessoa volta pra
// cima (o titulos.js do protótipo, sem GSAP: observer + transição CSS).
//
// Como o Revelar: o HTML do servidor sai visível (crawler, sem JS, print
// do link); o estado escondido só entra depois de montar e só abaixo da
// primeira dobra. Sem o observer ou com "reduzir movimento", fica parado.
//
// `id` dá os ids do rótulo (`{id}-rotulo`, o nome da seção) e do título
// (`{id}-titulo`, o nome quando não há rótulo).
export function TituloDaSecao({
  id,
  rotulo,
  leve,
  forte,
}: {
  id: string;
  rotulo?: string;
  leve: string;
  forte: string;
}) {
  const titulo = useRef<HTMLHeadingElement>(null);
  const palavrasLeves = leve.split(/\s+/);
  const palavrasFortes = forte.split(/\s+/);

  useEffect(() => {
    const el = titulo.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    if (el.getBoundingClientRect().top < window.innerHeight) return;

    el.dataset.estado = "escondido";
    const observador = new IntersectionObserver(
      (entradas) => {
        const entrada = entradas.at(-1);
        if (!entrada) return;
        if (entrada.isIntersecting) el.dataset.estado = "visivel";
        // Saiu por baixo: a pessoa voltou pra cima, e o título sobe de
        // novo quando ela descer. Saindo por cima, fica como está.
        else if (entrada.boundingClientRect.top > 0) el.dataset.estado = "escondido";
      },
      // Entra com o título a 86% da altura da tela, como no protótipo.
      { rootMargin: "0px 0px -14% 0px" }
    );
    observador.observe(el);
    return () => {
      observador.disconnect();
      delete el.dataset.estado;
    };
  }, []);

  return (
    <div className={estilos.cabeca}>
      {rotulo ? (
        <p id={`${id}-rotulo`} className={estilos.rotulo}>
          {rotulo}
        </p>
      ) : null}
      <h2 ref={titulo} id={`${id}-titulo`} className={estilos.titulo}>
        <span className={estilos.leve}>{palavras(palavrasLeves, 0)}</span>{" "}
        <span className={estilos.forte}>{palavras(palavrasFortes, palavrasLeves.length)}</span>
      </h2>
    </div>
  );
}

// Cada palavra num span com a vez dela (--i), e o espaço entre elas fica
// como texto: o leitor de tela lê a frase inteira, não palavra por palavra.
function palavras(lista: string[], inicio: number) {
  return lista.map((palavra, i) => (
    <Fragment key={i}>
      {i > 0 ? " " : null}
      <span className={estilos.palavra} style={{ "--i": inicio + i } as CSSProperties}>
        {palavra}
      </span>
    </Fragment>
  ));
}
