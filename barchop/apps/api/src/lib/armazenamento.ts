import { mkdtempSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

// Onde ficam as imagens (capa da barbearia, foto do profissional — bloco
// E2). O arquivo passa pela API, que confere tipo e tamanho e chama
// `guardar`; no banco vai só a CHAVE, e a URL pública sai daqui. Assim
// trocar de bucket ou de domínio não exige reescrever linha nenhuma, e o
// cliente nunca manda URL. Em produção é o Object Storage da OCI (API
// compatível com S3); em desenvolvimento e nos testes, uma pasta.
export interface Armazenamento {
  nome: string;
  guardar(chave: string, bytes: Buffer, tipo: TipoDeImagem): Promise<void>;
  apagar(chave: string): Promise<void>;
  urlPublica(chave: string): string;
  // Só o local: a própria API serve o arquivo (GET /arquivos/*). No S3,
  // quem serve é o bucket.
  ler?(chave: string): Promise<{ bytes: Buffer; tipo: TipoDeImagem } | null>;
}

export type TipoDeImagem = "image/png" | "image/jpeg" | "image/webp";

export const EXTENSAO_DO_TIPO: Record<TipoDeImagem, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

const TIPO_DA_EXTENSAO: Record<string, TipoDeImagem> = {
  png: "image/png",
  jpg: "image/jpeg",
  webp: "image/webp",
};

// A chave nunca muda de conteúdo (UUID novo a cada envio): o navegador
// pode guardar pra sempre.
const CACHE_IMUTAVEL = "public, max-age=31536000, immutable";

// O tipo pelos primeiros bytes, nunca pelo nome nem pelo Content-Type de
// quem enviou. Só png, jpeg e webp: SVG é texto que o navegador executa
// (script dentro da imagem), e GIF/HEIC não precisam existir aqui.
export function tipoPelosBytes(bytes: Buffer): TipoDeImagem | null {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "image/png";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString("latin1") === "RIFF" &&
    bytes.subarray(8, 12).toString("latin1") === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

export function armazenamentoLocal({ pasta, urlBase }: { pasta: string; urlBase: string }): Armazenamento {
  const raiz = resolve(pasta);
  // Defesa em profundidade: a rota já valida a chave por regex, mas o
  // caminho resolvido tem que continuar dentro da pasta de qualquer jeito.
  const caminhoDe = (chave: string): string => {
    const caminho = resolve(raiz, chave);
    if (!caminho.startsWith(raiz + sep)) throw new Error("chave fora da pasta de arquivos");
    return caminho;
  };
  const base = urlBase.replace(/\/+$/, "");

  return {
    nome: "local",
    async guardar(chave, bytes) {
      const caminho = caminhoDe(chave);
      await mkdir(dirname(caminho), { recursive: true });
      await writeFile(caminho, bytes);
    },
    async apagar(chave) {
      await rm(caminhoDe(chave), { force: true });
    },
    urlPublica(chave) {
      return `${base}/arquivos/${chave}`;
    },
    async ler(chave) {
      const tipo = TIPO_DA_EXTENSAO[chave.split(".").pop() ?? ""];
      if (!tipo) return null;
      try {
        return { bytes: await readFile(caminhoDe(chave)), tipo };
      } catch {
        return null;
      }
    },
  };
}

// O cliente entra por parâmetro: os testes passam um falso que só
// registra o comando, sem rede.
interface ClienteS3 {
  send(comando: { input: unknown }): Promise<unknown>;
}

export function armazenamentoS3({
  cliente,
  bucket,
  urlBase,
}: {
  cliente: ClienteS3;
  bucket: string;
  urlBase: string;
}): Armazenamento {
  const base = urlBase.replace(/\/+$/, "");
  return {
    nome: "s3",
    async guardar(chave, bytes, tipo) {
      await cliente.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: chave,
          Body: bytes,
          ContentType: tipo,
          CacheControl: CACHE_IMUTAVEL,
        })
      );
    },
    async apagar(chave) {
      await cliente.send(new DeleteObjectCommand({ Bucket: bucket, Key: chave }));
    },
    urlPublica(chave) {
      return `${base}/${chave}`;
    },
  };
}

// Escolhe pelo ambiente, como o canal e a fila. Em produção o local é
// recusado: na VM da OCI os arquivos iriam pro disco do contêiner e
// sumiriam no próximo deploy, sem erro nenhum em lugar nenhum.
export function armazenamentoDoAmbiente(env: Record<string, string | undefined> = process.env): Armazenamento {
  const pedido = env.ARMAZENAMENTO ?? (env.NODE_ENV === "production" ? undefined : "local");
  if (env.NODE_ENV === "production" && pedido !== "s3") {
    throw new Error("ARMAZENAMENTO=s3 é obrigatório em produção — o disco do contêiner não guarda imagem.");
  }
  if (pedido === "local") {
    return armazenamentoLocal({
      pasta: env.PASTA_DOS_ARQUIVOS ?? ".arquivos",
      urlBase: env.URL_DA_API ?? "http://localhost:3333",
    });
  }
  if (pedido === "s3") {
    const faltando = [
      "S3_ENDPOINT",
      "S3_REGIAO",
      "S3_BUCKET",
      "S3_CHAVE_DE_ACESSO",
      "S3_SEGREDO",
      "URL_PUBLICA_DAS_IMAGENS",
    ].filter((nome) => !env[nome]);
    if (faltando.length > 0) throw new Error(`ARMAZENAMENTO=s3 sem ${faltando.join(", ")}`);
    return armazenamentoS3({
      // `forcePathStyle`: o endpoint compatível da OCI é path-style
      // (https://<namespace>.compat.objectstorage.<região>.oraclecloud.com/<bucket>).
      cliente: new S3Client({
        region: env.S3_REGIAO,
        endpoint: env.S3_ENDPOINT,
        forcePathStyle: true,
        credentials: { accessKeyId: env.S3_CHAVE_DE_ACESSO!, secretAccessKey: env.S3_SEGREDO! },
      }),
      bucket: env.S3_BUCKET!,
      urlBase: env.URL_PUBLICA_DAS_IMAGENS!,
    });
  }
  throw new Error(`ARMAZENAMENTO desconhecido: "${pedido}"`);
}

// O que o buildApp usa sem armazenamento passado. Nos testes, uma pasta
// temporária por app: nada cai no repositório, e um teste não vê os
// arquivos do outro.
export function armazenamentoPadrao(env: Record<string, string | undefined> = process.env): Armazenamento {
  if (env.NODE_ENV === "test") {
    return armazenamentoLocal({
      pasta: mkdtempSync(join(tmpdir(), "barchop-arquivos-")),
      urlBase: "http://localhost:3333",
    });
  }
  return armazenamentoDoAmbiente(env);
}
