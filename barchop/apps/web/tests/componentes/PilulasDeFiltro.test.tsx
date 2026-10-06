import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PilulasDeFiltro } from "../../src/componentes/PilulasDeFiltro";

const OPCOES = [
  { valor: "todos", rotulo: "Todos", contagem: 12 },
  { valor: "ativos", rotulo: "No catálogo", contagem: 10 },
  { valor: "inativos", rotulo: "Fora do catálogo", contagem: 2, tom: "atencao" as const },
];

describe("PilulasDeFiltro", () => {
  it("é um grupo nomeado de botões que alternam", () => {
    render(<PilulasDeFiltro rotulo="Filtrar serviços" opcoes={OPCOES} valor="todos" aoTrocar={() => {}} />);

    expect(screen.getByRole("group", { name: "Filtrar serviços" })).toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(3);
  });

  it("só a escolhida fica pressionada", () => {
    render(<PilulasDeFiltro rotulo="Filtrar" opcoes={OPCOES} valor="ativos" aoTrocar={() => {}} />);

    expect(screen.getByRole("button", { name: /No catálogo/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /Todos/ })).toHaveAttribute("aria-pressed", "false");
  });

  it("a contagem faz parte do nome: quem ouve sabe quantos há antes de escolher", () => {
    render(<PilulasDeFiltro rotulo="Filtrar" opcoes={OPCOES} valor="todos" aoTrocar={() => {}} />);

    expect(screen.getByRole("button", { name: "Fora do catálogo 2" })).toBeInTheDocument();
  });

  it("clicar avisa o valor escolhido", async () => {
    const aoTrocar = vi.fn();
    render(<PilulasDeFiltro rotulo="Filtrar" opcoes={OPCOES} valor="todos" aoTrocar={aoTrocar} />);

    await userEvent.click(screen.getByRole("button", { name: /Fora do catálogo/ }));

    expect(aoTrocar).toHaveBeenCalledWith("inativos");
  });

  it("sem contagem, o nome é só o rótulo", () => {
    render(
      <PilulasDeFiltro
        rotulo="Filtrar"
        opcoes={[{ valor: "proximos", rotulo: "Próximos 7 dias" }]}
        valor="proximos"
        aoTrocar={() => {}}
      />
    );

    expect(screen.getByRole("button", { name: "Próximos 7 dias" })).toBeInTheDocument();
  });
});
