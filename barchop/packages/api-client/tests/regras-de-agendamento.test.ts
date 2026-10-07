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

  it("salvar as regras decide a área delas", async () => {
    const api = criarApiClientFalso();

    const salva = await api.barbeiro.atualizarMinhaBarbearia({ prazoRemarcarHoras: 2 });

    expect(salva.areasDecididas).toEqual(["regras_de_agendamento"]);
  });

  it("o lembrete traz o prazo de cancelar e o contato da barbearia", async () => {
    const api = criarApiClientFalso({
      agendamentos: [
        {
          id: "a1",
          data: "2026-10-10",
          horaInicio: "10:00",
          horaFim: "10:30",
          status: "confirmado",
          origem: "cliente",
          observacoes: null,
          servicos: [{ servicoId: "s1", nome: "Corte", precoNoMomento: "40.00", duracaoNoMomento: 30 }],
        },
      ],
      lembretes: { "token-a1": "a1" },
    });
    api.estado.perfil = { ...api.estado.perfil, prazoCancelarHoras: 12, whatsapp: "(11) 98888-7777" };

    const lembrete = await api.publico.lembrete("token-a1");

    expect(lembrete.barbearia).toEqual({
      nome: "GR Barber",
      slug: "gr-barber",
      prazoCancelarHoras: 12,
      whatsapp: "(11) 98888-7777",
      telefone: "(11) 3333-4444",
    });
  });
});

