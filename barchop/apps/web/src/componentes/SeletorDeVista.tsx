"use client";

import { useId, type ReactNode } from "react";
import { Indicador } from "../movimento/Indicador";
import estilos from "./SeletorDeVista.module.css";

// "lista" e "3dias" vieram com a agenda no celular (PR 2), no jeito do
// Google Agenda; valem no desktop também.
export type Vista = "lista" | "dia" | "3dias" | "semana" | "mes";

export const VISTAS: { valor: Vista; rotulo: string }[] = [
  { valor: "lista", rotulo: "Lista" },
  { valor: "dia", rotulo: "Dia" },
  { valor: "3dias", rotulo: "3 dias" },
  { valor: "semana", rotulo: "Semana" },
  { valor: "mes", rotulo: "Mês" },
];

export function SeletorDeVista({
  vista,
  titulo,
  aoTrocarVista,
  aoAndar,
  aoVoltarAHoje,
  aoIrParaAgora,
  acao,
}: {
  vista: Vista;
  // O título do período mora aqui, e não num bloco acima: a barra gruda
  // no topo, e um título fora dela sumiria ao rolar — justo o mês, que é
  // o que diz onde se está.
  titulo: string;
  aoTrocarVista: (vista: Vista) => void;
  // Passos na unidade da vista corrente: um dia, uma semana ou um mês.
  aoAndar: (passos: number) => void;
  aoVoltarAHoje: () => void;
  // Só nas vistas com régua do agora (dia e semana): vai pra hoje e rola
  // a grade até a hora atual. Ausente, o botão não aparece.
  aoIrParaAgora?: () => void;
  // Uma ação da tela ao lado das vistas ("Bloquear").
  acao?: ReactNode;
}) {
  const grupo = useId();
  return (
    <div className={estilos.barra}>
      <div className={estilos.navegacao}>
        <button type="button" className={estilos.hoje} onClick={aoVoltarAHoje}>
          Hoje
        </button>
        {aoIrParaAgora ? (
          <button type="button" className={estilos.textual} onClick={aoIrParaAgora}>
            Agora
          </button>
        ) : null}
        <button
          type="button"
          className={estilos.passo}
          aria-label="Período anterior"
          onClick={() => aoAndar(-1)}
        >
          ‹
        </button>
        <button
          type="button"
          className={estilos.passo}
          aria-label="Próximo período"
          onClick={() => aoAndar(1)}
        >
          ›
        </button>
        <h1 className={estilos.titulo}>{titulo}</h1>
      </div>

      <div className={estilos.lado}>
        {acao}
        <div className={estilos.vistas} role="group" aria-label="Vista da agenda">
          {VISTAS.map((opcao) => (
            <button
              key={opcao.valor}
              type="button"
              className={estilos.vista}
              // aria-pressed e não aria-current: são botões que alternam um
              // modo, não links para outro lugar.
              aria-pressed={opcao.valor === vista}
              onClick={() => aoTrocarVista(opcao.valor)}
            >
              {opcao.valor === vista ? <Indicador grupo={grupo} className={estilos.indicador} /> : null}
              {opcao.rotulo}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
