import { randomUUID } from "node:crypto";
import type { FastifyRequest } from "fastify";
import { prisma } from "@barchop/database";
import { EXTENSAO_DO_TIPO, tipoPelosBytes } from "../lib/armazenamento";
import { ErroDeNegocio } from "../lib/erro-negocio";
import { ErroHttp, naoEncontrado } from "../lib/erro-http";
import { PADRAO_UUID } from "../lib/padroes";
import { exigirPapel } from "../plugins/auth";
import type { App } from "../tipos";

// Capa da barbearia e foto do profissional (Onda 1, bloco E2). O arquivo
// passa pela API — e não direto do navegador pro bucket — porque o CORS
// do Object Storage da OCI não estava confirmado, e porque assim a API
// confere o tipo pelos bytes em produção também. O cliente manda só o
// arquivo: a chave é sorteada aqui e a URL sai do armazenamento.
//
// Só o dono: `PATCH /equipe/:id` também é só dele. O profissional não
// troca a própria foto por enquanto.

// Depois do redimensionamento no navegador uma foto fica bem abaixo
// disto; o teto é pra quem pula a tela.
const LIMITE_DA_CAPA = 4 * 1024 * 1024;
const LIMITE_DA_FOTO = 2 * 1024 * 1024;

const paramsComId = {
  type: "object",
  required: ["id"],
  additionalProperties: false,
  properties: { id: { type: "string", pattern: PADRAO_UUID } },
} as const;

// Lê o único arquivo da requisição, com teto, e devolve os bytes e o tipo
// tirado deles. A guarda de papel já rodou no onRequest: nenhum byte do
// corpo é lido antes de saber quem mandou.
async function lerImagem(request: FastifyRequest, limite: number) {
  const parte = await request.file({ limits: { fileSize: limite, files: 1, fields: 5 } });
  if (!parte) throw new ErroHttp(400, "requisicao_invalida", "envie a imagem no campo `arquivo`");

  let bytes: Buffer;
  try {
    bytes = await parte.toBuffer();
  } catch (erro) {
    if ((erro as { code?: string }).code === "FST_REQ_FILE_TOO_LARGE") {
      throw new ErroHttp(413, "arquivo_grande_demais", `a imagem passa de ${limite / 1024 / 1024} MB`);
    }
    throw erro;
  }

  const tipo = tipoPelosBytes(bytes);
  if (!tipo) {
    throw new ErroDeNegocio("só png, jpeg ou webp", "tipo_de_imagem_invalido");
  }
  return { bytes, tipo };
}

// Apagar o arquivo antigo é melhor-esforço: o banco já aponta pro novo, e
// um arquivo órfão no bucket não quebra nada (dívida no roteiro).
async function apagarSemFalhar(app: App, chave: string | null): Promise<void> {
  if (!chave) return;
  try {
    await app.armazenamento.apagar(chave);
  } catch (erro) {
    app.log.error({ err: erro, chave }, "imagem antiga não apagada");
  }
}

// Registradas num escopo que já tem o `autenticar` e o @fastify/multipart
// (ver app.ts): nenhuma outra rota passa a aceitar multipart.
export function registrarRotasImagens(app: App): void {
  app.post("/barbearias/me/capa", { onRequest: exigirPapel("dono") }, async (request) => {
    const barbeariaId = request.user.barbeariaId;
    const { bytes, tipo } = await lerImagem(request, LIMITE_DA_CAPA);
    const chave = `barbearias/${barbeariaId}/capa/${randomUUID()}.${EXTENSAO_DO_TIPO[tipo]}`;

    await app.armazenamento.guardar(chave, bytes, tipo);
    const antes = await prisma.barbearia.findUniqueOrThrow({
      where: { id: barbeariaId },
      select: { capaChave: true },
    });
    await prisma.barbearia.update({ where: { id: barbeariaId }, data: { capaChave: chave } });
    await apagarSemFalhar(app, antes.capaChave);

    return { capaUrl: app.armazenamento.urlPublica(chave) };
  });

  app.delete("/barbearias/me/capa", { onRequest: exigirPapel("dono") }, async (request, reply) => {
    const barbeariaId = request.user.barbeariaId;
    const antes = await prisma.barbearia.findUniqueOrThrow({
      where: { id: barbeariaId },
      select: { capaChave: true },
    });
    await prisma.barbearia.update({ where: { id: barbeariaId }, data: { capaChave: null } });
    await apagarSemFalhar(app, antes.capaChave);
    return reply.code(204).send();
  });

  app.post(
    "/equipe/:id/foto",
    { schema: { params: paramsComId }, onRequest: exigirPapel("dono") },
    async (request) => {
      const barbeariaId = request.user.barbeariaId;
      // Membro de outra barbearia: 404, como em toda rota da equipe.
      const membro = await prisma.barbeiro.findFirst({
        where: { id: request.params.id, barbeariaId },
        select: { id: true, fotoChave: true },
      });
      if (!membro) throw naoEncontrado("membro não encontrado");

      const { bytes, tipo } = await lerImagem(request, LIMITE_DA_FOTO);
      const chave = `barbearias/${barbeariaId}/equipe/${membro.id}/${randomUUID()}.${EXTENSAO_DO_TIPO[tipo]}`;

      await app.armazenamento.guardar(chave, bytes, tipo);
      await prisma.barbeiro.update({ where: { id: membro.id }, data: { fotoChave: chave } });
      await apagarSemFalhar(app, membro.fotoChave);

      return { fotoUrl: app.armazenamento.urlPublica(chave) };
    }
  );

  app.delete(
    "/equipe/:id/foto",
    { schema: { params: paramsComId }, onRequest: exigirPapel("dono") },
    async (request, reply) => {
      const membro = await prisma.barbeiro.findFirst({
        where: { id: request.params.id, barbeariaId: request.user.barbeariaId },
        select: { id: true, fotoChave: true },
      });
      if (!membro) throw naoEncontrado("membro não encontrado");
      await prisma.barbeiro.update({ where: { id: membro.id }, data: { fotoChave: null } });
      await apagarSemFalhar(app, membro.fotoChave);
      return reply.code(204).send();
    }
  );
}

// O formato exato das chaves que a API sorteia. Validada antes de chegar
// perto do disco: é o que impede `../` de virar leitura de arquivo.
const FORMATO_DA_CHAVE =
  /^barbearias\/[0-9a-f-]{36}\/(capa|equipe\/[0-9a-f-]{36})\/[0-9a-f-]{36}\.(png|jpg|webp)$/;

// Só no armazenamento local (desenvolvimento e testes): no S3 quem serve
// é o bucket. Pública, porque a imagem é da página pública.
export function registrarRotaDeArquivos(app: App): void {
  const ler = app.armazenamento.ler;
  if (!ler) return;

  app.get("/arquivos/*", async (request, reply) => {
    const chave = (request.params as { "*": string })["*"];
    if (!FORMATO_DA_CHAVE.test(chave)) throw naoEncontrado("arquivo não encontrado");
    const arquivo = await ler(chave);
    if (!arquivo) throw naoEncontrado("arquivo não encontrado");
    return reply
      .header("content-type", arquivo.tipo)
      .header("x-content-type-options", "nosniff")
      .header("cache-control", "public, max-age=31536000, immutable")
      .send(arquivo.bytes);
  });
}
