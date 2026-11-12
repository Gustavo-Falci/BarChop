"use client";

import { useEffect, useRef } from "react";
import type { Cena } from "./cena/cadeira";
import { ambienteDoNavegador, podeTer3D, QUADROS_MEDIDOS, quadrosLentos } from "./cena/podeTer3D";
import { estadoDaRolagem, type EstadoDoTopo } from "./cena/rolagem";
import { avisarTopoClaro } from "./cena/topoClaro";
import estilos from "./TopoDaHome.module.css";

// Fora do componente: o three e o modelo só chegam por aqui, fora do JS
// inicial da home.
const carregarCena = () => import("./cena/cadeira").then((m) => m.criarCena);

// Se a pessoa já desceu mais que isso quando o 3D fica pronto, prender o
// topo agora mexeria na página debaixo dela: fica a imagem.
const LONGE_DO_TOPO = 0.25;

// O que a rolagem escreve no topo (o CSS tem o repouso de padrão).
const VARIAVEIS = ["--afastamento", "--nome", "--foco", "--grade", "--escuro"] as const;

// A cadeira 3D do topo da home (home nova, marco 3), por cima da imagem
// parada do marco 2. Só em aparelho que passa pelas portas de podeTer3D,
// depois do load e num momento ocioso. Quando o primeiro quadro fica
// pronto, marca `data-vivo` no topo e no trilho: o CSS troca a imagem
// pelo canvas e alonga o trilho, que prende o topo enquanto a rolagem
// gira, aproxima e dissolve a cadeira na névoa. Contexto do WebGL
// perdido ou quadros lentos devolvem a imagem e soltam o topo.
export function CadeiraViva() {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const tela = canvas.current;
    const secao = tela?.closest<HTMLElement>("[data-topo]");
    const trilho = tela?.closest<HTMLElement>("[data-trilho]");
    if (!tela || !secao || !trilho) return;
    if (!podeTer3D(ambienteDoNavegador())) return;

    let cena: Cena | undefined;
    let acabou = false;
    let claro = false;
    let pedido = 0;
    let espera: number | undefined;
    const tempos: number[] = [];

    function pinta(e: EstadoDoTopo) {
      cena?.aplicar(e.cena);
      const valores = [e.afastamento, e.nome, e.foco, e.grade, e.escuro];
      VARIAVEIS.forEach((v, i) => secao!.style.setProperty(v, String(valores[i])));
      secao!.dataset.ui = e.interfaceFora ? "fora" : "dentro";
      if (e.claro !== claro) {
        claro = e.claro;
        avisarTopoClaro(claro);
      }
    }

    function progresso() {
      const curso = trilho!.offsetHeight - secao!.offsetHeight;
      return curso > 0 ? -trilho!.getBoundingClientRect().top / curso : 0;
    }

    function aoRolar() {
      if (pedido) return;
      pedido = requestAnimationFrame(() => {
        pedido = 0;
        if (!acabou) pinta(estadoDaRolagem(progresso()));
      });
    }

    // Volta pra imagem parada e solta o topo; serve também pra desmontar.
    function encerra() {
      if (acabou) return;
      acabou = true;
      if (pedido) cancelAnimationFrame(pedido);
      window.removeEventListener("scroll", aoRolar);
      window.removeEventListener("resize", aoRolar);
      tela!.removeEventListener("webglcontextlost", encerra);
      delete trilho!.dataset.vivo;
      delete secao!.dataset.vivo;
      delete secao!.dataset.ui;
      for (const v of VARIAVEIS) secao!.style.removeProperty(v);
      if (claro) avisarTopoClaro(false);
      cena?.destruir();
    }

    function mede(ms: number) {
      if (tempos.length >= QUADROS_MEDIDOS) return;
      tempos.push(ms);
      if (quadrosLentos(tempos)) encerra();
    }

    async function comeca() {
      espera = undefined;
      if (acabou || window.scrollY > window.innerHeight * LONGE_DO_TOPO) return;
      const criarCena = await carregarCena();
      if (acabou) return;
      tela!.addEventListener("webglcontextlost", encerra);
      cena = criarCena(tela!, { aoQuadro: mede });
      try {
        await cena.pronta;
      } catch {
        encerra();
        return;
      }
      if (acabou) return;
      trilho!.dataset.vivo = "";
      secao!.dataset.vivo = "";
      pinta(estadoDaRolagem(progresso()));
      window.addEventListener("scroll", aoRolar, { passive: true });
      window.addEventListener("resize", aoRolar);
    }

    function noOcio() {
      espera =
        typeof window.requestIdleCallback === "function"
          ? window.requestIdleCallback(() => void comeca(), { timeout: 2000 })
          : window.setTimeout(() => void comeca(), 200);
    }

    if (document.readyState === "complete") noOcio();
    else window.addEventListener("load", noOcio, { once: true });

    return () => {
      window.removeEventListener("load", noOcio);
      if (espera !== undefined) {
        if (typeof window.cancelIdleCallback === "function") window.cancelIdleCallback(espera);
        window.clearTimeout(espera);
      }
      encerra();
    };
  }, []);

  return <canvas ref={canvas} className={estilos.gl} aria-hidden="true" />;
}
