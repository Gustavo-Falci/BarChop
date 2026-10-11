"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { Aparencia } from "@barchop/formato";
import { Chip } from "../../../componentes/Chip";
import { SeletorEmPilulas } from "../../../componentes/SeletorEmPilulas";
import { MENSAGEM_DA_APARENCIA, MENSAGEM_DE_PRONTA, type ModoDaPrevia } from "../../../fluxo/previa";
import { linkDaBarbearia } from "../../../painel/compartilhar";
import { enderecoDaBarbearia } from "../../../tenant/endereco";
import estilos from "./PreviaDaPagina.module.css";

type Dispositivo = "celular" | "computador";
type Pagina = "inicio" | "agendar";

// O tamanho de verdade de cada aparelho: o iframe é desenhado nele (as
// media queries da página valem como no aparelho) e encolhido pra caber.
const TAMANHO: Record<Dispositivo, { largura: number; altura: number }> = {
  celular: { largura: 390, altura: 760 },
  computador: { largura: 1280, altura: 800 },
};

const CAMINHO: Record<Pagina, string> = { inicio: "", agendar: "/agendar" };

// A prévia ao vivo da Aparência (plano aparencia.plan.md, marco E): a
// página de verdade num iframe, com o rascunho mandado por postMessage a
// cada mudança. Só o visual muda lá dentro — o resto (serviços, horários)
// é o que o cliente vê hoje.
export function PreviaDaPagina({
  slug,
  aparencia,
  pendente,
}: {
  slug: string;
  aparencia: Aparencia;
  pendente: boolean;
}) {
  const [ampliada, setAmpliada] = useState(false);

  return (
    <section className={estilos.previa} aria-label="Prévia da sua página">
      <div className={estilos.topo}>
        <h2 className={estilos.titulo}>Prévia da sua página</h2>
        <Chip tom={pendente ? "atencao" : "ok"} tamanho="pequeno">
          {pendente ? "Rascunho" : "Publicada"}
        </Chip>
      </div>
      <Quadro slug={slug} aparencia={aparencia} titulo="Prévia da sua página" aoAmpliar={() => setAmpliada(true)} />
      {ampliada ? <JanelaAmpliada slug={slug} aparencia={aparencia} aoFechar={() => setAmpliada(false)} /> : null}
    </section>
  );
}

function JanelaAmpliada({
  slug,
  aparencia,
  aoFechar,
}: {
  slug: string;
  aparencia: Aparencia;
  aoFechar: () => void;
}) {
  const janela = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    janela.current?.showModal();
  }, []);

  return (
    <dialog
      ref={janela}
      className={estilos.janela}
      aria-label="Prévia da sua página"
      // O Esc do navegador fecha o <dialog>; o estado acompanha.
      onCancel={aoFechar}
    >
      <Quadro slug={slug} aparencia={aparencia} titulo="Prévia ampliada da sua página" ampliada aoFechar={aoFechar} />
    </dialog>
  );
}

function Quadro({
  slug,
  aparencia,
  titulo,
  ampliada = false,
  aoAmpliar,
  aoFechar,
}: {
  slug: string;
  aparencia: Aparencia;
  titulo: string;
  ampliada?: boolean;
  aoAmpliar?: () => void;
  aoFechar?: () => void;
}) {
  const id = useId();
  // Ampliada abre no computador — menos num celular, onde a página de
  // 1280px encolhida não se leria.
  const [dispositivo, setDispositivo] = useState<Dispositivo>(() =>
    ampliada && !(window.matchMedia?.("(max-width: 700px)").matches ?? false) ? "computador" : "celular"
  );
  const [pagina, setPagina] = useState<Pagina>("inicio");
  const [modo, setModo] = useState<ModoDaPrevia>(aparencia.modoPadrao === "escuro" ? "escuro" : "claro");
  // O dono fixou um modo (ou escolheu um tema que abre no escuro): a
  // prévia vai junto. Depois disso ele ainda troca à vontade.
  const [modoPadraoVisto, setModoPadraoVisto] = useState(aparencia.modoPadrao);
  if (aparencia.modoPadrao !== modoPadraoVisto) {
    setModoPadraoVisto(aparencia.modoPadrao);
    if (aparencia.modoPadrao !== "automatico") setModo(aparencia.modoPadrao);
  }
  // Trocar a chave recria o iframe: é o "Atualizar".
  const [versao, setVersao] = useState(0);
  const iframe = useRef<HTMLIFrameElement>(null);
  const caixa = useRef<HTMLDivElement>(null);
  const [largura, setLargura] = useState(0);
  const [alturaDaJanela, setAlturaDaJanela] = useState(0);

  const site = process.env.NEXT_PUBLIC_URL_DO_SITE;
  const endereco = `${enderecoDaBarbearia(slug, site)}${CAMINHO[pagina]}`;
  const abrir = `${linkDaBarbearia(slug, site, window.location.origin)}${CAMINHO[pagina]}`;
  // Em produção, <slug>.<site>: a mensagem só vai pra essa origem.
  const destino = new URL(endereco, window.location.href).origin;

  // O que mandar, sempre o mais novo — o aviso de "pronta" chega depois.
  const atual = useRef({ aparencia, modo });
  atual.current = { aparencia, modo };

  function enviar() {
    iframe.current?.contentWindow?.postMessage(
      { tipo: MENSAGEM_DA_APARENCIA, aparencia: atual.current.aparencia, modo: atual.current.modo },
      destino
    );
  }

  // A cada mudança do rascunho ou do modo.
  useEffect(enviar, [aparencia, modo, destino]);

  // A página avisa quando carregou (inclusive depois de navegar lá
  // dentro): manda de novo.
  useEffect(() => {
    function aoReceber(evento: MessageEvent) {
      if (evento.source !== iframe.current?.contentWindow || evento.origin !== destino) return;
      if ((evento.data as { tipo?: unknown } | null)?.tipo === MENSAGEM_DE_PRONTA) enviar();
    }
    window.addEventListener("message", aoReceber);
    return () => window.removeEventListener("message", aoReceber);
    // `enviar` lê de `atual`, que está sempre em dia.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destino]);

  // A largura disponível, pra encolher o aparelho até caber.
  useEffect(() => {
    const elemento = caixa.current;
    if (!elemento || typeof ResizeObserver === "undefined") return;
    const observador = new ResizeObserver(([entrada]) => setLargura(entrada!.contentRect.width));
    observador.observe(elemento);
    return () => observador.disconnect();
  }, []);

  // E a altura da janela: a coluna da prévia fica presa no alto, e um
  // aparelho mais alto que a tela teria o pé cortado.
  // Só quando a coluna está presa (a partir de 1200px) ou na ampliada:
  // embaixo dos blocos, num celular, a prévia rola com a página.
  useEffect(() => {
    const presa = window.matchMedia?.("(min-width: 1200px)");
    const medir = () => setAlturaDaJanela(ampliada || presa?.matches ? window.innerHeight : 0);
    medir();
    window.addEventListener("resize", medir);
    return () => window.removeEventListener("resize", medir);
  }, [ampliada]);

  const tamanho = TAMANHO[dispositivo];
  // O que sobra da tela pro aparelho, tirados os controles e o link.
  const alturaUtil = alturaDaJanela > 0 ? Math.max(320, alturaDaJanela - (ampliada ? 200 : 420)) : 0;
  const escala = Math.min(
    1,
    largura > 0 ? largura / tamanho.largura : 1,
    alturaUtil > 0 ? alturaUtil / tamanho.altura : 1
  );

  return (
    <div className={ampliada ? `${estilos.quadro} ${estilos.ampliado}` : estilos.quadro}>
      <div className={estilos.controles}>
        <SeletorEmPilulas<Dispositivo>
          nome={`${id}-dispositivo`}
          legenda="Aparelho"
          opcoes={[
            { valor: "celular", rotulo: "Celular" },
            { valor: "computador", rotulo: "Computador" },
          ]}
          valor={dispositivo}
          aoTrocar={setDispositivo}
        />
        <SeletorEmPilulas<Pagina>
          nome={`${id}-pagina`}
          legenda="Página"
          opcoes={[
            { valor: "inicio", rotulo: "Início" },
            { valor: "agendar", rotulo: "Agendar" },
          ]}
          valor={pagina}
          aoTrocar={setPagina}
        />
        <SeletorEmPilulas<ModoDaPrevia>
          nome={`${id}-modo`}
          legenda="Ver no modo"
          opcoes={[
            { valor: "claro", rotulo: "Claro" },
            { valor: "escuro", rotulo: "Escuro" },
          ]}
          valor={modo}
          aoTrocar={setModo}
        />
        <div className={estilos.acoes}>
          <button type="button" className={estilos.acao} onClick={() => setVersao(versao + 1)}>
            ↻ Atualizar
          </button>
          {aoAmpliar ? (
            <button type="button" className={estilos.acao} onClick={aoAmpliar} aria-label="Ampliar a prévia">
              ⤢ Ampliar
            </button>
          ) : null}
          {aoFechar ? (
            <button type="button" className={estilos.acao} onClick={aoFechar} aria-label="Fechar a prévia">
              ✕ Fechar
            </button>
          ) : null}
        </div>
      </div>

      <div ref={caixa} className={estilos.caixa}>
        <div
          className={estilos.aparelho}
          style={{ width: tamanho.largura * escala, height: tamanho.altura * escala }}
        >
          <iframe
            // O layout dos serviços é dado da página, não CSS: salvo no
            // ar, a prévia recarrega pra mostrar.
            key={`${versao}-${aparencia.layoutDosServicos}`}
            ref={iframe}
            title={titulo}
            src={endereco}
            data-dispositivo={dispositivo}
            className={estilos.iframe}
            style={{
              width: tamanho.largura,
              height: tamanho.altura,
              transform: `scale(${escala})`,
            }}
          />
        </div>
      </div>

      <a className={estilos.abrir} href={abrir} target="_blank" rel="noreferrer">
        Abrir a página <span aria-hidden="true">↗</span>
      </a>
    </div>
  );
}
