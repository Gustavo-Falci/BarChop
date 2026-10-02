import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Calendario } from "../../src/componentes/Calendario";

const AGORA = new Date("2026-09-08T10:00:00-03:00");

// Setembro de 2026 começa numa terça: as duas primeiras colunas da
// primeira linha ficam vazias, e é esse recuo que o cabeçalho precisa
// tornar legível.
function montar(extras: Partial<Parameters<typeof Calendario>[0]> = {}) {
  render(
    <Calendario
      mes="2026-09"
      dias={{ "2026-09-09": true, "2026-09-10": true }}
      agora={AGORA}
      aoEscolher={vi.fn()}
      aoTrocarMes={vi.fn()}
      {...extras}
    />
  );
}

describe("calendário", () => {
  it("mostra os sete dias da semana como cabeçalho", () => {
    montar();

    for (const nome of ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"]) {
      expect(screen.getByText(nome)).toBeInTheDocument();
    }
  });

  it("nomeia cada dia pela data por extenso", () => {
    // "9" sozinho não diz nada a quem ouve a tela, e repete em todo mês.
    montar();

    expect(screen.getByRole("button", { name: "9 de setembro" })).toBeInTheDocument();
  });

  it("marca o dia escolhido", () => {
    montar({ selecionada: "2026-09-09" });

    expect(
      screen.getByRole("button", { name: "9 de setembro", current: "date" })
    ).toBeInTheDocument();
  });

  it("sem dia escolhido, nenhum dia fica marcado", () => {
    montar();

    expect(
      screen.queryByRole("button", { name: "9 de setembro", current: "date" })
    ).not.toBeInTheDocument();
  });

  it("desabilita o dia sem vaga e o dia no passado", () => {
    montar();

    // 11 não está no mapa de disponibilidade; 7 é passado.
    expect(screen.getByRole("button", { name: "11 de setembro" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "7 de setembro" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "9 de setembro" })).toBeEnabled();
  });
});
