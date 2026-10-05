import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { criarApiClientFalso } from "@barchop/api-client";
import { ConfiguracoesDaBarbearia } from "../../../src/telas/painel/ConfiguracoesDaBarbearia";
import { DetalheDoAgendamento } from "../../../src/telas/painel/DetalheDoAgendamento";
import { navegacaoFalsa } from "../../ajudantes/navegacao";
import { montarPainel } from "../../ajudantes/painel";

function semear(status = "pendente", presencaConfirmadaEm: string | null = null) {
  return criarApiClientFalso({
    clientes: [
      { id: "c1", nome: "João Silva", telefone: "(11) 99999-0001", email: null, temConta: false },
    ],
    agendamentos: [
      {
        id: "a1",
        clienteId: "c1",
        data: "2026-09-08",
        horaInicio: "09:00",
        horaFim: "09:30",
        status,
        origem: "cliente",
        observacoes: null,
        presencaConfirmadaEm,
        servicos: [
          { servicoId: "s1", nome: "Corte", precoNoMomento: "40.00", duracaoNoMomento: 30 },
        ],
      },
    ],
  });
}

describe("lembrete no detalhe do agendamento", () => {
  beforeEach(() => {
    localStorage.clear();
    navegacaoFalsa.redefinir({ pathname: "/painel/agendamentos/a1", params: { id: "a1" } });
  });

  it("mostra o selo quando o cliente confirmou presença pelo link", async () => {
    montarPainel(<DetalheDoAgendamento />, semear("confirmado", "2026-09-07T15:00:00.000Z"));

    expect(await screen.findByText(/confirmou presença/i)).toBeInTheDocument();
  });

  it("sem confirmação, sem selo", async () => {
    montarPainel(<DetalheDoAgendamento />, semear());

    await screen.findByText(/João Silva/);
    expect(screen.queryByText(/confirmou presença/i)).toBeNull();
  });

  it("o lembrar pelo WhatsApp é um link pronto, aberto em outra aba", async () => {
    // Link de verdade, buscado ao carregar, e não um window.open depois
    // de um await: o navegador bloqueia a janela que não nasce direto do
    // clique.
    montarPainel(<DetalheDoAgendamento />, semear());

    const link = await screen.findByRole("link", { name: /lembrar pelo whatsapp/i });

    expect(link.getAttribute("href")).toMatch(/^https:\/\/wa\.me\/5511999990001\?text=/);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
  });

  it("cancelado não oferece lembrete", async () => {
    montarPainel(<DetalheDoAgendamento />, semear("cancelado"));

    await screen.findByText(/João Silva/);
    await waitFor(() => expect(screen.queryByRole("link", { name: /whatsapp/i })).toBeNull());
  });
});

describe("antecedência do lembrete nas configurações", () => {
  beforeEach(() => {
    localStorage.clear();
    navegacaoFalsa.redefinir({ pathname: "/painel/configuracoes" });
  });

  it("chega com a antecedência salva e troca por outra", async () => {
    const falso = criarApiClientFalso();
    const original = falso.barbeiro.atualizarMinhaBarbearia;
    const atualizar = vi.fn(original);
    falso.barbeiro.atualizarMinhaBarbearia = atualizar;
    montarPainel(<ConfiguracoesDaBarbearia />, falso);

    const seletor = await screen.findByLabelText(/quando o lembrete sai/i);
    await screen.findByRole("option", { name: /24 horas antes/i });
    expect(seletor).toHaveValue("24");

    await userEvent.selectOptions(seletor, "2");
    await userEvent.click(screen.getByRole("button", { name: /salvar lembrete/i }));

    await waitFor(() =>
      expect(atualizar).toHaveBeenCalledWith({ lembreteAtivo: true, lembreteAntecedenciaHoras: 2 })
    );
    expect((await falso.barbeiro.minhaBarbearia()).lembreteAntecedenciaHoras).toBe(2);
  });

  it("avisa que a troca vale pros próximos agendamentos", async () => {
    montarPainel(<ConfiguracoesDaBarbearia />, criarApiClientFalso());

    expect(await screen.findByText(/próximos agendamentos/i)).toBeInTheDocument();
  });
});
