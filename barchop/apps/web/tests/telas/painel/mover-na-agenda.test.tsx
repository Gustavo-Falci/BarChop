import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { criarApiClientFalso } from "@barchop/api-client";

import { JanelaDeMover } from "../../../src/telas/painel/agenda/JanelaDeMover";
import { navegacaoFalsa } from "../../ajudantes/navegacao";
import { montarPainel } from "../../ajudantes/painel";

// Arrastar e reordenar, PR 7: soltar um agendamento na agenda não muda
// nada sozinho — abre esta confirmação curta, com o "avisar o cliente"
// marcado. Evita o arrasto acidental no dia corrido.

function semear() {
  return criarApiClientFalso({
    clientes: [{ id: "c1", nome: "João Silva", telefone: "(11) 99999-0001", email: "joao@exemplo.com", temConta: false }],
    agendamentos: [
      {
        id: "a1",
        clienteId: "c1",
        data: "2026-12-08",
        horaInicio: "10:00",
        horaFim: "10:30",
        status: "confirmado",
        origem: "cliente",
        observacoes: null,
        servicos: [{ servicoId: "s1", nome: "Corte", precoNoMomento: "40.00", duracaoNoMomento: 30 }],
      },
    ],
  });
}

async function montar(aoMover = vi.fn(), aoFechar = vi.fn()) {
  const falso = semear();
  const agendamento = await falso.barbeiro.agendamento("a1");
  const remarcar = vi.spyOn(falso.barbeiro, "remarcarAgendamento");
  montarPainel(
    <JanelaDeMover
      agendamento={agendamento}
      destino={{ data: "2026-12-08", horaInicio: "11:15", horaFim: "11:45" }}
      aoMover={aoMover}
      aoFechar={aoFechar}
    />,
    falso
  );
  const janela = await screen.findByRole("dialog", { name: /mover/i });
  return { janela, remarcar, aoMover, aoFechar };
}

describe("confirmar o arrasto na agenda", () => {
  beforeEach(() => {
    localStorage.clear();
    navegacaoFalsa.redefinir({ pathname: "/painel/agenda" });
  });

  it("diz de onde pra onde, com quem é, e o aviso por e-mail vem marcado", async () => {
    const { janela } = await montar();

    expect(janela).toHaveTextContent("João Silva");
    expect(janela).toHaveTextContent("10:00");
    expect(janela).toHaveTextContent("11:15");
    expect(within(janela).getByRole("checkbox", { name: /avisar o cliente por e-mail/i })).toBeChecked();
  });

  it("confirmar chama o remarcar e entrega o agendamento novo", async () => {
    const { janela, remarcar, aoMover } = await montar();

    await userEvent.click(within(janela).getByRole("button", { name: "Mover" }));

    await waitFor(() =>
      expect(remarcar).toHaveBeenCalledWith("a1", { data: "2026-12-08", horaInicio: "11:15", avisarCliente: true })
    );
    await waitFor(() => expect(aoMover).toHaveBeenCalledWith(expect.objectContaining({ horaInicio: "11:15" })));
  });

  it("cancelar não muda nada", async () => {
    const { janela, remarcar, aoFechar } = await montar();

    await userEvent.click(within(janela).getByRole("button", { name: "Cancelar" }));

    expect(remarcar).not.toHaveBeenCalled();
    await waitFor(() => expect(aoFechar).toHaveBeenCalled());
  });
});
