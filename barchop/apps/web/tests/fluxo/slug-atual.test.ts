import { describe, expect, it } from "vitest";
import { slugAtual } from "../../src/fluxo/slugAtual";

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
