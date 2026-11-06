import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CartazDoLink } from "../../../src/telas/painel/hoje/CartazDoLink";
import { navegacaoFalsa } from "../../ajudantes/navegacao";
import { montarPainel } from "../../ajudantes/painel";

// Painel v2, marco 4 (4b): o cartaz pro balcão, aberto pela janela de
// compartilhar. Nome da casa, QR grande e o endereço por extenso, pra
// quem não aponta a câmera.
// O parágrafo do endereço, embaixo do QR.
function endereco(): HTMLElement {
  const qr = screen.getByRole("img", { name: /qr code/i });
  const paragrafo = qr.closest("article")?.querySelector("p:last-of-type");
  if (!(paragrafo instanceof HTMLElement)) throw new Error("sem o endereço");
  return paragrafo;
}

describe("cartaz do link", () => {
  beforeEach(() => {
    localStorage.clear();
    navegacaoFalsa.redefinir({ pathname: "/painel/cartaz" });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("traz o nome da barbearia, o QR e o endereço sem o protocolo", async () => {
    montarPainel(<CartazDoLink />);

    expect(await screen.findByRole("heading", { name: "GR Barber" })).toBeInTheDocument();
    expect(await screen.findByRole("img", { name: /qr code/i })).toBeInTheDocument();
    expect(endereco().textContent).toBe(`${window.location.host}/gr-barber`);
  });

  // Onda C, PR 6: a barra de cima, que some na impressão.
  it("tem o caminho de volta ao painel e avisa que sai numa folha A4", async () => {
    montarPainel(<CartazDoLink />);

    await screen.findByRole("heading", { name: "GR Barber" }, { timeout: 5000 });
    expect(screen.getByRole("link", { name: /Voltar ao painel/ })).toHaveAttribute("href", "/painel");
    expect(screen.getByText("Sai numa folha A4")).toBeInTheDocument();
  });

  // O endereço quebra no ponto, nunca no hífen do meio do nome: um
  // pedaço por trecho. Com um slug longo, sem isso o nome se partiria
  // ("gr-barber- / centro").
  it("em produção, o endereço sem https e em pedaços que quebram no ponto", async () => {
    vi.stubEnv("NEXT_PUBLIC_URL_DO_SITE", "https://barchop.com.br");
    montarPainel(<CartazDoLink />);

    await screen.findByRole("heading", { name: "GR Barber" }, { timeout: 5000 });
    const pedacos = [...endereco().children].map((pedaco) => pedaco.textContent);
    expect(pedacos).toEqual(["gr-barber", ".barchop", ".com", ".br"]);
  });

  it("\"Imprimir\" chama a impressão do navegador", async () => {
    const imprimir = vi.spyOn(window, "print").mockImplementation(() => {});
    montarPainel(<CartazDoLink />);

    // O cartaz espera a sessão e a barbearia; com as suítes em paralelo
    // isso passa do segundo padrão do findBy.
    await screen.findByRole("heading", { name: "GR Barber" }, { timeout: 5000 });
    await userEvent.click(screen.getByRole("button", { name: /imprimir/i }));

    expect(imprimir).toHaveBeenCalled();
  });
});
