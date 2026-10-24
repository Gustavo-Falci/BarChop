"use client";

import type { CelulaDoMes } from "../painel/grade";
import { formatarDataLonga } from "../formato/datas";
import estilos from "./GradeDoMes.module.css";

const NOMES = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

// Quantas pílulas o dia mostra; passando disso, as três e um "+N" com o
// resto (agenda no celular, PR 6, no jeito do Google Agenda).
const CHIPS_VISIVEIS = 3;

export function GradeDoMes({
  celulas,
  hoje,
  tons,
  aoAbrirDia,
}: {
  celulas: CelulaDoMes[];
  hoje: string;
  // O tom de cada profissional (data-tom 0–5), o mesmo da grade de tempo.
  tons?: Record<string, number>;
  aoAbrirDia: (data: string) => void;
}) {
  return (
    <div className={estilos.quadro}>
      {NOMES.map((nome) => (
        <span key={nome} className={estilos.cabecalho}>
          {nome}
        </span>
      ))}

      {celulas.map((celula) => {
        const quantos = celula.agendamentos.length;
        const excedente = quantos - CHIPS_VISIVEIS;
        const mostrados = celula.agendamentos.slice(0, CHIPS_VISIVEIS);

        return (
          <button
            key={celula.data}
            type="button"
            className={estilos.celula}
            // O nome acessível é a data por extenso: "8" sozinho não
            // distingue as células de meses vizinhos com o mesmo número.
            // E quantos tem: as pílulas mostram três, o leitor ouve todos.
            aria-label={
              quantos > 0
                ? `${formatarDataLonga(celula.data)}, ${quantos} ${quantos === 1 ? "agendamento" : "agendamentos"}`
                : formatarDataLonga(celula.data)
            }
            aria-current={celula.data === hoje ? "date" : undefined}
            data-fora-do-mes={celula.doMes ? undefined : "true"}
            data-fechado={celula.fechado ? "true" : undefined}
            onClick={() => aoAbrirDia(celula.data)}
          >
            <span className={estilos.numero}>
              {Number(celula.data.slice(8))}
            </span>

            {mostrados.map((agendamento) => (
              <span
                key={agendamento.id}
                className={estilos.chip}
                data-tom={tons?.[agendamento.barbeiro.id]}
                data-status={agendamento.status}
              >
                {/* No celular saem a hora e o sobrenome: numa coluna de
                    50px, "Diego Lima" virava "Diego …". Continuam no DOM. */}
                <span className={estilos.horaDoChip}>{agendamento.horaInicio} </span>
                {primeiroNome(agendamento.cliente.nome)}
                <span className={estilos.sobrenome}>{restoDoNome(agendamento.cliente.nome)}</span>
              </span>
            ))}

            {excedente > 0 ? (
              <span className={estilos.excedente}>+{excedente}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

function primeiroNome(nome: string): string {
  return nome.split(" ")[0];
}

// Com o espaço na frente: junto do primeiro nome, o texto volta inteiro.
function restoDoNome(nome: string): string {
  const resto = nome.split(" ").slice(1).join(" ");
  return resto ? ` ${resto}` : "";
}
