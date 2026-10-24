import { describe, expect, it, vi } from "vitest";
import { criarApiClient, criarApiClientFalso } from "../src/index";

// O caixa de um dia (Onda 2, marco 2, plano caixa-do-dia). As rotas são
// as de apps/api/src/routers/caixa.ts.

function respostaJson(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function cliente(fetchFalso: ReturnType<typeof vi.fn>) {
  return criarApiClient({
    baseUrl: "https://api.exemplo.br",
    obterToken: () => "jwt",
    fetch: fetchFalso as unknown as typeof globalThis.fetch,
  });
}

describe("api do caixa do dia", () => {
  it("lê o dia pela data na query", async () => {
    const fetchFalso = vi.fn().mockResolvedValueOnce(respostaJson({ data: "2026-09-08" }));

    await cliente(fetchFalso).barbeiro.caixaDoDia("2026-09-08");

    expect(fetchFalso.mock.calls[0][0]).toBe("https://api.exemplo.br/barbearias/me/caixa?data=2026-09-08");
  });

  it("fecha com POST e reabre com DELETE no fechamento do dia", async () => {
    const fetchFalso = vi
      .fn()
      .mockResolvedValueOnce(respostaJson({ data: "2026-09-08" }, 201))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const api = cliente(fetchFalso);

    await api.barbeiro.fecharODia("2026-09-08");
    await api.barbeiro.reabrirODia("2026-09-08");

    expect(fetchFalso.mock.calls.map(([url, init]) => [url, (init as RequestInit).method])).toEqual([
      ["https://api.exemplo.br/barbearias/me/caixa/2026-09-08/fechamento", "POST"],
      ["https://api.exemplo.br/barbearias/me/caixa/2026-09-08/fechamento", "DELETE"],
    ]);
  });
});

describe("dublê — caixa do dia", () => {
  function semear(papel: "dono" | "profissional" = "dono") {
    const membro = (id: string, nome: string, papelDele: "dono" | "profissional") => ({
      id,
      nome,
      email: `${id}@gr.com`,
      telefone: null,
      papel: papelDele,
      atende: true,
      ativo: true,
      fotoUrl: null,
      convitePendente: false,
      podeVenderPlanos: false,
    });
    const agendamento = (id: string, horaInicio: string, barbeiro: { id: string; nome: string }) => ({
      id,
      clienteId: "c1",
      data: "2026-09-08",
      horaInicio,
      horaFim: `${horaInicio.slice(0, 2)}:45`,
      status: "confirmado" as const,
      origem: "barbeiro" as const,
      observacoes: null,
      barbeiro,
      servicos: [{ servicoId: "s1", nome: "Corte", precoNoMomento: "40.00", duracaoNoMomento: 45 }],
    });
    return criarApiClientFalso({
      papel,
      clientes: [{ id: "c1", nome: "João", telefone: "(11) 99999-0001", email: null, temConta: false }],
      equipe: [membro("bb1", "Rafael", papel), membro("bb0", "Gustavo", papel === "dono" ? "profissional" : "dono")],
      agendamentos: [
        agendamento("a1", "09:00", { id: "bb1", nome: "Rafael" }),
        agendamento("a2", "10:00", { id: "bb0", nome: "Gustavo" }),
        agendamento("a3", "11:00", { id: "bb0", nome: "Gustavo" }),
      ],
      divisao: { parteDaCasa: {}, matriz: [{ donoDoCliente: "bb1", atendente: "bb0", percentual: 60 }] },
      donosDosClientes: { c1: "bb1" },
    });
  }

  it("totais, acerto com repasse e pendências, como a API", async () => {
    const falso = semear();
    await falso.barbeiro.registrarPagamento("a1", { forma: "pix" });
    await falso.barbeiro.registrarPagamento("a2", { forma: "dinheiro", servicosCentavos: 10000 });

    const caixa = await falso.barbeiro.caixaDoDia("2026-09-08");

    expect(caixa.fechamento).toBeNull();
    expect(caixa.totais.totalCentavos).toBe(14000);
    expect(caixa.totais.porForma.map((f) => f.forma)).toEqual(["pix", "dinheiro", "debito", "credito"]);
    expect(caixa.pagamentos.map((p) => [p.agendamentoId, p.horaInicio, p.cliente.nome])).toEqual([
      ["a1", "09:00", "João"],
      ["a2", "10:00", "João"],
    ]);
    expect(caixa.acerto.pessoas.map((l) => [l.pessoa?.nome, l.saldoCentavos])).toEqual([
      ["Rafael", 6000],
      ["Gustavo", -6000],
    ]);
    expect(caixa.acerto.repasses).toEqual([
      { de: { id: "bb0", nome: "Gustavo" }, para: { id: "bb1", nome: "Rafael" }, valorCentavos: 6000 },
    ]);
    expect(caixa.pendencias.map((p) => [p.agendamentoId, p.status, p.barbeiro.nome])).toEqual([
      ["a3", "confirmado", "Gustavo"],
    ]);
  });

  it("fechar grava quem fechou e trava o dia; reabrir solta; só o dono", async () => {
    const falso = semear();

    const fechado = await falso.barbeiro.fecharODia("2026-09-08");
    expect(fechado.fechamento?.fechadoPor).toEqual({ id: "bb1", nome: "Rafael" });
    await expect(falso.barbeiro.fecharODia("2026-09-08")).rejects.toMatchObject({ status: 409, codigo: "dia_fechado" });
    await expect(falso.barbeiro.registrarPagamento("a1", { forma: "pix" })).rejects.toMatchObject({
      codigo: "dia_fechado",
    });

    await falso.barbeiro.reabrirODia("2026-09-08");
    expect((await falso.barbeiro.caixaDoDia("2026-09-08")).fechamento).toBeNull();

    const profissional = semear("profissional");
    await expect(profissional.barbeiro.fecharODia("2026-09-08")).rejects.toMatchObject({ status: 403 });
  });

  it("o profissional recebe só o que é dele", async () => {
    const falso = semear("profissional");
    await falso.barbeiro.registrarPagamento("a1", { forma: "pix" });
    await falso.barbeiro.registrarPagamento("a2", { forma: "dinheiro", servicosCentavos: 10000 });

    const caixa = await falso.barbeiro.caixaDoDia("2026-09-08");

    // Rafael (bb1) entra no a1 (atendeu) e no a2 (leva a parte do cliente).
    expect(caixa.pagamentos.map((p) => p.agendamentoId)).toEqual(["a1", "a2"]);
    expect(caixa.acerto.pessoas.map((l) => l.pessoa?.id)).toEqual(["bb1"]);
    // A pendência é da agenda do Gustavo.
    expect(caixa.pendencias).toEqual([]);
  });
});
