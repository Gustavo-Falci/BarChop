"use client";

import type { CelulaDoMes } from "../painel/grade";
import { formatarDataLonga } from "../formato/datas";
import estilos from "./GradeDoMes.module.css";

const NOMES = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

// Quantos chips cabem antes de virar "+N". Quatro é o que a célula
// comporta sem rolar.
const CHIPS_VISIVEIS = 4;

export function GradeDoMes({
  celulas,
  hoje,
  aoAbrirDia,
}: {
  celulas: CelulaDoMes[];
  hoje: string;
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
        const excedente = celula.agendamentos.length - CHIPS_VISIVEIS;
        // Quando há excedente, um chip cede o lugar ao rótulo — daí
        // mostrar CHIPS_VISIVEIS - 1 e contar excedente + 1.
        const mostrados =
          excedente > 0
            ? celula.agendamentos.slice(0, CHIPS_VISIVEIS - 1)
            : celula.agendamentos;

        return (
          <button
            key={celula.data}
            type="button"
            className={estilos.celula}
            // O nome acessível é a data por extenso: "8" sozinho não
            // distingue as células de meses vizinhos com o mesmo número.
            aria-label={formatarDataLonga(celula.data)}
            aria-current={celula.data === hoje ? "date" : undefined}
            data-fora-do-mes={celula.doMes ? undefined : "true"}
            data-fechado={celula.fechado ? "true" : undefined}
            onClick={() => aoAbrirDia(celula.data)}
          >
            <span className={estilos.numero}>
              {Number(celula.data.slice(8))}
            </span>

            {mostrados.map((agendamento) => (
              <span key={agendamento.id} className={estilos.chip}>
                {agendamento.horaInicio} {agendamento.cliente.nome}
              </span>
            ))}

            {excedente > 0 ? (
              <span className={estilos.excedente}>+{excedente + 1}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
