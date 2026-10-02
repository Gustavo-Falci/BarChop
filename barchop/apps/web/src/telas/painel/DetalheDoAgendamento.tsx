"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import type { EdicaoDoAgendamento, ErroDaApi } from "@barchop/api-client";
import { Aviso } from "../../componentes/Aviso";
import { Botao } from "../../componentes/Botao";
import { Campo } from "../../componentes/Campo";
import { Chip } from "../../componentes/Chip";
import { formatarPreco } from "../../componentes/ItemDeServico";
import { useRequisicao } from "../../api/useRequisicao";
import { formatarDataLonga } from "../../formato/datas";
import { rotuloDoStatus } from "../../formato/status";
import { useApiDoPainel } from "../../painel/ProvedorDoPainel";
import estilos from "./DetalheDoAgendamento.module.css";

// Qualquer transição é aceita pela API: o barbeiro é a autoridade sobre
// o que aconteceu no salão.
const STATUS = ["pendente", "confirmado", "concluido", "cancelado", "no_show"] as const;

export function DetalheDoAgendamento() {
  const { id } = useParams<{ id: string }>();
  const api = useApiDoPainel();
  const agendamento = useRequisicao(() => api.barbeiro.agendamento(id), [id]);

  const [observacoes, setObservacoes] = useState("");
  const [aviso, setAviso] = useState<string | undefined>();
  const [salvando, setSalvando] = useState(false);

  // Sincronizado durante a renderização, e não num `useEffect`: mesmo
  // mecanismo do fix em ConfiguracoesDaBarbearia (181514d). A trava
  // `!agendamento.dados` mais abaixo olha se os dados chegaram, não se
  // `observacoes` já foi sincronizado com eles — entre o commit que abre
  // o formulário e o efeito que preencheria o campo, digitar aí corre
  // contra o preenchimento. O `!==` contra o rastreador evita o loop e
  // também é o que faz `agendamento.recarregar()` — chamado depois de
  // toda ação em `aplicar()`, inclusive "Salvar observações" — sincronizar
  // de novo: a resposta fresca do GET não é `===` à anterior.
  const [agendamentoSincronizado, setAgendamentoSincronizado] = useState<typeof agendamento.dados>(
    null
  );
  if (agendamento.dados && agendamento.dados !== agendamentoSincronizado) {
    setAgendamentoSincronizado(agendamento.dados);
    setObservacoes(agendamento.dados.observacoes ?? "");
  }

  if (agendamento.erro) {
    return (
      <Aviso>
        {agendamento.erro.codigo === "nao_encontrado"
          ? "Agendamento não encontrado."
          : agendamento.erro.mensagem}
      </Aviso>
    );
  }
  if (!agendamento.dados) return <p>Carregando…</p>;

  const atual = agendamento.dados;

  async function aplicar(edicao: EdicaoDoAgendamento) {
    setAviso(undefined);
    setSalvando(true);
    try {
      await api.barbeiro.atualizarAgendamento(id, edicao);
      agendamento.recarregar();
    } catch (causa) {
      setAviso((causa as ErroDaApi).mensagem || "Não foi possível salvar agora.");
    }
    setSalvando(false);
  }

  const total = atual.servicos.reduce(
    (soma, s) => soma + Math.round(Number(s.precoNoMomento) * 100),
    0
  );

  return (
    <div className={estilos.pagina}>
      <h1>{atual.cliente.nome}</h1>
      <p>{atual.cliente.telefone}</p>
      <p>
        {formatarDataLonga(atual.data)} · {atual.horaInicio}–{atual.horaFim}
      </p>
      <p>
        {atual.servicos.map((s) => s.nome).join(" + ")} ·{" "}
        {/* precoNoMomento, não o preço de hoje: é o que foi combinado
            com aquele cliente naquele dia. */}
        <span className={estilos.preco}>{formatarPreco((total / 100).toFixed(2))}</span>
      </p>
      <Chip tom="neutro">agendado pelo {atual.origem}</Chip>

      <section>
        <h2>Status</h2>
        <div className={estilos.status}>
          {STATUS.map((status) => (
            <Botao
              key={status}
              variante={status === atual.status ? "primario" : "contorno"}
              onClick={() => aplicar({ status })}
              carregando={salvando}
            >
              {rotuloDoStatus(status)}
            </Botao>
          ))}
        </div>
      </section>

      <Campo rotulo="Observações" valor={observacoes} onChange={setObservacoes} />
      <Botao onClick={() => aplicar({ observacoes })} carregando={salvando}>
        Salvar observações
      </Botao>

      {/* A API não tem remarcar no escopo do barbeiro, e aceitar data e
          hora no PATCH pularia a checagem de disponibilidade inteira.
          Dizer isso é melhor do que um botão que voltaria erro. */}
      <p className={estilos.nota}>Para mudar o horário, cancele e crie outro agendamento.</p>

      {aviso ? <Aviso>{aviso}</Aviso> : null}
    </div>
  );
}
