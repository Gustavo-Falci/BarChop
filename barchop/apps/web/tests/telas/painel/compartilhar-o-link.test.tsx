import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { criarApiClientFalso } from "@barchop/api-client";
import { DashboardDoDia } from "../../../src/telas/painel/DashboardDoDia";
import { navegacaoFalsa } from "../../ajudantes/navegacao";
import { montarPainel } from "../../ajudantes/painel";

// Painel v2, marco 4 (4b): o Hoje ganha o cartão do link, com QR, e a
// janela de compartilhar — copiar, WhatsApp, compartilhar do celular,
// baixar o QR e imprimir o cartaz. Qualquer uma marca o passo "Seu
// link" da trilha.
const AGORA = new Date("2026-09-08T10:00:00-03:00");
const LINK = `${window.location.origin}/gr-barber`;

async function cartao() {
  return screen.findByRole("region", { name: /^seu link$/i });
}

async function abrirJanela() {
  const usuario = userEvent.setup();
  await usuario.click(within(await cartao()).getByRole("button", { name: /compartilhar/i }));
  return { usuario, janela: await screen.findByRole("dialog", { name: /compartilhar seu link/i }) };
}

async function linkMarcado(falso: ReturnType<typeof criarApiClientFalso>) {
  return (await falso.barbeiro.onboarding()).passos.find((p) => p.id === "link")?.feito;
}

describe("cartão do link no Hoje", () => {
  beforeEach(() => {
    localStorage.clear();
    navegacaoFalsa.redefinir({ pathname: "/painel" });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Reflect.deleteProperty(navigator, "share");
  });

  it("mostra o endereço da barbearia e o QR dele", async () => {
    montarPainel(<DashboardDoDia agora={AGORA} />);

    const regiao = await cartao();

    expect(regiao).toHaveTextContent(LINK);
    expect(await within(regiao).findByRole("img", { name: /qr code/i })).toBeInTheDocument();
  });

  it("aparece também pro profissional: o link é público", async () => {
    montarPainel(<DashboardDoDia agora={AGORA} />, criarApiClientFalso({ papel: "profissional" }));

    expect(await cartao()).toHaveTextContent(LINK);
  });

  it("copiar põe o link na área de transferência e marca o passo", async () => {
    const falso = montarPainel(<DashboardDoDia agora={AGORA} />);
    const { usuario, janela } = await abrirJanela();

    await usuario.click(within(janela).getByRole("button", { name: /copiar link/i }));

    expect(await navigator.clipboard.readText()).toBe(LINK);
    expect(await within(janela).findByText(/link copiado/i)).toBeInTheDocument();
    expect(await linkMarcado(falso)).toBe(true);
  });

  it("WhatsApp abre o wa.me com a mensagem e o link, em outra aba", async () => {
    const falso = montarPainel(<DashboardDoDia agora={AGORA} />);
    const { usuario, janela } = await abrirJanela();
    const whatsapp = within(janela).getByRole("link", { name: /whatsapp/i });

    const url = new URL(whatsapp.getAttribute("href")!);
    expect(url.searchParams.get("text")).toBe(`Agende seu horário na GR Barber pelo link: ${LINK}`);
    expect(whatsapp).toHaveAttribute("target", "_blank");

    await usuario.click(whatsapp);
    await waitFor(async () => expect(await linkMarcado(falso)).toBe(true));
  });

  it("\"Compartilhar…\" só aparece onde o aparelho compartilha", async () => {
    montarPainel(<DashboardDoDia agora={AGORA} />);
    const { janela } = await abrirJanela();

    expect(within(janela).queryByRole("button", { name: /compartilhar…/i })).toBeNull();
  });

  it("no celular, \"Compartilhar…\" chama o compartilhar do aparelho", async () => {
    const share = vi.fn(async (_dados: ShareData) => {});
    Object.defineProperty(navigator, "share", { value: share, configurable: true });
    const falso = montarPainel(<DashboardDoDia agora={AGORA} />);
    const { usuario, janela } = await abrirJanela();

    await usuario.click(within(janela).getByRole("button", { name: /compartilhar…/i }));

    expect(share).toHaveBeenCalledWith(expect.objectContaining({ url: LINK }));
    await waitFor(async () => expect(await linkMarcado(falso)).toBe(true));
  });

  it("baixa o QR em PNG com o slug no nome", async () => {
    const clique = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const falso = montarPainel(<DashboardDoDia agora={AGORA} />);
    const { usuario, janela } = await abrirJanela();

    await usuario.click(within(janela).getByRole("button", { name: /baixar qr/i }));

    await waitFor(() => expect(clique).toHaveBeenCalled());
    const ancora = clique.mock.contexts[0] as HTMLAnchorElement;
    expect(ancora.download).toBe("qr-gr-barber.png");
    expect(ancora.href).toMatch(/^data:image\/png;base64,/);
    await waitFor(async () => expect(await linkMarcado(falso)).toBe(true));
  });

  it("imprimir abre o cartaz em outra aba", async () => {
    montarPainel(<DashboardDoDia agora={AGORA} />);
    const { janela } = await abrirJanela();

    const cartaz = within(janela).getByRole("link", { name: /imprimir cartaz/i });

    expect(cartaz).toHaveAttribute("href", "/painel/cartaz");
    expect(cartaz).toHaveAttribute("target", "_blank");
  });

  it("fechar tira a janela da tela", async () => {
    montarPainel(<DashboardDoDia agora={AGORA} />);
    const { usuario, janela } = await abrirJanela();

    await usuario.click(within(janela).getByRole("button", { name: /fechar/i }));

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("o passo \"Seu link\" da trilha abre a mesma janela e fica feito", async () => {
    const usuario = userEvent.setup();
    montarPainel(<DashboardDoDia agora={AGORA} />);
    const trilha = await screen.findByRole("region", { name: /primeiros passos/i });
    const passo = within(trilha).getByRole("listitem", { name: /seu link/i });

    await usuario.click(within(passo).getByRole("button", { name: /compartilhar link/i }));
    const janela = await screen.findByRole("dialog", { name: /compartilhar seu link/i });
    await usuario.click(within(janela).getByRole("button", { name: /copiar link/i }));

    await waitFor(() => expect(within(passo).getByText(/feito/i)).toBeInTheDocument());
  });
});
