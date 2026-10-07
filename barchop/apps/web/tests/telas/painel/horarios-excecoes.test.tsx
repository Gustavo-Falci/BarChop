import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { criarApiClientFalso } from "@barchop/api-client";
import { HorariosDaBarbearia } from "../../../src/telas/painel/configuracoes/HorariosDaBarbearia";
import { navegacaoFalsa } from "../../ajudantes/navegacao";
import { montarPainel } from "../../ajudantes/painel";

// Painel v2, marco 3 (3d): as exceções por data em Horários — fechar num
// feriado ou mudar o horário de um dia, pra toda a equipe.

const NATAL = { data: "2037-12-25", fechado: true, horaAbertura: null, horaFechamento: null, motivo: "Natal" };

function datas() {
  return screen.getByRole("region", { name: "Datas especiais" });
}

async function abrir(falso = criarApiClientFalso()) {
  montarPainel(<HorariosDaBarbearia />, falso);
  await screen.findByRole("region", { name: "Datas especiais" });
  return falso;
}

describe("datas especiais em Horários", () => {
  beforeEach(() => {
    localStorage.clear();
    navegacaoFalsa.redefinir({ pathname: "/painel/configuracoes/horarios" });
  });

  it("lista as datas salvas com o que vale em cada uma", async () => {
    await abrir(
      criarApiClientFalso({
        excecoesDeHorario: [
          NATAL,
          { data: "2037-12-31", fechado: false, horaAbertura: "09:00", horaFechamento: "13:00", motivo: null },
        ],
      })
    );

    expect(await within(datas()).findByText(/25 de dezembro/)).toBeInTheDocument();
    expect(within(datas()).getByText(/Fechado · Natal/)).toBeInTheDocument();
    expect(within(datas()).getByText(/31 de dezembro/)).toBeInTheDocument();
    expect(within(datas()).getByText(/09:00–13:00/)).toBeInTheDocument();
  });

  it("sem nenhuma data, diz que não há", async () => {
    await abrir();

    expect(await within(datas()).findByText(/nenhuma data especial/i)).toBeInTheDocument();
  });

  it("fecha uma data com motivo", async () => {
    const falso = criarApiClientFalso();
    const salvar = vi.spyOn(falso.barbeiro, "salvarExcecaoDeHorario");
    await abrir(falso);

    fireEvent.change(within(datas()).getByLabelText("Data"), { target: { value: "2037-12-25" } });
    await userEvent.type(within(datas()).getByLabelText(/motivo/i), "Natal");
    await userEvent.click(within(datas()).getByRole("button", { name: "Adicionar data" }));

    await waitFor(() => expect(salvar).toHaveBeenCalled());
    expect(salvar).toHaveBeenCalledWith("2037-12-25", { fechado: true, motivo: "Natal" });
    expect(await within(datas()).findByText(/25 de dezembro/)).toBeInTheDocument();
  });

  it("muda o horário de uma data", async () => {
    const falso = criarApiClientFalso();
    const salvar = vi.spyOn(falso.barbeiro, "salvarExcecaoDeHorario");
    await abrir(falso);

    fireEvent.change(within(datas()).getByLabelText("Data"), { target: { value: "2037-12-31" } });
    await userEvent.click(within(datas()).getByRole("checkbox", { name: "Fechado o dia todo" }));
    fireEvent.change(within(datas()).getByLabelText("Abre na data"), { target: { value: "09:00" } });
    fireEvent.change(within(datas()).getByLabelText("Fecha na data"), { target: { value: "13:00" } });
    await userEvent.click(within(datas()).getByRole("button", { name: "Adicionar data" }));

    await waitFor(() => expect(salvar).toHaveBeenCalled());
    expect(salvar).toHaveBeenCalledWith("2037-12-31", {
      fechado: false,
      horaAbertura: "09:00",
      horaFechamento: "13:00",
      motivo: null,
    });
  });

  it("avisa quantos agendamentos já marcados ficam fora", async () => {
    const falso = criarApiClientFalso();
    vi.spyOn(falso.barbeiro, "salvarExcecaoDeHorario").mockResolvedValue({ excecao: NATAL, foraDoHorario: 2 });
    await abrir(falso);

    fireEvent.change(within(datas()).getByLabelText("Data"), { target: { value: "2037-12-25" } });
    await userEvent.click(within(datas()).getByRole("button", { name: "Adicionar data" }));

    expect(await within(datas()).findByText(/2 agendamentos já marcados/i)).toBeInTheDocument();
  });

  it("sem data, ou com o horário invertido, para na tela sem chamar a API", async () => {
    const falso = criarApiClientFalso();
    const salvar = vi.spyOn(falso.barbeiro, "salvarExcecaoDeHorario");
    await abrir(falso);

    await userEvent.click(within(datas()).getByRole("button", { name: "Adicionar data" }));
    expect(await within(datas()).findByText(/escolha a data/i)).toBeInTheDocument();

    fireEvent.change(within(datas()).getByLabelText("Data"), { target: { value: "2037-12-31" } });
    await userEvent.click(within(datas()).getByRole("checkbox", { name: "Fechado o dia todo" }));
    fireEvent.change(within(datas()).getByLabelText("Abre na data"), { target: { value: "13:00" } });
    fireEvent.change(within(datas()).getByLabelText("Fecha na data"), { target: { value: "09:00" } });
    await userEvent.click(within(datas()).getByRole("button", { name: "Adicionar data" }));

    expect(await within(datas()).findByText(/fechar depois de abrir/i)).toBeInTheDocument();
    expect(salvar).not.toHaveBeenCalled();
  });

  it("remove uma data", async () => {
    const falso = criarApiClientFalso({ excecoesDeHorario: [NATAL] });
    const apagar = vi.spyOn(falso.barbeiro, "apagarExcecaoDeHorario");
    await abrir(falso);

    await userEvent.click(await within(datas()).findByRole("button", { name: /remover.*25 de dezembro/i }));

    await waitFor(() => expect(apagar).toHaveBeenCalledWith("2037-12-25"));
    expect(await within(datas()).findByText(/nenhuma data especial/i)).toBeInTheDocument();
  });
});
