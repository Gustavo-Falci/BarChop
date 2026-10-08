"use client";

import Link from "next/link";
import { useId } from "react";
import type { AgendamentoComCliente } from "@barchop/types";
import { Chip } from "../../../componentes/Chip";
import { Vazio } from "../../../componentes/Vazio";
import { rotuloDoStatus } from "../../../formato/status";
import { proximos } from "../../../painel/metricas";
import estilos from "./ProximosAtendimentos.module.css";

// Quantos cabem sem a lista virar a agenda: o resto do dia está lá.
const LIMITE = 5;

// Os próximos atendimentos do Hoje (painel v2, marco 4): o que vem a
// partir de agora, com "Agora" no que está acontecendo. O que já passou
// mora na Agenda.
export function ProximosAtendimentos({
  doDia,
  agora,
  aoAbrir,
}: {
  doDia: AgendamentoComCliente[];
  agora: Date;
  aoAbrir: (id: string) => void;
}) {
  const titulo = useId();
  const lista = proximos(doDia, agora).slice(0, LIMITE);
  // Com mais de um profissional no dia, cada linha diz com quem; com um
  // só, o nome repetido em toda linha seria ruído.
  const comEquipe = new Set(doDia.map((agendamento) => agendamento.barbeiro.id)).size > 1;

  return (
    <section className={estilos.secao} aria-labelledby={titulo}>
      <h2 id={titulo} className={estilos.titulo}>
        Próximos atendimentos
      </h2>

      {doDia.length === 0 ? (
        <Vazio
          mensagem="Nenhum agendamento hoje."
          dica="Quando alguém marcar pelo seu link, o horário aparece aqui."
        />
      ) : lista.length === 0 ? (
        <Vazio mensagem="Nada mais pra hoje." dica="Os atendimentos de hoje continuam na agenda." />
      ) : (
        <ul className={estilos.lista}>
          {lista.map(({ agendamento, emCurso }) => (
            <li key={agendamento.id}>
              <button
                type="button"
                className={estilos.item}
                data-em-curso={emCurso}
                onClick={() => aoAbrir(agendamento.id)}
              >
                <span className={estilos.hora}>{agendamento.horaInicio}</span>
                <span className={estilos.quem}>
                  <span className={estilos.cliente}>{agendamento.cliente.nome}</span>
                  <span className={estilos.servicos}>
                    {" · "}
                    {agendamento.servicos.map((s) => s.nome).join(" + ")}
                    {comEquipe ? ` · com ${agendamento.barbeiro.nome}` : null}
                  </span>
                </span>
                {emCurso ? (
                  <Chip tom="acento" tamanho="pequeno">
                    Agora
                  </Chip>
                ) : (
                  <Chip tom={agendamento.status === "confirmado" ? "ok" : "neutro"} tamanho="pequeno">
                    {rotuloDoStatus(agendamento.status)}
                  </Chip>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      {doDia.length > 0 ? (
        <Link className={estilos.agenda} href="/painel/agenda">
          Ver o dia na agenda →
        </Link>
      ) : null}
    </section>
  );
}
