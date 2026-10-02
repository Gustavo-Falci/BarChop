import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { criarApiClientFalso } from "@barchop/api-client";
import { DashboardDoDia } from "../../../src/telas/painel/DashboardDoDia";
import { navegacaoFalsa } from "../../ajudantes/navegacao";
import { montarPainel } from "../../ajudantes/painel";

// Data fixa e instante fixo: teste que compara data fixa com o relógio
// real passa hoje e falha sozinho depois.
const AGORA = new Date("2026-09-08T10:00:00-03:00");
const HOJE = "2026-09-08";

function semear() {
  return criarApiClientFalso({
    clientes: [
      { id: "c1", nome: "João Silva", telefone: "(11) 99999-0001", email: null, temConta: false },
    ],
    agendamentos: [
      {
        id: "a1",
        clienteId: "c1",
        data: HOJE,
        horaInicio: "09:00",
        horaFim: "09:30",
        status: "confirmado",
        origem: "cliente",
        observacoes: null,
        servicos: [
          { servicoId: "s1", nome: "Corte", precoNoMomento: "40.00", duracaoNoMomento: 30 },
        ],
      },
    ],
  });
}

describe("dashboard do dia", () => {
  beforeEach(() => {
    localStorage.clear();
    navegacaoFalsa.redefinir({ pathname: "/painel" });
  });

  it("mostra a contagem, a ocupação e o previsto", async () => {
    montarPainel(<DashboardDoDia agora={AGORA} />, semear());

    expect(await screen.findByText("1")).toBeInTheDocument();
    // 30 dos 540 minutos entre 09:00 e 18:00.
    expect(screen.getByText("6%")).toBeInTheDocument();
    expect(screen.getByText("R$ 40,00")).toBeInTheDocument();
    // "Previsto", não "faturamento": o número é promessa, não caixa.
    expect(screen.getByText(/previsto/i)).toBeInTheDocument();
  });

  it("lista os agendamentos de hoje e leva ao detalhe", async () => {
    montarPainel(<DashboardDoDia agora={AGORA} />, semear());

    await userEvent.click(await screen.findByRole("button", { name: /João Silva/ }));

    expect(navegacaoFalsa.push).toHaveBeenCalledWith("/painel/agendamentos/a1");
  });

  it("num dia sem agendamento diz isso em vez de mostrar tabela vazia", async () => {
    montarPainel(<DashboardDoDia agora={AGORA} />, criarApiClientFalso({ agendamentos: [] }));

    expect(await screen.findByText(/nenhum agendamento hoje/i)).toBeInTheDocument();
  });
});
