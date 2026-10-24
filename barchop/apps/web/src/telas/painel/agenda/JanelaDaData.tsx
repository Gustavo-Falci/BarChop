"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Calendario } from "../../../componentes/Calendario";
import { depoisDaSaida } from "../../../movimento/depoisDaSaida";
import estilos from "./JanelaDaData.module.css";

// O título ▾ da barra do celular (agenda no celular, PR 3): o calendário
// do mês numa folha que sobe de baixo. Escolher um dia vai pra ele na
// vista de agora, e a folha fecha.
export function JanelaDaData({
  data,
  agora,
  aoEscolher,
  aoFechar,
}: {
  data: string;
  agora: Date;
  aoEscolher: (data: string) => void;
  aoFechar: () => void;
}) {
  const janela = useRef<HTMLDialogElement>(null);
  const titulo = useId();
  const [mes, setMes] = useState(data.slice(0, 7));

  useEffect(() => {
    janela.current?.showModal();
  }, []);

  return (
    <dialog
      ref={janela}
      className={estilos.folha}
      aria-labelledby={titulo}
      onClose={(evento) => depoisDaSaida(evento.currentTarget, aoFechar)}
      onClick={(evento) => {
        if (evento.target === evento.currentTarget) janela.current?.close();
      }}
    >
      <h2 id={titulo} className={estilos.titulo}>
        Ir para a data
      </h2>
      <Calendario
        mes={mes}
        dias={{}}
        agora={agora}
        selecionada={data}
        livre
        aoTrocarMes={setMes}
        aoEscolher={(escolhida) => {
          aoEscolher(escolhida);
          janela.current?.close();
        }}
      />
    </dialog>
  );
}
