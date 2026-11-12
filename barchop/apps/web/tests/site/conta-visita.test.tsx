import { render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ContaVisita } from "../../src/site/ContaVisita";

// Home nova, marco 1: a home avisa a API que foi vista, uma vez por aba.
// Sem cookie: a marca fica no sessionStorage, que não sai do navegador e
// some quando a aba fecha.
afterEach(() => sessionStorage.clear());

describe("ContaVisita", () => {
  it("avisa a visita uma vez", async () => {
    const contarVisita = vi.fn().mockResolvedValue(undefined);
    render(<ContaVisita contarVisita={contarVisita} />);

    await waitFor(() => expect(contarVisita).toHaveBeenCalledTimes(1));
  });

  it("na mesma aba, voltar à home não conta de novo", async () => {
    const contarVisita = vi.fn().mockResolvedValue(undefined);
    const { unmount } = render(<ContaVisita contarVisita={contarVisita} />);
    await waitFor(() => expect(contarVisita).toHaveBeenCalledTimes(1));
    unmount();

    render(<ContaVisita contarVisita={contarVisita} />);
    await new Promise((pronto) => setTimeout(pronto, 20));
    expect(contarVisita).toHaveBeenCalledTimes(1);
  });

  it("não desenha nada, e a falha da API não aparece pra quem visita", async () => {
    const contarVisita = vi.fn().mockRejectedValue(new Error("fora do ar"));
    const { container } = render(<ContaVisita contarVisita={contarVisita} />);

    await waitFor(() => expect(contarVisita).toHaveBeenCalledTimes(1));
    expect(container).toBeEmptyDOMElement();
  });
});
