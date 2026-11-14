"use client";

import { useEffect } from "react";
import { CLASSE_DA_ABERTURA } from "./abertura/script";
import estilos from "./RolagemDaHome.module.css";

// A rolagem da home como a do protótipo (barchop-prototipo, motion/
// smooth.js, guia.js e scrollbar.js):
// - Lenis na roda do mouse e no trackpad (lerp 0,1); no toque, a nativa;
// - o freio (guia.js): o alvo nunca fica mais que 0,2 tela à frente de
//   onde a página está, então cada cena do topo tem tempo de tocar;
// - as âncoras (#dores, #como-funciona…) deslizam em 1,6 s;
// - a barra nativa some e uma fina flutua por cima: aparece ao rolar,
//   some parada, engrossa no mouse e dá pra arrastar.
//
// O Lenis só baixa depois do `load` (o teto da home: nada a mais no JS
// inicial) e só começa quando a abertura da navalha acaba. Com "reduzir
// movimento" ou sem mouse, nada disso liga: fica a rolagem do navegador.
const AVANCO = 0.2;
const CLASSE_DA_PAGINA = estilos.pagina!;

export function RolagemDaHome() {
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    if (!window.matchMedia?.("(hover: hover)").matches) return;

    let desligar: (() => void) | undefined;
    let cancelado = false;

    async function ligar() {
      const { default: Lenis } = await import("lenis");
      if (cancelado) return;
      const html = document.documentElement;
      const lenis = new Lenis({ lerp: 0.1, wheelMultiplier: 1, smoothWheel: true, syncTouch: false });

      // O freio da roda: limita o quanto o alvo anda à frente.
      lenis.options.virtualScroll = (dados) => {
        if (dados.event.type.includes("touch")) return true;
        const { deltaY, event } = dados;
        if ((event as WheelEvent).ctrlKey || !deltaY) return true;
        const alvo = lenis.targetScroll;
        const sentido = Math.sign(deltaY);
        const limite = lenis.animatedScroll + sentido * AVANCO * window.innerHeight;
        const novo =
          sentido > 0
            ? Math.max(alvo, Math.min(alvo + deltaY, limite))
            : Math.min(alvo, Math.max(alvo + deltaY, limite));
        dados.deltaY = novo - alvo;
        if (Math.abs(dados.deltaY) < 0.5) {
          if (event.cancelable) event.preventDefault();
          return false;
        }
        return true;
      };

      let quadro = 0;
      const rodar = (t: number) => {
        lenis.raf(t);
        quadro = requestAnimationFrame(rodar);
      };
      quadro = requestAnimationFrame(rodar);

      // Durante a abertura a página fica parada (o tocar.ts trava o body).
      const acompanharAbertura = () => {
        if (html.classList.contains(CLASSE_DA_ABERTURA)) lenis.stop();
        else lenis.start();
      };
      acompanharAbertura();
      const observador = new MutationObserver(acompanharAbertura);
      observador.observe(html, { attributes: true, attributeFilter: ["class"] });

      // As âncoras da página deslizam, com o mesmo freio do protótipo.
      const aoClicar = (ev: MouseEvent) => {
        const link = (ev.target as Element | null)?.closest?.('a[href^="#"]');
        if (!link || ev.defaultPrevented || ev.button !== 0 || ev.metaKey || ev.ctrlKey) return;
        const id = link.getAttribute("href")!;
        const alvo = id.length > 1 ? document.querySelector(id) : null;
        if (!(alvo instanceof HTMLElement)) return;
        ev.preventDefault();
        lenis.scrollTo(alvo, { duration: 1.6, easing: (t) => 1 - Math.pow(1 - t, 4) });
        history.replaceState(null, "", id);
      };
      document.addEventListener("click", aoClicar);

      html.classList.add(CLASSE_DA_PAGINA);
      const tirarBarra = barraDeRolagem(lenis);

      desligar = () => {
        cancelAnimationFrame(quadro);
        observador.disconnect();
        document.removeEventListener("click", aoClicar);
        tirarBarra();
        html.classList.remove(CLASSE_DA_PAGINA);
        lenis.destroy();
      };
    }

    const aoCarregar = () => void ligar();
    if (document.readyState === "complete") aoCarregar();
    else window.addEventListener("load", aoCarregar, { once: true });

    return () => {
      cancelado = true;
      window.removeEventListener("load", aoCarregar);
      desligar?.();
    };
  }, []);

  return null;
}

type LenisDaBarra = { scroll: number; on(evento: "scroll", fn: () => void): () => void; scrollTo(y: number, o: object): void };

// A barra fina (scrollbar.js do protótipo): um fio que aparece ao rolar e
// some parado; no mouse, engrossa e dá pra arrastar. Clara com mistura por
// diferença: aparece igual sobre o papel e sobre o escuro.
function barraDeRolagem(lenis: LenisDaBarra): () => void {
  const html = document.documentElement;
  const barra = document.createElement("div");
  barra.className = estilos.barra!;
  barra.setAttribute("aria-hidden", "true");
  const polegar = document.createElement("div");
  polegar.className = estilos.polegar!;
  barra.append(polegar);
  document.body.append(barra);

  let parado = 0;
  let altura = 0;
  const limite = () => Math.max(0, html.scrollHeight - window.innerHeight);

  function desenhar() {
    const max = limite();
    barra.toggleAttribute("data-sem", max < 2);
    if (max < 2) return;
    const trilho = barra.clientHeight;
    altura = Math.max(36, trilho * (window.innerHeight / (max + window.innerHeight)));
    polegar.style.height = `${altura}px`;
    polegar.style.transform = `translateY(${(trilho - altura) * Math.min(1, Math.max(0, lenis.scroll / max))}px)`;
  }

  function acordar() {
    desenhar();
    barra.setAttribute("data-ligada", "");
    window.clearTimeout(parado);
    parado = window.setTimeout(() => {
      if (!barra.hasAttribute("data-arrastando")) barra.removeAttribute("data-ligada");
    }, 900);
  }

  const tirarOuvinte = lenis.on("scroll", acordar);
  window.addEventListener("resize", desenhar);
  const medidor = new ResizeObserver(desenhar);
  medidor.observe(document.body);
  desenhar();

  let y0 = 0;
  let s0 = 0;
  polegar.addEventListener("pointerdown", (ev) => {
    if (ev.button !== 0) return;
    ev.preventDefault();
    polegar.setPointerCapture(ev.pointerId);
    y0 = ev.clientY;
    s0 = lenis.scroll;
    barra.setAttribute("data-arrastando", "");
    barra.setAttribute("data-ligada", "");
  });
  polegar.addEventListener("pointermove", (ev) => {
    if (!barra.hasAttribute("data-arrastando")) return;
    const y = s0 + ((ev.clientY - y0) / (barra.clientHeight - altura)) * limite();
    lenis.scrollTo(y, { immediate: true, force: true });
  });
  const soltar = () => {
    barra.removeAttribute("data-arrastando");
    acordar();
  };
  polegar.addEventListener("pointerup", soltar);
  polegar.addEventListener("pointercancel", soltar);

  return () => {
    tirarOuvinte();
    window.removeEventListener("resize", desenhar);
    medidor.disconnect();
    window.clearTimeout(parado);
    barra.remove();
  };
}
