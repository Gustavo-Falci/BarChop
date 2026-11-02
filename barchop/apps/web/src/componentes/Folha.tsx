"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { depoisDaSaida } from "../movimento/depoisDaSaida";
import estilos from "./FolhaDeEscolha.module.css";

// A casca das folhas do painel: sobe de baixo no celular e fica no meio da
// tela no computador (o desenho da FolhaDeEscolha). Fecha pelo X, pelo
// fundo ou pelo Esc; quem abriu desmonta a folha no `aoFechar`.
//
// Quem precisa fechar por dentro (um formulário que salvou) recebe o
// `fechar` pelos filhos em função: fechar pela <dialog>, e não desmontando,
// é o que deixa a saída animar (ver depoisDaSaida).
export function Folha({
  titulo,
  apoio,
  larga = false,
  focoInicial,
  children,
  aoFechar,
}: {
  titulo: string;
  // Uma linha embaixo do título, de quê é a folha ("Gustavo · Corte").
  apoio?: string;
  // Um formulário de vários campos pede mais que as 28rem de uma escolha.
  larga?: boolean;
  // Onde o foco entra ao abrir (um seletor dentro da folha), como o
  // rádio marcado da FolhaDeEscolha. Sem ele, o navegador escolhe o
  // primeiro controle, que é o X. O efeito do filho roda antes do
  // showModal daqui: por isso o foco é feito aqui, depois de abrir.
  focoInicial?: string;
  children: ReactNode | ((fechar: () => void) => ReactNode);
  aoFechar: () => void;
}) {
  const janela = useRef<HTMLDialogElement>(null);
  const idDoTitulo = useId();

  useEffect(() => {
    // O showModal leva o foco pro X, o primeiro controle: no celular,
    // focar um campo de texto abriria o teclado por cima da folha.
    janela.current?.showModal();
    if (focoInicial) janela.current?.querySelector<HTMLElement>(focoInicial)?.focus();
    // Só ao abrir: o seletor não muda com a folha aberta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function fechar() {
    janela.current?.close();
  }

  return (
    <dialog
      ref={janela}
      className={larga ? `${estilos.folha} ${estilos.larga}` : estilos.folha}
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
        {apoio ? <p className={estilos.apoio}>{apoio}</p> : null}
        {typeof children === "function" ? children(fechar) : children}
      </div>
    </dialog>
  );
}
