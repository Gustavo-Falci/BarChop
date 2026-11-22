import { describe, expect, it, vi } from "vitest";
import { criarApiClient, criarApiClientFalso, ErroDaApi } from "../src/index";

// Mudar os serviços de um agendamento (22/11/2026): a prévia (GET
// /agendamentos/:id/servicos/previa) e o salvar (PUT
// /agendamentos/:id/servicos) no client e no dublê.

function respostaJson(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json" } });
}

function clientDe(fetchFalso: ReturnType<typeof vi.fn>) {
  return criarApiClient({
    baseUrl: "https://api.exemplo.br",
    obterToken: () => "jwt",
    fetch: fetchFalso as unknown as typeof globalThis.fetch,
  });
}

const CORTE = { servicoId: "s1", nome: "Corte", precoNoMomento: "30.00", duracaoNoMomento: 30 };

function comAgendamento(
  opcoes: { papel?: "dono" | "profissional"; limite?: string; servicos?: (typeof CORTE)[]; horaFim?: string } = {}
) {
  return criarApiClientFalso({
    papel: opcoes.papel ?? "dono",
    servicos: [
      { id: "s1", nome: "Corte", duracaoMinutos: 30, preco: "30.00", ativo: true, categoria: null, descricao: null, fotoUrl: null },
      { id: "s2", nome: "Barba", duracaoMinutos: 20, preco: "25.00", ativo: true, categoria: null, descricao: null, fotoUrl: null },
      { id: "s3", nome: "Sobrancelha", duracaoMinutos: 10, preco: "15.00", ativo: true, categoria: null, descricao: null, fotoUrl: null },
      { id: "s4", nome: "Antigo", duracaoMinutos: 10, preco: "10.00", ativo: false, categoria: null, descricao: null, fotoUrl: null },
    ],
    agendamentos: [
      {
        id: "a1",
        clienteId: "c1",
        data: "2026-12-08",
        horaInicio: "09:00",
        horaFim: opcoes.horaFim ?? "09:30",
        status: "confirmado",
        origem: "cliente",
        observacoes: null,
        servicos: opcoes.servicos ?? [CORTE],
      },
    ],
    limitesDaMudanca: {
      a1: { limite: opcoes.limite ?? "09:40", proximo: { tipo: "atendimento", cliente: "Lucas Andrade", horaInicio: "09:40" } },
    },
  });
}

describe("mudar os serviços no client", () => {
  it("prévia: GET com os serviços repetidos na query", async () => {
    const fetchFalso = vi.fn(async () => respostaJson({ cabe: true }));

    const previa = await clientDe(fetchFalso).barbeiro.previaDosServicos("a1", ["s1", "s3"]);

    const [url] = fetchFalso.mock.calls[0] as unknown as [string];
    expect(url).toBe("https://api.exemplo.br/agendamentos/a1/servicos/previa?servicoIds=s1&servicoIds=s3");
    expect(previa).toEqual({ cabe: true });
  });

  it("salvar: PUT com o corpo", async () => {
    const fetchFalso = vi.fn(async () => respostaJson({ id: "a1" }));

    await clientDe(fetchFalso).barbeiro.mudarServicos("a1", {
      servicoIds: ["s1", "s2"],
      aceitaSemTempo: true,
      avisarCliente: false,
    });

    const [url, init] = fetchFalso.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.exemplo.br/agendamentos/a1/servicos");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body as string)).toEqual({ servicoIds: ["s1", "s2"], aceitaSemTempo: true, avisarCliente: false });
  });
});

describe("mudar os serviços no dublê", () => {
  it("prévia que cabe", async () => {
    const previa = await comAgendamento().barbeiro.previaDosServicos("a1", ["s1", "s3"]);

    expect(previa).toMatchObject({
      cabe: true,
      previstoMinutos: 40,
      terminaPrevisto: "09:40",
      horaFim: "09:40",
      limite: "09:40",
      encaixe: false,
      duracaoDosServicos: 40,
      totalAntes: "30.00",
      totalDepois: "45.00",
      entram: [{ servicoId: "s3", nome: "Sobrancelha", duracaoMinutos: 10, preco: "15.00" }],
      saem: [],
    });
  });

  it("prévia que não cabe: encaixe até o limite, com quem bate", async () => {
    const previa = await comAgendamento().barbeiro.previaDosServicos("a1", ["s1", "s2"]);

    expect(previa).toMatchObject({
      cabe: false,
      previstoMinutos: 50,
      terminaPrevisto: "09:50",
      horaFim: "09:40",
      encaixe: true,
      proximo: { tipo: "atendimento", cliente: "Lucas Andrade", horaInicio: "09:40" },
    });
  });

  it("salvar o que não cabe sem a marca: 409 sem_tempo; com ela, vira encaixe", async () => {
    const falso = comAgendamento();

    await expect(falso.barbeiro.mudarServicos("a1", { servicoIds: ["s1", "s2"] })).rejects.toMatchObject({
      status: 409,
      codigo: "sem_tempo",
    });
    const salvo = await falso.barbeiro.mudarServicos("a1", { servicoIds: ["s1", "s2"], aceitaSemTempo: true });

    expect(salvo.horaFim).toBe("09:40");
    expect(salvo.servicos.map((s) => s.nome)).toEqual(["Corte", "Barba"]);
  });

  it("tirar encurta pra soma dos que ficam", async () => {
    const falso = comAgendamento({
      horaFim: "09:40",
      servicos: [CORTE, { servicoId: "s3", nome: "Sobrancelha", precoNoMomento: "15.00", duracaoNoMomento: 10 }],
    });

    const salvo = await falso.barbeiro.mudarServicos("a1", { servicoIds: ["s1"] });

    expect(salvo.horaFim).toBe("09:30");
    expect(salvo.servicos).toEqual([CORTE]);
  });

  it("serviço novo inativo: 422 servico_inativo", async () => {
    await expect(comAgendamento().barbeiro.previaDosServicos("a1", ["s1", "s4"])).rejects.toMatchObject({
      codigo: "servico_inativo",
    });
  });

  it("repetido ou vazio: 400", async () => {
    const falso = comAgendamento();

    await expect(falso.barbeiro.mudarServicos("a1", { servicoIds: ["s1", "s1"] })).rejects.toBeInstanceOf(ErroDaApi);
    await expect(falso.barbeiro.mudarServicos("a1", { servicoIds: [] })).rejects.toMatchObject({ status: 400 });
  });

  it("com pagamento: 409 com_pagamento", async () => {
    const falso = comAgendamento();
    await falso.barbeiro.registrarPagamento("a1", { forma: "pix" });

    await expect(falso.barbeiro.mudarServicos("a1", { servicoIds: ["s1", "s3"] })).rejects.toMatchObject({
      status: 409,
      codigo: "com_pagamento",
    });
  });
});
