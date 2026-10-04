import { describe, expect, it, vi } from "vitest";
import { criarApiClient, criarApiClientFalso } from "../src/index";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

function respostaJson(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json" } });
}

function clientComFetch(fetchFalso: ReturnType<typeof vi.fn>) {
  return criarApiClient({
    baseUrl: "https://api.exemplo.br",
    fetch: fetchFalso as unknown as typeof globalThis.fetch,
    obterToken: () => "tok",
  });
}

describe("api do barbeiro — imagens", () => {
  it("envia a capa como multipart, com o token, sem Content-Type à mão", async () => {
    // O navegador põe o Content-Type com o boundary; um à mão quebraria o
    // corpo.
    const fetchFalso = vi.fn(async (_url: string, _init?: RequestInit) =>
      respostaJson({ capaUrl: "https://img/capa.png" })
    );

    const url = await clientComFetch(fetchFalso).barbeiro.enviarCapa(new Blob([PNG], { type: "image/png" }));

    const [destino, init] = fetchFalso.mock.calls[0]!;
    expect(destino).toBe("https://api.exemplo.br/barbearias/me/capa");
    expect(init!.method).toBe("POST");
    expect(init!.body).toBeInstanceOf(FormData);
    expect((init!.body as FormData).get("arquivo")).toBeInstanceOf(Blob);
    const cabecalhos = init!.headers as Record<string, string>;
    expect(cabecalhos.Authorization).toBe("Bearer tok");
    expect(Object.keys(cabecalhos).map((c) => c.toLowerCase())).not.toContain("content-type");
    expect(url).toBe("https://img/capa.png");
  });

  it("foto do membro e remoções", async () => {
    const fetchFalso = vi.fn(async (_url: string, _init?: RequestInit) =>
      _init?.method === "DELETE" ? new Response(null, { status: 204 }) : respostaJson({ fotoUrl: "https://img/f.png" })
    );
    const barbeiro = clientComFetch(fetchFalso).barbeiro;

    expect(await barbeiro.enviarFotoDoMembro("m1", new Blob([PNG]))).toBe("https://img/f.png");
    await barbeiro.removerFotoDoMembro("m1");
    await barbeiro.removerCapa();

    expect(fetchFalso.mock.calls.map(([url, init]) => [url, init!.method])).toEqual([
      ["https://api.exemplo.br/equipe/m1/foto", "POST"],
      ["https://api.exemplo.br/equipe/m1/foto", "DELETE"],
      ["https://api.exemplo.br/barbearias/me/capa", "DELETE"],
    ]);
  });
});

describe("dublê — imagens", () => {
  it("a capa enviada aparece no painel e na página pública; remover limpa", async () => {
    const falso = criarApiClientFalso();

    const url = await falso.barbeiro.enviarCapa(new Blob([PNG]));

    expect((await falso.barbeiro.minhaBarbearia()).capaUrl).toBe(url);
    expect((await falso.publico.perfilDaBarbearia("gr-barber")).capaUrl).toBe(url);
    await falso.barbeiro.removerCapa();
    expect((await falso.publico.perfilDaBarbearia("gr-barber")).capaUrl).toBeNull();
  });

  it("a foto do membro aparece na equipe e na página pública", async () => {
    const falso = criarApiClientFalso();

    const url = await falso.barbeiro.enviarFotoDoMembro("bb1", new Blob([PNG]));

    expect((await falso.barbeiro.equipe()).find((m) => m.id === "bb1")!.fotoUrl).toBe(url);
    expect((await falso.publico.perfilDaBarbearia("gr-barber")).barbeiros[0]!.fotoUrl).toBe(url);
  });

  it("recusa como a API: não é imagem (422) e grande demais (413)", async () => {
    const falso = criarApiClientFalso();

    await expect(falso.barbeiro.enviarCapa(new Blob(["<svg/>"]))).rejects.toMatchObject({
      status: 422,
      codigo: "tipo_de_imagem_invalido",
    });
    const grande = new Blob([PNG, new Uint8Array(4 * 1024 * 1024 + 1)]);
    await expect(falso.barbeiro.enviarCapa(grande)).rejects.toMatchObject({
      status: 413,
      codigo: "arquivo_grande_demais",
    });
  });
});
