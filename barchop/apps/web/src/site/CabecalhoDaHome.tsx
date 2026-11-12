"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { MarcaDoBarChop } from "../componentes/MarcaDoBarChop";
import { LinkDeAcao } from "./LinkDeAcao";
import estilos from "./CabecalhoDaHome.module.css";

type Tema = "escuro" | "claro";

// O cabeçalho só da home (home nova, marco 2): fixo, transparente com
// texto claro sobre o topo escuro e, quando o topo sai de baixo dele, com
// o papel e a tinta do cabeçalho das outras páginas. Mesmos links do
// CabecalhoDoSite (relativos: no www o proxy manda /painel/… pro host
// painel.).
//
// O HTML do servidor sai escuro, que é o que a pessoa vê ao chegar. Quem
// muda é o IntersectionObserver olhando o topo numa faixa da altura do
// cabeçalho; sem ele no navegador, fica escuro.
export function CabecalhoDaHome({ topo }: { topo: string }) {
  const cabecalho = useRef<HTMLElement>(null);
  const [tema, setTema] = useState<Tema>("escuro");

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
          if (entrada) setTema(entrada.isIntersecting ? "escuro" : "claro");
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
    <header ref={cabecalho} className={estilos.cabecalho} data-tema={tema}>
      <div className={estilos.conteudo}>
        <Link href="/" className={estilos.marca}>
          <MarcaDoBarChop tamanho={30} />
          <span className={estilos.nomeDaMarca}>BarChop</span>
        </Link>
        <nav aria-label="Conta" className={estilos.nav}>
          <Link href="/precos" className={`${estilos.link} ${estilos.precos}`}>
            Preços
          </Link>
          <Link href="/painel/entrar" className={estilos.link}>
            Entrar
          </Link>
          <LinkDeAcao href="/painel/cadastro" className={estilos.acao}>
            Criar barbearia
          </LinkDeAcao>
        </nav>
      </div>
    </header>
  );
}
