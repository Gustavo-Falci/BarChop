import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { criarApiClientFalso } from "@barchop/api-client";
import { Agenda } from "../../../src/telas/painel/Agenda";
import { DashboardDoDia } from "../../../src/telas/painel/DashboardDoDia";
import { navegacaoFalsa } from "../../ajudantes/navegacao";
import { montarPainel } from "../../ajudantes/painel";

// Onda 1, C3: a vista de dia da agenda com uma coluna por profissional.

// 2026-09-08 é uma terça-feira; oito da manhã, antes de abrir.
const AGORA = new Date("2026-09-08T08:00:00-03:00");

function semear(papel?: "dono" | "profissional" | "recepcao") {
  const falso = criarApiClientFalso({
    papel,
    bloqueios: [
      {
        id: "x1",
        barbeiroId: "m2",
        dataInicio: "2026-09-08",
        dataFim: "2026-09-08",
        horaInicio: "12:00",
        horaFim: "13:00",
        motivo: "Almoço",
      },
    ],
  });
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
  navegacaoFalsa.redefinir({
    pathname: "/painel/agenda",
    query: { vista: "dia", data: "2026-09-08" },
  });
});

describe("agenda da equipe", () => {
  it("o dia mostra uma coluna por quem atende, com o nome", async () => {
    montarPainel(<Agenda agora={AGORA} />, semear());

    const cabecalho = await screen.findByTestId("cabecalho-da-grade");
    await waitFor(() => expect(within(cabecalho).getByText("Ana")).toBeInTheDocument());
    expect(within(cabecalho).getByText("Rafael")).toBeInTheDocument();
  });

  it("o almoço da Ana aparece na coluna dela", async () => {
    montarPainel(<Agenda agora={AGORA} />, semear());

    expect(await screen.findByText(/almoço/i)).toBeInTheDocument();
  });

  it("criar a partir da coluna da Ana leva o profissional", async () => {
    montarPainel(<Agenda agora={AGORA} />, semear());
    const cabecalho = await screen.findByTestId("cabecalho-da-grade");
    await waitFor(() => within(cabecalho).getByText("Ana"));

    // Dois "09:00" livres, um por coluna; o segundo é o da Ana.
    const livres = screen.getAllByRole("button", { name: "09:00" });
    await userEvent.click(livres[1]);

    expect(navegacaoFalsa.push).toHaveBeenCalledWith(
      "/painel/agendamentos/novo?data=2026-09-08&hora=09%3A00&profissional=m2"
    );
  });

  it("o profissional vê só a própria agenda: uma coluna, sem divisão", async () => {
    montarPainel(<Agenda agora={AGORA} />, semear("profissional"));

    await screen.findByTestId("cabecalho-da-grade");
    expect(screen.queryByText("Ana")).not.toBeInTheDocument();
  });
});

describe("painel do dia da equipe", () => {
  // 2026-09-08 às 08:00, antes do primeiro horário.
  function comDoisAtendendo() {
    return criarApiClientFalso({
      agendamentos: [
        {
          id: "a1",
          data: "2026-09-08",
          horaInicio: "09:00",
          horaFim: "09:30",
          status: "confirmado",
          origem: "cliente",
          observacoes: null,
          barbeiro: { id: "bb1", nome: "Rafael" },
          servicos: [{ servicoId: "s1", nome: "Corte", precoNoMomento: "40.00", duracaoNoMomento: 30 }],
        },
        {
          id: "a2",
          data: "2026-09-08",
          horaInicio: "10:00",
          horaFim: "10:30",
          status: "confirmado",
          origem: "cliente",
          observacoes: null,
          barbeiro: { id: "m2", nome: "Ana" },
          servicos: [{ servicoId: "s1", nome: "Corte", precoNoMomento: "40.00", duracaoNoMomento: 30 }],
        },
      ],
    });
  }

  it("com mais de um profissional no dia, cada linha diz com quem", async () => {
    navegacaoFalsa.redefinir({ pathname: "/painel" });
    montarPainel(<DashboardDoDia agora={AGORA} />, comDoisAtendendo());

    expect(await screen.findByRole("button", { name: /10:00.*com ana/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /09:00.*com rafael/i })).toBeInTheDocument();
  });

  it("com um profissional só, a linha não repete o nome", async () => {
    navegacaoFalsa.redefinir({ pathname: "/painel" });
    montarPainel(<DashboardDoDia agora={AGORA} />, semear("profissional"));

    await screen.findByText(/agendamentos hoje/i);
    expect(screen.queryByText(/com rafael/i)).not.toBeInTheDocument();
  });
});
