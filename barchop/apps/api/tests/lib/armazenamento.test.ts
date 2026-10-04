import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  armazenamentoDoAmbiente,
  armazenamentoLocal,
  armazenamentoS3,
  tipoPelosBytes,
} from "../../src/lib/armazenamento";

describe("tipoPelosBytes", () => {
  it("reconhece png, jpeg e webp pelos primeiros bytes", () => {
    expect(tipoPelosBytes(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe("image/png");
    expect(tipoPelosBytes(Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0]))).toBe("image/jpeg");
    expect(tipoPelosBytes(Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBP")]))).toBe(
      "image/webp"
    );
  });

  it("qualquer outra coisa é null — svg, gif, texto, vazio", () => {
    for (const bytes of [Buffer.from("<svg/>"), Buffer.from("GIF89a"), Buffer.from("oi"), Buffer.alloc(0)]) {
      expect(tipoPelosBytes(bytes)).toBeNull();
    }
  });
});

describe("armazenamento local", () => {
  it("guarda, lê e apaga; a URL pública aponta pra API", async () => {
    const pasta = await mkdtemp(join(tmpdir(), "barchop-armazenamento-"));
    try {
      const local = armazenamentoLocal({ pasta, urlBase: "http://localhost:3333" });
      const chave = "barbearias/b1/capa/c1.png";

      await local.guardar(chave, Buffer.from("abc"), "image/png");

      expect(local.urlPublica(chave)).toBe("http://localhost:3333/arquivos/barbearias/b1/capa/c1.png");
      expect(await local.ler!(chave)).toEqual({ bytes: Buffer.from("abc"), tipo: "image/png" });
      await local.apagar(chave);
      expect(await local.ler!(chave)).toBeNull();
    } finally {
      await rm(pasta, { recursive: true, force: true });
    }
  });
});

describe("armazenamento S3 (OCI)", () => {
  it("guarda com tipo e cache imutável; apaga; URL pela base pública", async () => {
    const enviados: { nome: string; entrada: Record<string, unknown> }[] = [];
    const cliente = {
      async send(comando: { constructor: { name: string }; input: Record<string, unknown> }) {
        enviados.push({ nome: comando.constructor.name, entrada: comando.input });
        return {};
      },
    };
    const s3 = armazenamentoS3({
      cliente,
      bucket: "barchop-imagens",
      urlBase: "https://objectstorage.sa-saopaulo-1.oraclecloud.com/n/ns/b/barchop-imagens/o",
    });

    await s3.guardar("barbearias/b1/capa/c1.png", Buffer.from("abc"), "image/png");
    await s3.apagar("barbearias/b1/capa/c1.png");

    expect(enviados[0]!.nome).toBe("PutObjectCommand");
    expect(enviados[0]!.entrada).toMatchObject({
      Bucket: "barchop-imagens",
      Key: "barbearias/b1/capa/c1.png",
      ContentType: "image/png",
      CacheControl: "public, max-age=31536000, immutable",
    });
    expect(enviados[1]).toMatchObject({
      nome: "DeleteObjectCommand",
      entrada: { Bucket: "barchop-imagens", Key: "barbearias/b1/capa/c1.png" },
    });
    expect(s3.urlPublica("barbearias/b1/capa/c1.png")).toBe(
      "https://objectstorage.sa-saopaulo-1.oraclecloud.com/n/ns/b/barchop-imagens/o/barbearias/b1/capa/c1.png"
    );
    expect(s3.ler).toBeUndefined();
  });
});

describe("armazenamentoDoAmbiente", () => {
  it("em produção recusa o local: o disco do contêiner some no próximo deploy", () => {
    expect(() => armazenamentoDoAmbiente({ NODE_ENV: "production" })).toThrow(/ARMAZENAMENTO/);
    expect(() => armazenamentoDoAmbiente({ NODE_ENV: "production", ARMAZENAMENTO: "local" })).toThrow(
      /ARMAZENAMENTO/
    );
  });

  it("s3 sem as variáveis não sobe", () => {
    expect(() => armazenamentoDoAmbiente({ NODE_ENV: "production", ARMAZENAMENTO: "s3" })).toThrow(/S3_/);
  });

  it("s3 completo sobe", () => {
    const s3 = armazenamentoDoAmbiente({
      NODE_ENV: "production",
      ARMAZENAMENTO: "s3",
      S3_ENDPOINT: "https://ns.compat.objectstorage.sa-saopaulo-1.oraclecloud.com",
      S3_REGIAO: "sa-saopaulo-1",
      S3_BUCKET: "barchop-imagens",
      S3_CHAVE_DE_ACESSO: "x",
      S3_SEGREDO: "y",
      URL_PUBLICA_DAS_IMAGENS: "https://objectstorage.sa-saopaulo-1.oraclecloud.com/n/ns/b/barchop-imagens/o",
    });
    expect(s3.nome).toBe("s3");
  });

  it("em desenvolvimento, o local por padrão", () => {
    expect(armazenamentoDoAmbiente({ NODE_ENV: "development" }).nome).toBe("local");
  });

  it("valor desconhecido é erro de configuração", () => {
    expect(() => armazenamentoDoAmbiente({ NODE_ENV: "development", ARMAZENAMENTO: "ftp" })).toThrow(/ftp/);
  });
});
