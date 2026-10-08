"use client";

import { useId } from "react";
import type { ErroDaApi } from "@barchop/api-client";
import { Aviso } from "../../componentes/Aviso";
import { Botao } from "../../componentes/Botao";
import { CabecalhoDaPagina } from "../../componentes/CabecalhoDaPagina";
import { LadoALado } from "../../componentes/Colunas";
import { Secao } from "../../componentes/Secao";
import { useRequisicao } from "../../api/useRequisicao";
import { hojeIso, somarDias } from "../../formato/datas";
import { useApiDoPainel } from "../../painel/ProvedorDoPainel";
import { usePainel } from "../../painel/SessaoDoPainel";
import { useAgora } from "../../painel/useAgora";
import { FormularioDeBloqueio, useFormularioDeBloqueio } from "./FormularioDeBloqueio";
import estilos from "./FolgasEBloqueios.module.css";

// Quantos dias à frente a lista mostra. Bloqueio mais longe que isso
// existe e vale; só não aparece aqui.
const DIAS_A_FRENTE = 90;

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

      {/* Lado a lado: o formulário à esquerda, a lista à direita (as
          telas usam a largura — pedido do dono). */}
      <LadoALado>
        <Secao
          titulo="Novo bloqueio"
          acao={
            <Botao type="submit" form={idDoForm} carregando={formulario.salvando}>
              Bloquear
            </Botao>
          }
        >
          <FormularioDeBloqueio
            id={idDoForm}
            formulario={formulario}
            membros={podemSerBloqueados}
            soOProprio={soOProprio}
          />
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
      </LadoALado>
    </div>
  );
}
