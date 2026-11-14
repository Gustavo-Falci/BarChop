"use client";

import { useEffect, useState } from "react";
import { statusDoTopo, type StatusDoTopo } from "./statusDoTopo";

// O site é estático (ADR-0006): o HTML sai do build, e a hora do build
// não diz nada. O HTML leva um exemplo neutro; depois de montar, a conta
// usa a hora de agora e refaz a cada minuto.
const NO_HTML: StatusDoTopo = { aberto: true, texto: "próximo horário livre 14:40" };
const UM_MINUTO = 60_000;

// O ponto e o texto do status. Fechada, o ponto fica vazado e parado.
export function StatusAoVivo({ classeDoPonto }: { classeDoPonto: string }) {
  const [status, setStatus] = useState(NO_HTML);

  useEffect(() => {
    const atualizar = () => setStatus(statusDoTopo(new Date()));
    atualizar();
    const relogio = window.setInterval(atualizar, UM_MINUTO);
    return () => window.clearInterval(relogio);
  }, []);

  return (
    <>
      <span className={classeDoPonto} data-fechado={status.aberto ? undefined : ""} aria-hidden="true" />
      Exemplo · {status.texto}
    </>
  );
}
