"use client";

import type { AgendamentoComCliente } from "@barchop/types";
import { formatarPreco } from "../../../componentes/ItemDeServico";
import { formatarHoras, proximos } from "../../../painel/metricas";
import { linkDoZap } from "../../../painel/whatsapp";
import estilos from "./ProximoEmDestaque.module.css";

function emMinutos(hora: string): number {
  const [h, m] = hora.split(":").map(Number);
  return h * 60 + m;
}

// O que o barbeiro procura entre um corte e outro (análise de 17/10): o
// próximo atendimento, primeiro, com o WhatsApp a um toque. Só o CSS o
// mostra, e só no celular — no desktop a lista ao lado já está à vista.
export function ProximoEmDestaque({
  doDia,
  agora,
  aoAbrir,
}: {
  doDia: AgendamentoComCliente[];
  agora: Date;
  aoAbrir: (id: string) => void;
}) {
  const proximo = proximos(doDia, agora)[0];
  if (!proximo) return null;

  const { agendamento, emCurso } = proximo;
  const falta = emMinutos(agendamento.horaInicio) - (agora.getHours() * 60 + agora.getMinutes());
  const quando = emCurso ? "Agora" : `Em ${formatarHoras(falta)}`;
  const total = agendamento.servicos.reduce((soma, s) => soma + Number(s.precoNoMomento), 0);

  return (
    <section className={estilos.destaque} aria-label="Próximo atendimento">
      <p className={estilos.etiqueta}>
        Próximo · <span className={estilos.quando}>{quando}</span>
      </p>
      <div className={estilos.linha}>
        <span className={estilos.hora}>{agendamento.horaInicio}</span>
        <span className={estilos.quem}>
          <strong className={estilos.cliente}>{agendamento.cliente.nome}</strong>
          <span className={estilos.servicos}>
            {agendamento.servicos.map((s) => s.nome).join(" + ")} · {formatarPreco(total.toFixed(2))}
          </span>
        </span>
      </div>
      <div className={estilos.acoes}>
        <a className={estilos.zap} href={linkDoZap(agendamento.cliente.telefone)} target="_blank" rel="noreferrer">
          WhatsApp
        </a>
        <button type="button" className={estilos.abrir} onClick={() => aoAbrir(agendamento.id)}>
          Abrir
        </button>
      </div>
    </section>
  );
}
