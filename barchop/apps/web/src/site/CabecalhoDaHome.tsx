"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { MarcaDoBarChop } from "../componentes/MarcaDoBarChop";
import { TOPO_CLARO } from "./cena/topoClaro";
import { LinkDeAcao } from "./LinkDeAcao";
import { LinkDoSite } from "./LinkDoSite";
import estilos from "./CabecalhoDaHome.module.css";

// Até aqui do alto da página o cabeçalho nunca some.
const SEMPRE_VISIVEL = 140;
// Movimentos menores que isso não decidem nada (o dedo treme).
const FOLGA = 2;

// O cabeçalho só da home (home nova, marco 2): fixo, transparente com
// texto claro sobre o topo escuro e, quando o topo sai de baixo dele, com
// o papel e a tinta do cabeçalho das outras páginas. Mesmos links do
// CabecalhoDoSite (relativos: no www o proxy manda /painel/… pro host
// painel.).
//
// O HTML do servidor sai escuro, que é o que a pessoa vê ao chegar. Quem
// muda é o IntersectionObserver olhando o topo numa faixa da altura do
// cabeçalho; sem ele no navegador, fica escuro. Com a cadeira 3D (marco
// 3) o topo fica preso debaixo do cabeçalho até a névoa acabar, então o
// topo também avisa (TOPO_CLARO) quando já clareou. Some ao descer e
// volta ao subir.
export function CabecalhoDaHome({ topo }: { topo: string }) {
  const cabecalho = useRef<HTMLElement>(null);
  const [foraDoTopo, setForaDoTopo] = useState(false);
  const [nevoaClara, setNevoaClara] = useState(false);
  const [escondido, setEscondido] = useState(false);
  const tema = foraDoTopo || nevoaClara ? "claro" : "escuro";

  useEffect(() => {
    const ouvir = (ev: Event) => setNevoaClara((ev as CustomEvent<boolean>).detail === true);
    document.addEventListener(TOPO_CLARO, ouvir);
    return () => document.removeEventListener(TOPO_CLARO, ouvir);
  }, []);

  useEffect(() => {
    let ultimo = window.scrollY;
    function aoRolar() {
      const y = window.scrollY;
      if (y < SEMPRE_VISIVEL) setEscondido(false);
      else if (y > ultimo + FOLGA) setEscondido(true);
      else if (y < ultimo - FOLGA) setEscondido(false);
      ultimo = y;
    }
    window.addEventListener("scroll", aoRolar, { passive: true });
    return () => window.removeEventListener("scroll", aoRolar);
  }, []);

  useEffect(() => {
    const alvo = document.getElementById(topo);
    if (!alvo || typeof IntersectionObserver === "undefined") return;

    let observador: IntersectionObserver | undefined;
    function observar() {
      observador?.disconnect();
      const altura = cabecalho.current?.offsetHeight ?? 0;
      const resto = Math.max(0, Math.round(window.innerHeight - altura));
      observador = new IntersectionObserver(
        (entradas) => {
          const entrada = entradas.at(-1);
          if (entrada) setForaDoTopo(!entrada.isIntersecting);
        },
        { rootMargin: `0px 0px -${resto}px 0px` }
      );
      observador.observe(alvo!);
    }

    observar();
    window.addEventListener("resize", observar);
    return () => {
      window.removeEventListener("resize", observar);
      observador?.disconnect();
    };
  }, [topo]);

  return (
    <header
      ref={cabecalho}
      className={estilos.cabecalho}
      data-tema={tema}
      data-escondido={escondido ? "" : undefined}
    >
      <div className={estilos.conteudo}>
        <Link href="/" className={estilos.marca}>
          <MarcaDoBarChop tamanho={30} />
          <span className={estilos.nomeDaMarca}>BarChop</span>
        </Link>
        <nav aria-label="Conta" className={estilos.nav}>
          <Link href="/precos" className={`${estilos.link} ${estilos.precos}`}>
            Preços
          </Link>
          <LinkDoSite href="/painel/entrar" className={estilos.link}>
            Entrar
          </LinkDoSite>
          <LinkDeAcao href="/painel/cadastro" className={estilos.acao}>
            Criar barbearia
          </LinkDeAcao>
        </nav>
      </div>
    </header>
  );
}
