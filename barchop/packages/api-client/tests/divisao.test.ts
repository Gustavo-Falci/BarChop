import { describe, expect, it, vi } from "vitest";
import { criarApiClient, criarApiClientFalso } from "../src/index";

// A divisão do dinheiro e de quem é o cliente (Onda 2, marco 2, plano
// caixa-do-dia). Rotas de apps/api/src/routers/caixa.ts e clientes.ts.

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

describe("api da divisão", () => {
  it("lê com GET e grava com PUT o corpo como veio", async () => {
    const vazia = { membros: [], matriz: [] };
    const fetchFalso = vi.fn().mockResolvedValueOnce(respostaJson(vazia)).mockResolvedValueOnce(respostaJson(vazia));
    const api = cliente(fetchFalso);
    const corpo = { parteDaCasa: [{ membroId: "bb1", percentual: 10 }], matriz: [] };

    await api.barbeiro.divisao();
    await api.barbeiro.salvarDivisao(corpo);

    expect(fetchFalso.mock.calls[0][0]).toBe("https://api.exemplo.br/barbearias/me/divisao");
    const [url, init] = fetchFalso.mock.calls[1];
    expect(url).toBe("https://api.exemplo.br/barbearias/me/divisao");
    expect((init as RequestInit).method).toBe("PUT");
    expect(JSON.parse((init as RequestInit).body as string)).toEqual(corpo);
  });
});

describe("dublê — divisão e profissional do cliente", () => {
  const membro = (id: string, nome: string, papel: "dono" | "profissional" | "recepcao") => ({
    id,
    nome,
    email: `${id}@gr.com`,
    telefone: null,
    papel,
    atende: papel !== "recepcao",
    ativo: true,
    fotoUrl: null,
    convitePendente: false,
  });

  function semear(papel: "dono" | "profissional" = "dono") {
    return criarApiClientFalso({
      papel,
      equipe: [membro("bb1", "Rafael", papel), membro("bb0", "Gustavo", "profissional"), membro("bb9", "Balcão", "recepcao")],
      clientes: [{ id: "c1", nome: "João", telefone: "(11) 99999-0001", email: null, temConta: false }],
      divisao: { parteDaCasa: { bb0: 10 }, matriz: [{ donoDoCliente: "bb1", atendente: "bb0", percentual: 60 }] },
    });
  }

  it("lê só quem atende, e grava substituindo a matriz (par em 0 não fica)", async () => {
    const falso = semear();

    expect(await falso.barbeiro.divisao()).toEqual({
      membros: [
        { id: "bb1", nome: "Rafael", parteDaCasa: 0 },
        { id: "bb0", nome: "Gustavo", parteDaCasa: 10 },
      ],
      matriz: [{ donoDoClienteId: "bb1", atendenteId: "bb0", percentual: 60 }],
    });

    const salva = await falso.barbeiro.salvarDivisao({
      parteDaCasa: [{ membroId: "bb1", percentual: 5 }],
      matriz: [
        { donoDoClienteId: "bb1", atendenteId: "bb0", percentual: 0 },
        { donoDoClienteId: "bb0", atendenteId: "bb1", percentual: 30 },
      ],
    });
    expect(salva.membros.map((m) => m.parteDaCasa)).toEqual([5, 10]);
    expect(salva.matriz).toEqual([{ donoDoClienteId: "bb0", atendenteId: "bb1", percentual: 30 }]);
  });

  it("como a API: só o dono, e membro fora da divisão é 422", async () => {
    await expect(semear("profissional").barbeiro.divisao()).rejects.toMatchObject({ status: 403 });
    await expect(
      semear().barbeiro.salvarDivisao({ parteDaCasa: [{ membroId: "bb9", percentual: 5 }], matriz: [] })
    ).rejects.toMatchObject({ status: 422, codigo: "membro_invalido" });
  });

  it("o detalhe do cliente traz de quem ele é, e só o dono troca", async () => {
    const falso = semear();
    expect((await falso.barbeiro.cliente("c1")).profissional).toBeNull();

    await falso.barbeiro.atualizarCliente("c1", { profissionalId: "bb0" });
    expect((await falso.barbeiro.cliente("c1")).profissional).toEqual({ id: "bb0", nome: "Gustavo" });

    await expect(falso.barbeiro.atualizarCliente("c1", { profissionalId: "bb9" })).rejects.toMatchObject({
      codigo: "membro_invalido",
    });
    await expect(semear("profissional").barbeiro.atualizarCliente("c1", { profissionalId: "bb0" })).rejects.toMatchObject({
      status: 403,
    });
  });
});
