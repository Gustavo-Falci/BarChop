"use client";

import { useEffect, useRef } from "react";
import estilos from "./CampoDeBusca.module.css";

// A lupa é desenhada aqui, e não em painel/icones.tsx: aquele arquivo é
// a família da barra lateral, e este componente é genérico — o fluxo do
// cliente pode usá-lo sem arrastar a navegação do painel junto. Mesmo
// esqueleto da família mesmo assim: 24x24, traço, currentColor.
function Lupa() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

// Busca é ação, não campo de formulário: lupa, texto de exemplo, um
// jeito de apagar e a tecla que traz o foco. O <label> continua no DOM
// (escondido só visualmente) porque é ele que nomeia o campo para leitor
// de tela — `placeholder` não nomeia nada.
export function CampoDeBusca({
  rotulo,
  valor,
  onChange,
  exemplo,
  atalho = "/",
}: {
  rotulo: string;
  valor: string;
  onChange: (valor: string) => void;
  exemplo?: string;
  // A tecla que traz o foco pra cá. `null` desliga o atalho.
  atalho?: string | null;
}) {
  const entrada = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!atalho) return;

    function aoTeclar(evento: KeyboardEvent) {
      if (evento.key !== atalho) return;
      // Com Ctrl/Cmd a tecla pertence ao navegador, não à tela.
      if (evento.ctrlKey || evento.metaKey || evento.altKey) return;

      // Quem já está escrevendo em algum lugar continua escrevendo:
      // roubar o foco de outro campo por causa de uma barra digitada é
      // pior do que não ter atalho nenhum.
      const foco = document.activeElement;
      const escrevendo =
        foco instanceof HTMLInputElement ||
        foco instanceof HTMLTextAreaElement ||
        foco instanceof HTMLSelectElement ||
        (foco instanceof HTMLElement && foco.isContentEditable);
      if (escrevendo) return;

      // Sem o preventDefault a própria barra entra no campo que acabou
      // de ganhar foco.
      evento.preventDefault();
      entrada.current?.focus();
    }

    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  }, [atalho]);

  const id = `busca-${rotulo.replace(/\W+/g, "-").toLowerCase()}`;

  return (
    <div className={estilos.campo}>
      <label className={estilos.rotulo} htmlFor={id}>
        {rotulo}
      </label>

      <div className={estilos.caixa}>
        <span className={estilos.lupa}>
          <Lupa />
        </span>

        <input
          id={id}
          ref={entrada}
          type="search"
          className={estilos.entrada}
          value={valor}
          placeholder={exemplo}
          onChange={(evento) => onChange(evento.target.value)}
        />

        {valor ? (
          <button
            type="button"
            className={estilos.apagar}
            // "Apagar" e não "Limpar": o estado vazio da lista oferece um
            // botão "Limpar busca", e dois alvos com o mesmo nome na
            // mesma tela são ambíguos pra quem navega por voz ou por
            // lista de elementos.
            aria-label="Apagar busca"
            onClick={() => {
              onChange("");
              entrada.current?.focus();
            }}
          >
            ×
          </button>
        ) : atalho ? (
          // A dica só aparece com o campo vazio: escrita por cima do que
          // se digita, viraria sujeira.
          <kbd className={estilos.atalho} aria-hidden="true">
            {atalho}
          </kbd>
        ) : null}
      </div>
    </div>
  );
}
