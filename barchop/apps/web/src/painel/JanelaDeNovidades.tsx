"use client";

import { useEffect, useId, useRef } from "react";
import { formatarDataLonga } from "../formato/datas";
import { NOVIDADES } from "./novidades";
import estilos from "./JanelaDeNovidades.module.css";
import { depoisDaSaida } from "../movimento/depoisDaSaida";

// A lista do que mudou no BarChop, aberta pelo menu "…". <dialog>
// nativo, como a janela de compartilhar do Hoje: foco preso e Esc vêm
// do navegador.
export function JanelaDeNovidades({ aoFechar }: { aoFechar: () => void }) {
  const janela = useRef<HTMLDialogElement>(null);
  const titulo = useId();

  useEffect(() => {
    janela.current?.showModal();
  }, []);

  return (
    <dialog ref={janela} className={estilos.janela} aria-labelledby={titulo} onClose={(evento) => depoisDaSaida(evento.currentTarget, aoFechar)}>
      <div className={estilos.topo}>
        <h2 id={titulo} className={estilos.titulo}>
          Novidades
        </h2>
        <button type="button" className={estilos.fechar} onClick={() => janela.current?.close()}>
          Fechar
        </button>
      </div>
      <ol className={estilos.lista}>
        {NOVIDADES.map((novidade) => (
          <li key={novidade.titulo} className={estilos.novidade}>
            <time dateTime={novidade.data} className={estilos.data}>
              {formatarDataLonga(novidade.data)}
            </time>
            <strong className={estilos.nome}>{novidade.titulo}</strong>
            <p className={estilos.texto}>{novidade.texto}</p>
          </li>
        ))}
      </ol>
    </dialog>
  );
}
