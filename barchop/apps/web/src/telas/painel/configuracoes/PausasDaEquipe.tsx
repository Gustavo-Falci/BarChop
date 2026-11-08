"use client";

import Link from "next/link";
import { Aviso } from "../../../componentes/Aviso";
import { Secao } from "../../../componentes/Secao";
import { useRequisicao } from "../../../api/useRequisicao";
import { useApiDoPainel } from "../../../painel/ProvedorDoPainel";
import { resumoDaPausa } from "../pausa";
import estilos from "./Configuracoes.module.css";
import { Carregando } from "../../../componentes/Carregando";

// As pausas são de cada profissional, na jornada dele (painel v2, marco
// 3; decisão do dono, 2026-10-07; várias por dia desde 08/11). Horários
// não edita as pausas: mostra as de cada um e leva pra jornada, onde elas
// moram — um lugar só pra mudar.
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
      descricao="Cada pessoa tem as suas pausas, na jornada dela. Durante uma pausa, ninguém marca horário com quem está pausando."
    >
      {pausas.erro ? <Aviso>{pausas.erro.mensagem || "Não foi possível carregar as pausas agora."}</Aviso> : null}
      {!pausas.dados && !pausas.erro ? <Carregando compacto /> : null}
      {pausas.dados ? (
        <ul className={estilos.lista}>
          {pausas.dados.map(({ membro, resumo }) => (
            <li key={membro.id}>
              <Link
                href={`/painel/equipe/${membro.id}`}
                className={estilos.linha}
                aria-label={`Mudar as pausas de ${membro.nome}`}
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
