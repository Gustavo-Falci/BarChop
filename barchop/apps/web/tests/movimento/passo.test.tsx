import { render, renderHook, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MarcaDeConfirmado } from "../../src/componentes/MarcaDeConfirmado";
import { useDeslizeDoPasso } from "../../src/movimento/passo";

// Motion PR 5: a tela do passo entra deslizando do lado de onde veio.
// O passo anterior é lembrado entre as rotas (cada passo é uma tela que
// monta do zero).

describe("useDeslizeDoPasso", () => {
  it("a primeira tela não desliza; avançar vem da direita, voltar da esquerda", () => {
    const primeira = renderHook(() => useDeslizeDoPasso("servicos"));
    expect(primeira.result.current.initial).toBe(false);
    primeira.unmount();

    const avancou = renderHook(() => useDeslizeDoPasso("profissional"));
    expect(avancou.result.current.initial).toMatchObject({ x: expect.any(Number) });
    expect((avancou.result.current.initial as { x: number }).x).toBeGreaterThan(0);
    avancou.unmount();

    const voltou = renderHook(() => useDeslizeDoPasso("servicos"));
    expect((voltou.result.current.initial as { x: number }).x).toBeLessThan(0);
    voltou.unmount();

    // Recarregou o mesmo passo: nada a deslizar.
    const mesmo = renderHook(() => useDeslizeDoPasso("servicos"));
    expect(mesmo.result.current.initial).toBe(false);
    mesmo.unmount();
  });
});

describe("MarcaDeConfirmado", () => {
  it("é decorativa: o ✓ desenhado não entra no que o leitor de tela lê", () => {
    render(
      <>
        <MarcaDeConfirmado />
        <h1>Agendamento confirmado</h1>
      </>
    );

    expect(screen.getByRole("heading", { name: "Agendamento confirmado" })).toBeInTheDocument();
    expect(document.querySelector("svg[aria-hidden='true'] path")).not.toBeNull();
  });
});
