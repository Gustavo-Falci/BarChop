"use client";

import { useState } from "react";
import type { ConferenciaDeHorario } from "@barchop/types";
import { Botao } from "../../componentes/Botao";
import { Campo } from "../../componentes/Campo";
import { useRequisicao } from "../../api/useRequisicao";
import { useApiDoPainel } from "../../painel/ProvedorDoPainel";
import estilos from "./OutroHorario.module.css";

// "09:35", "0935" e "935" viram "09:35"; o resto é null. Hora que não
// existe (25:00, 09:75) também.
export function lerHora(texto: string): string | null {
  const partes = /^(\d{1,2}):?(\d{2})$/.exec(texto.trim());
  if (!partes || Number(partes[1]) > 23 || Number(partes[2]) > 59) return null;
  return `${partes[1].padStart(2, "0")}:${partes[2]}`;
}

function somarMinutos(hora: string, minutos: number): string {
  const total = Number(hora.slice(0, 2)) * 60 + Number(hora.slice(3, 5)) + minutos;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

// O "Outro horário" do Novo agendamento (pedido do barbeiro, 08/11/2026):
// qualquer minuto, e não só os da lista. Confere na API a cada hora
// completa digitada — a mesma conferência do POST, então "Cabe" nunca
// leva a um 422. Sem timer: só pergunta quando o texto já é uma hora.
export function OutroHorario({
  pedido,
  duracao,
  aoUsar,
}: {
  pedido: Omit<ConferenciaDeHorario, "horaInicio">;
  duracao: number;
  aoUsar: (hora: string) => void;
}) {
  const api = useApiDoPainel();
  const [aberto, setAberto] = useState(false);
  const [texto, setTexto] = useState("");
  // O formato só cobra depois de sair do campo: no meio da digitação,
  // "09:3" ainda não é erro.
  const [saiu, setSaiu] = useState(false);
  const hora = lerHora(texto);

  const conferencia = useRequisicao(
    () =>
      aberto && hora
        ? api.barbeiro.conferirHorario({ ...pedido, horaInicio: hora })
        : Promise.resolve(null),
    [aberto, hora, pedido.barbeiroId, pedido.data, pedido.servicoIds.join(",")]
  );
  // A resposta de antes não vale pra hora de agora: os dados do
  // useRequisicao ficam até a próxima chegar.
  const resposta = hora && !conferencia.carregando ? conferencia.dados : null;

  let erro: string | undefined;
  if (texto && !hora && saiu) erro = "Digite a hora como 09:35.";
  else if (resposta && !resposta.cabe) erro = `Não cabe ${duracao} min: ${resposta.mensagem}.`;
  else if (hora && conferencia.erro) erro = "Não deu pra conferir agora. Tente de novo.";

  return (
    <div className={estilos.outro}>
      <button
        type="button"
        className={estilos.abrir}
        aria-expanded={aberto}
        onClick={() => setAberto((atual) => !atual)}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          focusable="false"
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </svg>
        Outro horário
      </button>

      {aberto ? (
        <div className={estilos.quadro}>
          <Campo
            rotulo="Qualquer minuto"
            inputMode="numeric"
            autoComplete="off"
            apoio="Digite a hora, como 09:35."
            erro={erro}
            valor={texto}
            onChange={setTexto}
            onBlur={() => setSaiu(true)}
          />
          {hora && resposta?.cabe ? (
            <div className={estilos.cabe}>
              <span className={estilos.faixa}>
                Cabe: {hora} – {somarMinutos(hora, duracao)}
              </span>
              <Botao type="button" variante="contorno" onClick={() => aoUsar(hora)}>
                Usar {hora}
              </Botao>
            </div>
          ) : null}
          <button
            type="button"
            className={estilos.voltar}
            onClick={() => {
              setAberto(false);
              setTexto("");
              setSaiu(false);
            }}
          >
            Voltar pra lista
          </button>
        </div>
      ) : null}
    </div>
  );
}
