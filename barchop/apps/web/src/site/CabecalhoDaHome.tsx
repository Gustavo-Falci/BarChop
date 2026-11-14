"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { MarcaDoBarChop } from "../componentes/MarcaDoBarChop";
import { TOPO_CLARO } from "./cena/topoClaro";
import { LinkDeAcao } from "./LinkDeAcao";
import { LinkDoSite } from "./LinkDoSite";
import estilos from "./CabecalhoDaHome.module.css";

// Até aqui do alto da página o cabeçalho nunca some.
const SEMPRE_VISIVEL = 140;
// Movimentos menores que isso não decidem nada (o dedo treme).
const FOLGA = 2;
// A linha da tela que decide o tema: a altura do meio do cabeçalho.
const LINHA_DO_CABECALHO = 36;

// As seções da pílula, na ordem da página. O fecho (#comecar) é escuro:
// com ele embaixo, o cabeçalho volta ao escuro.
const SECOES = [
  { id: "dores", nome: "O problema" },
  { id: "como-funciona", nome: "Como funciona" },
  { id: "comecar", nome: "Começar" },
] as const;
const FECHO = "comecar";

// O cabeçalho só da home, o `.nav` do protótipo (barchop-prototipo,
// hero.css e nav.js): fixo e sem barra, a marca à esquerda, a pílula das
// seções no meio (com a seção do meio da tela marcada) e, à direita, o
// "Entrar" (decisão do dono, 14/11) e o convite. Claro sobre as seções
// claras, escuro sobre o topo e sobre o fecho. Some ao descer e volta ao
// subir. Os links do painel são relativos: no www o proxy manda /painel/…
// pro host painel.
//
// O HTML do servidor sai escuro, que é o que a pessoa vê ao chegar. O
// IntersectionObserver olha o topo numa faixa da altura do cabeçalho;
// sem ele no navegador, fica escuro. Com a cadeira 3D o topo fica preso
// debaixo do cabeçalho até a névoa acabar, então o topo também avisa
// (TOPO_CLARO) quando já clareou.
export function CabecalhoDaHome({ topo, classeDaFonte }: { topo: string; classeDaFonte?: string }) {
  const [foraDoTopo, setForaDoTopo] = useState(false);
  const [nevoaClara, setNevoaClara] = useState(false);
  const [sobreOFecho, setSobreOFecho] = useState(false);
  const [escondido, setEscondido] = useState(false);
  const [aqui, setAqui] = useState<string | null>(null);
  const tema = !sobreOFecho && (foraDoTopo || nevoaClara) ? "claro" : "escuro";

  useEffect(() => {
    const ouvir = (ev: Event) => setNevoaClara((ev as CustomEvent<boolean>).detail === true);
    document.addEventListener(TOPO_CLARO, ouvir);
    return () => document.removeEventListener(TOPO_CLARO, ouvir);
  }, []);

  useEffect(() => {
    let ultimo = window.scrollY;
    let pedido = 0;

    // O que está embaixo do cabeçalho e no meio da tela, medido uma vez
    // por quadro.
    function medir() {
      pedido = 0;
      const fecho = document.getElementById(FECHO);
      setSobreOFecho(fecho !== null && fecho.getBoundingClientRect().top <= LINHA_DO_CABECALHO);
      // A última seção que já passou do meio da tela (o espaço entre
      // duas seções conta pra de cima), enquanto o fim dela não sobe.
      const meio = window.innerHeight / 2;
      let secao: string | null = null;
      for (const { id } of SECOES) {
        const caixa = document.getElementById(id)?.getBoundingClientRect();
        if (caixa && caixa.top < meio) secao = caixa.bottom > 0 ? id : null;
      }
      setAqui(secao);
    }

    function aoRolar() {
      const y = window.scrollY;
      if (y < SEMPRE_VISIVEL) setEscondido(false);
      else if (y > ultimo + FOLGA) setEscondido(true);
      else if (y < ultimo - FOLGA) setEscondido(false);
      ultimo = y;
      if (!pedido) pedido = window.requestAnimationFrame(medir);
    }

    medir();
    window.addEventListener("scroll", aoRolar, { passive: true });
    window.addEventListener("resize", aoRolar);
    return () => {
      window.removeEventListener("scroll", aoRolar);
      window.removeEventListener("resize", aoRolar);
      if (pedido) window.cancelAnimationFrame(pedido);
    };
  }, []);

  useEffect(() => {
    const alvo = document.getElementById(topo);
    if (!alvo || typeof IntersectionObserver === "undefined") return;

    let observador: IntersectionObserver | undefined;
    function observar() {
      observador?.disconnect();
      // A faixa vai do alto da tela até a linha do cabeçalho (36 px, a
      // do nav.js do protótipo), não até o pé dele: a pontinha do topo
      // que ainda passa por baixo da pílula não deixa a marca escura
      // sobre o papel.
      const resto = Math.max(0, Math.round(window.innerHeight - LINHA_DO_CABECALHO));
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
      className={[estilos.cabecalho, classeDaFonte].filter(Boolean).join(" ")}
      data-tema={tema}
      data-escondido={escondido ? "" : undefined}
    >
      <Link href="/" className={estilos.marca}>
        {/* Onde o B da abertura da navalha pousa (marco 5). */}
        <span className={estilos.icone} data-marca-da-nav="">
          <MarcaDoBarChop tamanho={30} />
        </span>
        <span className={estilos.nomeDaMarca}>
          <span className={estilos.bar}>Bar</span>Chop
        </span>
      </Link>
      <nav aria-label="Seções" className={estilos.pilula}>
        {SECOES.map(({ id, nome }) => (
          <a
            key={id}
            href={`#${id}`}
            className={estilos.secao}
            aria-current={aqui === id ? "true" : undefined}
          >
            {nome}
          </a>
        ))}
      </nav>
      <nav aria-label="Conta" className={estilos.conta}>
        <LinkDoSite href="/painel/entrar" className={estilos.entrar}>
          Entrar
        </LinkDoSite>
        <LinkDeAcao href="/painel/cadastro" className={estilos.acao} rotuloQueSobe>
          Criar barbearia
        </LinkDeAcao>
      </nav>
    </header>
  );
}
