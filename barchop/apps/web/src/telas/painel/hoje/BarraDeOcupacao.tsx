"use client";

import { useId } from "react";
import type { MinutosDoDia, OcupacaoDoDia } from "@barchop/types";
import { formatarHoras, percentual } from "../../../painel/metricas";
import estilos from "./BarraDeOcupacao.module.css";

// A ocupação do Hoje (painel v2, marco 4): quanto do dia de trabalho já
// está agendado, da casa e — com equipe — de cada um. A conta é da API
// (jornada, pausa, data especial e bloqueios); aqui só se desenha.
export function BarraDeOcupacao({
  ocupacao,
  soDoProfissional,
}: {
  ocupacao: OcupacaoDoDia;
  // O profissional recebe só a própria linha: a barra é dele, não da casa.
  soDoProfissional: boolean;
}) {
  const titulo = useId();
  const daCasa = percentual(ocupacao.casa);

  return (
    <section className={estilos.cartao} aria-labelledby={titulo}>
      <h2 id={titulo} className={estilos.titulo}>
        Ocupação
      </h2>

      {daCasa === null ? (
        <p className={estilos.fechado}>Fechado hoje.</p>
      ) : (
        <>
          <div className={estilos.resumo}>
            <span className={estilos.numero}>{daCasa}%</span>
            <span className={estilos.apoio}>
              {formatarHoras(ocupacao.casa.minutosAgendados)} de {formatarHoras(ocupacao.casa.minutosDeTrabalho)}{" "}
              agendados
            </span>
          </div>
          <Barra minutos={ocupacao.casa} rotulo={soDoProfissional ? "Sua ocupação" : "Ocupação da casa"} />
        </>
      )}

      {ocupacao.profissionais.length > 1 && daCasa !== null ? (
        <ul className={estilos.equipe}>
          {ocupacao.profissionais.map((profissional) => {
            const deste = percentual(profissional);
            return (
              <li key={profissional.id} className={estilos.linha}>
                <span className={estilos.nome}>{profissional.nome}</span>
                <span className={estilos.valor}>{deste === null ? "Folga" : `${deste}%`}</span>
                {deste === null ? null : <Barra minutos={profissional} rotulo={`Ocupação de ${profissional.nome}`} />}
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}

function Barra({ minutos, rotulo }: { minutos: MinutosDoDia; rotulo: string }) {
  const valor = percentual(minutos) ?? 0;
  // A barra para em 100; o número ao lado diz o resto.
  const preenchido = Math.min(valor, 100);
  return (
    <div
      role="meter"
      aria-label={rotulo}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={preenchido}
      aria-valuetext={`${valor}%`}
      className={estilos.barra}
    >
      <span className={estilos.preenchido} style={{ width: `${preenchido}%` }} />
    </div>
  );
}
