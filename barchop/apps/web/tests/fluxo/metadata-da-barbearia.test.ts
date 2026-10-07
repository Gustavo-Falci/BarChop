import { describe, expect, it } from "vitest";
import { metadataDaBarbearia } from "../../src/fluxo/metadataDaBarbearia";

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

// É isto que o WhatsApp mostra quando o barbeiro cola o link: antes
// toda página do fluxo se chamava "BarChop", e a prévia não dizia de
// qual barbearia era.
describe("metadata da barbearia", () => {
  it("usa o nome da barbearia como título e na prévia do link", async () => {
    const metadata = await metadataDaBarbearia(
      "barbearia-do-gu",
      fetchQueResponde(200, PERFIL)
    );

    expect(metadata.title).toBe("Barbearia do Gu");
    expect(metadata.openGraph?.title).toBe("Barbearia do Gu");
  });

  it("descreve com a apresentação numa linha só, sem as quebras que o barbeiro digitou", async () => {
    const metadata = await metadataDaBarbearia(
      "barbearia-do-gu",
      fetchQueResponde(200, {
        ...PERFIL,
        sobre: "Barbearia de bairro.\nCorte na tesoura.\n\nAgende pelo link.",
      })
    );

    expect(metadata.description).toBe(
      "Barbearia de bairro. Corte na tesoura. Agende pelo link."
    );
    expect(metadata.openGraph?.description).toBe(metadata.description);
  });

  it("corta apresentação longa na palavra, com reticências", async () => {
    const metadata = await metadataDaBarbearia(
      "barbearia-do-gu",
      fetchQueResponde(200, { ...PERFIL, sobre: "palavra ".repeat(60) })
    );

    const descricao = metadata.description as string;
    expect(descricao.length).toBeLessThanOrEqual(160);
    expect(descricao.endsWith("palavra…")).toBe(true);
  });

  it("sem apresentação, convida pra agendar", async () => {
    const metadata = await metadataDaBarbearia(
      "barbearia-do-gu",
      fetchQueResponde(200, PERFIL)
    );

    expect(metadata.description).toBe("Agende seu horário na Barbearia do Gu.");
  });

  it("slug que não existe não derruba a página: cai no título padrão", async () => {
    const metadata = await metadataDaBarbearia(
      "sumiu",
      fetchQueResponde(404, { erro: "nao_encontrado", mensagem: "x" })
    );

    expect(metadata).toEqual({});
  });

  it("API fora do ar também cai no padrão", async () => {
    const metadata = await metadataDaBarbearia("barbearia-do-gu", async () => {
      throw new TypeError("fetch failed");
    });

    expect(metadata).toEqual({});
  });

  // Todo caminho sem rota própria cai em /[slug]: o favicon.ico que o
  // navegador pede sozinho, o apple-touch-icon.png do iPhone, os robôs
  // atrás de /wp-login.php. Nenhum deles pode ser link de barbearia, e
  // cada um custava uma ida à API (400) por página. Visto em produção.
  it.each([
    "favicon.ico",
    "apple-touch-icon.png",
    "wp-login.php",
    "Barbearia-Do-Gu",
    "termos",
  ])("%s não pode ser link de barbearia: nem pergunta à API", async (slug) => {
    let chamadas = 0;
    const metadata = await metadataDaBarbearia(slug, async () => {
      chamadas++;
      return new Response("{}", { status: 400 });
    });

    expect(chamadas).toBe(0);
    expect(metadata).toEqual({});
  });
});
