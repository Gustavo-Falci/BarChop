import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { criarApiClientFalso } from "@barchop/api-client";
import { Agenda } from "../../../src/telas/painel/Agenda";
import { navegacaoFalsa } from "../../ajudantes/navegacao";
import { montarPainel } from "../../ajudantes/painel";
import { comTelaDeCelular } from "../../ajudantes/tela";

// Agenda no celular, PR 2: as vistas "lista" e "3 dias", e o padrão de
// cada tela. 2026-09-08 é uma terça-feira.
const AGORA = new Date("2026-09-08T10:00:00-03:00");

function semear() {
  return criarApiClientFalso({
    clientes: [
      { id: "c1", nome: "João Silva", telefone: "(11) 99999-0001", email: null, temConta: false },
    ],
    agendamentos: [
      {
        id: "a1",
        clienteId: "c1",
        data: "2026-09-08",
        horaInicio: "11:00",
        horaFim: "11:30",
        status: "confirmado",
        origem: "cliente",
        observacoes: null,
        servicos: [{ servicoId: "s1", nome: "Corte", precoNoMomento: "40.00", duracaoNoMomento: 30 }],
      },
    ],
  });
}

function irPara(query: Record<string, string>) {
  navegacaoFalsa.redefinir({ pathname: "/painel/agenda", query });
}

describe("vistas novas da agenda", () => {
  beforeEach(() => {
    localStorage.clear();
    irPara({ data: "2026-09-08" });
  });

  it("3 dias mostra três colunas a partir da data", async () => {
    irPara({ vista: "3dias", data: "2026-09-08" });
    montarPainel(<Agenda agora={AGORA} />, semear());

    expect(await screen.findByRole("button", { name: "3 dias" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "8 de setembro" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "10 de setembro" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "11 de setembro" })).not.toBeInTheDocument();
  });

  it("3 dias anda de três em três", async () => {
    irPara({ vista: "3dias", data: "2026-09-08" });
    montarPainel(<Agenda agora={AGORA} />, semear());

    await userEvent.click(await screen.findByRole("button", { name: "Próximo período" }));

    expect(navegacaoFalsa.push).toHaveBeenCalledWith("/painel/agenda?vista=3dias&data=2026-09-11");
  });

  it("a lista mostra os dias em sequência, com o agendamento no dia dele", async () => {
    irPara({ vista: "lista", data: "2026-09-08" });
    montarPainel(<Agenda agora={AGORA} />, semear());

    const lista = await screen.findByTestId("lista-da-agenda");
    const terca = within(lista).getByRole("region", { name: "8 de setembro" });
    expect(within(terca).getByRole("button", { name: /João Silva/ })).toBeInTheDocument();
    // 14 dias: de 8 a 21 de setembro.
    expect(within(lista).getByRole("region", { name: "21 de setembro" })).toBeInTheDocument();
    expect(within(lista).queryByRole("region", { name: "22 de setembro" })).not.toBeInTheDocument();
  });

  it("a lista anda de 14 em 14 dias", async () => {
    irPara({ vista: "lista", data: "2026-09-08" });
    montarPainel(<Agenda agora={AGORA} />, semear());

    await userEvent.click(await screen.findByRole("button", { name: "Próximo período" }));

    expect(navegacaoFalsa.push).toHaveBeenCalledWith("/painel/agenda?vista=lista&data=2026-09-22");
  });

  it("vista desconhecida na URL cai no padrão, sem erro", async () => {
    irPara({ vista: "xyz", data: "2026-09-08" });
    montarPainel(<Agenda agora={AGORA} />, semear());

    expect(await screen.findByRole("button", { name: "Semana" })).toHaveAttribute("aria-pressed", "true");
  });

  it("escolher a vista a guarda neste aparelho", async () => {
    montarPainel(<Agenda agora={AGORA} />, semear());

    await userEvent.click(await screen.findByRole("button", { name: "3 dias" }));

    expect(localStorage.getItem("barchop.agenda.vista")).toBe("3dias");
  });

  it("sem vista na URL, vale a última escolhida aqui", async () => {
    localStorage.setItem("barchop.agenda.vista", "dia");
    montarPainel(<Agenda agora={AGORA} />, semear());

    expect(await screen.findByRole("button", { name: "Dia" })).toHaveAttribute("aria-pressed", "true");
  });

  describe("no celular", () => {
    let desfazer: () => void;
    beforeEach(() => {
      desfazer = comTelaDeCelular();
    });
    afterEach(() => desfazer());

    it("sem vista na URL, abre na lista", async () => {
      montarPainel(<Agenda agora={AGORA} />, semear());

      expect(await screen.findByTestId("lista-da-agenda")).toBeInTheDocument();
    });

    it("busca os agendamentos uma vez só, já no intervalo da lista", async () => {
      const falso = semear();
      const busca = vi.spyOn(falso.barbeiro, "agendamentosDoIntervalo");
      montarPainel(<Agenda agora={AGORA} />, falso);

      await screen.findByTestId("lista-da-agenda");

      expect(busca).toHaveBeenCalledTimes(1);
      expect(busca).toHaveBeenCalledWith("2026-09-08", "2026-09-21");
    });

    it("a vista na URL vence o padrão do celular", async () => {
      irPara({ vista: "semana", data: "2026-09-08" });
      montarPainel(<Agenda agora={AGORA} />, semear());

      expect(await screen.findByRole("button", { name: "Semana" })).toHaveAttribute("aria-pressed", "true");
    });
  });
});
