import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { criarApiClientFalso, ErroDaApi } from "@barchop/api-client";

import { formatarDataLonga } from "../../../src/formato/datas";
import { DetalheDoAgendamento } from "../../../src/telas/painel/DetalheDoAgendamento";
import { navegacaoFalsa } from "../../ajudantes/navegacao";
import { montarPainel } from "../../ajudantes/painel";

// Arrastar e reordenar, PR 6: "Mudar horário" no detalhe do agendamento,
// no lugar do "cancele e crie outro". Dia e horário livres, com quem
// (pra quem pode trocar) e o aviso por e-mail ao cliente, marcado.

const FUTURO = "2026-12-08";
const NOVO_DIA = "2026-12-09";

function semear({ papel = "dono", data = FUTURO }: { papel?: "dono" | "profissional"; data?: string } = {}) {
  return criarApiClientFalso({
    papel,
    clientes: [
      { id: "c1", nome: "João Silva", telefone: "(11) 99999-0001", email: "joao@exemplo.com", temConta: false },
    ],
    agendamentos: [
      {
        id: "a1",
        clienteId: "c1",
        data,
        horaInicio: "09:00",
        horaFim: "09:30",
        status: "confirmado",
        origem: "cliente",
        observacoes: null,
        servicos: [{ servicoId: "s1", nome: "Corte", precoNoMomento: "40.00", duracaoNoMomento: 30 }],
      },
    ],
    diasComVaga: { [NOVO_DIA]: true },
    horariosLivres: ["09:00", "10:00"],
  });
}

async function abrir() {
  await userEvent.click(await screen.findByRole("button", { name: "Mudar horário" }));
  return screen.getByRole("dialog", { name: "Mudar horário" });
}

async function escolherDiaEHora(janela: HTMLElement) {
  await userEvent.click(within(janela).getByRole("button", { name: formatarDataLonga(NOVO_DIA) }));
  await userEvent.click(await within(janela).findByRole("button", { name: "10:00" }));
}

describe("mudar horário pelo detalhe", () => {
  beforeEach(() => {
    localStorage.clear();
    navegacaoFalsa.redefinir({ pathname: "/painel/agendamentos/a1", params: { id: "a1" } });
  });

  it("escolhe dia e horário, avisa o cliente e vai pro agendamento novo", async () => {
    const falso = semear();
    const remarcar = vi.spyOn(falso.barbeiro, "remarcarAgendamento");
    montarPainel(<DetalheDoAgendamento />, falso);

    const janela = await abrir();
    await escolherDiaEHora(janela);
    expect(within(janela).getByRole("checkbox", { name: /avisar o cliente por e-mail/i })).toBeChecked();
    await userEvent.click(within(janela).getByRole("button", { name: "Mudar horário" }));

    await waitFor(() =>
      expect(remarcar).toHaveBeenCalledWith("a1", { data: NOVO_DIA, horaInicio: "10:00", avisarCliente: true })
    );
    await waitFor(() => expect(navegacaoFalsa.replace).toHaveBeenCalledWith("/painel/agendamentos/a2"));
  });

  it("horário que deixou de estar livre: a mensagem aparece na janela", async () => {
    const falso = semear();
    vi.spyOn(falso.barbeiro, "remarcarAgendamento").mockRejectedValue(
      new ErroDaApi(422, "horario_indisponivel", "esse horário não está mais livre")
    );
    montarPainel(<DetalheDoAgendamento />, falso);

    const janela = await abrir();
    await escolherDiaEHora(janela);
    await userEvent.click(within(janela).getByRole("button", { name: "Mudar horário" }));

    expect(await within(janela).findByRole("alert")).toHaveTextContent("esse horário não está mais livre");
  });

  it("o dono escolhe com quem", async () => {
    const dono = semear();
    dono.estado.equipe!.push({
      id: "m2",
      nome: "Ana",
      email: "ana@gr.com",
      telefone: null,
      papel: "profissional",
      atende: true,
      ativo: true,
      fotoUrl: null,
      convitePendente: false,
    });
    montarPainel(<DetalheDoAgendamento />, dono);

    expect(within(await abrir()).getByRole("combobox", { name: "Profissional" })).toBeInTheDocument();
  });

  it("pro profissional, a janela não oferece outro profissional", async () => {
    montarPainel(<DetalheDoAgendamento />, semear({ papel: "profissional" }));

    expect(within(await abrir()).queryByRole("combobox", { name: "Profissional" })).not.toBeInTheDocument();
  });

  it("agendamento que já passou não oferece mudar horário", async () => {
    montarPainel(<DetalheDoAgendamento />, semear({ data: "2026-09-08" }));

    expect(await screen.findByRole("heading", { level: 1, name: /João Silva/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mudar horário" })).not.toBeInTheDocument();
  });
});
