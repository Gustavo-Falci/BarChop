import { describe, expect, it } from "vitest";
import { ImagemInvalida, semMetadados } from "../../src/lib/metadados-de-imagem";
import {
  blocoDoJpeg,
  blocoDoPng,
  blocoDoWebp,
  comentario,
  exif,
  jpeg,
  png,
  webp,
} from "../helpers/imagens";

// Auditoria de segurança de 15/11, SEC-020: foto de celular leva no EXIF
// as coordenadas de onde foi tirada, e as imagens vão pra um bucket de
// leitura pública.
const SEGREDO = "GPS -23.5505,-46.6333";

function texto(bytes: Buffer): string {
  return bytes.toString("latin1");
}

describe("semMetadados: JPEG", () => {
  it("tira o Exif, o XMP, o IPTC e o comentário; a imagem passa byte a byte", () => {
    const limpo = jpeg();
    const sujo = jpeg([
      exif(1, SEGREDO),
      blocoDoJpeg(0xe1, `http://ns.adobe.com/xap/1.0/\0<x:xmpmeta>${SEGREDO}</x:xmpmeta>`),
      blocoDoJpeg(0xed, `Photoshop 3.0\0${SEGREDO}`),
      comentario(`feito em ${SEGREDO}`),
    ]);

    const saida = semMetadados(sujo, "image/jpeg");

    expect(texto(saida)).not.toContain(SEGREDO);
    expect(texto(saida)).not.toContain("Exif");
    // Orientação 1 é "em pé, como está": nada a preservar, e o que sobra
    // é exatamente a imagem sem os blocos extras.
    expect(saida.equals(limpo)).toBe(true);
  });

  it("guarda a orientação, e só ela: foto de celular em pé não aparece deitada", () => {
    const saida = semMetadados(jpeg([exif(6, SEGREDO)]), "image/jpeg");

    expect(texto(saida)).not.toContain(SEGREDO);
    // Um Exif mínimo, logo depois do JFIF, com a etiqueta 0x0112 = 6.
    const emExif = saida.indexOf(Buffer.from("Exif\0\0", "latin1"));
    expect(emExif).toBeGreaterThan(0);
    const tiff = saida.subarray(emExif + 6);
    expect(tiff.toString("latin1", 0, 2)).toBe("II");
    expect(tiff.readUInt16LE(10)).toBe(0x0112);
    expect(tiff.readUInt16LE(18)).toBe(6);
    // O JFIF continua abrindo o arquivo.
    expect(saida.toString("latin1", 6, 10)).toBe("JFIF");
    // E o resultado continua sendo um JPEG que a própria função lê.
    expect(semMetadados(saida, "image/jpeg").equals(saida)).toBe(true);
  });

  it("mantém o perfil de cor e o bloco da Adobe, que mudam como a imagem é desenhada", () => {
    const perfil = blocoDoJpeg(0xe2, "ICC_PROFILE\0perfil");
    const adobe = blocoDoJpeg(0xee, "Adobe\0cores");

    const saida = semMetadados(jpeg([perfil, exif(1), adobe]), "image/jpeg");

    expect(texto(saida)).toContain("ICC_PROFILE");
    expect(texto(saida)).toContain("Adobe");
  });

  it("o que vem depois do fim da imagem sai", () => {
    // Fotos "com movimento" e alguns editores penduram uma segunda imagem
    // depois do fim — com o Exif dela.
    const saida = semMetadados(jpeg([], Buffer.concat([exif(1, SEGREDO), Buffer.from("lixo")])), "image/jpeg");

    expect(saida.equals(jpeg())).toBe(true);
  });

  it("recusa JPEG cortado, sem fim ou com bloco de tamanho errado", () => {
    const inteiro = jpeg();
    expect(() => semMetadados(inteiro.subarray(0, inteiro.length - 2), "image/jpeg")).toThrow(ImagemInvalida);
    expect(() => semMetadados(inteiro.subarray(0, 12), "image/jpeg")).toThrow(ImagemInvalida);
    expect(() => semMetadados(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0xff, 0xff, 1, 2]), "image/jpeg")).toThrow(ImagemInvalida);
    expect(() => semMetadados(Buffer.from([0xff, 0xd8, 0x00, 0x01, 0xff, 0xd9]), "image/jpeg")).toThrow(ImagemInvalida);
  });
});

describe("semMetadados: PNG", () => {
  it("tira o Exif, os textos e a data; o resto passa byte a byte", () => {
    const sujo = png([
      blocoDoPng("eXIf", Buffer.from(SEGREDO, "latin1")),
      blocoDoPng("tEXt", Buffer.from(`Comment\0${SEGREDO}`, "latin1")),
      blocoDoPng("iTXt", Buffer.from(`XML:com.adobe.xmp\0${SEGREDO}`, "latin1")),
      blocoDoPng("zTXt", Buffer.from(SEGREDO, "latin1")),
      blocoDoPng("tIME", Buffer.alloc(7, 1)),
    ]);

    const saida = semMetadados(sujo, "image/png");

    expect(saida.equals(png())).toBe(true);
  });

  it("mantém transparência, paleta e cor; tira o que vem depois do fim", () => {
    const cor = [blocoDoPng("PLTE", Buffer.alloc(6, 5)), blocoDoPng("tRNS", Buffer.alloc(2, 6)), blocoDoPng("gAMA", Buffer.alloc(4, 7))];

    const saida = semMetadados(png(cor, Buffer.from(SEGREDO, "latin1")), "image/png");

    expect(saida.equals(png(cor))).toBe(true);
  });

  it("recusa PNG cortado ou sem fim", () => {
    const inteiro = png();
    expect(() => semMetadados(inteiro.subarray(0, inteiro.length - 12), "image/png")).toThrow(ImagemInvalida);
    expect(() => semMetadados(inteiro.subarray(0, 20), "image/png")).toThrow(ImagemInvalida);
  });
});

describe("semMetadados: WebP", () => {
  const imagem = blocoDoWebp("VP8 ", Buffer.alloc(31, 3));

  it("tira o Exif e o XMP, apaga os avisos do cabeçalho e acerta o tamanho", () => {
    // 0x0c = avisos de Exif e de XMP ligados; 0x10 = transparência.
    const cabecalho = (avisos: number) => blocoDoWebp("VP8X", Buffer.from([avisos, 0, 0, 0, 1, 0, 0, 1, 0, 0]));
    const sujo = webp([
      cabecalho(0x1c),
      imagem,
      blocoDoWebp("EXIF", Buffer.from(SEGREDO, "latin1")),
      blocoDoWebp("XMP ", Buffer.from(`<x>${SEGREDO}</x>`, "latin1")),
    ]);

    const saida = semMetadados(sujo, "image/webp");

    expect(texto(saida)).not.toContain(SEGREDO);
    expect(saida.equals(webp([cabecalho(0x10), imagem]))).toBe(true);
    expect(saida.readUInt32LE(4)).toBe(saida.length - 8);
  });

  it("WebP simples passa como está; a sobra depois do tamanho declarado sai", () => {
    expect(semMetadados(webp([imagem]), "image/webp").equals(webp([imagem]))).toBe(true);
    expect(semMetadados(webp([imagem], Buffer.from(SEGREDO, "latin1")), "image/webp").equals(webp([imagem]))).toBe(true);
  });

  it("recusa WebP com tamanho que não bate ou sem imagem", () => {
    const inteiro = webp([imagem]);
    expect(() => semMetadados(inteiro.subarray(0, inteiro.length - 4), "image/webp")).toThrow(ImagemInvalida);
    expect(() => semMetadados(webp([]), "image/webp")).toThrow(ImagemInvalida);
  });
});
