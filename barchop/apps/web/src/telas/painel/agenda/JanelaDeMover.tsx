"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { ErroDaApi } from "@barchop/api-client";
import type { AgendamentoComCliente } from "@barchop/types";
import { Aviso } from "../../../componentes/Aviso";
import { Botao } from "../../../componentes/Botao";
import { formatarDataComSemana } from "../../../formato/datas";
import { depoisDaSaida } from "../../../movimento/depoisDaSaida";
import { useApiDoPainel } from "../../../painel/ProvedorDoPainel";
import estilos from "./JanelaDeMover.module.css";

// A confirmação do arrasto na agenda (arrastar e reordenar, PR 7). Soltar
// não muda nada sozinho: no dia corrido, um arrasto sem querer moveria o
// cliente de alguém. A frase diz de onde pra onde, e o "avisar o
// cliente por e-mail" vem marcado (decisão do dono em 21/10).
export function JanelaDeMover({
  agendamento,
  destino,
  nomeDoProfissional,
  aoMover,
  aoFechar,
}: {
  agendamento: AgendamentoComCliente;
  destino: { data: string; horaInicio: string; horaFim: string; barbeiroId?: string };
  // Só quando o destino troca de profissional: "com Ana".
  nomeDoProfissional?: string;
  // O agendamento NOVO: remarcar cria outro, com outro id.
  aoMover: (novo: AgendamentoComCliente) => void;
  aoFechar: () => void;
}) {
  const api = useApiDoPainel();
  const janela = useRef<HTMLDialogElement>(null);
  const titulo = useId();
  const temEmail = Boolean(agendamento.cliente.email);
  const [avisar, setAvisar] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    janela.current?.showModal();
  }, []);

  async function mover() {
    setEnviando(true);
    setErro(null);
    try {
      const novo = await api.barbeiro.remarcarAgendamento(agendamento.id, {
        data: destino.data,
        horaInicio: destino.horaInicio,
        ...(destino.barbeiroId ? { barbeiroId: destino.barbeiroId } : {}),
        avisarCliente: temEmail && avisar,
      });
      aoMover(novo);
      janela.current?.close();
    } catch (causa) {
      setErro((causa as ErroDaApi).mensagem || "Não foi possível mover agora.");
      setEnviando(false);
    }
  }

  const servicos = agendamento.servicos.map((servico) => servico.nome).join(" + ");

  return (
    <dialog
      ref={janela}
      className={estilos.janela}
      aria-labelledby={titulo}
      onClose={(evento) => depoisDaSaida(evento.currentTarget, aoFechar)}
    >
      <h2 id={titulo} className={estilos.titulo}>
        Mover agendamento
      </h2>
      <p className={estilos.frase}>
        Mover {servicos} de <strong>{agendamento.cliente.nome}</strong> de{" "}
        {formatarDataComSemana(agendamento.data)} às {agendamento.horaInicio} para{" "}
        <strong>
          {formatarDataComSemana(destino.data)} às {destino.horaInicio}
        </strong>
        {nomeDoProfissional ? <> com {nomeDoProfissional}</> : null}?
      </p>

      {temEmail ? (
        <label className={estilos.aviso}>
          <input type="checkbox" checked={avisar} onChange={(evento) => setAvisar(evento.target.checked)} />
          Avisar o cliente por e-mail
        </label>
      ) : (
        <p className={estilos.apoio}>O cliente não tem e-mail: avise você pelo telefone.</p>
      )}

      {erro ? <Aviso>{erro}</Aviso> : null}

      <div className={estilos.rodape}>
        <Botao type="button" variante="contorno" onClick={() => janela.current?.close()}>
          Cancelar
        </Botao>
        <Botao type="button" onClick={() => void mover()} carregando={enviando}>
          Mover
        </Botao>
      </div>
    </dialog>
  );
}
