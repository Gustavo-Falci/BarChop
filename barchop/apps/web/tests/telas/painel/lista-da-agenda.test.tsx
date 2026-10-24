import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { AgendamentoComCliente, BloqueioSerializado, HorarioSerializado } from "@barchop/types";
import { ListaDaAgenda, type ProfissionalDaLista } from "../../../src/telas/painel/agenda/ListaDaAgenda";

// A vista Lista (agenda no celular, PR 4). 2026-09-08 é uma terça; o
// domingo fecha.
const HORARIOS: HorarioSerializado[] = [0, 1, 2, 3, 4, 5, 6].map((diaSemana) => ({
  diaSemana,
  horaAbertura: diaSemana === 0 ? null : "09:00",
  horaFechamento: diaSemana === 0 ? null : "18:00",
  fechado: diaSemana === 0,
}));
const TERCA = "2026-09-08";
const AGORA = new Date("2026-09-08T11:15:00-03:00");
const EQUIPE: ProfissionalDaLista[] = [
  { id: "bb1", nome: "Rafael", tom: 0 },
  { id: "m2", nome: "Ana", tom: 1 },
];

function agendamento(parcial: Partial<AgendamentoComCliente> & { id: string }): AgendamentoComCliente {
  return {
    data: TERCA,
    horaInicio: "11:00",
    horaFim: "11:30",
    status: "confirmado",
    origem: "cliente",
    observacoes: null,
    presencaConfirmadaEm: null,
    barbeiro: { id: "bb1", nome: "Rafael" },
    servicos: [{ servicoId: "s1", nome: "Corte", precoNoMomento: "40.00", duracaoNoMomento: 30 }],
    cliente: { id: "c1", nome: "João Silva", telefone: "(11) 99999-0001", email: null, temConta: false },
    ...parcial,
  };
}

function montar(entrada: {
  dias?: string[];
  agendamentos?: AgendamentoComCliente[];
  bloqueios?: BloqueioSerializado[];
  profissionais?: ProfissionalDaLista[];
  aoAbrir?: (id: string) => void;
  aoMarcar?: (data: string) => void;
  aoMostrarMais?: () => void;
}) {
  render(
    <ListaDaAgenda
      dias={entrada.dias ?? [TERCA]}
      agendamentos={entrada.agendamentos ?? []}
      bloqueios={entrada.bloqueios ?? []}
      horarios={HORARIOS}
      agora={AGORA}
      profissionais={entrada.profissionais}
      aoAbrir={entrada.aoAbrir ?? (() => {})}
      aoMarcar={entrada.aoMarcar ?? (() => {})}
      aoMostrarMais={entrada.aoMostrarMais ?? (() => {})}
    />
  );
}

const DE_HOJE = [
  agendamento({ id: "cedo1", horaInicio: "09:00", horaFim: "09:30", status: "concluido", cliente: { id: "c2", nome: "Diego", telefone: "", email: null, temConta: false } }),
  agendamento({ id: "cedo2", horaInicio: "10:00", horaFim: "10:30", status: "concluido", cliente: { id: "c3", nome: "Marcos", telefone: "", email: null, temConta: false } }),
  agendamento({ id: "agora", horaInicio: "11:00", horaFim: "11:30" }),
  agendamento({ id: "depois", horaInicio: "14:00", horaFim: "14:30", status: "pendente", cliente: { id: "c4", nome: "Pedro", telefone: "", email: null, temConta: false } }),
];

describe("ListaDaAgenda", () => {
  it("põe os cartões de cada dia em ordem de horário", () => {
    montar({
      dias: [TERCA, "2026-09-09"],
      agendamentos: [
        agendamento({ id: "b", data: "2026-09-09", horaInicio: "15:00", horaFim: "15:30" }),
        agendamento({ id: "a2", data: "2026-09-09", horaInicio: "09:00", horaFim: "09:30", cliente: { id: "c9", nome: "Caio", telefone: "", email: null, temConta: false } }),
      ],
    });

    const quarta = screen.getByRole("region", { name: "9 de setembro" });
    const cartoes = within(quarta).getAllByRole("button");
    expect(cartoes[0]).toHaveTextContent("Caio");
    expect(cartoes[1]).toHaveTextContent("João Silva");
  });

  it("o cancelado não aparece", () => {
    montar({ dias: ["2026-09-09"], agendamentos: [agendamento({ id: "x", data: "2026-09-09", status: "cancelado" })] });

    expect(screen.queryByRole("button", { name: /João Silva/ })).not.toBeInTheDocument();
  });

  it("hoje recolhe o que já acabou em Mais cedo, e abre no toque", async () => {
    montar({ agendamentos: DE_HOJE });

    const botao = screen.getByRole("button", { name: "Mais cedo · 2 atendidos" });
    expect(botao).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: /Diego/ })).not.toBeInTheDocument();
    // O que está acontecendo continua à vista.
    expect(screen.getByRole("button", { name: /João Silva/ })).toHaveTextContent("em atendimento");

    await userEvent.click(botao);

    expect(botao).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: /Diego/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Marcos/ })).toBeInTheDocument();
  });

  it("a régua do agora fica entre o que já começou e o próximo", () => {
    montar({ agendamentos: DE_HOJE });

    const regua = screen.getByRole("separator", { name: "Agora, 11:15" });
    const agora = screen.getByRole("button", { name: /João Silva/ }).closest("li")!;
    const depois = screen.getByRole("button", { name: /Pedro/ }).closest("li")!;
    expect(agora.nextElementSibling).toBe(regua);
    expect(regua.nextElementSibling).toBe(depois);
  });

  it("fora de hoje, sem régua e sem Mais cedo", () => {
    montar({ dias: ["2026-09-09"], agendamentos: [agendamento({ id: "q", data: "2026-09-09" })] });

    expect(screen.queryByTestId("regua-da-lista")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Mais cedo/ })).not.toBeInTheDocument();
  });

  it("o cartão diz o status: aguardando confirmação no pendente", () => {
    montar({ agendamentos: DE_HOJE });

    const pedro = screen.getByRole("button", { name: /Pedro/ });
    expect(pedro).toHaveTextContent("14:00 – 14:30 · aguardando confirmação");
    expect(pedro).toHaveAttribute("data-status", "pendente");
  });

  it("tocar no cartão abre o agendamento", async () => {
    const aoAbrir = vi.fn();
    montar({ dias: ["2026-09-09"], agendamentos: [agendamento({ id: "q", data: "2026-09-09" })], aoAbrir });

    await userEvent.click(screen.getByRole("button", { name: /João Silva/ }));

    expect(aoAbrir).toHaveBeenCalledWith("q");
  });

  it("o bloqueio aparece listrado entre os cartões, com o nome de quem", () => {
    montar({
      dias: ["2026-09-09"],
      profissionais: EQUIPE,
      agendamentos: [agendamento({ id: "q", data: "2026-09-09", horaInicio: "13:00", horaFim: "13:30" })],
      bloqueios: [
        {
          id: "x1",
          barbeiroId: "m2",
          dataInicio: "2026-09-09",
          dataFim: "2026-09-09",
          horaInicio: "12:00",
          horaFim: "13:00",
          motivo: "Almoço",
        },
      ],
    });

    const quarta = screen.getByRole("region", { name: "9 de setembro" });
    const itens = within(quarta).getAllByRole("listitem");
    expect(itens[0]).toHaveTextContent("12:00 – 13:00 · Almoço · Ana");
    expect(itens[1]).toHaveTextContent("João Silva");
  });

  it("com dois ou mais profissionais, o cartão diz com quem", () => {
    montar({ dias: ["2026-09-09"], profissionais: EQUIPE, agendamentos: [agendamento({ id: "q", data: "2026-09-09", barbeiro: { id: "m2", nome: "Ana" } })] });

    expect(screen.getByRole("button", { name: /João Silva/ })).toHaveTextContent("Ana");
  });

  it("com um só, o nome não se repete no cartão", () => {
    montar({
      dias: ["2026-09-09"],
      profissionais: [EQUIPE[0]],
      agendamentos: [agendamento({ id: "q", data: "2026-09-09" })],
    });

    expect(screen.getByRole("button", { name: /João Silva/ })).not.toHaveTextContent("Rafael");
  });

  it("domingo fechado diz Fechado", () => {
    montar({ dias: ["2026-09-13"] });

    expect(within(screen.getByRole("region", { name: "13 de setembro" })).getByText("Fechado")).toBeInTheDocument();
  });

  it("dia aberto e vazio leva pro novo agendamento naquela data", async () => {
    const aoMarcar = vi.fn();
    montar({ dias: ["2026-09-10"], aoMarcar });

    await userEvent.click(screen.getByRole("button", { name: "Nenhum horário. Toque para marcar." }));

    expect(aoMarcar).toHaveBeenCalledWith("2026-09-10");
  });

  it("dia passado e vazio não oferece marcar", () => {
    montar({ dias: ["2026-09-07"] });

    expect(screen.getByText("Nenhum agendamento.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Toque para marcar/ })).not.toBeInTheDocument();
  });

  it("a virada da semana ganha um separador", () => {
    montar({ dias: ["2026-09-12", "2026-09-13", "2026-09-14"] });

    expect(screen.getByRole("separator", { name: "Semana de 13 – 19 set" })).toBeInTheDocument();
  });

  it("a semana que vira o mês diz os dois", () => {
    montar({ dias: ["2026-09-26", "2026-09-27"] });

    expect(screen.getByRole("separator", { name: "Semana de 27 set – 3 out" })).toBeInTheDocument();
  });

  it("o dia de hoje tem o título com o dia da semana pro leitor", () => {
    montar({});

    expect(screen.getByRole("heading", { name: "terça, 8 de setembro" })).toBeInTheDocument();
  });

  it("Mostrar mais 14 dias avisa a tela", async () => {
    const aoMostrarMais = vi.fn();
    montar({ aoMostrarMais });

    await userEvent.click(screen.getByRole("button", { name: "Mostrar mais 14 dias" }));

    expect(aoMostrarMais).toHaveBeenCalled();
  });
});
