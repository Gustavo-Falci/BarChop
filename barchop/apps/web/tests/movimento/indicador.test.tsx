import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { Abas } from "../../src/componentes/Abas";
import { PilulasDeFiltro } from "../../src/componentes/PilulasDeFiltro";
import { SeletorDeVista, type Vista } from "../../src/componentes/SeletorDeVista";
import { SeletorEmPilulas } from "../../src/componentes/SeletorEmPilulas";

// Motion PR 3: o item ativo ganha um indicador só (o fundo, ou o traço
// das abas), que desliza de um item pro outro (`layoutId`). Aqui, o que
// dá pra ver sem layout: um indicador por grupo, dentro do ativo, e ele
// muda de item junto com a escolha.

function indicadores(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>("[data-indicador]")];
}

function Vistas() {
  const [vista, setVista] = useState<Vista>("dia");
  return (
    <SeletorDeVista
      vista={vista}
      titulo="Outubro"
      aoTrocarVista={setVista}
      aoAndar={() => {}}
      aoVoltarAHoje={() => {}}
    />
  );
}

function AbasDeTeste() {
  const [atual, setAtual] = useState<"a" | "b">("a");
  return (
    <Abas
      rotulo="Seções"
      abas={[
        { id: "a", rotulo: "Primeira" },
        { id: "b", rotulo: "Segunda" },
      ]}
      atual={atual}
      aoTrocar={setAtual}
      paineis={{ a: <p>um</p>, b: <p>dois</p> }}
    />
  );
}

function Intervalo() {
  const [valor, setValor] = useState<"15" | "30">("15");
  return (
    <SeletorEmPilulas
      nome="intervalo"
      legenda="Intervalo"
      opcoes={[
        { valor: "15", rotulo: "15 min" },
        { valor: "30", rotulo: "30 min" },
      ]}
      valor={valor}
      aoTrocar={setValor}
    />
  );
}

function Filtro() {
  const [valor, setValor] = useState<"todos" | "ativos">("todos");
  return (
    <PilulasDeFiltro
      rotulo="Filtrar"
      opcoes={[
        { valor: "todos", rotulo: "Todos" },
        { valor: "ativos", rotulo: "Ativos" },
      ]}
      valor={valor}
      aoTrocar={setValor}
    />
  );
}

describe("indicador do item ativo", () => {
  it("SeletorDeVista: um só, na vista escolhida, e muda com ela", async () => {
    render(<Vistas />);
    expect(indicadores()).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Dia", pressed: true })).toContainElement(indicadores()[0]!);

    await userEvent.click(screen.getByRole("button", { name: "Semana" }));

    expect(indicadores()).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Semana", pressed: true })).toContainElement(indicadores()[0]!);
  });

  it("Abas: o traço fica na aba selecionada e muda com ela", async () => {
    render(<AbasDeTeste />);
    expect(screen.getByRole("tab", { name: "Primeira", selected: true })).toContainElement(indicadores()[0]!);

    await userEvent.click(screen.getByRole("tab", { name: "Segunda" }));

    expect(indicadores()).toHaveLength(1);
    expect(screen.getByRole("tab", { name: "Segunda", selected: true })).toContainElement(indicadores()[0]!);
  });

  it("SeletorEmPilulas: o fundo fica na opção marcada e muda com ela", async () => {
    render(<Intervalo />);
    const quinze = screen.getByRole("radio", { name: "15 min" }).closest("label")!;
    expect(quinze).toContainElement(indicadores()[0]!);

    await userEvent.click(screen.getByRole("radio", { name: "30 min" }));

    expect(indicadores()).toHaveLength(1);
    expect(screen.getByRole("radio", { name: "30 min" }).closest("label")).toContainElement(indicadores()[0]!);
  });

  it("PilulasDeFiltro: o fundo fica no filtro escolhido e muda com ele", async () => {
    render(<Filtro />);
    expect(screen.getByRole("button", { name: "Todos", pressed: true })).toContainElement(indicadores()[0]!);

    await userEvent.click(screen.getByRole("button", { name: "Ativos" }));

    expect(indicadores()).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Ativos", pressed: true })).toContainElement(indicadores()[0]!);
  });

  it("dois grupos na mesma tela não dividem o indicador", () => {
    render(
      <>
        <Filtro />
        <Intervalo />
      </>
    );

    expect(indicadores()).toHaveLength(2);
  });
});
