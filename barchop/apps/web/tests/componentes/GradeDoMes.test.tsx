import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { AgendamentoComCliente, HorarioSerializado } from "@barchop/types";
import { GradeDoMes } from "../../src/componentes/GradeDoMes";
import { gradeDoMes } from "../../src/painel/grade";

const HORARIOS: HorarioSerializado[] = [0, 1, 2, 3, 4, 5, 6].map((diaSemana) => ({
  diaSemana,
  horaAbertura: diaSemana === 0 ? null : "09:00",
  horaFechamento: diaSemana === 0 ? null : "18:00",
  fechado: diaSemana === 0,
}));

function agendamento(id: string, hora: string): AgendamentoComCliente {
  return {
    id,
    data: "2026-09-08",
    horaInicio: hora,
    horaFim: "23:00",
    status: "confirmado",
    origem: "cliente",
    observacoes: null,
    presencaConfirmadaEm: null,
    barbeiro: { id: "bb1", nome: "Rafael" },
    servicos: [
      { servicoId: "s1", nome: "Corte", precoNoMomento: "40.00", duracaoNoMomento: 30 },
    ],
    cliente: {
      id: "c1",
      nome: `Cliente ${id}`,
      telefone: "(11) 99999-0001",
      email: null,
      temConta: false,
    },
  };
}

// A pílula parte o nome em dois nós (o sobrenome some no celular), então
// a busca é pelo texto inteiro da pílula.
function pilula(texto: string): HTMLElement | null {
  return (
    screen.queryAllByText((_, el) => el?.hasAttribute("data-status") === true && (el.textContent ?? "").includes(texto))[0] ?? null
  );
}

function montar(entrada: {
  agendamentos?: AgendamentoComCliente[];
  aoAbrirDia?: (data: string) => void;
}) {
  render(
    <GradeDoMes
      celulas={gradeDoMes({
        mes: "2026-09",
        horarios: HORARIOS,
        agendamentos: entrada.agendamentos ?? [],
      })}
      hoje="2026-09-08"
      aoAbrirDia={entrada.aoAbrirDia ?? (() => {})}
    />
  );
}

describe("GradeDoMes", () => {
  it("mostra os chips do dia e abre o dia ao clicar na célula", async () => {
    const aoAbrirDia = vi.fn((_data: string) => {});
    montar({ agendamentos: [agendamento("a1", "10:00")], aoAbrirDia });

    expect(pilula("Cliente a1")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "8 de setembro, 1 agendamento" }));

    expect(aoAbrirDia).toHaveBeenCalledWith("2026-09-08");
  });

  it("passando de três no dia, mostra três e um +N com o resto", () => {
    montar({
      agendamentos: [
        agendamento("a1", "09:00"),
        agendamento("a2", "10:00"),
        agendamento("a3", "11:00"),
        agendamento("a4", "12:00"),
        agendamento("a5", "13:00"),
      ],
    });

    expect(pilula("Cliente a3")).toBeInTheDocument();
    expect(pilula("Cliente a4")).not.toBeInTheDocument();
    expect(screen.getByText("+2")).toBeInTheDocument();
  });

  it("com exatamente três no dia, mostra os três e nenhum +N", () => {
    // O caso que separa "corta acima de 2" de "corta acima de 3": com um
    // limite errado por um, este teste fica vermelho e o de cima não.
    montar({
      agendamentos: [agendamento("a1", "09:00"), agendamento("a2", "10:00"), agendamento("a3", "11:00")],
    });

    expect(pilula("Cliente a3")).toBeInTheDocument();
    expect(screen.queryByText(/^\+/)).not.toBeInTheDocument();
  });

  it("o nome do dia diz quantos agendamentos tem; o dia vazio, só a data", () => {
    montar({
      agendamentos: [
        agendamento("a1", "09:00"),
        agendamento("a2", "10:00"),
        agendamento("a3", "11:00"),
        agendamento("a4", "12:00"),
      ],
    });

    expect(screen.getByRole("button", { name: "8 de setembro, 4 agendamentos" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "9 de setembro" })).toBeInTheDocument();
  });

  it("dia sem agendamento não tem pílula", () => {
    montar({ agendamentos: [agendamento("a1", "09:00")] });

    expect(screen.getByRole("button", { name: "9 de setembro" })).toHaveTextContent(/^9$/);
  });

  it("a pílula leva o tom do profissional e o status", () => {
    const pendente = { ...agendamento("a1", "09:00"), status: "pendente" as const, barbeiro: { id: "m2", nome: "Ana" } };
    render(
      <GradeDoMes
        celulas={gradeDoMes({ mes: "2026-09", horarios: HORARIOS, agendamentos: [pendente] })}
        hoje="2026-09-08"
        tons={{ bb1: 0, m2: 1 }}
        aoAbrirDia={() => {}}
      />
    );

    const daAna = pilula("Cliente a1");
    expect(daAna).toHaveAttribute("data-tom", "1");
    expect(daAna).toHaveAttribute("data-status", "pendente");
  });

  it("distingue a célula de fora do mês e a de hoje", () => {
    montar({});

    expect(screen.getByRole("button", { name: "30 de agosto" })).toHaveAttribute(
      "data-fora-do-mes",
      "true"
    );
    expect(screen.getByRole("button", { name: "8 de setembro" })).toHaveAttribute(
      "aria-current",
      "date"
    );
  });
});
