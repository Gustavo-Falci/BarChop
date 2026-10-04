import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { criarApiClientFalso } from "@barchop/api-client";

import { NavegacaoDoPainel } from "../../../src/painel/NavegacaoDoPainel";
import { CadastroDeMembro } from "../../../src/telas/painel/CadastroDeMembro";
import { FolgasEBloqueios } from "../../../src/telas/painel/FolgasEBloqueios";
import { navegacaoFalsa } from "../../ajudantes/navegacao";
import { montarPainel } from "../../ajudantes/painel";

// Onda 1, B4: a semana de trabalho e os serviços de cada membro (na
// tela do membro) e a tela de folgas e bloqueios.

// Um instante fixo: a tela lista os bloqueios dos próximos 90 dias.
const AGORA = new Date("2037-01-01T12:00:00-03:00");

function comAna(semente: Parameters<typeof criarApiClientFalso>[0] = {}) {
  const falso = criarApiClientFalso(semente);
  falso.estado.equipe!.push({
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
  return falso;
}

beforeEach(() => {
  localStorage.clear();
  navegacaoFalsa.redefinir({ pathname: "/painel/equipe/m2", params: { id: "m2" } });
});

describe("jornada do membro", () => {
  it("troca a segunda pra horário próprio e salva a semana inteira", async () => {
    const falso = comAna();
    const salvar = vi.spyOn(falso.barbeiro, "salvarJornada");
    montarPainel(<CadastroDeMembro />, falso);

    await userEvent.selectOptions(await screen.findByLabelText("Jornada na segunda"), "proprio");
    fireEvent.change(screen.getByLabelText("Entrada na segunda"), { target: { value: "13:00" } });
    fireEvent.change(screen.getByLabelText("Saída na segunda"), { target: { value: "20:00" } });
    await userEvent.click(screen.getByRole("button", { name: /salvar jornada/i }));

    await waitFor(() => expect(salvar).toHaveBeenCalled());
    const [id, semana] = salvar.mock.calls[0];
    expect(id).toBe("m2");
    expect(semana).toHaveLength(7);
    expect(semana[1]).toEqual({ diaSemana: 1, modo: "proprio", horaInicio: "13:00", horaFim: "20:00" });
    expect(semana[2]).toMatchObject({ modo: "barbearia" });
    expect(await screen.findByText(/jornada salva/i)).toBeInTheDocument();
  });

  it("horário próprio sem saída para na tela, sem chamar a API", async () => {
    const falso = comAna();
    const salvar = vi.spyOn(falso.barbeiro, "salvarJornada");
    montarPainel(<CadastroDeMembro />, falso);

    await userEvent.selectOptions(await screen.findByLabelText("Jornada na segunda"), "proprio");
    fireEvent.change(screen.getByLabelText("Entrada na segunda"), { target: { value: "13:00" } });
    await userEvent.click(screen.getByRole("button", { name: /salvar jornada/i }));

    expect(await screen.findByText(/segunda.*entrada e a saída/i)).toBeInTheDocument();
    expect(salvar).not.toHaveBeenCalled();
  });

  it("folga esconde as horas do dia", async () => {
    montarPainel(<CadastroDeMembro />, comAna());

    await userEvent.selectOptions(await screen.findByLabelText("Jornada no domingo"), "folga");

    expect(screen.queryByLabelText("Entrada no domingo")).not.toBeInTheDocument();
  });
});

describe("serviços do membro", () => {
  it("desmarca a barba e salva a lista inteira", async () => {
    const falso = comAna();
    const salvar = vi.spyOn(falso.barbeiro, "salvarServicosDoMembro");
    montarPainel(<CadastroDeMembro />, falso);

    const barba = await screen.findByRole("checkbox", { name: "Barba" });
    expect(barba).toBeChecked();
    await userEvent.click(barba);
    await userEvent.click(screen.getByRole("button", { name: /salvar serviços/i }));

    await waitFor(() => expect(salvar).toHaveBeenCalledWith("m2", ["s1"]));
    expect(await screen.findByText(/serviços salvos/i)).toBeInTheDocument();
  });
});

describe("folgas e bloqueios", () => {
  beforeEach(() => navegacaoFalsa.redefinir({ pathname: "/painel/bloqueios" }));

  it("lista os bloqueios dos próximos dias com o nome de quem e o motivo", async () => {
    const falso = comAna({
      bloqueios: [
        {
          id: "x1",
          barbeiroId: "m2",
          dataInicio: "2037-01-05",
          dataFim: "2037-01-09",
          horaInicio: null,
          horaFim: null,
          motivo: "Férias",
        },
      ],
    });
    montarPainel(<FolgasEBloqueios agora={AGORA} />, falso);

    const item = (await screen.findByText("Férias")).closest("li") as HTMLElement;
    expect(within(item).getByText("Ana")).toBeInTheDocument();
    expect(within(item).getByText(/dia inteiro/i)).toBeInTheDocument();
  });

  it("bloqueia o almoço da Ana numa faixa de horas", async () => {
    const falso = comAna();
    const criar = vi.spyOn(falso.barbeiro, "criarBloqueio");
    montarPainel(<FolgasEBloqueios agora={AGORA} />, falso);

    // Espera a opção, e não só o <select>: ele aparece antes de a equipe
    // chegar, vazio — sob carga o selectOptions corria contra a lista.
    await screen.findByRole("option", { name: "Ana" });
    await userEvent.selectOptions(screen.getByLabelText("Membro"), "m2");
    fireEvent.change(screen.getByLabelText("De"), { target: { value: "2037-01-12" } });
    fireEvent.change(screen.getByLabelText("Até"), { target: { value: "2037-01-16" } });
    await userEvent.click(screen.getByRole("checkbox", { name: /dia inteiro/i }));
    fireEvent.change(screen.getByLabelText("Das"), { target: { value: "12:00" } });
    fireEvent.change(screen.getByLabelText("Às"), { target: { value: "13:00" } });
    await userEvent.type(screen.getByLabelText(/motivo/i), "Almoço");
    await userEvent.click(screen.getByRole("button", { name: /^bloquear$/i }));

    await waitFor(() =>
      expect(criar).toHaveBeenCalledWith({
        barbeiroId: "m2",
        dataInicio: "2037-01-12",
        dataFim: "2037-01-16",
        horaInicio: "12:00",
        horaFim: "13:00",
        motivo: "Almoço",
      })
    );
    expect(await screen.findByText("Almoço")).toBeInTheDocument();
  });

  it("período invertido para na tela, sem chamar a API", async () => {
    const falso = comAna();
    const criar = vi.spyOn(falso.barbeiro, "criarBloqueio");
    montarPainel(<FolgasEBloqueios agora={AGORA} />, falso);

    fireEvent.change(await screen.findByLabelText("De"), { target: { value: "2037-01-16" } });
    fireEvent.change(screen.getByLabelText("Até"), { target: { value: "2037-01-12" } });
    await userEvent.click(screen.getByRole("button", { name: /^bloquear$/i }));

    expect(await screen.findByText(/termina antes de começar/i)).toBeInTheDocument();
    expect(criar).not.toHaveBeenCalled();
  });

  it("remove um bloqueio", async () => {
    const falso = comAna({
      bloqueios: [
        {
          id: "x1",
          barbeiroId: "bb1",
          dataInicio: "2037-01-05",
          dataFim: "2037-01-05",
          horaInicio: null,
          horaFim: null,
          motivo: "Médico",
        },
      ],
    });
    const apagar = vi.spyOn(falso.barbeiro, "apagarBloqueio");
    montarPainel(<FolgasEBloqueios agora={AGORA} />, falso);

    const item = (await screen.findByText("Médico")).closest("li") as HTMLElement;
    await userEvent.click(within(item).getByRole("button", { name: /remover/i }));

    await waitFor(() => expect(apagar).toHaveBeenCalledWith("x1"));
    await waitFor(() => expect(screen.queryByText("Médico")).not.toBeInTheDocument());
  });

  it("o profissional bloqueia só a própria agenda: sem escolher membro", async () => {
    const falso = comAna({ papel: "profissional" });
    const criar = vi.spyOn(falso.barbeiro, "criarBloqueio");
    montarPainel(<FolgasEBloqueios agora={AGORA} />, falso);

    fireEvent.change(await screen.findByLabelText("De"), { target: { value: "2037-01-05" } });
    fireEvent.change(screen.getByLabelText("Até"), { target: { value: "2037-01-05" } });
    expect(screen.queryByLabelText("Membro")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /^bloquear$/i }));

    await waitFor(() =>
      expect(criar).toHaveBeenCalledWith(expect.objectContaining({ barbeiroId: "bb1" }))
    );
  });

  it("todo papel vê Folgas na barra", async () => {
    montarPainel(<NavegacaoDoPainel />, criarApiClientFalso({ papel: "profissional" }));

    expect(await screen.findByRole("link", { name: /folgas/i })).toHaveAttribute(
      "href",
      "/painel/bloqueios"
    );
  });
});
