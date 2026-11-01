"use client";

import { AnimatePresence, m } from "motion/react";
import { useId, useState } from "react";
import type { ErroDaApi } from "@barchop/api-client";
import { Aviso } from "../../componentes/Aviso";
import { Botao } from "../../componentes/Botao";
import { CabecalhoDaPagina } from "../../componentes/CabecalhoDaPagina";
import { Vazio } from "../../componentes/Vazio";
import { useRequisicao } from "../../api/useRequisicao";
import { formatarPeriodo, hojeIso, somarDias } from "../../formato/datas";
import { useApiDoPainel } from "../../painel/ProvedorDoPainel";
import { entradaDoItem, usePrimeiraCarga } from "../../movimento/lista";
import { IconeBloqueio } from "../../painel/icones";
import { useAgora } from "../../painel/useAgora";
import { JanelaDeBloqueio } from "./agenda/JanelaDeBloqueio";
import estilos from "./FolgasEBloqueios.module.css";

// Quantos dias à frente a lista mostra. Bloqueio mais longe que isso
// existe e vale; só não aparece aqui.
const DIAS_A_FRENTE = 90;

// Folga, almoço, médico: o que tira o membro da agenda. Dono e recepção
// bloqueiam qualquer um; o profissional, só a própria agenda — pra ele o
// campo de membro nem aparece. Quem barra é a API.
export function FolgasEBloqueios({ agora: agoraFixo }: { agora?: Date } = {}) {
  const api = useApiDoPainel();
  const agora = useAgora(agoraFixo);
  const idDoForm = useId();
  const hoje = hojeIso(agora);
  const ate = somarDias(hoje, DIAS_A_FRENTE);

  const equipe = useRequisicao(() => api.barbeiro.equipe(), []);
  const bloqueios = useRequisicao(() => api.barbeiro.bloqueios(hoje, ate), [hoje, ate]);

  // O formulário mora na mesma janela "Bloquear horário" da Agenda
  // (17/10): a tela abre na lista, que é o que se vem ver.
  const [bloqueando, setBloqueando] = useState(false);
  const [erro, setErro] = useState<string | undefined>();

  const nomeDe = (id: string) => equipe.dados?.find((m) => m.id === id)?.nome ?? "—";

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
  const primeiraCarga = usePrimeiraCarga(!carregando);

  return (
    <div className={estilos.pagina}>
      <CabecalhoDaPagina
        titulo="Folgas e bloqueios"
        apoio="Férias, almoço, consulta: o que tira alguém da agenda. O horário bloqueado some do agendamento online."
        acao={<Botao onClick={() => setBloqueando(true)}>+ Bloquear</Botao>}
      />

      {bloqueando ? (
        <JanelaDeBloqueio
          data={hoje}
          aoBloquear={() => bloqueios.recarregar()}
          aoFechar={() => setBloqueando(false)}
        />
      ) : null}

      {erro ? <Aviso>{erro}</Aviso> : null}

      <div className={estilos.corpo}>
        <section className={estilos.coluna} aria-labelledby={`${idDoForm}-lista`}>
          <h2 id={`${idDoForm}-lista`} className={estilos.rotuloDoGrupo}>
            Próximos {DIAS_A_FRENTE} dias
          </h2>
          {falha ? (
            <Aviso>{falha.mensagem || "Não foi possível carregar os bloqueios agora."}</Aviso>
          ) : carregando ? (
            <p className={estilos.vazio}>Carregando…</p>
          ) : bloqueios.dados!.length === 0 ? (
            // O estado vazio da casa, e não uma linha solta: o que é, pra
            // que serve e onde se faz (redesenho do celular, PR 5).
            <Vazio
              icone={<IconeBloqueio />}
              mensagem={`Nenhuma folga ou bloqueio nos próximos ${DIAS_A_FRENTE} dias.`}
              // Espaço que não quebra: o "+" e o "Bloquear" são o nome do botão.
              dica={"Pra tirar alguém da agenda, use o +\u00A0Bloquear, lá em cima."}
            />
          ) : (
            // Removeu, a linha sai e as de baixo sobem pro buraco
            // (`layout`); bloqueou, a nova entra (motion PR 4).
            <ul className={estilos.lista}>
              <AnimatePresence>
                {bloqueios.dados!.map((bloqueio, indice) => {
                  const periodo = formatarPeriodo(bloqueio.dataInicio, bloqueio.dataFim);
                  const horas =
                    bloqueio.horaInicio && bloqueio.horaFim
                      ? `${bloqueio.horaInicio} às ${bloqueio.horaFim}`
                      : "dia inteiro";
                  return (
                    <m.li
                      key={bloqueio.id}
                      layout
                      className={estilos.item}
                      {...entradaDoItem(indice, { primeiraCarga, novosEntram: true })}
                    >
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
                    </m.li>
                  );
                })}
              </AnimatePresence>
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
