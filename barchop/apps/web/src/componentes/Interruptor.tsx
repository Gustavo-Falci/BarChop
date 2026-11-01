"use client";

import estilos from "./Interruptor.module.css";

// Liga e desliga na hora (redesenho das Configurações, 01/11): o dia
// aberto em Horários, as regras de sim/não. Botão com role="switch", o
// mesmo do "Mostrar os planos na página" de Planos. `rotuloOculto`: a
// linha já diz o que é (o dia, ao lado) e o rótulo fica só pra quem
// ouve. O alvo tem 44px mesmo com o trilho menor.
export function Interruptor({
  rotulo,
  ligado,
  aoTrocar,
  rotuloOculto = false,
  desligado = false,
  descritoPor,
}: {
  rotulo: string;
  ligado: boolean;
  aoTrocar: (ligado: boolean) => void;
  rotuloOculto?: boolean;
  desligado?: boolean;
  descritoPor?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={ligado}
      aria-label={rotuloOculto ? rotulo : undefined}
      aria-describedby={descritoPor}
      disabled={desligado}
      className={estilos.interruptor}
      onClick={() => aoTrocar(!ligado)}
    >
      {rotuloOculto ? null : <span className={estilos.rotulo}>{rotulo}</span>}
      <span className={estilos.trilho} aria-hidden="true">
        <span className={estilos.bolinha} />
      </span>
    </button>
  );
}
