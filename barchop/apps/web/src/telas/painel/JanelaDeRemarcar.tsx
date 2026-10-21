"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { ErroDaApi } from "@barchop/api-client";
import type { AgendamentoComCliente } from "@barchop/types";
import { Aviso } from "../../componentes/Aviso";
import { Botao } from "../../componentes/Botao";
import { Calendario } from "../../componentes/Calendario";
import { ListaDeHorarios } from "../../componentes/ListaDeHorarios";
import { Vazio } from "../../componentes/Vazio";
import { useRequisicao } from "../../api/useRequisicao";
import { formatarDataLonga } from "../../formato/datas";
import { depoisDaSaida } from "../../movimento/depoisDaSaida";
import { useApiDoPainel } from "../../painel/ProvedorDoPainel";
import { usePainel } from "../../painel/SessaoDoPainel";
import { useAgora } from "../../painel/useAgora";
import estilos from "./JanelaDeRemarcar.module.css";

// "Mudar horário" no detalhe do agendamento (arrastar e reordenar, PR 6):
// o caminho do teclado e do celular pra remarcar — o arrasto na agenda
// (PR 7) é o atalho de quem está no desktop. Dia e horário livres pela
// mesma disponibilidade do Novo agendamento (com o token: grade livre do
// painel), com quem (pra quem pode trocar) e o aviso por e-mail ao
// cliente, marcado — decisão do dono em 21/10.
//
// A disponibilidade não sabe que o próprio agendamento vai sair: o
// horário dele e os que o sobrepõem não aparecem como livres. Mover
// 15 minutos pra frente fica pro arrasto, que manda direto pra API.
export function JanelaDeRemarcar({
  agendamento,
  aoRemarcar,
  aoFechar,
}: {
  agendamento: AgendamentoComCliente;
  // O agendamento NOVO: remarcar cria outro, com outro id.
  aoRemarcar: (novo: AgendamentoComCliente) => void;
  aoFechar: () => void;
}) {
  const api = useApiDoPainel();
  const { perfil, slug } = usePainel();
  const janela = useRef<HTMLDialogElement>(null);
  const titulo = useId();
  const idDoProfissional = useId();
  const agora = useAgora();
  const soOProprio = perfil.papel === "profissional";
  const servicoIds = agendamento.servicos.map((servico) => servico.servicoId);
  const temEmail = Boolean(agendamento.cliente.email);

  const [mes, setMes] = useState(agendamento.data.slice(0, 7));
  const [data, setData] = useState<string | null>(null);
  const [hora, setHora] = useState<string | null>(null);
  const [barbeiroId, setBarbeiroId] = useState(agendamento.barbeiro.id);
  const [avisar, setAvisar] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    janela.current?.showModal();
  }, []);

  // Quem atende, pra quem pode passar o agendamento a outro. O
  // profissional não troca (a API responde 403), então nem pergunta.
  const equipe = useRequisicao(
    () => (soOProprio ? Promise.resolve([]) : api.barbeiro.equipe()),
    [soOProprio]
  );
  const quemAtende = (equipe.dados ?? []).filter((membro) => membro.ativo && membro.atende);

  const dias = useRequisicao(
    () => api.publico.disponibilidadeDoMes(slug, { barbeiroId, mes, servicoIds }, { comToken: true }),
    [slug, barbeiroId, mes, servicoIds.join(",")]
  );
  const horarios = useRequisicao(
    () =>
      data
        ? api.publico.disponibilidadeDoDia(slug, { barbeiroId, data, servicoIds }, { comToken: true })
        : Promise.resolve([]),
    [slug, barbeiroId, data, servicoIds.join(",")]
  );

  async function remarcar() {
    if (!data || !hora) return;
    setEnviando(true);
    setErro(null);
    try {
      const novo = await api.barbeiro.remarcarAgendamento(agendamento.id, {
        data,
        horaInicio: hora,
        ...(barbeiroId !== agendamento.barbeiro.id ? { barbeiroId } : {}),
        avisarCliente: temEmail && avisar,
      });
      aoRemarcar(novo);
    } catch (causa) {
      setErro((causa as ErroDaApi).mensagem || "Não foi possível mudar o horário agora.");
      setEnviando(false);
    }
  }

  return (
    <dialog
      ref={janela}
      className={estilos.janela}
      aria-labelledby={titulo}
      onClose={(evento) => depoisDaSaida(evento.currentTarget, aoFechar)}
    >
      <h2 id={titulo} className={estilos.titulo}>
        Mudar horário
      </h2>
      <p className={estilos.apoio}>
        Hoje: {formatarDataLonga(agendamento.data)}, às {agendamento.horaInicio}.
      </p>

      {!soOProprio && quemAtende.length > 1 ? (
        <label className={estilos.campo} htmlFor={idDoProfissional}>
          Profissional
          <select
            id={idDoProfissional}
            value={barbeiroId}
            onChange={(evento) => {
              setBarbeiroId(evento.target.value);
              setHora(null);
            }}
          >
            {quemAtende.map((membro) => (
              <option key={membro.id} value={membro.id}>
                {membro.nome}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {/* Dia e horário lado a lado no desktop: a escolha é uma só. */}
      <div className={estilos.escolha}>
        <Calendario
          mes={mes}
          dias={dias.dados ?? {}}
          agora={agora}
          selecionada={data ?? undefined}
          aoEscolher={(escolhida) => {
            setData(escolhida);
            setHora(null);
          }}
          aoTrocarMes={setMes}
        />
        <div className={estilos.horarios}>
          {!data ? (
            <Vazio mensagem="Escolha o dia" dica="Os horários livres aparecem aqui." />
          ) : (horarios.dados ?? []).length === 0 && !horarios.carregando ? (
            <Vazio mensagem="Sem horário livre neste dia" dica="Tente outro dia no calendário." />
          ) : (
            <ListaDeHorarios horarios={horarios.dados ?? []} selecionada={hora ?? undefined} aoEscolher={setHora} />
          )}
        </div>
      </div>

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
          Voltar
        </Botao>
        <Botao type="button" onClick={() => void remarcar()} disabled={!data || !hora} carregando={enviando}>
          Mudar horário
        </Botao>
      </div>
    </dialog>
  );
}
