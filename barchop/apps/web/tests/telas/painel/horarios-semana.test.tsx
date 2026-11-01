import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { criarApiClientFalso } from "@barchop/api-client";
import type { HorarioSerializado } from "@barchop/types";
import { HorariosDaBarbearia } from "../../../src/telas/painel/configuracoes/HorariosDaBarbearia";
import { navegacaoFalsa } from "../../ajudantes/navegacao";
import { montarPainel } from "../../ajudantes/painel";

// Horários depois do redesenho das Configurações (01/11, decisão do dono):
// sai o cartão "A rotina da semana", que repetia a lista dos dias. Os
// atalhos preenchem a semana direto; cada dia tem um interruptor de
// aberto; o salvar é a barra de mudanças, como em Regras e Dados.
// O dublê abre de segunda a sábado, 09:00–18:00.

function comSalvarEspiado() {
  const falso = criarApiClientFalso();
  const original = falso.barbeiro.salvarHorarios;
  const salvar = vi.fn(async (horarios: HorarioSerializado[]) => original(horarios));
  falso.barbeiro.salvarHorarios = salvar;
  return { falso, salvar };
}

function semana() {
  return screen.getByRole("region", { name: "A semana" });
}

function barra() {
  return screen.getByRole("region", { name: "Mudanças" });
}

describe("horários: a semana", () => {
  beforeEach(() => {
    localStorage.clear();
    navegacaoFalsa.redefinir({ pathname: "/painel/configuracoes/horarios" });
  });

  it("sem o cartão da rotina: os dias e os atalhos moram na semana", async () => {
    montarPainel(<HorariosDaBarbearia />, criarApiClientFalso());

    await screen.findByRole("region", { name: "A semana" });
    expect(screen.queryByRole("region", { name: "A rotina da semana" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Aplicar à semana" })).not.toBeInTheDocument();
    expect(within(semana()).getByRole("group", { name: "Preencher a semana com" })).toBeInTheDocument();
  });

  it("cada dia tem um interruptor de aberto", async () => {
    montarPainel(<HorariosDaBarbearia />, criarApiClientFalso());

    expect(await screen.findByRole("switch", { name: "Aberto na segunda" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("switch", { name: "Aberto no domingo" })).toHaveAttribute("aria-checked", "false");
    expect(within(semana()).getByText("Fechado")).toBeInTheDocument();
  });

  it("o atalho preenche a semana na hora", async () => {
    montarPainel(<HorariosDaBarbearia />, criarApiClientFalso());

    await userEvent.click(await screen.findByRole("button", { name: /seg a sex · 9–18/i }));

    expect(screen.getByRole("switch", { name: "Aberto no sábado" })).toHaveAttribute("aria-checked", "false");
    expect(screen.queryByLabelText("Abre no sábado")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Abre na segunda")).toHaveValue("09:00");
  });

  it("desligar um dia fecha e limpa as horas; o salvar manda os sete", async () => {
    const { falso, salvar } = comSalvarEspiado();
    montarPainel(<HorariosDaBarbearia />, falso);

    await userEvent.click(await screen.findByRole("switch", { name: "Aberto na segunda" }));
    expect(screen.queryByLabelText("Abre na segunda")).not.toBeInTheDocument();
    await userEvent.click(within(barra()).getByRole("button", { name: "Salvar" }));

    await waitFor(() => expect(salvar).toHaveBeenCalled());
    const enviada = salvar.mock.calls[0][0];
    expect(enviada).toHaveLength(7);
    expect(enviada.find((dia) => dia.diaSemana === 1)).toMatchObject({
      fechado: true,
      horaAbertura: null,
      horaFechamento: null,
    });
  });

  it("religar um dia fechado usa o horário mais comum da semana", async () => {
    montarPainel(<HorariosDaBarbearia />, criarApiClientFalso());

    await userEvent.click(await screen.findByRole("switch", { name: "Aberto no domingo" }));

    expect(screen.getByLabelText("Abre no domingo")).toHaveValue("09:00");
    expect(screen.getByLabelText("Fecha no domingo")).toHaveValue("18:00");
  });

  it("a barra diz o que mudou, e descartar volta a semana salva", async () => {
    montarPainel(<HorariosDaBarbearia />, criarApiClientFalso());

    await userEvent.click(await screen.findByRole("switch", { name: "Aberto no sábado" }));

    expect(barra()).toHaveTextContent("1 mudança · Sábado: 09:00–18:00 → fechado");
    await userEvent.click(within(barra()).getByRole("button", { name: "Descartar" }));

    expect(screen.getByRole("switch", { name: "Aberto no sábado" })).toHaveAttribute("aria-checked", "true");
  });

  it("área ainda não decidida: a barra pede pra salvar mesmo sem mudança", async () => {
    montarPainel(<HorariosDaBarbearia />, criarApiClientFalso());

    await screen.findByRole("region", { name: "A semana" });
    expect(barra()).toHaveTextContent("Ainda não decidido");
  });

  it("hora que fecha antes de abrir para na tela, sem chamar a API", async () => {
    const { falso, salvar } = comSalvarEspiado();
    montarPainel(<HorariosDaBarbearia />, falso);

    const fecha = await screen.findByLabelText("Fecha na sexta");
    await userEvent.clear(fecha);
    await userEvent.type(fecha, "08:00");
    await userEvent.click(within(barra()).getByRole("button", { name: "Salvar" }));

    expect(await within(barra()).findByText(/sexta.*fechar depois de abrir/i)).toBeInTheDocument();
    expect(salvar).not.toHaveBeenCalled();
  });
});
