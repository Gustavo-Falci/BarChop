"use client";

import { useId, useState } from "react";
import Link from "next/link";
import type { EstadoDoOnboarding, PassoDoOnboarding } from "@barchop/types";
import { useRequisicao } from "../../api/useRequisicao";
import { useApiDoPainel } from "../../painel/ProvedorDoPainel";
import estilos from "./TrilhaDoOnboarding.module.css";

// O que cada passo pede, em frase de dono, e onde se resolve. A ordem é
// a da API (routers/onboarding.ts): é a ordem em que a barbearia fica
// pronta pra receber cliente.
const TEXTOS: Record<PassoDoOnboarding, { titulo: string; dica: string; destino?: string; acao?: string }> = {
  horarios: {
    titulo: "Horário de funcionamento",
    dica: "Os dias e horas em que a barbearia abre.",
    destino: "/painel/configuracoes/horarios",
    acao: "Definir horário",
  },
  servicos: {
    titulo: "Primeiro serviço",
    dica: "O que você faz, quanto tempo leva e quanto custa.",
    destino: "/painel/servicos/novo",
    acao: "Cadastrar serviço",
  },
  equipe: {
    titulo: "Equipe",
    dica: "Convide quem atende com você — cada um com a própria agenda.",
    destino: "/painel/equipe/novo",
  },
  link: {
    titulo: "Seu link",
    dica: "Mande pros clientes no WhatsApp e ponha na bio do Instagram.",
  },
  primeira_reserva: {
    titulo: "Primeira reserva pelo link",
    dica: "Quando um cliente marcar sozinho, este passo se marca.",
  },
};

// A trilha de primeiros passos do dono (Onda 1, F2), no topo do painel
// do dia. Some quando os cinco estão feitos — e some calada se não
// carregar: o painel do dia é o que importa, e a trilha é ajuda.
//
// Quem decide se ela aparece é quem a monta (só pro dono): esta tela
// pede o estado à API, e a rota é só do dono.
//
// O passo do link abre a janela de compartilhar do Hoje (painel v2,
// marco 4), que é de quem monta a trilha; `linkCompartilhado` avisa
// quando alguma ação dela marcou o passo.
export function TrilhaDoOnboarding({
  linkCompartilhado = false,
  aoCompartilharLink,
}: {
  linkCompartilhado?: boolean;
  aoCompartilharLink: () => void;
}) {
  const api = useApiDoPainel();
  const titulo = useId();
  const carregado = useRequisicao(() => api.barbeiro.onboarding(), []);
  // A resposta das ações (o PATCH devolve o estado novo) ganha da carga.
  const [atualizado, setAtualizado] = useState<EstadoDoOnboarding | null>(null);

  const recebido = atualizado ?? carregado.dados;
  if (!recebido) return null;
  const passos = linkCompartilhado
    ? recebido.passos.map((passo) => (passo.id === "link" ? { ...passo, feito: true } : passo))
    : recebido.passos;
  if (passos.every((passo) => passo.feito)) return null;

  const feitos = passos.filter((passo) => passo.feito).length;

  async function trabalhoSozinho() {
    setAtualizado(await api.barbeiro.marcarTrabalhoSozinho(true));
  }

  return (
    <section className={estilos.trilha} aria-labelledby={titulo}>
      <div className={estilos.topo}>
        <h2 id={titulo} className={estilos.titulo}>
          Primeiros passos
        </h2>
        <span className={estilos.progresso}>
          {feitos} de {passos.length}
        </span>
      </div>
      <ol className={estilos.passos}>
        {passos.map((passo) => (
          <Passo
            key={passo.id}
            id={passo.id}
            feito={passo.feito}
            acao={
              passo.feito ? null : passo.id === "equipe" ? (
                <>
                  <Link className={estilos.acao} href={TEXTOS.equipe.destino!}>
                    Convidar
                  </Link>
                  <button type="button" className={estilos.secundaria} onClick={() => void trabalhoSozinho()}>
                    Trabalho sozinho
                  </button>
                </>
              ) : passo.id === "link" ? (
                <button type="button" className={estilos.acao} onClick={aoCompartilharLink}>
                  Compartilhar link
                </button>
              ) : TEXTOS[passo.id].destino ? (
                <Link className={estilos.acao} href={TEXTOS[passo.id].destino!}>
                  {TEXTOS[passo.id].acao}
                </Link>
              ) : null
            }
          />
        ))}
      </ol>
    </section>
  );
}

function Passo({
  id,
  feito,
  acao,
}: {
  id: PassoDoOnboarding;
  feito: boolean;
  acao: React.ReactNode;
}) {
  const titulo = useId();
  const texto = TEXTOS[id];
  return (
    <li className={estilos.passo} data-feito={feito} aria-labelledby={titulo}>
      <span className={estilos.marca} aria-hidden="true">
        {feito ? "✓" : ""}
      </span>
      <div className={estilos.corpo}>
        <span id={titulo} className={estilos.nome}>
          {texto.titulo}
        </span>
        {feito ? <span className={estilos.feito}>Feito</span> : <span className={estilos.dica}>{texto.dica}</span>}
      </div>
      {acao ? <div className={estilos.acoes}>{acao}</div> : null}
    </li>
  );
}
