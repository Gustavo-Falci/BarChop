"use client";

import { useState } from "react";
import { chaveDoModo } from "./aparenciaDaPagina";
import estilos from "./TrocaDeModo.module.css";

type Modo = "claro" | "escuro";

// O modo que está valendo: o data-theme que o script do layout pôs, ou,
// sem ele, o do sistema.
function modoAtual(): Modo {
  const tema = document.documentElement.getAttribute("data-theme");
  if (tema === "dark") return "escuro";
  if (tema === "light") return "claro";
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "escuro" : "claro";
}

// O botão lua/sol da página pública: só aparece quando o dono ligou
// "Deixar o cliente trocar entre claro e escuro" na Aparência. A escolha
// fica guardada por barbearia, e o script do layout a aplica na próxima
// visita antes da primeira pintura.
export function TrocaDeModo({ slug }: { slug: string }) {
  const [modo, setModo] = useState<Modo>(modoAtual);
  const outro: Modo = modo === "escuro" ? "claro" : "escuro";

  function trocar() {
    document.documentElement.setAttribute("data-theme", outro === "escuro" ? "dark" : "light");
    try {
      window.localStorage.setItem(chaveDoModo(slug), outro);
    } catch {
      // Navegação privada sem armazenamento: troca só nesta visita.
    }
    setModo(outro);
  }

  return (
    <button type="button" className={estilos.botao} onClick={trocar} aria-label={`Usar o modo ${outro}`}>
      {outro === "escuro" ? (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11z" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="4.5" />
          <path d="M12 1.5v3M12 19.5v3M1.5 12h3M19.5 12h3M4.6 4.6l2.1 2.1M17.3 17.3l2.1 2.1M4.6 19.4l2.1-2.1M17.3 6.7l2.1-2.1" />
        </svg>
      )}
    </button>
  );
}
