import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { criarApiClientFalso } from "@barchop/api-client";
import type { HorarioSerializado } from "@barchop/types";
import { HorariosDaBarbearia } from "../../../src/telas/painel/configuracoes/HorariosDaBarbearia";
import { navegacaoFalsa } from "../../ajudantes/navegacao";
import { montarPainel } from "../../ajudantes/painel";

// Horários com a rotina da semana (painel v2, marco 2, PR C). O dublê
// abre de segunda a sábado, 09:00–18:00.

function comSalvarEspiado() {
  const falso = criarApiClientFalso();
  const original = falso.barbeiro.salvarHorarios;
  const salvar = vi.fn(async (horarios: HorarioSerializado[]) => original(horarios));
  falso.barbeiro.salvarHorarios = salvar;
  return { falso, salvar };
}

function rotina() {
  return screen.getByRole("region", { name: "A rotina da semana" });
}

describe("horários com rotina", () => {
  beforeEach(() => {
    localStorage.clear();
    navegacaoFalsa.redefinir({ pathname: "/painel/configuracoes/horarios" });
  });

  it("chega com a rotina lida da semana salva", async () => {
    montarPainel(<HorariosDaBarbearia />, criarApiClientFalso());

    await screen.findByRole("region", { name: "A rotina da semana" });
    expect(within(rotina()).getByRole("checkbox", { name: "Seg" })).toBeChecked();
    expect(within(rotina()).getByRole("checkbox", { name: "Sáb" })).toBeChecked();
    expect(within(rotina()).getByRole("checkbox", { name: "Dom" })).not.toBeChecked();
    expect(within(rotina()).getByLabelText("Rotina: abre")).toHaveValue("09:00");
    expect(within(rotina()).getByText("Resultado: Seg a sáb, 09:00–18:00")).toBeInTheDocument();
  });

  it("o atalho preenche a rotina, sem mexer na semana ainda", async () => {
    montarPainel(<HorariosDaBarbearia />, criarApiClientFalso());

    await userEvent.click(await screen.findByRole("button", { name: /seg a sex · 9–18/i }));

    expect(within(rotina()).getByRole("checkbox", { name: "Sáb" })).not.toBeChecked();
    expect(within(rotina()).getByText("Resultado: Seg a sex, 09:00–18:00")).toBeInTheDocument();
    // A semana só muda no "Aplicar": sábado continua aberto.
    expect(screen.getByLabelText("Abre na sábado")).toBeInTheDocument();
  });

  it("aplicar leva a rotina pra semana, e salvar manda os sete dias", async () => {
    const { falso, salvar } = comSalvarEspiado();
    montarPainel(<HorariosDaBarbearia />, falso);

    await userEvent.click(await screen.findByRole("button", { name: /seg a sex · 9–18/i }));
    await userEvent.click(screen.getByRole("button", { name: "Aplicar à semana" }));

    expect(screen.queryByLabelText("Abre na sábado")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /salvar horários/i }));

    await waitFor(() => expect(salvar).toHaveBeenCalled());
    const enviada = salvar.mock.calls[0][0];
    expect(enviada).toHaveLength(7);
    expect(enviada.find((dia) => dia.diaSemana === 6)).toMatchObject({ fechado: true });
    expect(enviada.find((dia) => dia.diaSemana === 1)).toMatchObject({
      fechado: false,
      horaAbertura: "09:00",
      horaFechamento: "18:00",
    });
  });

  it("marcar e desmarcar dias muda a frase do resultado", async () => {
    montarPainel(<HorariosDaBarbearia />, criarApiClientFalso());

    await userEvent.click(await within(await screen.findByRole("region", { name: "A rotina da semana" })).findByRole("checkbox", { name: "Dom" }));

    expect(within(rotina()).getByText("Resultado: Todos os dias, 09:00–18:00")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Aplicar à semana" })).toBeInTheDocument();
  });

  it("rotina que fecha antes de abrir avisa no campo e não aplica", async () => {
    const { falso, salvar } = comSalvarEspiado();
    montarPainel(<HorariosDaBarbearia />, falso);

    const fecha = await screen.findByLabelText("Rotina: fecha");
    await userEvent.clear(fecha);
    await userEvent.type(fecha, "08:00");
    await userEvent.click(screen.getByRole("button", { name: "Aplicar à semana" }));

    expect(await screen.findByText(/fechar depois de abrir/i)).toBeInTheDocument();
    expect(screen.getByLabelText("Fecha na segunda")).toHaveValue("18:00");
    expect(salvar).not.toHaveBeenCalled();
  });

  it("um dia mexido à mão fica marcado como diferente da rotina", async () => {
    montarPainel(<HorariosDaBarbearia />, criarApiClientFalso());

    const semana = await screen.findByRole("region", { name: "A semana" });
    expect(within(semana).queryByText("Diferente da rotina")).not.toBeInTheDocument();

    const fechaSexta = screen.getByLabelText("Fecha na sexta");
    await userEvent.clear(fechaSexta);
    await userEvent.type(fechaSexta, "20:00");

    expect(within(semana).getAllByText("Diferente da rotina")).toHaveLength(1);
  });
});
