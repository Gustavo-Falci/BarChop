"use client";

import { useEffect } from "react";
import { CLASSE_DA_ABERTURA } from "./abertura/script";

// A abertura da navalha (home nova, marco 5). O script inline já decidiu,
// antes da primeira pintura, se ela acontece (põe a classe no <html>);
// aqui só se baixa e se toca o código quando a classe está lá. Quem não
// vê a abertura não baixa nada dela.
export function AberturaDaHome() {
  useEffect(() => {
    if (!document.documentElement.classList.contains(CLASSE_DA_ABERTURA)) return;
    const topo = document.querySelector<HTMLElement>("[data-topo]");
    if (!topo) return;
    const cabecalho = document.querySelector<HTMLElement>("[data-marca-da-nav]")?.closest("header") ?? null;
    let desmontou = false;
    let parar: (() => void) | void;
    void import("./abertura/tocar").then(async ({ tocar }) => {
      if (desmontou) return;
      parar = await tocar({ topo, cabecalho });
    });
    return () => {
      desmontou = true;
      parar?.();
    };
  }, []);

  return null;
}
