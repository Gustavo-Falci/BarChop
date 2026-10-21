import { describe, expect, it, vi } from "vitest";
import { CATEGORIAS_DE_SERVICO } from "@barchop/formato";
import { criarApiClient, criarApiClientFalso, ErroDaApi } from "../src/index";

// Arrastar e reordenar, PR 4: as três ordens no client. As rotas são as
// do PR 2 (routers/servicos.ts, equipe.ts e barbearias.ts), que pedem a
// lista inteira e devolvem o estado novo.

function respostaJson(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function client(fetchFalso: ReturnType<typeof vi.fn>) {
  return criarApiClient({
    baseUrl: "https://api.exemplo.br",
    obterToken: () => "jwt-do-dono",
    fetch: fetchFalso as unknown as typeof globalThis.fetch,
  });
}

function chamada(fetchFalso: ReturnType<typeof vi.fn>) {
  const init = fetchFalso.mock.calls[0][1] as RequestInit;
  return {
    url: fetchFalso.mock.calls[0][0] as string,
    metodo: init.method,
    corpo: init.body === undefined ? undefined : JSON.parse(init.body as string),
    token: (init.headers as Record<string, string>).Authorization,
  };
}

describe("ordens no client", () => {
  it("salva a ordem dos serviços com a lista inteira e devolve a lista nova", async () => {
    const fetchFalso = vi.fn(async () => respostaJson({ servicos: [] }));

    const servicos = await client(fetchFalso).barbeiro.salvarOrdemDosServicos(["s2", "s1"]);

    expect(chamada(fetchFalso)).toEqual({
      url: "https://api.exemplo.br/servicos/ordem",
      metodo: "PUT",
      corpo: { ids: ["s2", "s1"] },
      token: "Bearer jwt-do-dono",
    });
    expect(servicos).toEqual([]);
  });

  it("salva a ordem da equipe e devolve os membros", async () => {
    const fetchFalso = vi.fn(async () => respostaJson({ membros: [] }));

    const membros = await client(fetchFalso).barbeiro.salvarOrdemDaEquipe(["m2", "bb1"]);

    expect(chamada(fetchFalso)).toMatchObject({
      url: "https://api.exemplo.br/equipe/ordem",
      metodo: "PUT",
      corpo: { ids: ["m2", "bb1"] },
    });
    expect(membros).toEqual([]);
  });

  it("salva a ordem das categorias e devolve a barbearia", async () => {
    const fetchFalso = vi.fn(async () => respostaJson({ slug: "gr" }));

    const barbearia = await client(fetchFalso).barbeiro.salvarOrdemDasCategorias(["barba", "cabelo"]);

    expect(chamada(fetchFalso)).toMatchObject({
      url: "https://api.exemplo.br/barbearias/me/categorias/ordem",
      metodo: "PUT",
      corpo: { categorias: ["barba", "cabelo"] },
    });
    expect(barbearia).toEqual({ slug: "gr" });
  });
});

describe("ordens no dublê", () => {
  it("reordena os serviços, e a página pública segue", async () => {
    const falso = criarApiClientFalso();

    const servicos = await falso.barbeiro.salvarOrdemDosServicos(["s2", "s1"]);

    expect(servicos.map((s) => s.id)).toEqual(["s2", "s1"]);
    expect((await falso.publico.servicos(falso.estado.perfil.slug)).map((s) => s.id)).toEqual(["s2", "s1"]);
  });

  it("recusa lista que não é o conjunto da barbearia, como a API", async () => {
    const falso = criarApiClientFalso();

    await expect(falso.barbeiro.salvarOrdemDosServicos(["s1"])).rejects.toMatchObject({
      status: 400,
      codigo: "requisicao_invalida",
    });
    await expect(falso.barbeiro.salvarOrdemDaEquipe(["outro"])).rejects.toBeInstanceOf(ErroDaApi);
  });

  it("reordena a equipe", async () => {
    const falso = criarApiClientFalso();
    const ids = (await falso.barbeiro.equipe()).map((m) => m.id).reverse();

    const membros = await falso.barbeiro.salvarOrdemDaEquipe(ids);

    expect(membros.map((m) => m.id)).toEqual(ids);
  });

  it("guarda a ordem das categorias completa, as que faltam no fim", async () => {
    const falso = criarApiClientFalso();

    const barbearia = await falso.barbeiro.salvarOrdemDasCategorias(["barba", "cabelo"]);

    expect(barbearia.ordemCategorias.slice(0, 2)).toEqual(["barba", "cabelo"]);
    expect([...barbearia.ordemCategorias].sort()).toEqual([...CATEGORIAS_DE_SERVICO].sort());
    expect(falso.estado.perfil.ordemCategorias.slice(0, 2)).toEqual(["barba", "cabelo"]);
  });

  it("só o dono reordena", async () => {
    const falso = criarApiClientFalso({ papel: "recepcao" });

    await expect(falso.barbeiro.salvarOrdemDosServicos(["s1", "s2"])).rejects.toMatchObject({ status: 403 });
  });
});
