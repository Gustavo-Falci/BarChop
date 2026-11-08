import { screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { criarApiClientFalso } from "@barchop/api-client";
import type { DiaDaJornada } from "@barchop/types";
import { HorariosDaBarbearia } from "../../../src/telas/painel/configuracoes/HorariosDaBarbearia";
import { navegacaoFalsa } from "../../ajudantes/navegacao";
import { montarPainel } from "../../ajudantes/painel";

// Painel v2, marco 3: a pausa mora na jornada de cada membro, e Horários
// mostra a de cada um com o caminho pra mudar. O dublê do dono tem só o
// Rafael (bb1).

function jornadaComAlmocoECafe(): DiaDaJornada[] {
  return [0, 1, 2, 3, 4, 5, 6].map((diaSemana) => ({
    diaSemana,
    modo: diaSemana === 0 ? "folga" : "barbearia",
    horaInicio: null,
    horaFim: null,
    pausas: diaSemana >= 1 && diaSemana <= 5 ? [{ inicio: "12:00", fim: "13:00" }, { inicio: "16:00", fim: "16:15" }] : [],
  }));
}

function pausas() {
  return screen.getByRole("region", { name: "Pausas da equipe" });
}

describe("pausas da equipe em Horários", () => {
  beforeEach(() => {
    localStorage.clear();
    navegacaoFalsa.redefinir({ pathname: "/painel/configuracoes/horarios" });
  });

  it("mostra as pausas de cada membro que atende, com o caminho pra mudar", async () => {
    montarPainel(<HorariosDaBarbearia />, criarApiClientFalso({ jornadas: { bb1: jornadaComAlmocoECafe() } }));

    await screen.findByRole("region", { name: "Pausas da equipe" });
    expect(await within(pausas()).findByText("Seg a sex, 12:00–13:00 e 16:00–16:15")).toBeInTheDocument();
    expect(within(pausas()).getByText("Rafael")).toBeInTheDocument();
    expect(within(pausas()).getByRole("link", { name: "Mudar as pausas de Rafael" })).toHaveAttribute(
      "href",
      "/painel/equipe/bb1"
    );
  });

  it("quem não tem pausa aparece como sem pausa", async () => {
    montarPainel(<HorariosDaBarbearia />, criarApiClientFalso());

    await screen.findByRole("region", { name: "Pausas da equipe" });
    expect(await within(pausas()).findByText("Sem pausa")).toBeInTheDocument();
  });

  it("quem não atende fica de fora", async () => {
    const falso = criarApiClientFalso();
    falso.estado.equipe!.push({
      id: "m3",
      nome: "Bia",
      email: "bia@gr.com",
      telefone: null,
      papel: "recepcao",
      atende: false,
      ativo: true,
      fotoUrl: null,
      convitePendente: false,
      podeVenderPlanos: false,
    });
    montarPainel(<HorariosDaBarbearia />, falso);

    await screen.findByRole("region", { name: "Pausas da equipe" });
    await within(pausas()).findByText("Rafael");
    expect(within(pausas()).queryByText("Bia")).not.toBeInTheDocument();
  });
});
