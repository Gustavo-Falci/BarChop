import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { criarApiClientFalso } from "@barchop/api-client";
import { DetalheDoCliente } from "../../../src/telas/painel/DetalheDoCliente";
import { navegacaoFalsa } from "../../ajudantes/navegacao";
import { montarPainel } from "../../ajudantes/painel";

// O detalhe do cliente sem as duas caixas "Dados" e "Histórico" (pedido
// do dono): o histórico é o que se olha, as ações de falar e agendar
// ficam no topo, e os dados se editam ao lado, com o Salvar só quando
// algo mudou.

const AGORA = new Date("2026-09-08T10:00:00-03:00");

const servico = { servicoId: "s1", nome: "Corte", precoNoMomento: "40.00", duracaoNoMomento: 30 };

function semear() {
  return criarApiClientFalso({
    hoje: "2026-09-08",
    clientes: [
      { id: "c1", nome: "João Silva", telefone: "(11) 99999-0001", email: null, temConta: false },
    ],
    agendamentos: [
      {
        id: "a1",
        clienteId: "c1",
        data: "2026-08-30",
        horaInicio: "09:00",
        horaFim: "09:30",
        status: "concluido",
        origem: "cliente",
        observacoes: null,
        servicos: [servico],
      },
      {
        id: "a2",
        clienteId: "c1",
        data: "2026-09-15",
        horaInicio: "17:00",
        horaFim: "17:30",
        status: "confirmado",
        origem: "cliente",
        observacoes: null,
        servicos: [servico],
      },
    ],
  });
}

function montar() {
  navegacaoFalsa.redefinir({ pathname: "/painel/clientes/c1", params: { id: "c1" } });
  montarPainel(<DetalheDoCliente agora={AGORA} />, semear());
}

describe("detalhe do cliente", () => {
  beforeEach(() => localStorage.clear());

  it("no topo, falar no WhatsApp e agendar pra este cliente", async () => {
    montar();

    const zap = await screen.findByRole("link", { name: /whatsapp/i });
    expect(zap).toHaveAttribute("href", "https://wa.me/5511999990001");
    expect(screen.getByRole("link", { name: /agendar/i })).toHaveAttribute(
      "href",
      "/painel/agendamentos/novo?cliente=c1"
    );
    expect(screen.getByRole("link", { name: /clientes/i })).toHaveAttribute("href", "/painel/clientes");
  });

  it("o resumo diz quantos agendamentos, o próximo e o último", async () => {
    montar();

    expect(
      await screen.findByText("2 agendamentos · próximo em 15 de setembro · último em 30 de agosto")
    ).toBeInTheDocument();
  });

  it("o histórico separa os próximos dos anteriores, e cada um abre o agendamento", async () => {
    montar();

    const proximos = await screen.findByRole("region", { name: "Próximos" });
    const anteriores = screen.getByRole("region", { name: "Anteriores" });
    expect(within(proximos).getByRole("link", { name: /15 de setembro/i })).toHaveAttribute(
      "href",
      "/painel/agendamentos/a2"
    );
    expect(within(anteriores).getByRole("link", { name: /30 de agosto/i })).toHaveAttribute(
      "href",
      "/painel/agendamentos/a1"
    );
    expect(within(anteriores).getByText("concluído")).toBeInTheDocument();
  });

  it("Salvar só aparece quando um dado muda, e Descartar volta ao que era", async () => {
    montar();

    const nome = await screen.findByLabelText(/^nome/i);
    expect(screen.queryByRole("button", { name: /salvar/i })).toBeNull();

    await userEvent.clear(nome);
    await userEvent.type(nome, "João da Silva");
    expect(screen.getByRole("button", { name: /salvar/i })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /descartar/i }));
    expect(nome).toHaveValue("João Silva");
    expect(screen.queryByRole("button", { name: /salvar/i })).toBeNull();
  });

  it("salvar manda a edição e o botão some de novo", async () => {
    navegacaoFalsa.redefinir({ pathname: "/painel/clientes/c1", params: { id: "c1" } });
    const falso = semear();
    const atualizar = vi.spyOn(falso.barbeiro, "atualizarCliente");
    montarPainel(<DetalheDoCliente agora={AGORA} />, falso);

    const nome = await screen.findByLabelText(/^nome/i);
    await userEvent.clear(nome);
    await userEvent.type(nome, "João da Silva");
    await userEvent.click(screen.getByRole("button", { name: /salvar/i }));

    await waitFor(() =>
      expect(atualizar).toHaveBeenCalledWith("c1", expect.objectContaining({ nome: "João da Silva" }))
    );
    await waitFor(() => expect(screen.queryByRole("button", { name: /salvar/i })).toBeNull());
  });
});
