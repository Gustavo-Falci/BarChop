import { describe, expect, it } from "vitest";
import type { DiaDaJornada } from "@barchop/types";
import { criarApiClientFalso } from "../src/index";

// Várias pausas por dia (08/11/2026): o dublê segue as regras do PUT
// /equipe/:id/jornada da API (routers/equipe.ts), inclusive a da aba da
// web antiga, e a ocupação devolve todas.

const QUINTA = "2037-01-08";
const ALMOCO = { inicio: "12:00", fim: "13:00" };
const CAFE = { inicio: "16:00", fim: "16:15" };

const SEMANA: DiaDaJornada[] = [0, 1, 2, 3, 4, 5, 6].map((diaSemana) => ({
  diaSemana,
  modo: "barbearia",
  horaInicio: null,
  horaFim: null,
}));

const comDia = (diaSemana: number, dia: Partial<DiaDaJornada>) =>
  SEMANA.map((d) => (d.diaSemana === diaSemana ? { ...d, ...dia } : d));

describe("várias pausas no dublê", () => {
  it("grava as pausas em ordem, com a primeira nos campos antigos", async () => {
    const falso = criarApiClientFalso();

    const salva = await falso.barbeiro.salvarJornada("bb1", comDia(4, { pausas: [CAFE, ALMOCO] }));

    expect(salva[4]).toMatchObject({ pausas: [ALMOCO, CAFE], pausaInicio: "12:00", pausaFim: "13:00" });
    expect((await falso.barbeiro.jornada("bb1"))[3]).toMatchObject({ pausas: [], pausaInicio: null });
  });

  it("recusa pausas que se cruzam e pausa invertida; a folga fica sem", async () => {
    const falso = criarApiClientFalso();

    await expect(
      falso.barbeiro.salvarJornada("bb1", comDia(4, { pausas: [ALMOCO, { inicio: "12:30", fim: "13:30" }] }))
    ).rejects.toMatchObject({ status: 422, codigo: "pausas_se_cruzam" });
    await expect(
      falso.barbeiro.salvarJornada("bb1", comDia(4, { pausas: [{ inicio: "16:15", fim: "16:00" }] }))
    ).rejects.toMatchObject({ status: 422, codigo: "pausa_invalida" });

    const salva = await falso.barbeiro.salvarJornada("bb1", comDia(4, { modo: "folga", pausas: [ALMOCO] }));
    expect(salva[4]).toMatchObject({ pausas: [], pausaInicio: null, pausaFim: null });
  });

  it("a semente com a pausa antiga vira uma pausa", async () => {
    const falso = criarApiClientFalso({
      jornadas: { bb1: comDia(4, { pausaInicio: "12:00", pausaFim: "13:00" }) },
    });

    expect((await falso.barbeiro.jornada("bb1"))[4].pausas).toEqual([ALMOCO]);
  });

  it("a aba antiga: num dia com duas pausas, mexer no campo antigo dá 422; o dia que ela não mexeu fica", async () => {
    const falso = criarApiClientFalso();
    await falso.barbeiro.salvarJornada("bb1", comDia(4, { pausas: [ALMOCO, CAFE] }));
    const lida = await falso.barbeiro.jornada("bb1");

    await expect(
      falso.barbeiro.salvarJornada(
        "bb1",
        lida.map((dia) => (dia.diaSemana === 4 ? { ...dia, pausaInicio: "12:30", pausaFim: "13:30" } : dia))
      )
    ).rejects.toMatchObject({ status: 422, codigo: "recarregue_a_pagina" });

    const salva = await falso.barbeiro.salvarJornada(
      "bb1",
      lida.map((dia) => (dia.diaSemana === 2 ? { ...dia, pausaInicio: "11:00", pausaFim: "11:30" } : dia))
    );
    expect(salva[2].pausas).toEqual([{ inicio: "11:00", fim: "11:30" }]);
    expect(salva[4].pausas).toEqual([ALMOCO, CAFE]);
  });

  it("a ocupação devolve todas as pausas, e a primeira em `pausa`", async () => {
    const falso = criarApiClientFalso();
    await falso.barbeiro.salvarJornada("bb1", comDia(4, { pausas: [ALMOCO, CAFE] }));

    const [rafael] = (await falso.barbeiro.ocupacaoDoDia(QUINTA)).profissionais;

    expect(rafael.pausas).toEqual([ALMOCO, CAFE]);
    expect(rafael.pausa).toEqual(ALMOCO);
  });
});
