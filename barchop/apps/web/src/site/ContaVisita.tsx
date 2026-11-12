"use client";

import { useEffect } from "react";
import { apiPublica } from "../sessao/cliente-da-api";

// Home nova, marco 1: a home avisa a API que foi vista, uma vez por aba,
// pra linha de base de visita → cadastro. Sem cookie e sem nada de quem
// visitou: a marca fica no sessionStorage (não sai do navegador e some
// quando a aba fecha), e a API só soma 1 no total do dia.
const MARCA = "barchop:visita-da-home";

function contarPelaApi(): Promise<void> {
  return apiPublica().contarVisita();
}

export function ContaVisita({ contarVisita = contarPelaApi }: { contarVisita?: () => Promise<void> }) {
  useEffect(() => {
    try {
      if (sessionStorage.getItem(MARCA)) return;
      sessionStorage.setItem(MARCA, "1");
    } catch {
      // Navegador que recusa o sessionStorage (modo privado antigo):
      // conta mesmo assim; no máximo conta de novo ao recarregar.
    }
    // A falha não aparece pra quem visita: contar é nosso, não dele.
    contarVisita().catch(() => {});
  }, [contarVisita]);

  return null;
}
