// @vitest-environment node
import { describe, expect, it } from "vitest";
import Imagem, { alt, contentType, size } from "../../app/(marketing)/opengraph-image";

// A prévia de quem cola barchop.com.br no WhatsApp. Sem ela, o link
// aparecia só com título e descrição, sem imagem nenhuma.
describe("imagem de Open Graph do site", () => {
  it("é um PNG de 1200×630, o tamanho que WhatsApp, Instagram e LinkedIn esperam", () => {
    expect(size).toEqual({ width: 1200, height: 630 });
    expect(contentType).toBe("image/png");
    expect(alt).toMatch(/BarChop/);
  });

  it("sai desenhada, com as fontes do repositório", async () => {
    // Lê as fontes do disco e desenha: se o caminho da fonte quebrar, o
    // build quebra junto — melhor saber aqui.
    const resposta = await Imagem();
    const bytes = new Uint8Array(await resposta.arrayBuffer());

    expect(resposta.headers.get("content-type")).toBe("image/png");
    // Assinatura do PNG e o cabeçalho IHDR, com largura e altura.
    expect([...bytes.slice(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
    const dados = new DataView(bytes.buffer);
    expect(dados.getUint32(16)).toBe(1200);
    expect(dados.getUint32(20)).toBe(630);
  }, 30_000);
});
