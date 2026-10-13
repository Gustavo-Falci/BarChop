"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { FiltroDeNotificacoes, Notificacao } from "@barchop/types";
import { MenuSuspenso } from "../componentes/MenuSuspenso";
import { SeletorEmPilulas } from "../componentes/SeletorEmPilulas";
import { IconeCheck, IconeSino } from "./icones";
import { rotuloDoSino, tempoDesde } from "./notificacoes";
import { useApiDoPainel } from "./ProvedorDoPainel";
import estilos from "./SinoDeNotificacoes.module.css";

const ABAS: { valor: FiltroDeNotificacoes; rotulo: string }[] = [
  { valor: "nao-lidas", rotulo: "Não lidas" },
  { valor: "todas", rotulo: "Todas" },
  { valor: "avisos", rotulo: "Avisos" },
];

// A conta do número no sino é relida a cada minuto e quando a aba volta
// ao foco: o barbeiro deixa o painel aberto no balcão o dia inteiro.
const INTERVALO_DA_CONTAGEM = 60_000;

// O sino da barra de topo (plano barra-do-topo, PR C): agendamentos que
// o cliente mexeu sozinho, pagamentos (Onda 2) e avisos do BarChop.
export function SinoDeNotificacoes({
  aberto,
  aoAlternar,
  aoFechar,
}: {
  aberto: boolean;
  aoAlternar: () => void;
  aoFechar: () => void;
}) {
  const api = useApiDoPainel();
  const router = useRouter();
  const [naoLidas, setNaoLidas] = useState(0);
  const [filtro, setFiltro] = useState<FiltroDeNotificacoes>("nao-lidas");
  const [lista, setLista] = useState<Notificacao[] | null>(null);
  const [falhou, setFalhou] = useState(false);

  const contar = useCallback(() => {
    // Falha na contagem não incomoda ninguém: o número fica como estava
    // e a próxima volta tenta de novo.
    api.barbeiro.contagemDeNotificacoes().then(setNaoLidas, () => {});
  }, [api]);

  useEffect(() => {
    contar();
    const relogio = window.setInterval(() => {
      if (!document.hidden) contar();
    }, INTERVALO_DA_CONTAGEM);
    window.addEventListener("focus", contar);
    return () => {
      window.clearInterval(relogio);
      window.removeEventListener("focus", contar);
    };
  }, [contar]);

  // A lista só é buscada com o sino aberto — e de novo a cada troca de
  // aba. `vivo` descarta a resposta de uma aba que já ficou pra trás.
  useEffect(() => {
    if (!aberto) return;
    let vivo = true;
    setLista(null);
    setFalhou(false);
    api.barbeiro.notificacoes(filtro).then(
      (notificacoes) => {
        if (vivo) setLista(notificacoes);
      },
      () => {
        if (vivo) setFalhou(true);
      }
    );
    return () => {
      vivo = false;
    };
  }, [api, aberto, filtro]);

  function marcarComoLida(notificacao: Notificacao) {
    if (notificacao.lida) return;
    setLista((atual) => atual?.map((n) => (n.id === notificacao.id ? { ...n, lida: true } : n)) ?? null);
    setNaoLidas((atual) => Math.max(0, atual - 1));
    api.barbeiro.marcarNotificacaoLida(notificacao.id).catch(contar);
  }

  function abrirNoPainel(notificacao: Notificacao) {
    marcarComoLida(notificacao);
    if (notificacao.link) {
      aoFechar();
      router.push(notificacao.link);
    }
  }

  async function lerTodas() {
    await api.barbeiro.lerTodasAsNotificacoes();
    setNaoLidas(0);
    setLista((atual) =>
      filtro === "nao-lidas" ? [] : (atual?.map((n) => ({ ...n, lida: true })) ?? null)
    );
  }

  function linha(notificacao: Notificacao) {
    const conteudo = (
      <>
        <span className={estilos.ponto} data-lida={notificacao.lida ? "" : undefined} aria-hidden="true" />
        <span className={estilos.miolo}>
          <strong className={estilos.titulo}>{notificacao.titulo}</strong>
          <span className={estilos.texto}>{notificacao.texto}</span>
          <span className={estilos.quando}>{tempoDesde(notificacao.criadaEm)}</span>
        </span>
      </>
    );
    // Link de fora (aviso com https) abre em outra aba, como link; o
    // resto é botão, que marca como lida e navega dentro do painel.
    if (notificacao.link?.startsWith("https://")) {
      return (
        <a
          className={estilos.linha}
          href={notificacao.link}
          target="_blank"
          rel="noreferrer"
          onClick={() => marcarComoLida(notificacao)}
        >
          {conteudo}
        </a>
      );
    }
    return (
      <button type="button" className={estilos.linha} onClick={() => abrirNoPainel(notificacao)}>
        {conteudo}
      </button>
    );
  }

  function vazio() {
    if (filtro === "nao-lidas") {
      return (
        <div className={estilos.vazio}>
          <span className={estilos.selo} aria-hidden="true">
            <IconeCheck />
          </span>
          <strong>Tudo em dia</strong>
          <p>Você leu tudo. As próximas notificações aparecem aqui assim que chegarem.</p>
          <button type="button" className={estilos.verLidas} onClick={() => setFiltro("todas")}>
            Ver lidas
          </button>
        </div>
      );
    }
    return (
      <div className={estilos.vazio}>
        <p>
          {filtro === "avisos"
            ? "Nenhum aviso do BarChop por aqui."
            : "Nenhuma notificação ainda. Quando um cliente marcar, cancelar ou remarcar pelo link, aparece aqui."}
        </p>
      </div>
    );
  }

  return (
    <MenuSuspenso
      rotulo="Notificações"
      rotuloDoGatilho={rotuloDoSino(naoLidas)}
      gatilho={
        <>
          <IconeSino />
          {naoLidas > 0 ? (
            <span className={estilos.contador} aria-hidden="true">
              {naoLidas > 9 ? "9+" : naoLidas}
            </span>
          ) : null}
        </>
      }
      aberto={aberto}
      aoAlternar={aoAlternar}
      aoFechar={aoFechar}
      classeDoPainel={estilos.painel}
    >
      <div className={estilos.topo}>
        <h2 className={estilos.cabecalho}>Notificações</h2>
        {naoLidas > 0 ? (
          <button type="button" className={estilos.lerTodas} onClick={lerTodas}>
            Marcar todas como lidas
          </button>
        ) : null}
      </div>
      <div className={estilos.abas}>
        <SeletorEmPilulas
          nome="filtro-das-notificacoes"
          legenda="Mostrar"
          opcoes={ABAS}
          valor={filtro}
          aoTrocar={setFiltro}
        />
      </div>
      <div className={estilos.lista} aria-live="polite" aria-busy={lista === null && !falhou}>
        {falhou ? (
          <p className={estilos.falha}>Não deu pra carregar agora. Tente abrir de novo.</p>
        ) : lista === null ? null : lista.length === 0 ? (
          vazio()
        ) : (
          <ul>
            {lista.map((notificacao) => (
              <li key={notificacao.id}>{linha(notificacao)}</li>
            ))}
          </ul>
        )}
      </div>
    </MenuSuspenso>
  );
}
