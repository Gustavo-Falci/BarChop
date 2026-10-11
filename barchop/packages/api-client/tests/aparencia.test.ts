import { describe, expect, it, vi } from "vitest";
import { APARENCIA_PADRAO, type Aparencia } from "@barchop/formato";
import type { AparenciaDaPagina } from "@barchop/types";
import { criarApiClient, criarApiClientFalso, ErroDaApi } from "../src/index";

// A Aparência (marco B): o rascunho fica no servidor até o dono publicar
// ou descartar; a página pública só vê o que está no ar.

const OCEANO: AparenciaDaPagina = { ...APARENCIA_PADRAO, tema: "oceano", cantos: "pilula" };

// O tipo de @barchop/types é cópia à mão do de @barchop/formato (o pacote
// de tipos não depende de nenhum outro). Se um dos dois mudar sozinho, o
// type-check quebra aqui.
type MesmoFormato = [Aparencia] extends [AparenciaDaPagina]
  ? [AparenciaDaPagina] extends [Aparencia]
    ? true
    : false
  : false;
const mesmoFormato: MesmoFormato = true;
void mesmoFormato;

function respostaJson(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json" } });
}

describe("api do barbeiro — aparência", () => {
  it("salvar, publicar e descartar vão nas rotas certas, com o token", async () => {
    const fetchFalso = vi.fn(async (_url: string, _init?: RequestInit) => respostaJson({ id: "b1" }));
    const barbeiro = criarApiClient({
      baseUrl: "https://api.exemplo.br",
      fetch: fetchFalso as unknown as typeof globalThis.fetch,
      obterToken: () => "tok",
    }).barbeiro;

    await barbeiro.salvarRascunhoDaAparencia(OCEANO);
    await barbeiro.publicarAparencia();
    await barbeiro.descartarRascunhoDaAparencia();

    expect(fetchFalso.mock.calls.map(([url, init]) => [url, init!.method])).toEqual([
      ["https://api.exemplo.br/barbearias/me/aparencia/rascunho", "PUT"],
      ["https://api.exemplo.br/barbearias/me/aparencia/publicar", "POST"],
      ["https://api.exemplo.br/barbearias/me/aparencia/rascunho", "DELETE"],
    ]);
    expect(JSON.parse(fetchFalso.mock.calls[0]![1]!.body as string)).toEqual(OCEANO);
    expect((fetchFalso.mock.calls[0]![1]!.headers as Record<string, string>).Authorization).toBe("Bearer tok");
  });
});

describe("dublê — aparência", () => {
  it("nasce com o padrão no ar e sem rascunho", async () => {
    const falso = criarApiClientFalso();

    const painel = await falso.barbeiro.minhaBarbearia();
    expect(painel.aparencia).toEqual(APARENCIA_PADRAO);
    expect(painel.aparenciaRascunho).toBeNull();
    expect((await falso.publico.perfilDaBarbearia("gr-barber")).aparencia).toEqual(APARENCIA_PADRAO);
  });

  it("o rascunho não chega na página pública até publicar", async () => {
    const falso = criarApiClientFalso();

    const salvo = await falso.barbeiro.salvarRascunhoDaAparencia(OCEANO);
    expect(salvo.aparenciaRascunho).toEqual(OCEANO);
    expect((await falso.publico.perfilDaBarbearia("gr-barber")).aparencia).toEqual(APARENCIA_PADRAO);

    const publicado = await falso.barbeiro.publicarAparencia();
    expect(publicado.aparencia).toEqual(OCEANO);
    expect(publicado.aparenciaRascunho).toBeNull();
    expect((await falso.publico.perfilDaBarbearia("gr-barber")).aparencia).toEqual(OCEANO);
  });

  it("rascunho igual ao que está no ar é nada pendente", async () => {
    const falso = criarApiClientFalso();
    await falso.barbeiro.salvarRascunhoDaAparencia(OCEANO);

    expect((await falso.barbeiro.salvarRascunhoDaAparencia(APARENCIA_PADRAO)).aparenciaRascunho).toBeNull();
  });

  it("descartar limpa o rascunho e deixa o que está no ar", async () => {
    const falso = criarApiClientFalso();
    await falso.barbeiro.salvarRascunhoDaAparencia(OCEANO);

    const depois = await falso.barbeiro.descartarRascunhoDaAparencia();
    expect(depois.aparenciaRascunho).toBeNull();
    expect(depois.aparencia).toEqual(APARENCIA_PADRAO);
  });

  it("publicar sem rascunho é 409, como na API", async () => {
    const falso = criarApiClientFalso();

    await expect(falso.barbeiro.publicarAparencia()).rejects.toMatchObject({ status: 409 });
  });

  it("só o dono mexe", async () => {
    const falso = criarApiClientFalso({ papel: "profissional" });

    await expect(falso.barbeiro.salvarRascunhoDaAparencia(OCEANO)).rejects.toBeInstanceOf(ErroDaApi);
    await expect(falso.barbeiro.salvarRascunhoDaAparencia(OCEANO)).rejects.toMatchObject({ status: 403 });
  });
});
