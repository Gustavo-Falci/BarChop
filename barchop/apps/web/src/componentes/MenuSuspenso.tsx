"use client";

import { useEffect, useId, useRef, type MouseEvent, type ReactNode } from "react";
import estilos from "./MenuSuspenso.module.css";

// Um botão que abre um painel logo abaixo dele (menu do usuário, menu
// "…" e o sino da barra de topo). Padrão de "disclosure" e não de
// role="menu": o painel tem rádios, links e botões misturados, e o
// role="menu" obrigaria setas no lugar do Tab pra tudo isso.
//
// Controlado por fora (`aberto`): a barra garante um aberto por vez.
// Esc e clique fora fecham; Esc devolve o foco ao gatilho, senão ele
// cairia no <body> e quem usa teclado recomeçaria a página do zero.
// Link ou botão marcado com `data-fecha` fecham ao clicar.
export function MenuSuspenso({
  rotulo,
  gatilho,
  rotuloDoGatilho,
  aberto,
  aoAlternar,
  aoFechar,
  aviso = false,
  classeDoGatilho,
  classeDoPainel,
  children,
}: {
  // O nome do painel aberto ("Sua conta", "Mais opções").
  rotulo: string;
  gatilho: ReactNode;
  // Pra gatilho só de ícone; com texto visível, o texto já nomeia.
  rotuloDoGatilho?: string;
  aberto: boolean;
  aoAlternar: () => void;
  aoFechar: () => void;
  // O ponto no canto do gatilho: tem coisa nova lá dentro.
  aviso?: boolean;
  classeDoGatilho?: string;
  // Pra quem precisa de outra largura (o sino é mais largo).
  classeDoPainel?: string;
  children: ReactNode;
}) {
  const raiz = useRef<HTMLDivElement>(null);
  const botao = useRef<HTMLButtonElement>(null);
  const idDoPainel = useId();

  useEffect(() => {
    if (!aberto) return;
    function foraDaqui(evento: PointerEvent) {
      if (!raiz.current?.contains(evento.target as Node)) aoFechar();
    }
    function tecla(evento: KeyboardEvent) {
      if (evento.key !== "Escape") return;
      aoFechar();
      botao.current?.focus();
    }
    document.addEventListener("pointerdown", foraDaqui);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("pointerdown", foraDaqui);
      document.removeEventListener("keydown", tecla);
    };
  }, [aberto, aoFechar]);

  // O clique no painel só fecha o menu: quem age é o link ou o botão
  // clicado, que já é focável e tem nome.
  function aoClicarNoPainel(evento: MouseEvent<HTMLDivElement>) {
    if ((evento.target as HTMLElement).closest("a, [data-fecha]")) aoFechar();
  }

  return (
    <div ref={raiz} className={estilos.raiz}>
      <button
        ref={botao}
        type="button"
        className={`${estilos.gatilho} ${classeDoGatilho ?? ""}`}
        aria-expanded={aberto}
        aria-controls={aberto ? idDoPainel : undefined}
        aria-label={rotuloDoGatilho}
        data-aviso={aviso ? "" : undefined}
        onClick={aoAlternar}
      >
        {gatilho}
      </button>
      {aberto ? (
        <div
          id={idDoPainel}
          role="group"
          aria-label={rotulo}
          className={`${estilos.painel} ${classeDoPainel ?? ""}`}
          onClick={aoClicarNoPainel}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}

// O miolo de uma linha do menu: ícone, texto e, à direita, um selo ou
// um valor. Vai dentro do <a> ou do <button> da linha, que é quem age.
export function ItemDoMenu({
  icone,
  children,
  fim,
}: {
  icone?: ReactNode;
  children: ReactNode;
  fim?: ReactNode;
}) {
  return (
    <>
      {icone}
      <span className={estilos.texto}>{children}</span>
      {fim ? <span className={estilos.fim}>{fim}</span> : null}
    </>
  );
}

// A classe da linha, pra quem monta o <a>/<button> dela, e a régua
// entre grupos de linhas.
export const LINHA_DO_MENU = estilos.linha;
export const REGUA_DO_MENU = estilos.regua;
