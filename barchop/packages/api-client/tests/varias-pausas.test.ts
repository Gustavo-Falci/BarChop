import { describe, expect, it } from "vitest";
import type { DiaDaJornada } from "@barchop/types";
import { criarApiClientFalso } from "../src/index";

// Várias pausas por dia (08/11/2026): o dublê segue as regras do PUT
// /equipe/:id/jornada da API (routers/equipe.ts), inclusive a recusa da
// aba da web antiga, e a ocupação devolve todas.

const QUINTA = "2037-01-08";
const ALMOCO = { inicio: "12:00", fim: "13:00" };
const CAFE = { inicio: "16:00", fim: "16:15" };

const SEMANA: DiaDaJornada[] = [0, 1, 2, 3, 4, 5, 6].map((diaSemana) => ({
  diaSemana,
  modo: "barbearia",
  horaInicio: null,
  horaFim: null,
  pausas: [],
}));

const comDia = (diaSemana: number, dia: Partial<DiaDaJornada>) =>
  SEMANA.map((d) => (d.diaSemana === diaSemana ? { ...d, ...dia } : d));

describe("várias pausas no dublê", () => {
  it("grava as pausas em ordem, sem os campos da pausa única", async () => {
    const falso = criarApiClientFalso();

    const salva = await falso.barbeiro.salvarJornada("bb1", comDia(4, { pausas: [CAFE, ALMOCO] }));

    expect(salva[4]).toEqual({ diaSemana: 4, modo: "barbearia", horaInicio: null, horaFim: null, pausas: [ALMOCO, CAFE] });
    expect((await falso.barbeiro.jornada("bb1"))[3].pausas).toEqual([]);
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
    expect(salva[4]).toMatchObject({ modo: "folga", pausas: [] });
  });

  it("a aba da web antiga (campos da pausa única no corpo): 422 recarregue_a_pagina, e nada muda", async () => {
    const falso = criarApiClientFalso();
    await falso.barbeiro.salvarJornada("bb1", comDia(4, { pausas: [ALMOCO, CAFE] }));
    const lida = await falso.barbeiro.jornada("bb1");

    await expect(
      falso.barbeiro.salvarJornada(
        "bb1",
        lida.map((dia) => ({ ...dia, pausaInicio: dia.diaSemana === 2 ? "11:00" : null, pausaFim: null }) as DiaDaJornada)
      )
    ).rejects.toMatchObject({
      status: 422,
      codigo: "recarregue_a_pagina",
      mensagem: "Esta página está desatualizada. Recarregue para salvar a jornada.",
    });
    expect((await falso.barbeiro.jornada("bb1"))[4].pausas).toEqual([ALMOCO, CAFE]);
  });

  it("a ocupação devolve todas as pausas, sem o campo da pausa única", async () => {
    const falso = criarApiClientFalso();
    await falso.barbeiro.salvarJornada("bb1", comDia(4, { pausas: [ALMOCO, CAFE] }));

    const [rafael] = (await falso.barbeiro.ocupacaoDoDia(QUINTA)).profissionais;

    expect(rafael.pausas).toEqual([ALMOCO, CAFE]);
    expect(rafael).not.toHaveProperty("pausa");
  });
});
