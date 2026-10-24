import { describe, expect, it, vi } from "vitest";
import { criarApiClient, criarApiClientFalso, ErroDaApi } from "../src/index";

// O pagamento de um atendimento (Onda 2, marco 2, plano caixa-do-dia).
// As rotas são as de apps/api/src/routers/caixa.ts.

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

describe("api do pagamento do atendimento", () => {
  it("lê o pagamento e se o dia está fechado", async () => {
    const fetchFalso = vi.fn().mockResolvedValueOnce(respostaJson({ pagamento: null, diaFechado: false }));

    expect(await cliente(fetchFalso).barbeiro.pagamentoDoAgendamento("a1")).toEqual({
      pagamento: null,
      diaFechado: false,
    });
    expect(fetchFalso.mock.calls[0][0]).toBe("https://api.exemplo.br/agendamentos/a1/pagamento");
  });

  it("registra com PUT e o corpo como veio", async () => {
    const fetchFalso = vi.fn().mockResolvedValueOnce(respostaJson({ id: "p1" }));
    const dados = { forma: "pix" as const, servicosCentavos: 4000, recebidoPorId: "bb1" };

    await cliente(fetchFalso).barbeiro.registrarPagamento("a1", dados);

    const [url, init] = fetchFalso.mock.calls[0];
    expect(url).toBe("https://api.exemplo.br/agendamentos/a1/pagamento");
    expect((init as RequestInit).method).toBe("PUT");
    expect(JSON.parse((init as RequestInit).body as string)).toEqual(dados);
  });

  it("remove com DELETE", async () => {
    const fetchFalso = vi.fn().mockResolvedValueOnce(new Response(null, { status: 204 }));

    await cliente(fetchFalso).barbeiro.removerPagamento("a1");

    const [url, init] = fetchFalso.mock.calls[0];
    expect(url).toBe("https://api.exemplo.br/agendamentos/a1/pagamento");
    expect((init as RequestInit).method).toBe("DELETE");
  });
});

// O dublê faz a mesma conta da API (dividirPagamento, do
// @barchop/formato) com as regras da semente.
describe("dublê — pagamento do atendimento", () => {
  function semear(extra = {}) {
    return criarApiClientFalso({
      clientes: [{ id: "c1", nome: "João", telefone: "(11) 99999-0001", email: null, temConta: false }],
      agendamentos: [
        {
          id: "a1",
          clienteId: "c1",
          data: "2026-09-08",
          horaInicio: "09:00",
          horaFim: "09:30",
          status: "confirmado",
          origem: "barbeiro",
          observacoes: null,
          servicos: [{ servicoId: "s1", nome: "Corte", precoNoMomento: "40.00", duracaoNoMomento: 30 }],
        },
      ],
      ...extra,
    });
  }

  it("registrar conclui, divide e devolve o pagamento; ler acha o mesmo", async () => {
    const falso = semear({ divisao: { parteDaCasa: { bb1: 10 }, matriz: [] } });

    const pagamento = await falso.barbeiro.registrarPagamento("a1", { forma: "pix", gorjetaCentavos: 300 });

    expect(pagamento).toMatchObject({ servicosCentavos: 4000, totalCentavos: 4300, recebidoPor: { id: "bb1" } });
    expect(pagamento.partes.map((p) => [p.beneficiario?.id ?? null, p.motivo, p.valorCentavos])).toEqual([
      ["bb1", "atendimento", 3600],
      [null, "casa", 400],
      ["bb1", "gorjeta", 300],
    ]);
    expect((await falso.barbeiro.agendamento("a1")).status).toBe("concluido");
    expect(await falso.barbeiro.pagamentoDoAgendamento("a1")).toEqual({ pagamento, diaFechado: false, assinaturas: [] });
  });

  it("sair do concluído apaga o pagamento; remover também", async () => {
    const falso = semear();
    await falso.barbeiro.registrarPagamento("a1", { forma: "pix" });
    await falso.barbeiro.atualizarAgendamento("a1", { status: "confirmado" });
    expect((await falso.barbeiro.pagamentoDoAgendamento("a1")).pagamento).toBeNull();

    await falso.barbeiro.registrarPagamento("a1", { forma: "pix" });
    await falso.barbeiro.removerPagamento("a1");
    expect((await falso.barbeiro.pagamentoDoAgendamento("a1")).pagamento).toBeNull();
  });

  it("dia fechado é 409 dia_fechado; plano sem caixa é 403 recurso_do_plano", async () => {
    const fechado = semear({ diasFechados: ["2026-09-08"] });
    await expect(fechado.barbeiro.registrarPagamento("a1", { forma: "pix" })).rejects.toMatchObject({
      status: 409,
      codigo: "dia_fechado",
    });

    const gratis = semear();
    gratis.estado.assinatura = { ...gratis.estado.assinatura!, situacao: "gratis", planoEfetivo: "gratis" };
    const erro = await gratis.barbeiro.pagamentoDoAgendamento("a1").catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(ErroDaApi);
    expect(erro).toMatchObject({ status: 403, codigo: "recurso_do_plano" });
  });

  it("desconto maior que os serviços é 422 valor_invalido", async () => {
    const falso = semear();
    await expect(
      falso.barbeiro.registrarPagamento("a1", { forma: "pix", descontoCentavos: 4001 })
    ).rejects.toMatchObject({ status: 422, codigo: "valor_invalido" });
  });
});
