import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { criarApiClientFalso } from "@barchop/api-client";
import type { DiaDaJornada } from "@barchop/types";
import { Agenda } from "../../../src/telas/painel/Agenda";
import { DetalheDoAgendamento } from "../../../src/telas/painel/DetalheDoAgendamento";
import { navegacaoFalsa } from "../../ajudantes/navegacao";
import { montarPainel } from "../../ajudantes/painel";

// O encaixe à vista na agenda (pedido do barbeiro, 08/11/2026; PR 4):
// a etiqueta no cartão, a linha "Livre" entre dois atendimentos e a
// linha do encaixe no detalhe. 2026-09-09 é uma quarta; agora é a
// terça, 8.
const AGORA = new Date("2026-09-08T10:00:00-03:00");
const QUARTA = "2026-09-09";

const corte = (duracaoNoMomento = 30) => ({
  servicoId: "s1",
  nome: "Corte",
  precoNoMomento: "40.00",
  duracaoNoMomento,
});

function marcado(id: string, horaInicio: string, horaFim: string, duracao = 30) {
  return {
    id,
    clienteId: "c1",
    data: QUARTA,
    horaInicio,
    horaFim,
    status: "confirmado" as const,
    origem: "barbeiro" as const,
    observacoes: null,
    servicos: [corte(duracao)],
  };
}

function jornadaComAlmoco(): DiaDaJornada[] {
  return [0, 1, 2, 3, 4, 5, 6].map((diaSemana) => ({
    diaSemana,
    modo: diaSemana === 0 ? "folga" : "barbearia",
    horaInicio: null,
    horaFim: null,
    pausaInicio: diaSemana >= 1 && diaSemana <= 5 ? "12:00" : null,
    pausaFim: diaSemana >= 1 && diaSemana <= 5 ? "13:00" : null,
  }));
}

function semear() {
  return criarApiClientFalso({
    clientes: [{ id: "c1", nome: "João Silva", telefone: "(11) 99999-0001", email: null, temConta: false }],
    jornadas: { bb1: jornadaComAlmoco() },
    agendamentos: [
      marcado("a1", "09:00", "09:30"),
      marcado("a2", "09:40", "10:30"),
      // O encaixe: 15 min de um Corte de 30.
      marcado("a3", "10:30", "10:45"),
      marcado("a4", "11:00", "11:30"),
      marcado("a5", "13:00", "13:40", 40),
    ],
  });
}

function comAna(falso: ReturnType<typeof criarApiClientFalso>) {
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
    podeVenderPlanos: false,
  });
  return falso;
}

async function quarta() {
  const lista = await screen.findByTestId("lista-da-agenda");
  return within(lista).getByRole("region", { name: "9 de setembro" });
}

describe("encaixe na lista da agenda", () => {
  beforeEach(() => {
    localStorage.clear();
    navegacaoFalsa.redefinir({ pathname: "/painel/agenda", query: { vista: "lista", data: "2026-09-08" } });
  });

  it("o encaixe ganha a etiqueta e diz quanto o serviço tem", async () => {
    montarPainel(<Agenda agora={AGORA} />, semear());

    const dia = await quarta();
    const cartao = within(dia).getByRole("button", { name: /10:30 – 10:45/ });
    expect(within(cartao).getByText("Encaixe")).toBeInTheDocument();
    expect(cartao).toHaveTextContent("10:30 – 10:45 · 15 min (o serviço tem 30)");
    // O de tamanho cheio, não.
    expect(within(within(dia).getByRole("button", { name: /09:00 – 09:30/ })).queryByText("Encaixe")).toBeNull();
  });

  it("entre dois atendimentos, a linha Livre; com menos de 30 min, Encaixar", async () => {
    montarPainel(<Agenda agora={AGORA} />, semear());

    const dia = await quarta();
    expect(await within(dia).findByText("Livre 09:30 – 09:40 · 10 min")).toBeInTheDocument();
    expect(within(dia).getByText("Livre 10:45 – 11:00 · 15 min")).toBeInTheDocument();

    await userEvent.click(within(dia).getByRole("button", { name: "Encaixar às 09:30" }));

    expect(navegacaoFalsa.push).toHaveBeenCalledWith(
      `/painel/agendamentos/novo?data=${QUARTA}&hora=09:30&duracao=10&profissional=bb1`
    );
  });

  it("a pausa aparece e corta o buraco: antes dela, 30 min é Marcar", async () => {
    montarPainel(<Agenda agora={AGORA} />, semear());

    const dia = await quarta();
    expect(await within(dia).findByText("12:00 – 13:00 · Pausa")).toBeInTheDocument();
    expect(within(dia).getByText("Livre 11:30 – 12:00 · 30 min")).toBeInTheDocument();
    expect(within(dia).queryByText(/Livre 12:00/)).toBeNull();
    // Depois do último, não: aí é o horário livre de sempre.
    expect(within(dia).queryByText(/Livre 13:40/)).toBeNull();

    await userEvent.click(within(dia).getByRole("button", { name: "Marcar às 11:30" }));

    expect(navegacaoFalsa.push).toHaveBeenCalledWith(
      `/painel/agendamentos/novo?data=${QUARTA}&hora=11:30&profissional=bb1`
    );
  });

  it("dia que já passou não oferece buraco", async () => {
    navegacaoFalsa.redefinir({ pathname: "/painel/agenda", query: { vista: "lista", data: "2026-09-08" } });
    montarPainel(<Agenda agora={new Date("2026-09-10T10:00:00-03:00")} />, semear());

    const lista = await screen.findByTestId("lista-da-agenda");
    const dia = within(lista).getByRole("region", { name: "9 de setembro" });
    await within(dia).findByRole("button", { name: /10:30 – 10:45/ });
    expect(within(dia).queryByText(/^Livre/)).toBeNull();
  });

  it("com a equipe toda na lista, sem Livre: a lista mistura os profissionais", async () => {
    montarPainel(<Agenda agora={AGORA} />, comAna(semear()));

    const dia = await quarta();
    await within(dia).findByRole("button", { name: /10:30 – 10:45/ });
    await waitFor(() => expect(within(dia).queryByText(/^Livre/)).toBeNull());
  });

  it("com a equipe filtrada em um só, a linha Livre volta", async () => {
    navegacaoFalsa.redefinir({
      pathname: "/painel/agenda",
      query: { vista: "lista", data: "2026-09-08", profissionais: "bb1" },
    });
    montarPainel(<Agenda agora={AGORA} />, comAna(semear()));

    const dia = await quarta();
    expect(await within(dia).findByText("Livre 09:30 – 09:40 · 10 min")).toBeInTheDocument();
  });

  it("sem o expediente, nenhum Livre: melhor não oferecer que oferecer o almoço", async () => {
    const falso = semear();
    vi.spyOn(falso.barbeiro, "ocupacaoDoDia").mockRejectedValue(new Error("fora do ar"));
    montarPainel(<Agenda agora={AGORA} />, falso);

    const dia = await quarta();
    await within(dia).findByRole("button", { name: /10:30 – 10:45/ });
    await waitFor(() => expect(falso.barbeiro.ocupacaoDoDia).toHaveBeenCalled());
    expect(within(dia).queryByText(/^Livre/)).toBeNull();
  });
});

describe("encaixe no detalhe do agendamento", () => {
  beforeEach(() => {
    localStorage.clear();
    navegacaoFalsa.redefinir({ pathname: "/painel/agendamentos/a3", params: { id: "a3" } });
  });

  it("diz que é encaixe e quanto o serviço tem", async () => {
    montarPainel(<DetalheDoAgendamento />, semear());

    expect(await screen.findByText("Encaixe · 15 min (o serviço tem 30)")).toBeInTheDocument();
  });

  it("o de tamanho cheio não tem a linha", async () => {
    navegacaoFalsa.redefinir({ pathname: "/painel/agendamentos/a1", params: { id: "a1" } });
    montarPainel(<DetalheDoAgendamento />, semear());

    await screen.findByRole("heading", { level: 1, name: /João Silva/ });
    expect(screen.queryByText(/^Encaixe ·/)).toBeNull();
  });
});
