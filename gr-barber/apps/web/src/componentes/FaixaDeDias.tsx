"use client";

import { formatarDataComSemana } from "../formato/datas";
import estilos from "./FaixaDeDias.module.css";

// Na ordem do getUTCDay. Mesma abreviação do cabeçalho do Calendario.
const NOMES = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

// Os próximos dias numa fila que rola de lado. Quem agenda corte quase
// sempre quer "esta semana ou a próxima", e a grade do mês inteiro
// obrigava a achar o dia no meio de trinta — no fim do mês, com três
// dias clicáveis e o resto no mês seguinte, atrás de uma seta.
export function FaixaDeDias({
  dias,
  disponiveis,
  selecionada,
  aoEscolher,
}: {
  dias: string[];
  disponiveis: Record<string, boolean>;
  selecionada?: string;
  aoEscolher: (data: string) => void;
}) {
  return (
    <div className={estilos.faixa} role="group" aria-label="Próximos dias">
      {dias.map((data) => (
        <button
          key={data}
          type="button"
          className={estilos.dia}
          // Com o dia da semana, ao contrário do Calendario: aqui não há
          // cabeçalho de coluna dizendo que "29" é terça.
          aria-label={formatarDataComSemana(data)}
          aria-current={data === selecionada ? "date" : undefined}
          disabled={!disponiveis[data]}
          onClick={() => aoEscolher(data)}
        >
          <span className={estilos.semana} aria-hidden="true">
            {NOMES[new Date(`${data}T00:00:00Z`).getUTCDay()]}
          </span>
          <span className={estilos.numero} aria-hidden="true">
            {Number(data.slice(-2))}
          </span>
        </button>
      ))}
    </div>
  );
}
