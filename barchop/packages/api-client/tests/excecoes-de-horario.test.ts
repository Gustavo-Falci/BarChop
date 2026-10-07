import { describe, expect, it, vi } from "vitest";
import { criarApiClient, criarApiClientFalso } from "../src/index";

// Painel v2, marco 3 (3c): exceções por data da barbearia. As rotas são
// as de apps/api/src/routers/horarios.ts.

function respostaJson(corpo: unknown, status = 200): Response {
  return new Response(corpo === null ? null : JSON.stringify(corpo), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function client(fetchFalso: ReturnType<typeof vi.fn>) {
  return criarApiClient({
    baseUrl: "https://api.exemplo.br",
    obterToken: () => "jwt",
    fetch: fetchFalso as unknown as typeof globalThis.fetch,
  });
}

const FERIADO = { data: "2037-04-21", fechado: true, horaAbertura: null, horaFechamento: null, motivo: "Tiradentes" };

describe("api das exceções de horário", () => {
  it("lista, salva e apaga pela data", async () => {
    const fetchFalso = vi
      .fn()
      .mockResolvedValueOnce(respostaJson({ excecoes: [FERIADO] }))
      .mockResolvedValueOnce(respostaJson({ excecao: FERIADO, foraDoHorario: 2 }))
      .mockResolvedValueOnce(respostaJson(null, 204));
    const api = client(fetchFalso);

    const lista = await api.barbeiro.excecoesDeHorario();
    const salva = await api.barbeiro.salvarExcecaoDeHorario("2037-04-21", { fechado: true, motivo: "Tiradentes" });
    await api.barbeiro.apagarExcecaoDeHorario("2037-04-21");

    expect(lista).toEqual([FERIADO]);
    expect(salva).toEqual({ excecao: FERIADO, foraDoHorario: 2 });
    const [url1] = fetchFalso.mock.calls[0];
    const [url2, init2] = fetchFalso.mock.calls[1];
    const [url3, init3] = fetchFalso.mock.calls[2];
    expect(url1).toBe("https://api.exemplo.br/barbearias/me/horarios/excecoes");
    expect(url2).toBe("https://api.exemplo.br/barbearias/me/horarios/excecoes/2037-04-21");
    expect((init2 as RequestInit).method).toBe("PUT");
    expect(JSON.parse((init2 as RequestInit).body as string)).toEqual({ fechado: true, motivo: "Tiradentes" });
    expect(url3).toBe("https://api.exemplo.br/barbearias/me/horarios/excecoes/2037-04-21");
    expect((init3 as RequestInit).method).toBe("DELETE");
  });
});

describe("dublê — exceções de horário", () => {
  it("salva, substitui, lista em ordem e apaga; decide Horários", async () => {
    const falso = criarApiClientFalso();

    await falso.barbeiro.salvarExcecaoDeHorario("2037-12-25", { fechado: true });
    await falso.barbeiro.salvarExcecaoDeHorario("2037-04-21", { fechado: true, motivo: "Tiradentes" });
    const especial = await falso.barbeiro.salvarExcecaoDeHorario("2037-12-25", {
      fechado: false,
      horaAbertura: "09:00",
      horaFechamento: "13:00",
    });

    expect(especial).toEqual({
      excecao: { data: "2037-12-25", fechado: false, horaAbertura: "09:00", horaFechamento: "13:00", motivo: null },
      foraDoHorario: 0,
    });
    expect((await falso.barbeiro.excecoesDeHorario()).map((e) => e.data)).toEqual(["2037-04-21", "2037-12-25"]);
    expect((await falso.barbeiro.minhaBarbearia()).areasDecididas).toContain("horarios");

    await falso.barbeiro.apagarExcecaoDeHorario("2037-04-21");
    expect((await falso.barbeiro.excecoesDeHorario()).map((e) => e.data)).toEqual(["2037-12-25"]);
  });

  it("as mesmas recusas da API", async () => {
    const falso = criarApiClientFalso();

    await expect(
      falso.barbeiro.salvarExcecaoDeHorario("2037-04-21", { fechado: false })
    ).rejects.toMatchObject({ status: 422, codigo: "horario_incompleto" });
    await expect(
      falso.barbeiro.salvarExcecaoDeHorario("2037-04-21", {
        fechado: false,
        horaAbertura: "14:00",
        horaFechamento: "10:00",
      })
    ).rejects.toMatchObject({ status: 422, codigo: "intervalo_invalido" });
    await expect(falso.barbeiro.apagarExcecaoDeHorario("2037-04-21")).rejects.toMatchObject({ status: 404 });
  });

  it("só o dono muda", async () => {
    const falso = criarApiClientFalso({ papel: "profissional" });

    await expect(
      falso.barbeiro.salvarExcecaoDeHorario("2037-04-21", { fechado: true })
    ).rejects.toMatchObject({ status: 403 });
  });
});
