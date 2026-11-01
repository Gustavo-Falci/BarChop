"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import type { Aparencia } from "@barchop/formato";
import { Chip } from "../../../componentes/Chip";
import { MENSAGEM_DA_APARENCIA, MENSAGEM_DE_PRONTA, type ModoDaPrevia } from "../../../fluxo/previa";
import { depoisDaSaida } from "../../../movimento/depoisDaSaida";
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
  recolhida = false,
}: {
  slug: string;
  aparencia: Aparencia;
  pendente: boolean;
  // Recolhida (redesenho das Configurações, PR 6): só o botão, que abre a
  // prévia ampliada. No celular e no tablet ela ficava embaixo de tudo,
  // com ~900px, e o iframe carregava a página inteira sem ninguém ver.
  recolhida?: boolean;
}) {
  const [ampliada, setAmpliada] = useState(false);

  if (recolhida) {
    return (
      <>
        <button
          type="button"
          className={estilos.verPrevia}
          aria-haspopup="dialog"
          onClick={() => setAmpliada(true)}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="7" y="2" width="10" height="20" rx="2" />
            <path d="M11 18h2" />
          </svg>
          Ver a prévia da página
        </button>
        {ampliada ? <JanelaAmpliada slug={slug} aparencia={aparencia} aoFechar={() => setAmpliada(false)} /> : null}
      </>
    );
  }

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
    // O showModal leva o foco pro primeiro rádio, que parece escolhido
    // sem estar; a janela abre com o foco na saída. (O `autoFocus` do
    // React não serve: ele foca antes do showModal, que tira o foco.)
    janela.current?.querySelector<HTMLElement>("[data-foco-inicial]")?.focus();
  }, []);

  return (
    <dialog
      ref={janela}
      className={estilos.janela}
      aria-label="Prévia da sua página"
      // O Esc do navegador fecha o <dialog> e o botão chama close(): os
      // dois passam pelo `close`, e o estado acompanha depois da saída.
      onClose={(evento) => depoisDaSaida(evento.currentTarget, aoFechar)}
    >
      <Quadro
        slug={slug}
        aparencia={aparencia}
        titulo="Prévia ampliada da sua página"
        ampliada
        aoFechar={() => janela.current?.close()}
      />
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
  // O que sobra da tela pro aparelho, tirados o título, os controles, a
  // barra de endereço e o rodapé (uns 225px) e as folgas da coluna presa.
  const alturaUtil = alturaDaJanela > 0 ? Math.max(320, alturaDaJanela - (ampliada ? 200 : 300)) : 0;
  const escala = Math.min(
    1,
    largura > 0 ? largura / tamanho.largura : 1,
    alturaUtil > 0 ? alturaUtil / tamanho.altura : 1
  );

  // Na barra de endereço, como no navegador: sem o protocolo.
  const enderecoVisivel = abrir.replace(/^https?:\/\//, "");

  return (
    <div className={ampliada ? `${estilos.quadro} ${estilos.ampliado}` : estilos.quadro}>
      <div className={estilos.barra}>
        <fieldset className={estilos.segmentos}>
          <legend className={estilos.somenteLeitor}>Aparelho</legend>
          {(
            [
              { valor: "celular", rotulo: "Celular", icone: <IconeCelular /> },
              { valor: "computador", rotulo: "Computador", icone: <IconeComputador /> },
            ] as const
          ).map((opcao) => (
            <label key={opcao.valor} className={estilos.segmento}>
              <input
                type="radio"
                name={`${id}-dispositivo`}
                value={opcao.valor}
                checked={dispositivo === opcao.valor}
                onChange={() => setDispositivo(opcao.valor)}
                className={estilos.radio}
              />
              <span className={estilos.rotuloDoSegmento}>
                {opcao.icone}
                {opcao.rotulo}
              </span>
            </label>
          ))}
        </fieldset>
        <div className={estilos.acoes}>
          <button
            type="button"
            className={estilos.acao}
            onClick={() => setVersao(versao + 1)}
            aria-label="Atualizar a prévia"
            title="Atualizar"
          >
            <IconeAtualizar />
          </button>
          {aoAmpliar ? (
            <button type="button" className={estilos.acao} onClick={aoAmpliar} aria-label="Ampliar a prévia" title="Ampliar">
              <IconeAmpliar />
            </button>
          ) : null}
          {aoFechar ? (
            <button
              type="button"
              className={estilos.acao}
              onClick={aoFechar}
              aria-label="Fechar a prévia"
              title="Fechar"
              data-foco-inicial
            >
              <IconeFechar />
            </button>
          ) : null}
        </div>
      </div>

      <fieldset className={estilos.paginas}>
        <legend className={estilos.somenteLeitor}>Página</legend>
        {(
          [
            { valor: "inicio", rotulo: "Início" },
            { valor: "agendar", rotulo: "Agendar" },
          ] as const
        ).map((opcao) => (
          <label key={opcao.valor} className={estilos.pagina}>
            <input
              type="radio"
              name={`${id}-pagina`}
              value={opcao.valor}
              checked={pagina === opcao.valor}
              onChange={() => setPagina(opcao.valor)}
              className={estilos.radio}
            />
            <span className={estilos.rotuloDaPagina}>{opcao.rotulo}</span>
          </label>
        ))}
      </fieldset>

      <div ref={caixa} className={estilos.caixa}>
        <div className={estilos.aparelho} style={{ width: tamanho.largura * escala }}>
          <p className={estilos.endereco}>{enderecoVisivel}</p>
          <div style={{ width: tamanho.largura * escala, height: tamanho.altura * escala, overflow: "hidden" }}>
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
      </div>

      <div className={estilos.rodape}>
        <button
          type="button"
          role="switch"
          aria-checked={modo === "escuro"}
          className={estilos.interruptor}
          onClick={() => setModo(modo === "escuro" ? "claro" : "escuro")}
        >
          Modo escuro
          <span className={estilos.trilho} aria-hidden="true">
            <span className={estilos.botaozinho} />
          </span>
        </button>
        <a className={estilos.abrir} href={abrir} target="_blank" rel="noreferrer">
          Abrir a página <IconeLinkExterno />
        </a>
      </div>
    </div>
  );
}

// Os ícones da barra, no traço dos da referência (24×24, contorno).
function Icone({ children }: { children: ReactNode }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

function IconeCelular() {
  return (
    <Icone>
      <rect x="6" y="2" width="12" height="20" rx="2" />
      <path d="M11 18h2" />
    </Icone>
  );
}

function IconeComputador() {
  return (
    <Icone>
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </Icone>
  );
}

function IconeAtualizar() {
  return (
    <Icone>
      <path d="M21 12a9 9 0 1 1-2.64-6.36L21 8" />
      <path d="M21 3v5h-5" />
    </Icone>
  );
}

function IconeAmpliar() {
  return (
    <Icone>
      <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
    </Icone>
  );
}

function IconeFechar() {
  return (
    <Icone>
      <path d="M18 6 6 18M6 6l12 12" />
    </Icone>
  );
}

function IconeLinkExterno() {
  return (
    <Icone>
      <path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    </Icone>
  );
}
