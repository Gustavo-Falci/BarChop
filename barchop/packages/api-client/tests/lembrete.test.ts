import { describe, expect, it, vi } from "vitest";
import { criarApiClient, criarApiClientFalso, ErroDaApi } from "../src/index";

function respostaJson(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function clientComFetch(fetchFalso: ReturnType<typeof vi.fn>) {
  return criarApiClient({
    baseUrl: "https://api.exemplo.br",
    fetch: fetchFalso as unknown as typeof globalThis.fetch,
  });
}

const DO_LEMBRETE = {
  id: "a1",
  data: "2026-10-10",
  horaInicio: "10:00",
  status: "confirmado",
  presencaConfirmadaEm: null,
  barbearia: { nome: "GR Barber", slug: "gr-barber" },
  barbeiro: { nome: "Rafael" },
  servicos: [{ nome: "Corte" }],
};

describe("api pública — link do lembrete", () => {
  it("lê o agendamento pelo token, sem login", async () => {
    const fetchFalso = vi.fn(async () => respostaJson({ agendamento: DO_LEMBRETE }));

    const lido = await clientComFetch(fetchFalso).publico.lembrete("tok.en.x");

    expect(fetchFalso.mock.calls[0][0]).toBe("https://api.exemplo.br/lembretes/tok.en.x");
    expect(lido).toEqual(DO_LEMBRETE);
  });

  it("confirma e cancela por POST", async () => {
    const fetchFalso = vi.fn(async () => respostaJson({ agendamento: DO_LEMBRETE }));
    const publico = clientComFetch(fetchFalso).publico;

    await publico.confirmarPresenca("tok");
    await publico.cancelarPeloLembrete("tok");

    const chamadas = fetchFalso.mock.calls as unknown as [string, RequestInit][];
    expect(chamadas.map(([url, init]) => [url, init.method])).toEqual([
      ["https://api.exemplo.br/lembretes/tok/confirmar", "POST"],
      ["https://api.exemplo.br/lembretes/tok/cancelar", "POST"],
    ]);
  });

  it("o agendamento público leva o e-mail do lembrete", async () => {
    const fetchFalso = vi.fn(async () => respostaJson({}, 201));

    await clientComFetch(fetchFalso).publico.agendar("gr-barber", {
      servicoIds: ["s1"],
      data: "2026-10-10",
      horaInicio: "10:00",
      cliente: { nome: "Maria", telefone: "11977776666", email: "maria@exemplo.com" },
    });

    const init = fetchFalso.mock.calls[0]![1] as RequestInit;
    expect(JSON.parse(init.body as string).cliente.email).toBe("maria@exemplo.com");
  });
});

describe("api do barbeiro — lembrete", () => {
  it("pede o wa.me do lembrete e devolve só a URL", async () => {
    const fetchFalso = vi.fn(async () => respostaJson({ url: "https://wa.me/5511?text=oi" }));

    const url = await clientComFetch(fetchFalso).barbeiro.lembreteWhatsApp("a1");

    expect(fetchFalso.mock.calls[0][0]).toBe(
      "https://api.exemplo.br/agendamentos/a1/lembrete-whatsapp"
    );
    expect(url).toBe("https://wa.me/5511?text=oi");
  });
});

describe("dublê — lembrete", () => {
  const semente = {
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
        clienteId: "c1",
      },
    ],
    lembretes: { "token-a1": "a1" },
    lembretesVencidos: ["token-vencido"],
  };

  it("lê o agendamento do token, no formato da API", async () => {
    const falso = criarApiClientFalso(semente);

    expect(await falso.publico.lembrete("token-a1")).toEqual({
      id: "a1",
      data: "2026-10-10",
      horaInicio: "10:00",
      status: "confirmado",
      presencaConfirmadaEm: null,
      barbearia: { nome: "GR Barber", slug: "gr-barber" },
      barbeiro: { nome: "Rafael" },
      servicos: [{ nome: "Corte" }],
    });
  });

  it("confirmar marca a presença, que a agenda do painel passa a ver", async () => {
    const falso = criarApiClientFalso(semente);

    const confirmado = await falso.publico.confirmarPresenca("token-a1");
    const deNovo = await falso.publico.confirmarPresenca("token-a1");

    expect(confirmado.presencaConfirmadaEm).toEqual(expect.any(String));
    expect(deNovo.presencaConfirmadaEm).toBe(confirmado.presencaConfirmadaEm);
    expect((await falso.barbeiro.agendamento("a1")).presencaConfirmadaEm).toBe(
      confirmado.presencaConfirmadaEm
    );
  });

  it("cancelar cancela, e cancelar de novo não é erro", async () => {
    const falso = criarApiClientFalso(semente);

    await falso.publico.cancelarPeloLembrete("token-a1");
    const deNovo = await falso.publico.cancelarPeloLembrete("token-a1");

    expect(deNovo.status).toBe("cancelado");
  });

  it("recusa como a API: cancelado não confirma (422)", async () => {
    const falso = criarApiClientFalso(semente);
    await falso.publico.cancelarPeloLembrete("token-a1");

    await expect(falso.publico.confirmarPresenca("token-a1")).rejects.toMatchObject({
      status: 422,
      codigo: "status_nao_permite",
    });
  });

  it("token desconhecido é 401 link_invalido; vencido é 410 link_expirado", async () => {
    const falso = criarApiClientFalso(semente);

    await expect(falso.publico.lembrete("outro")).rejects.toMatchObject({
      status: 401,
      codigo: "link_invalido",
    });
    await expect(falso.publico.confirmarPresenca("token-vencido")).rejects.toMatchObject({
      status: 410,
      codigo: "link_expirado",
    });
  });

  it("antecedência: 24 h por padrão, só aceita 2, 12 ou 24", async () => {
    const falso = criarApiClientFalso();

    expect((await falso.barbeiro.minhaBarbearia()).lembreteAntecedenciaHoras).toBe(24);
    const salva = await falso.barbeiro.atualizarMinhaBarbearia({ lembreteAntecedenciaHoras: 2 });
    expect(salva.lembreteAntecedenciaHoras).toBe(2);
    await expect(
      falso.barbeiro.atualizarMinhaBarbearia({ lembreteAntecedenciaHoras: 5 as never })
    ).rejects.toBeInstanceOf(ErroDaApi);
  });

  it("o wa.me sai pro telefone do cliente; cancelado é 422", async () => {
    const falso = criarApiClientFalso(semente);

    const url = new URL(await falso.barbeiro.lembreteWhatsApp("a1"));
    expect(`${url.origin}${url.pathname}`).toBe("https://wa.me/5511999998888");
    expect(url.searchParams.get("text")).toContain("10:00");

    await falso.publico.cancelarPeloLembrete("token-a1");
    await expect(falso.barbeiro.lembreteWhatsApp("a1")).rejects.toMatchObject({ status: 422 });
  });

  it("agendamento novo nasce sem presença confirmada", async () => {
    const falso = criarApiClientFalso();

    const novo = await falso.publico.agendar("gr-barber", {
      servicoIds: ["s1"],
      data: "2026-10-10",
      horaInicio: "09:00",
      cliente: { nome: "Maria", telefone: "11977776666", email: "maria@exemplo.com" },
    });

    expect(novo.presencaConfirmadaEm).toBeNull();
  });

  it("e-mail fora do formato é 400, como na API", async () => {
    const falso = criarApiClientFalso();

    await expect(
      falso.publico.agendar("gr-barber", {
        servicoIds: ["s1"],
        data: "2026-10-10",
        horaInicio: "09:00",
        cliente: { nome: "Maria", telefone: "11977776666", email: "nao-e-email" },
      })
    ).rejects.toMatchObject({ status: 400 });
  });
});
