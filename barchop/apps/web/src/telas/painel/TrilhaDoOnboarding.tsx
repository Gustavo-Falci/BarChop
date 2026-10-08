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

// Recolher a trilha é preferência de quem olha, por aparelho: vive no
// localStorage, como a barra lateral. Sem storage (aba anônima, bloqueio)
// ela só nasce aberta.
const CHAVE_RECOLHIDA = "painel.trilha";

function lerRecolhida(): boolean {
  try {
    return typeof window !== "undefined" && window.localStorage.getItem(CHAVE_RECOLHIDA) === "recolhida";
  } catch {
    return false;
  }
}

function gravarRecolhida(recolhida: boolean): void {
  try {
    if (recolhida) window.localStorage.setItem(CHAVE_RECOLHIDA, "recolhida");
    else window.localStorage.removeItem(CHAVE_RECOLHIDA);
  } catch {
    // Sem storage, recolher vale só até recarregar.
  }
}

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
  const [recolhida, setRecolhida] = useState(lerRecolhida);
  const lista = useId();

  const recebido = atualizado ?? carregado.dados;
  if (!recebido) return null;
  const passos = linkCompartilhado
    ? recebido.passos.map((passo) => (passo.id === "link" ? { ...passo, feito: true } : passo))
    : recebido.passos;
  if (passos.every((passo) => passo.feito)) return null;

  const feitos = passos.filter((passo) => passo.feito).length;
  // O próximo passo é o primeiro que falta, na ordem da API. Só ele leva
  // o botão amarelo: com uma ação de destaque por cartão, o dono não sabe
  // por onde começar.
  const proximo = passos.find((passo) => !passo.feito)?.id;
  const linkFeito = passos.some((passo) => passo.id === "link" && passo.feito);

  function alternar() {
    setRecolhida((antes) => {
      gravarRecolhida(!antes);
      return !antes;
    });
  }

  async function trabalhoSozinho() {
    setAtualizado(await api.barbeiro.marcarTrabalhoSozinho(true));
  }

  return (
    <section className={estilos.trilha} aria-labelledby={titulo}>
      <div className={estilos.topo}>
        <div className={estilos.cabeca}>
          <h2 id={titulo} className={estilos.titulo}>
            Primeiros passos
          </h2>
          <span className={estilos.progresso}>
            {feitos} de {passos.length} feitos
          </span>
        </div>
        <button
          type="button"
          className={estilos.recolher}
          aria-expanded={!recolhida}
          aria-controls={lista}
          onClick={alternar}
        >
          {recolhida ? "Mostrar" : "Recolher"}
        </button>
      </div>
      <div
        className={estilos.barra}
        role="progressbar"
        aria-label="Progresso dos primeiros passos"
        aria-valuemin={0}
        aria-valuemax={passos.length}
        aria-valuenow={feitos}
      >
        <span className={estilos.preenchido} style={{ width: `${(feitos / passos.length) * 100}%` }} />
      </div>
      {recolhida && proximo ? (
        <p className={estilos.resumo}>
          Próximo: <strong>{TEXTOS[proximo].titulo}</strong>
        </p>
      ) : null}
      <ol id={lista} className={estilos.passos} hidden={recolhida}>
        {passos.map((passo, indice) => (
          <Passo
            key={passo.id}
            id={passo.id}
            numero={indice + 1}
            feito={passo.feito}
            atual={passo.id === proximo}
            aguardando={passo.id === "primeira_reserva" && linkFeito}
            acao={
              passo.feito ? null : passo.id === "equipe" ? (
                <>
                  <Link className={classeDaAcao(passo.id === proximo)} href={TEXTOS.equipe.destino!}>
                    Convidar
                  </Link>
                  <button type="button" className={estilos.secundaria} onClick={() => void trabalhoSozinho()}>
                    Trabalho sozinho
                  </button>
                </>
              ) : passo.id === "link" ? (
                <button type="button" className={classeDaAcao(passo.id === proximo)} onClick={aoCompartilharLink}>
                  Compartilhar link
                </button>
              ) : TEXTOS[passo.id].destino ? (
                <Link className={classeDaAcao(passo.id === proximo)} href={TEXTOS[passo.id].destino!}>
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

// O botão amarelo é do passo atual; os outros pendentes ficam com o
// contorno, ainda clicáveis — a ordem é sugestão, não trava.
function classeDaAcao(atual: boolean) {
  return atual ? estilos.acao : estilos.secundaria;
}

function Passo({
  id,
  numero,
  feito,
  atual,
  aguardando,
  acao,
}: {
  id: PassoDoOnboarding;
  numero: number;
  feito: boolean;
  atual: boolean;
  aguardando: boolean;
  acao: React.ReactNode;
}) {
  const titulo = useId();
  const texto = TEXTOS[id];
  return (
    <li className={estilos.passo} data-feito={feito} data-atual={atual} aria-labelledby={titulo}>
      <div className={estilos.linha}>
        <span className={estilos.marca} aria-hidden="true">
          {feito ? "✓" : numero}
        </span>
        <div className={estilos.corpo}>
          {atual ? <span className={estilos.etiqueta}>Próximo passo</span> : null}
          <span id={titulo} className={estilos.nome}>
            {texto.titulo}
          </span>
          {feito ? <span className={estilos.feito}>Feito</span> : <span className={estilos.dica}>{texto.dica}</span>}
        </div>
      </div>
      {acao ? <div className={estilos.acoes}>{acao}</div> : null}
      {!feito && aguardando ? (
        <div className={estilos.acoes}>
          <span className={estilos.aguardando}>
            <span className={estilos.pulso} aria-hidden="true" />
            Esperando o primeiro cliente
          </span>
        </div>
      ) : null}
    </li>
  );
}
