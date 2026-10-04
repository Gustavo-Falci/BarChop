"use client";

import { useId, useState } from "react";
import type { ErroDaApi } from "@barchop/api-client";
import { Aviso } from "../../componentes/Aviso";
import { Botao } from "../../componentes/Botao";
import { CabecalhoDaPagina } from "../../componentes/CabecalhoDaPagina";
import { Campo } from "../../componentes/Campo";
import { Secao } from "../../componentes/Secao";
import { useRequisicao } from "../../api/useRequisicao";
import { hojeIso, somarDias } from "../../formato/datas";
import { useApiDoPainel } from "../../painel/ProvedorDoPainel";
import { usePainel } from "../../painel/SessaoDoPainel";
import { useAgora } from "../../painel/useAgora";
import estilos from "./FolgasEBloqueios.module.css";

// Quantos dias à frente a lista mostra. Bloqueio mais longe que isso
// existe e vale; só não aparece aqui.
const DIAS_A_FRENTE = 90;
const MOTIVO_MAX = 120;

// "2037-01-05" → "05/01". O ano fica de fora: a lista cobre 90 dias.
function diaCurto(data: string): string {
  return `${data.slice(8, 10)}/${data.slice(5, 7)}`;
}

// Folga, almoço, médico: o que tira o membro da agenda. Dono e recepção
// bloqueiam qualquer um; o profissional, só a própria agenda — pra ele o
// campo de membro nem aparece. Quem barra é a API.
export function FolgasEBloqueios({ agora: agoraFixo }: { agora?: Date } = {}) {
  const api = useApiDoPainel();
  const { perfil } = usePainel();
  const agora = useAgora(agoraFixo);
  const idDoForm = useId();
  const hoje = hojeIso(agora);
  const ate = somarDias(hoje, DIAS_A_FRENTE);
  const soOProprio = perfil.papel === "profissional";

  const equipe = useRequisicao(() => api.barbeiro.equipe(), []);
  const bloqueios = useRequisicao(() => api.barbeiro.bloqueios(hoje, ate), [hoje, ate]);

  const [barbeiroId, setBarbeiroId] = useState(perfil.id);
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [diaInteiro, setDiaInteiro] = useState(true);
  const [horaInicio, setHoraInicio] = useState("");
  const [horaFim, setHoraFim] = useState("");
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | undefined>();
  const [salvando, setSalvando] = useState(false);

  const nomeDe = (id: string) => equipe.dados?.find((m) => m.id === id)?.nome ?? "—";
  // Só quem atende pode ser bloqueado de fato — a recepção sem agenda
  // não tem o que bloquear.
  const podemSerBloqueados = (equipe.dados ?? []).filter((m) => m.ativo && m.atende);

  async function bloquear() {
    setErro(undefined);
    if (!dataInicio || !dataFim) {
      setErro("Informe o primeiro e o último dia.");
      return;
    }
    // "YYYY-MM-DD" compara como texto na ordem do calendário.
    if (dataFim < dataInicio) {
      setErro("O período termina antes de começar.");
      return;
    }
    if (!diaInteiro) {
      if (!horaInicio || !horaFim) {
        setErro("Informe o começo e o fim do horário bloqueado.");
        return;
      }
      if (horaInicio >= horaFim) {
        setErro("O horário bloqueado termina antes de começar.");
        return;
      }
    }

    setSalvando(true);
    try {
      await api.barbeiro.criarBloqueio({
        barbeiroId: soOProprio ? perfil.id : barbeiroId,
        dataInicio,
        dataFim,
        horaInicio: diaInteiro ? null : horaInicio,
        horaFim: diaInteiro ? null : horaFim,
        motivo: motivo.trim() || null,
      });
      setDataInicio("");
      setDataFim("");
      setMotivo("");
      bloqueios.recarregar();
    } catch (causa) {
      setErro((causa as ErroDaApi).mensagem || "Não foi possível bloquear agora.");
    } finally {
      setSalvando(false);
    }
  }

  async function remover(id: string) {
    setErro(undefined);
    try {
      await api.barbeiro.apagarBloqueio(id);
      bloqueios.recarregar();
    } catch (causa) {
      setErro((causa as ErroDaApi).mensagem || "Não foi possível remover agora.");
    }
  }

  const carregando = !bloqueios.dados || !equipe.dados;
  const falha = bloqueios.erro ?? equipe.erro;

  return (
    <div className={estilos.pagina}>
      <CabecalhoDaPagina
        titulo="Folgas e bloqueios"
        apoio="Férias, almoço, consulta: o que tira alguém da agenda. O horário bloqueado some do agendamento online."
      />

      <Secao
        titulo="Novo bloqueio"
        acao={
          <Botao type="submit" form={idDoForm} carregando={salvando}>
            Bloquear
          </Botao>
        }
      >
        <form
          id={idDoForm}
          className={estilos.formulario}
          noValidate
          onSubmit={(evento) => {
            evento.preventDefault();
            void bloquear();
          }}
        >
          {/* `htmlFor`, e não o <label> embrulhando o <select>: embrulhado,
              o texto das opções entraria no nome do campo. */}
          {soOProprio ? null : (
            <div className={estilos.campoSelect}>
              <label htmlFor={`${idDoForm}-membro`}>Membro</label>
              <select
                id={`${idDoForm}-membro`}
                value={barbeiroId}
                onChange={(evento) => setBarbeiroId(evento.target.value)}
              >
                {podemSerBloqueados.map((membro) => (
                  <option key={membro.id} value={membro.id}>
                    {membro.nome}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className={estilos.linha}>
            <Campo rotulo="De" type="date" valor={dataInicio} onChange={setDataInicio} />
            <Campo rotulo="Até" type="date" valor={dataFim} onChange={setDataFim} />
          </div>
          <label className={estilos.opcao}>
            <input
              type="checkbox"
              checked={diaInteiro}
              onChange={(evento) => setDiaInteiro(evento.target.checked)}
            />
            Dia inteiro
          </label>
          {diaInteiro ? null : (
            <div className={estilos.linha}>
              <Campo rotulo="Das" type="time" valor={horaInicio} onChange={setHoraInicio} />
              <Campo rotulo="Às" type="time" valor={horaFim} onChange={setHoraFim} />
            </div>
          )}
          <Campo
            rotulo="Motivo (opcional)"
            maxLength={MOTIVO_MAX}
            placeholder="Férias, almoço, médico"
            valor={motivo}
            onChange={setMotivo}
          />
          {erro ? <Aviso>{erro}</Aviso> : null}
        </form>
      </Secao>

      <Secao titulo={`Próximos ${DIAS_A_FRENTE} dias`}>
        {falha ? (
          <Aviso>{falha.mensagem || "Não foi possível carregar os bloqueios agora."}</Aviso>
        ) : carregando ? (
          <p>Carregando…</p>
        ) : bloqueios.dados!.length === 0 ? (
          <p className={estilos.vazio}>Nenhum bloqueio nos próximos {DIAS_A_FRENTE} dias.</p>
        ) : (
          <ul className={estilos.lista}>
            {bloqueios.dados!.map((bloqueio) => {
              const periodo =
                bloqueio.dataInicio === bloqueio.dataFim
                  ? diaCurto(bloqueio.dataInicio)
                  : `${diaCurto(bloqueio.dataInicio)} a ${diaCurto(bloqueio.dataFim)}`;
              const horas =
                bloqueio.horaInicio && bloqueio.horaFim
                  ? `${bloqueio.horaInicio} às ${bloqueio.horaFim}`
                  : "dia inteiro";
              return (
                <li key={bloqueio.id} className={estilos.item}>
                  <div className={estilos.texto}>
                    <strong>{nomeDe(bloqueio.barbeiroId)}</strong>
                    <span>
                      {periodo} · <span>{horas}</span>
                    </span>
                    {bloqueio.motivo ? <span className={estilos.motivo}>{bloqueio.motivo}</span> : null}
                  </div>
                  <Botao
                    type="button"
                    variante="contorno"
                    onClick={() => void remover(bloqueio.id)}
                    aria-label={`Remover bloqueio de ${nomeDe(bloqueio.barbeiroId)} em ${periodo}`}
                  >
                    Remover
                  </Botao>
                </li>
              );
            })}
          </ul>
        )}
      </Secao>
    </div>
  );
}
