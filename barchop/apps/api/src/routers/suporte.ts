import { prisma } from "@barchop/database";
import { normalizarEmail } from "@barchop/formato";
import { ErroHttp } from "../lib/erro-http";
import { ErroDeNegocio } from "../lib/erro-negocio";
import type { LimitesDeAuth } from "../lib/limites";
import { PADRAO_EMAIL, PADRAO_UUID } from "../lib/padroes";
import { conferirSenha, obterHashDescartavel } from "../lib/senha";
import { trocarSlug } from "../lib/slug";
import { operadorDoToken } from "../plugins/auth";
import type { App } from "../tipos";
import { serializarSolicitacao } from "./solicitacao-de-link";

// O suporte da plataforma (bloco F4): entra com conta própria e avalia
// os pedidos de troca de link. Login no escopo com limite; o resto no
// escopo do suporte (app.ts), atrás do autenticarSuporte.

const corpoLogin = {
  type: "object",
  required: ["email", "senha"],
  additionalProperties: false,
  properties: {
    email: { type: "string", pattern: PADRAO_EMAIL, maxLength: 160 },
    senha: { type: "string", minLength: 1, maxLength: 200 },
  },
} as const;

export function registrarRotasLoginDoSuporte(app: App, limites: LimitesDeAuth): void {
  app.post(
    "/suporte/login",
    { schema: { body: corpoLogin }, preHandler: limites.loginDoSuporte },
    async (request, reply) => {
      const operador = await prisma.operadorSuporte.findUnique({
        where: { email: normalizarEmail(request.body.email)! },
      });

      // O mesmo cuidado do login do painel: e-mail desconhecido, conta
      // desativada e senha errada custam o mesmo scrypt e respondem igual.
      const autorizado = operador?.ativo ? operador : null;
      const confere = await conferirSenha(
        request.body.senha,
        autorizado?.senhaHash ?? (await obterHashDescartavel())
      );
      if (!autorizado || !confere) {
        return reply.code(401).send({ erro: "credenciais_invalidas" });
      }

      const token = app.jwt.sign({ tipo: "suporte", operadorId: autorizado.id });
      return {
        token,
        operador: { id: autorizado.id, nome: autorizado.nome, email: autorizado.email },
      };
    }
  );
}

const paramsComId = {
  type: "object",
  required: ["id"],
  additionalProperties: false,
  properties: { id: { type: "string", pattern: PADRAO_UUID } },
} as const;

const corpoRecusa = {
  type: "object",
  required: ["resposta"],
  additionalProperties: false,
  properties: { resposta: { type: "string", minLength: 1, maxLength: 500 } },
} as const;

// Lê e trava a linha do pedido: duas decisões ao mesmo tempo (dois
// operadores, ou o dono cancelando) esperam uma pela outra.
async function pedidoPendente(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  id: string
) {
  const [linha] = await tx.$queryRaw<{ status: string }[]>`
    SELECT status FROM solicitacao_troca_link WHERE id = ${id}::uuid FOR UPDATE`;
  if (!linha) throw new ErroHttp(404, "nao_encontrado", "pedido não encontrado");
  if (linha.status !== "pendente") {
    throw new ErroDeNegocio("esse pedido já foi decidido", "solicitacao_decidida");
  }
  return tx.solicitacaoTrocaLink.findUniqueOrThrow({ where: { id } });
}

export function registrarRotasSuporte(app: App): void {
  // A fila: os pendentes, do mais antigo pro mais novo, com a barbearia.
  app.get("/suporte/solicitacoes", async (request) => {
    operadorDoToken(request);
    const pendentes = await prisma.solicitacaoTrocaLink.findMany({
      where: { status: "pendente" },
      orderBy: { criadoEm: "asc" },
      include: { barbearia: { select: { id: true, nome: true, slug: true } } },
    });
    return {
      solicitacoes: pendentes.map((pedido) => ({
        ...serializarSolicitacao(pedido),
        barbearia: pedido.barbearia,
      })),
    };
  });

  // Aprovar = trocar o link (a mesma regra de sempre: nome de outra
  // barbearia, atual ou antigo, é 409) e marcar o pedido, numa transação
  // só. Um 409 desfaz tudo e o pedido fica pendente pro suporte recusar
  // com uma resposta.
  app.post(
    "/suporte/solicitacoes/:id/aprovar",
    { schema: { params: paramsComId } },
    async (request) => {
      const { operadorId } = operadorDoToken(request);
      const decidido = await prisma.$transaction(async (tx) => {
        const pedido = await pedidoPendente(tx, request.params.id);
        await trocarSlug(tx, pedido.barbeariaId, pedido.slugPedido);
        return tx.solicitacaoTrocaLink.update({
          where: { id: pedido.id },
          data: { status: "aprovada", decididoEm: new Date(), decididoPor: operadorId },
        });
      });
      return serializarSolicitacao(decidido);
    }
  );

  app.post(
    "/suporte/solicitacoes/:id/recusar",
    { schema: { params: paramsComId, body: corpoRecusa } },
    async (request) => {
      const { operadorId } = operadorDoToken(request);
      const decidido = await prisma.$transaction(async (tx) => {
        const pedido = await pedidoPendente(tx, request.params.id);
        return tx.solicitacaoTrocaLink.update({
          where: { id: pedido.id },
          data: {
            status: "recusada",
            resposta: request.body.resposta.trim(),
            decididoEm: new Date(),
            decididoPor: operadorId,
          },
        });
      });
      return serializarSolicitacao(decidido);
    }
  );
}
