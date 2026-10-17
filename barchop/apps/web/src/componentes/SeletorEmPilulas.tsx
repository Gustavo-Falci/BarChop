"use client";

import type { ReactNode } from "react";
import estilos from "./SeletorEmPilulas.module.css";

// Uma escolha de formulário entre poucas opções curtas (15 / 30 / 45 /
// 60 min), à vista, no lugar de um <select> que esconde as opções atrás
// de um clique. Rádios nativos com o rótulo desenhado em pílula: setas
// do teclado, um valor por grupo e o envio do formulário vêm de graça.
export function SeletorEmPilulas<V extends string>({
  nome,
  legenda,
  opcoes,
  valor,
  aoTrocar,
  efeito,
  legendaOculta = false,
}: {
  // O `name` dos rádios — único na tela, senão dois grupos viram um.
  nome: string;
  legenda: string;
  // `desligada`: à vista, mas não se escolhe (o Essencial pra equipe
  // maior que o limite dele). `selo`: um detalhe curto dentro da pílula
  // ("2 meses grátis").
  opcoes: { valor: V; rotulo: string; desligada?: boolean; selo?: ReactNode }[];
  valor: V;
  aoTrocar: (valor: V) => void;
  // A consequência da escolha numa frase ("Seus clientes vão ver: 9:00,
  // 9:30…"). `aria-live` porque ela muda com a escolha e quem usa leitor
  // de tela não está olhando pra ela quando muda.
  efeito?: ReactNode;
  // A legenda só pro leitor de tela, quando a linha já diz o que é (o dia
  // da semana na jornada, ao lado do controle).
  legendaOculta?: boolean;
}) {
  return (
    <fieldset className={estilos.seletor}>
      <legend className={legendaOculta ? estilos.legendaOculta : estilos.legenda}>{legenda}</legend>
      <div className={estilos.opcoes}>
        {opcoes.map((opcao) => (
          <label key={opcao.valor} className={estilos.opcao}>
            <input
              type="radio"
              name={nome}
              value={opcao.valor}
              checked={opcao.valor === valor}
              disabled={opcao.desligada}
              onChange={() => aoTrocar(opcao.valor)}
              className={estilos.radio}
            />
            <span className={estilos.pilula}>
              {opcao.rotulo}
              {opcao.selo ? <span className={estilos.selo}>{opcao.selo}</span> : null}
            </span>
          </label>
        ))}
      </div>
      {efeito ? (
        <p className={estilos.efeito} aria-live="polite">
          {efeito}
        </p>
      ) : null}
    </fieldset>
  );
}
