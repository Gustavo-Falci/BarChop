import { describe, expect, it, vi } from "vitest";
import { criarApiClient, criarApiClientFalso } from "../src/index";

function respostaJson(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("api pública — página rica", () => {
  it("busca os próximos horários e devolve a lista por serviço", async () => {
    const lista = [{ servicoId: "s1", horarios: [{ data: "2026-10-10", horaInicio: "09:00" }] }];
    const fetchFalso = vi.fn(async (_url: string, _init?: RequestInit) => respostaJson({ servicos: lista }));
    const api = criarApiClient({
      baseUrl: "https://api.exemplo.br",
      fetch: fetchFalso as unknown as typeof globalThis.fetch,
    });

    const proximos = await api.publico.proximosHorarios("gr-barber");

    expect(fetchFalso.mock.calls[0]![0]).toBe("https://api.exemplo.br/barbearias/gr-barber/proximos-horarios");
    expect(proximos).toEqual(lista);
  });
});

describe("dublê — página rica", () => {
  it("barbearia sem nada disso por padrão", async () => {
    const perfil = await criarApiClientFalso().publico.perfilDaBarbearia("gr-barber");

    expect(perfil).toMatchObject({ whatsapp: null, instagram: null, comodidades: [], formasDePagamento: [] });
  });

  it("o dono grava e a página pública mostra", async () => {
    const falso = criarApiClientFalso();

    await falso.barbeiro.atualizarMinhaBarbearia({
      whatsapp: "(11) 98888-7777",
      instagram: "gr.barber",
      comodidades: ["wifi"],
      formasDePagamento: ["pix"],
    });

    expect(await falso.publico.perfilDaBarbearia("gr-barber")).toMatchObject({
      whatsapp: "(11) 98888-7777",
      instagram: "gr.barber",
      comodidades: ["wifi"],
      formasDePagamento: ["pix"],
    });
  });

  it("recusa como a API: @ ou URL no instagram, item fora da lista ou repetido", async () => {
    const falso = criarApiClientFalso();

    for (const edicao of [
      { instagram: "@gr.barber" },
      { instagram: "https://instagram.com/gr" },
      { comodidades: ["piscina"] },
      { comodidades: ["wifi", "wifi"] },
      { formasDePagamento: ["cheque"] },
    ]) {
      await expect(falso.barbeiro.atualizarMinhaBarbearia(edicao)).rejects.toMatchObject({ status: 400 });
    }
  });

  it("serviço com categoria da lista; null tira", async () => {
    const falso = criarApiClientFalso();

    const barba = await falso.barbeiro.criarServico({
      nome: "Barba",
      duracaoMinutos: 30,
      preco: "30.00",
      categoria: "barba",
    });
    const limpo = await falso.barbeiro.atualizarServico(barba.id, { categoria: null });

    expect(barba.categoria).toBe("barba");
    expect(limpo.categoria).toBeNull();
  });

  it("categoria fora da lista é 400, como na API", async () => {
    const falso = criarApiClientFalso();

    await expect(
      falso.barbeiro.criarServico({ nome: "Corte", duracaoMinutos: 30, preco: "30.00", categoria: "CEBELO" })
    ).rejects.toMatchObject({ status: 400 });
    await expect(falso.barbeiro.atualizarServico("s1", { categoria: "Cabelo" })).rejects.toMatchObject({
      status: 400,
    });
  });

  it("próximos horários: os semeados, ou lista vazia por serviço ativo", async () => {
    const semeados = [{ servicoId: "s1", horarios: [{ data: "2026-10-10", horaInicio: "09:00" }] }];

    expect(
      await criarApiClientFalso({ proximosHorarios: semeados }).publico.proximosHorarios("gr-barber")
    ).toEqual(semeados);
    expect(await criarApiClientFalso().publico.proximosHorarios("gr-barber")).toEqual([
      { servicoId: "s1", horarios: [] },
      { servicoId: "s2", horarios: [] },
    ]);
  });
});
