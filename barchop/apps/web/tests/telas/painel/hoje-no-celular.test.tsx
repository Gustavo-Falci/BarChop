import { readFileSync } from "node:fs";
import { join } from "node:path";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { criarApiClientFalso } from "@barchop/api-client";
import { CONSULTA_DO_CELULAR } from "../../../src/painel/useTelaDeCelular";
import { DashboardDoDia } from "../../../src/telas/painel/DashboardDoDia";
import { navegacaoFalsa } from "../../ajudantes/navegacao";
import { montarPainel } from "../../ajudantes/painel";

// O Hoje no celular (redesenho, PR 2). O jsdom não faz layout: o que o
// CSS esconde é conferido lendo a regra, como em pecas-no-celular; o
// que a tela diz e faz, pela tela.
const AGORA = new Date("2026-09-08T10:00:00-03:00");
const LINK = `${window.location.origin}/gr-barber`;

function lerCss(caminho: string): string {
  return readFileSync(join(__dirname, "../../../src", caminho), "utf8").replace(/\r\n/g, "\n");
}

function blocoDaMedia(css: string, abertura: string): string {
  const inicio = css.indexOf(abertura);
  if (inicio < 0) return "";
  const resto = css.slice(inicio);
  return resto.slice(0, resto.indexOf("\n}\n") + 2);
}

async function cartao() {
  return screen.findByRole("region", { name: /^seu link$/i });
}

async function linkMarcado(falso: ReturnType<typeof criarApiClientFalso>) {
  return (await falso.barbeiro.onboarding()).passos.find((p) => p.id === "link")?.feito;
}

beforeEach(() => {
  localStorage.clear();
  navegacaoFalsa.redefinir({ pathname: "/painel" });
});

describe("Novo agendamento no cabeçalho", () => {
  it("some onde a barra de baixo aparece, que já tem o Novo; no desktop fica", async () => {
    montarPainel(<DashboardDoDia agora={AGORA} />);

    const botao = await screen.findByRole("button", { name: /novo agendamento/i });

    expect(botao.closest("[data-so-no-desktop]")).not.toBeNull();
    // A mesma consulta da barra de baixo: a 641–900px não pode haver
    // dois "Novo", nem nenhum.
    const celular = blocoDaMedia(lerCss("componentes/CabecalhoDaPagina.module.css"), `@media ${CONSULTA_DO_CELULAR}`);
    expect(celular).toMatch(/\.acao\[data-so-no-desktop\]\s*\{[^}]*display:\s*none/);
  });
});

describe("resumo do dia no celular", () => {
  it("as três legendas cabem numa linha, sem quebrar", () => {
    const celular = blocoDaMedia(lerCss("telas/painel/DashboardDoDia.module.css"), "@media (max-width: 640px)");

    expect(celular).toMatch(/white-space:\s*nowrap/);
  });
});

describe("cartão do link", () => {
  it("copiar no próprio cartão põe o link na área de transferência, avisa e marca o passo", async () => {
    const falso = montarPainel(<DashboardDoDia agora={AGORA} />);
    const usuario = userEvent.setup();
    const regiao = await cartao();

    await usuario.click(within(regiao).getByRole("button", { name: /copiar o link/i }));

    expect(await navigator.clipboard.readText()).toBe(LINK);
    expect(await within(regiao).findByRole("status")).toHaveTextContent(/link copiado/i);
    expect(await linkMarcado(falso)).toBe(true);
  });

  it("sem área de transferência, mostra o link pra copiar à mão e não marca o passo", async () => {
    const falso = montarPainel(<DashboardDoDia agora={AGORA} />);
    const usuario = userEvent.setup();
    const regiao = await cartao();
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValueOnce(new Error("negado"));

    await usuario.click(within(regiao).getByRole("button", { name: /copiar o link/i }));

    expect(await within(regiao).findByRole("status")).toHaveTextContent(/não deu pra copiar/i);
    expect(await linkMarcado(falso)).toBe(false);
  });

  it("o aviso de copiado já existe antes do clique, pro leitor de tela anunciar", async () => {
    montarPainel(<DashboardDoDia agora={AGORA} />);

    expect(within(await cartao()).getByRole("status")).toBeEmptyDOMElement();
  });

  it("o QR code abre e fecha por um botão", async () => {
    montarPainel(<DashboardDoDia agora={AGORA} />);
    const usuario = userEvent.setup();
    const regiao = await cartao();
    const alternar = within(regiao).getByRole("button", { name: /^qr code$/i });
    const qr = within(regiao).getByRole("img", { name: /qr code/i }).closest("[id]")!;

    expect(alternar).toHaveAttribute("aria-expanded", "false");
    expect(alternar).toHaveAttribute("aria-controls", qr.id);

    await usuario.click(alternar);
    expect(alternar).toHaveAttribute("aria-expanded", "true");
    expect(qr).toHaveAttribute("data-aberto");

    await usuario.click(alternar);
    expect(alternar).toHaveAttribute("aria-expanded", "false");
    expect(qr).not.toHaveAttribute("data-aberto");
  });

  it("no celular o QR fica recolhido e o botão aparece; no desktop o QR fica à vista, sem botão", () => {
    const css = lerCss("telas/painel/hoje/CartaoDoLink.module.css");
    const celular = blocoDaMedia(css, `@media ${CONSULTA_DO_CELULAR}`);

    expect(css).toMatch(/\.alternarQr\s*\{[^}]*display:\s*none/);
    expect(celular).toMatch(/\.alternarQr\s*\{[^}]*display:\s*inline-flex/);
    expect(celular).toMatch(/\.qr:not\(\[data-aberto\]\)\s*\{[^}]*display:\s*none/);
  });
});
