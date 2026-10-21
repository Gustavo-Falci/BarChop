import { render, renderHook, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Estatistica } from "../../src/componentes/Estatistica";
import { atrasoDoItem, entradaDoItem, usePrimeiraCarga } from "../../src/movimento/lista";
import { ESCALONAMENTO } from "../../src/movimento/tokens";

// Motion PR 4: listas que entram escalonadas na primeira carga, itens
// que entram e saem, e o número que troca.

describe("atrasoDoItem", () => {
  it("escalona os primeiros, um passo cada", () => {
    expect(atrasoDoItem(0)).toBe(0);
    expect(atrasoDoItem(1)).toBeCloseTo(ESCALONAMENTO.passo);
    expect(atrasoDoItem(ESCALONAMENTO.limite - 1)).toBeCloseTo((ESCALONAMENTO.limite - 1) * ESCALONAMENTO.passo);
  });

  it("do limite em diante, todos entram juntos: lista longa não fica esperando", () => {
    const teto = atrasoDoItem(ESCALONAMENTO.limite);
    expect(atrasoDoItem(ESCALONAMENTO.limite + 1)).toBe(teto);
    expect(atrasoDoItem(500)).toBe(teto);
    expect(teto).toBeCloseTo(ESCALONAMENTO.limite * ESCALONAMENTO.passo);
  });
});

describe("entradaDoItem", () => {
  it("na primeira carga, parte de fora e espera a vez", () => {
    const props = entradaDoItem(2, { primeiraCarga: true });

    expect(props.initial).toMatchObject({ opacity: 0 });
    expect(props.animate.transition.delay).toBeCloseTo(atrasoDoItem(2));
  });

  it("depois, em lista que filtra (tabela), o item que aparece não anima", () => {
    expect(entradaDoItem(2, { primeiraCarga: false }).initial).toBe(false);
  });

  it("depois, em lista curta onde item novo é notícia, ele entra na hora, sem esperar a vez", () => {
    const props = entradaDoItem(2, { primeiraCarga: false, novosEntram: true });

    expect(props.initial).toMatchObject({ opacity: 0 });
    expect(props.animate.transition.delay).toBe(0);
  });
});

describe("usePrimeiraCarga", () => {
  it("é verdade no primeiro render e deixa de ser logo depois", async () => {
    const { result } = renderHook(() => usePrimeiraCarga());

    expect(result.current).toBe(true);
    await waitFor(() => expect(result.current).toBe(false));
  });
});

describe("Estatistica", () => {
  it("mostra o valor novo quando ele muda, e o velho sai", async () => {
    const { rerender } = render(<Estatistica numero="3" legenda="agendamentos hoje" />);
    expect(screen.getByText("3")).toBeInTheDocument();

    rerender(<Estatistica numero="4" legenda="agendamentos hoje" />);

    expect(screen.getByText("4")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText("3")).not.toBeInTheDocument());
  });
});
