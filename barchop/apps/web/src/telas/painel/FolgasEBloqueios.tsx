"use client";

import { useId } from "react";
import type { ErroDaApi } from "@barchop/api-client";
import { Aviso } from "../../componentes/Aviso";
import { Botao } from "../../componentes/Botao";
import { CabecalhoDaPagina } from "../../componentes/CabecalhoDaPagina";
import { useRequisicao } from "../../api/useRequisicao";
import { formatarPeriodo, hojeIso, somarDias } from "../../formato/datas";
import { useApiDoPainel } from "../../painel/ProvedorDoPainel";
import { usePainel } from "../../painel/SessaoDoPainel";
import { useAgora } from "../../painel/useAgora";
import { FormularioDeBloqueio, useFormularioDeBloqueio } from "./FormularioDeBloqueio";
import estilos from "./FolgasEBloqueios.module.css";

// Quantos dias à frente a lista mostra. Bloqueio mais longe que isso
// existe e vale; só não aparece aqui.
const DIAS_A_FRENTE = 90;

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

  const formulario = useFormularioDeBloqueio({
    membroInicial: perfil.id,
    soOProprio,
    aoBloquear: () => bloqueios.recarregar(),
  });
  const setErro = formulario.setErro;

  const nomeDe = (id: string) => equipe.dados?.find((m) => m.id === id)?.nome ?? "—";
  // Só quem atende pode ser bloqueado de fato — a recepção sem agenda
  // não tem o que bloquear.
  const podemSerBloqueados = (equipe.dados ?? []).filter((m) => m.ativo && m.atende);

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

      {/* Sem as caixas "Novo bloqueio" e "Próximos 90 dias" (pedido do
          dono): o formulário à esquerda, com o Bloquear embaixo dele; a
          lista à direita. No celular, um embaixo do outro. */}
      <div className={estilos.corpo}>
        <section className={estilos.coluna} aria-labelledby={`${idDoForm}-titulo`}>
          <h2 id={`${idDoForm}-titulo`} className={estilos.rotuloDoGrupo}>
            Novo bloqueio
          </h2>
          <FormularioDeBloqueio
            id={idDoForm}
            formulario={formulario}
            membros={podemSerBloqueados}
            soOProprio={soOProprio}
          />
          <div className={estilos.acoes}>
            <Botao type="submit" form={idDoForm} carregando={formulario.salvando}>
              Bloquear
            </Botao>
          </div>
        </section>

        <section className={estilos.coluna} aria-labelledby={`${idDoForm}-lista`}>
          <h2 id={`${idDoForm}-lista`} className={estilos.rotuloDoGrupo}>
            Próximos {DIAS_A_FRENTE} dias
          </h2>
          {falha ? (
            <Aviso>{falha.mensagem || "Não foi possível carregar os bloqueios agora."}</Aviso>
          ) : carregando ? (
            <p className={estilos.vazio}>Carregando…</p>
          ) : bloqueios.dados!.length === 0 ? (
            <p className={estilos.vazio}>
              Ninguém fora da agenda nos próximos {DIAS_A_FRENTE} dias.
            </p>
          ) : (
            <ul className={estilos.lista}>
              {bloqueios.dados!.map((bloqueio) => {
                const periodo = formatarPeriodo(bloqueio.dataInicio, bloqueio.dataFim);
                const horas =
                  bloqueio.horaInicio && bloqueio.horaFim
                    ? `${bloqueio.horaInicio} às ${bloqueio.horaFim}`
                    : "dia inteiro";
                return (
                  <li key={bloqueio.id} className={estilos.item}>
                    <span className={estilos.quando}>
                      <strong>{periodo}</strong>
                      <span className={estilos.secundario}>{horas}</span>
                    </span>
                    <span className={estilos.quem}>
                      {nomeDe(bloqueio.barbeiroId)}
                      {bloqueio.motivo ? (
                        <span className={estilos.secundario}>{bloqueio.motivo}</span>
                      ) : null}
                    </span>
                    <Botao
                      type="button"
                      variante="fantasma"
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
        </section>
      </div>
    </div>
  );
}
