"use client";

import type { AgendamentoComCliente } from "@barchop/types";
import { formatarDataLonga } from "../../../formato/datas";
import estilos from "./ListaDaAgenda.module.css";

// A vista "Lista" da agenda (agenda no celular, PR 2): os dias em
// sequência, cada um com os agendamentos em ordem de horário.
export function ListaDaAgenda({
  dias,
  agendamentos,
  aoAbrir,
}: {
  dias: string[];
  agendamentos: AgendamentoComCliente[];
  aoAbrir: (id: string) => void;
}) {
  const doDia = (dia: string) =>
    agendamentos
      .filter((a) => a.data === dia && a.status !== "cancelado")
      .sort((a, b) => a.horaInicio.localeCompare(b.horaInicio));

  return (
    <div className={estilos.lista} data-testid="lista-da-agenda">
      {dias.map((dia) => {
        const deste = doDia(dia);
        return (
          <section key={dia} className={estilos.dia} aria-label={formatarDataLonga(dia)}>
            <h2 className={estilos.data}>{formatarDataLonga(dia)}</h2>
            {deste.length === 0 ? (
              <p className={estilos.vazio}>Nenhum agendamento.</p>
            ) : (
              <ul className={estilos.cartoes}>
                {deste.map((agendamento) => (
                  <li key={agendamento.id}>
                    <button type="button" className={estilos.cartao} onClick={() => aoAbrir(agendamento.id)}>
                      <span className={estilos.quem}>
                        {agendamento.cliente.nome} · {agendamento.servicos.map((s) => s.nome).join(" + ")}
                      </span>
                      <span className={estilos.quando}>
                        {agendamento.horaInicio} – {agendamento.horaFim}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
