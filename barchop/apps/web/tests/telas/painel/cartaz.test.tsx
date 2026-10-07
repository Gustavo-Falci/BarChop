import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CartazDoLink } from "../../../src/telas/painel/hoje/CartazDoLink";
import { navegacaoFalsa } from "../../ajudantes/navegacao";
import { montarPainel } from "../../ajudantes/painel";

// Painel v2, marco 4 (4b): o cartaz pro balcão, aberto pela janela de
// compartilhar. Nome da casa, QR grande e o endereço por extenso, pra
// quem não aponta a câmera.
describe("cartaz do link", () => {
  beforeEach(() => {
    localStorage.clear();
    navegacaoFalsa.redefinir({ pathname: "/painel/cartaz" });
  });

  afterEach(() => vi.restoreAllMocks());

  it("traz o nome da barbearia, o QR e o endereço", async () => {
    montarPainel(<CartazDoLink />);

    expect(await screen.findByRole("heading", { name: "GR Barber" })).toBeInTheDocument();
    expect(await screen.findByRole("img", { name: /qr code/i })).toBeInTheDocument();
    expect(screen.getByText(`${window.location.origin}/gr-barber`)).toBeInTheDocument();
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
