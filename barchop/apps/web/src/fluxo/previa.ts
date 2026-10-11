import { normalizarAparencia, type Aparencia } from "@barchop/formato";
import { cssDaAparencia } from "./aparenciaDaPagina";

// A prévia ao vivo da Aparência (plano aparencia.plan.md, marco E). O
// painel abre a página de verdade num iframe e manda o rascunho por
// postMessage; a página, dentro do iframe, troca só o próprio visual.
// Nunca pela URL: um link com o visual na query viraria página
// falsificada que qualquer um compartilha.
//
// Em produção é cross-origin — o painel mora em painel.<site> e a página
// em <slug>.<site> —, então os dois lados conferem a origem.

export const MENSAGEM_DA_APARENCIA = "barchop:previa:aparencia";
export const MENSAGEM_DE_PRONTA = "barchop:previa:pronta";

export type ModoDaPrevia = "claro" | "escuro";

export interface MensagemDaPrevia {
  aparencia: Aparencia;
  modo: ModoDaPrevia;
}

// De onde o painel fala. Com o site configurado, o subdomínio `painel.`
// (o mesmo SUBDOMINIO_DO_PAINEL de tenant/rota.ts); sem ele
// (desenvolvimento), tudo mora no mesmo host.
export function origemDoPainel(urlDoSite: string | undefined, origemAtual: string): string {
  if (!urlDoSite) return origemAtual;
  const { protocol, host } = new URL(urlDoSite);
  return `${protocol}//painel.${host}`;
}

// O que chega pela mensagem é dado de fora: só passa no formato certo, e
// a aparência sai normalizada.
export function lerMensagemDaPrevia(dados: unknown): MensagemDaPrevia | null {
  if (typeof dados !== "object" || dados === null) return null;
  const { tipo, aparencia, modo } = dados as Record<string, unknown>;
  if (tipo !== MENSAGEM_DA_APARENCIA) return null;
  if (modo !== "claro" && modo !== "escuro") return null;
  return { aparencia: normalizarAparencia(aparencia), modo };
}

// Só a janela-mãe, e só da origem do painel.
export function deveAceitar(
  evento: { origin: string; source: unknown },
  origemPermitida: string,
  pai: Window
): boolean {
  return evento.origin === origemPermitida && evento.source === pai;
}

const ID_DA_PREVIA = "aparencia-previa";
export const ID_DA_PUBLICADA = "aparencia-publicada";

// Troca o visual do documento pelo do rascunho: o <style> publicado sai
// de cena (media "not all", sem tirar do DOM o nó que o React desenhou),
// entra o do rascunho, e o modo fica fixo no que o painel pediu.
export function aplicarPrevia(documento: Document, { aparencia, modo }: MensagemDaPrevia): void {
  documento.getElementById(ID_DA_PUBLICADA)?.setAttribute("media", "not all");
  let estilo = documento.getElementById(ID_DA_PREVIA);
  if (!estilo) {
    estilo = documento.createElement("style");
    estilo.id = ID_DA_PREVIA;
    // No fim do <head>: depois dos tokens (ganha deles), e fora do
    // <body> que o React desenha — navegar dentro da prévia não o leva.
    documento.head.appendChild(estilo);
  }
  // textContent, não innerHTML: o CSS já sai só com hex e trechos fixos.
  estilo.textContent = cssDaAparencia(aparencia);
  documento.documentElement.setAttribute("data-theme", modo === "escuro" ? "dark" : "light");
}
