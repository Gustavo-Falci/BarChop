"use client";

import Link from "next/link";
import { Aviso } from "../../../componentes/Aviso";
import { Secao } from "../../../componentes/Secao";
import { useRequisicao } from "../../../api/useRequisicao";
import { useApiDoPainel } from "../../../painel/ProvedorDoPainel";
import { resumoDaPausa } from "../pausa";
import estilos from "./Configuracoes.module.css";

// A pausa do almoço é de cada profissional, na jornada dele (painel v2,
// marco 3; decisão do dono, 2026-10-07). Horários não edita a pausa: mostra
// a de cada um e leva pra jornada, onde ela mora — um lugar só pra mudar.
export function PausasDaEquipe() {
  const api = useApiDoPainel();
  const pausas = useRequisicao(async () => {
    // Só quem recebe cliente: quem não atende ou ainda não entrou não tem
    // agenda pra pausar.
    const equipe = (await api.barbeiro.equipe()).filter(
      (membro) => membro.ativo && membro.atende && !membro.convitePendente
    );
    return Promise.all(
      equipe.map(async (membro) => ({
        membro,
        resumo: resumoDaPausa(await api.barbeiro.jornada(membro.id)),
      }))
    );
  }, []);

  return (
    <Secao
      titulo="Pausas da equipe"
      descricao="Cada pessoa tem a sua pausa, na jornada dela. Durante a pausa, ninguém marca horário com quem está pausando."
    >
      {pausas.erro ? <Aviso>{pausas.erro.mensagem || "Não foi possível carregar as pausas agora."}</Aviso> : null}
      {!pausas.dados && !pausas.erro ? <p>Carregando…</p> : null}
      {pausas.dados ? (
        <ul className={estilos.lista}>
          {pausas.dados.map(({ membro, resumo }) => (
            <li key={membro.id}>
              <Link
                href={`/painel/equipe/${membro.id}`}
                className={estilos.linha}
                aria-label={`Mudar a pausa de ${membro.nome}`}
              >
                <strong className={estilos.nomeDaArea}>{membro.nome}</strong>
                <span className={estilos.valor}>{resumo}</span>
                <span className={estilos.seta} aria-hidden="true">
                  ›
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </Secao>
  );
}
