import { describe, expect, it } from "vitest";
import { APARENCIA_PADRAO } from "@barchop/formato";
import { barbeariaDoLayout, procurarBarbearia, slugAtual } from "../../src/fluxo/slugAtual";

function fetchQueResponde(status: number, corpo: unknown): typeof fetch {
  return async () =>
    new Response(JSON.stringify(corpo), {
      status,
      headers: { "Content-Type": "application/json" },
    });
}

const PERFIL = {
  id: "b1",
  nome: "Barbearia do Gu",
  slug: "barbearia-do-gu",
  endereco: null,
  sobre: null,
  horarios: [],
  barbeiros: [],
};

// O layout também leva a Aparência publicada (marco C), da mesma busca.
describe("barbeariaDoLayout", () => {
  it("devolve o slug e a aparência, normalizada", async () => {
    const lida = await barbeariaDoLayout(
      "barbearia-do-gu",
      fetchQueResponde(200, { ...PERFIL, aparencia: { tema: "oceano", cantos: "estrela" } })
    );

    expect(lida).toEqual({ slug: "barbearia-do-gu", aparencia: { ...APARENCIA_PADRAO, tema: "oceano" } });
  });

  it("API de antes da Aparência (sem o campo): o padrão", async () => {
    // O web pode subir antes da API (a lição do #104).
    const lida = await barbeariaDoLayout("barbearia-do-gu", fetchQueResponde(200, PERFIL));

    expect(lida?.aparencia).toEqual(APARENCIA_PADRAO);
  });

  it("falha da API: null, e a página segue", async () => {
    expect(await barbeariaDoLayout("barbearia-do-gu", fetchQueResponde(500, {}))).toBeNull();
  });
});

// O 404 de verdade (canvas "Página não encontrada", 15/11): o layout só
// responde 404 quando sabe que a barbearia não existe. API fora do ar não
// é "não existe": a página abre e a tela explica.
describe("procurarBarbearia", () => {
  it("achou: o slug atual e a aparência", async () => {
    const achado = await procurarBarbearia("barbearia-do-gu", fetchQueResponde(200, PERFIL));

    expect(achado).toEqual({ tipo: "achada", slug: "barbearia-do-gu", aparencia: APARENCIA_PADRAO });
  });

  it("a API diz 404: não existe", async () => {
    const achado = await procurarBarbearia(
      "sumiu",
      fetchQueResponde(404, { erro: "nao_encontrado", mensagem: "barbearia não encontrada" })
    );

    expect(achado).toEqual({ tipo: "nao_existe" });
  });

  it.each(["blog", "home", "wp-login.php", "Barbearia-Do-Gu"])(
    "%s não pode ser link de barbearia: não existe, sem perguntar à API",
    async (slug) => {
      let chamadas = 0;
      const achado = await procurarBarbearia(slug, async () => {
        chamadas++;
        return new Response("{}", { status: 200 });
      });

      expect(chamadas).toBe(0);
      expect(achado).toEqual({ tipo: "nao_existe" });
    }
  );

  it("API com erro ou fora do ar: sem resposta, nunca 'não existe'", async () => {
    expect(await procurarBarbearia("barbearia-do-gu", fetchQueResponde(500, {}))).toEqual({
      tipo: "sem_resposta",
    });
    expect(
      await procurarBarbearia("barbearia-do-gu", async () => {
        throw new TypeError("fetch failed");
      })
    ).toEqual({ tipo: "sem_resposta" });
  });
});

// O layout de /[slug] pergunta à API qual é o slug atual da barbearia,
// pra redirecionar o link antigo pro novo (E3c).
describe("slug atual da barbearia", () => {
  it("devolve o slug que a API diz ser o atual", async () => {
    const atual = await slugAtual("nome-antigo", fetchQueResponde(200, PERFIL));

    expect(atual).toBe("barbearia-do-gu");
  });

  it("slug que não existe devolve null: quem explica é a tela", async () => {
    const atual = await slugAtual(
      "sumiu",
      fetchQueResponde(404, { erro: "nao_encontrado", mensagem: "x" })
    );

    expect(atual).toBeNull();
  });

  it("API fora do ar devolve null e a página segue", async () => {
    const atual = await slugAtual("barbearia-do-gu", async () => {
      throw new TypeError("fetch failed");
    });

    expect(atual).toBeNull();
  });

  // Mesmos casos da metadata: cada um custava uma ida à API por página.
  it.each([
    "favicon.ico",
    "apple-touch-icon.png",
    "wp-login.php",
    "Barbearia-Do-Gu",
    "termos",
  ])("%s não pode ser link de barbearia: nem pergunta à API", async (slug) => {
    let chamadas = 0;
    const atual = await slugAtual(slug, async () => {
      chamadas++;
      return new Response("{}", { status: 400 });
    });

    expect(chamadas).toBe(0);
    expect(atual).toBeNull();
  });
});
