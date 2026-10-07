import { describe, expect, it } from "vitest";
import { REGRAS_PADRAO } from "@barchop/formato";
import { criarApiClientFalso } from "../src/index";

// As regras de agendamento no dublê (painel v2, marco 3): a tela de
// Regras (3f) e a do cliente (3g) são testadas contra ele, então ele
// devolve e grava as regras como a API.

describe("regras de agendamento no dublê", () => {
  it("barbearia sem semente tem os padrões, no painel e na página pública", async () => {
    const api = criarApiClientFalso();

    expect(await api.barbeiro.minhaBarbearia()).toMatchObject(REGRAS_PADRAO);
    expect(await api.publico.perfilDaBarbearia("gr-barber")).toMatchObject(REGRAS_PADRAO);
  });

  it("salvar grava as regras e as duas leituras devolvem", async () => {
    const api = criarApiClientFalso();
    const regras = { intervaloMinutos: 30, aceitaMesmoDia: false, janelaDias: 14, prazoCancelarHoras: 24 } as const;

    const salva = await api.barbeiro.atualizarMinhaBarbearia(regras);

    expect(salva).toMatchObject(regras);
    expect(await api.publico.perfilDaBarbearia("gr-barber")).toMatchObject(regras);
  });
});
