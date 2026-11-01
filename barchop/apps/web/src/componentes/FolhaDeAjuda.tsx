"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { depoisDaSaida } from "../movimento/depoisDaSaida";
import estilos from "./FolhaDeEscolha.module.css";

// Uma ajuda que abre numa folha (redesenho das Configurações, PR 9:
// Pagamentos online). O mesmo desenho da FolhaDeEscolha: sobe de baixo no
// celular e fica no meio da tela no computador. Só mostra; fecha pelo X,
// pelo fundo ou pelo Esc. Quem abriu desmonta a folha no `aoFechar`.
export function FolhaDeAjuda({
  titulo,
  children,
  aoFechar,
}: {
  titulo: string;
  children: ReactNode;
  aoFechar: () => void;
}) {
  const janela = useRef<HTMLDialogElement>(null);
  const idDoTitulo = useId();

  useEffect(() => {
    janela.current?.showModal();
  }, []);

  function fechar() {
    janela.current?.close();
  }

  return (
    <dialog
      ref={janela}
      className={estilos.folha}
      aria-labelledby={idDoTitulo}
      onClose={(evento) => depoisDaSaida(evento.currentTarget, aoFechar)}
      onClick={(evento) => {
        // Só o fundo: o espaço de dentro fica no .corpo, e não na <dialog>.
        if (evento.target === evento.currentTarget) fechar();
      }}
    >
      <div className={estilos.corpo}>
        <span className={estilos.alca} aria-hidden="true" />
        <div className={estilos.topo}>
          <h2 id={idDoTitulo} className={estilos.titulo}>
            {titulo}
          </h2>
          <button type="button" className={estilos.fechar} aria-label="Fechar" onClick={fechar}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
