import { prisma } from "@barchop/database";
import { PADRAO_PRECO, PADRAO_SLUG, PADRAO_UUID } from "../lib/padroes";
import { serializarServico } from "../lib/serializar";
import type { App } from "../tipos";

// Preço entra como string pelo mesmo motivo que sai como string: number
// aqui passaria por float e perderia centavo. O Prisma aceita string
// direto numa coluna Decimal.
//
// A duração tem teto: um serviço de 2000 minutos faria o hora_fim do
// agendamento passar da meia-noite na fase 4, e `somarMinutos` recusa —
// mas aí já seria erro 500 no meio de um POST de agendamento. Melhor
// barrar no cadastro. O `multipleOf: 5` mantém o cadastro alinhado com a
// grade de horários sugeridos.
const corpoNovoServico = {
  type: "object",
  additionalProperties: false,
  required: ["nome", "duracaoMinutos", "preco"],
  properties: {
    nome: { type: "string", minLength: 2, maxLength: 120 },
    duracaoMinutos: {
      type: "integer",
      minimum: 5,
      maximum: 480,
      multipleOf: 5,
    },
    preco: { type: "string", pattern: PADRAO_PRECO },
  },
} as const;

const paramsComId = {
  type: "object",
  required: ["id"],
  additionalProperties: false,
  properties: { id: { type: "string", pattern: PADRAO_UUID } },
} as const;

// `ativo` entra aqui porque é como o barbeiro reativa o que desativou —
// o DELETE é reversível de propósito.
const corpoPatchServico = {
  type: "object",
  additionalProperties: false,
  minProperties: 1,
  properties: {
    nome: { type: "string", minLength: 2, maxLength: 120 },
    duracaoMinutos: {
      type: "integer",
      minimum: 5,
      maximum: 480,
      multipleOf: 5,
    },
    preco: { type: "string", pattern: PADRAO_PRECO },
    ativo: { type: "boolean" },
  },
} as const;

const paramsSlug = {
  type: "object",
  required: ["slug"],
  additionalProperties: false,
  properties: { slug: { type: "string", pattern: PADRAO_SLUG } },
} as const;

export function registrarRotasServicos(app: App): void {
  app.get("/servicos", async (request) => {
    // A lista do barbeiro inclui os inativos: é dela que sai a tela de
    // Serviços, onde ele reativa o que desativou. A pública não.
    const servicos = await prisma.servico.findMany({
      where: { barbeariaId: request.user.barbeariaId },
      orderBy: [{ ativo: "desc" }, { nome: "asc" }],
    });

    return { servicos: servicos.map(serializarServico) };
  });

  app.post(
    "/servicos",
    { schema: { body: corpoNovoServico } },
    async (request, reply) => {
      const servico = await prisma.servico.create({
        // barbeariaId do token, sempre. O corpo não tem como mandar o
        // dele: additionalProperties: false recusa antes.
        data: { barbeariaId: request.user.barbeariaId, ...request.body },
      });

      return reply.code(201).send(serializarServico(servico));
    }
  );

  app.patch(
    "/servicos/:id",
    { schema: { params: paramsComId, body: corpoPatchServico } },
    async (request) => {
      const servico = await prisma.servico.update({
        // O barbeariaId vai no MESMO where da escrita. Conferir a posse
        // numa consulta separada antes deixaria uma janela entre a
        // checagem e o update; aqui, se a barbearia não casa, o Prisma
        // lança P2025 e o tratador central devolve 404.
        where: { id: request.params.id, barbeariaId: request.user.barbeariaId },
        data: request.body,
      });

      return serializarServico(servico);
    }
  );

  app.delete(
    "/servicos/:id",
    { schema: { params: paramsComId } },
    async (request) => {
      // Soft delete: AgendamentoServico tem FK ON DELETE RESTRICT pro
      // serviço — apagar de verdade quebraria o histórico de quem já foi
      // atendido. Some da listagem pública, continua na do barbeiro.
      const servico = await prisma.servico.update({
        where: { id: request.params.id, barbeariaId: request.user.barbeariaId },
        data: { ativo: false },
      });

      return serializarServico(servico);
    }
  );
}

// Primeira tela do fluxo do cliente depois da landing: a escolha dos
// serviços, com a soma de duração em tempo real. Sem token.
export function registrarRotasServicosPublicas(app: App): void {
  app.get(
    "/barbearias/:slug/servicos",
    { schema: { params: paramsSlug } },
    async (request) => {
      const barbearia = await prisma.barbearia.findUniqueOrThrow({
        where: { slug: request.params.slug },
      });

      const servicos = await prisma.servico.findMany({
        where: { barbeariaId: barbearia.id, ativo: true },
        orderBy: { nome: "asc" },
      });

      return { servicos: servicos.map(serializarServico) };
    }
  );
}
