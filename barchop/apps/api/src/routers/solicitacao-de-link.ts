import { prisma, type SolicitacaoTrocaLink } from "@barchop/database";
import { slugReservado } from "@barchop/formato";
import { conflito, ErroHttp, naoEncontrado } from "../lib/erro-http";
import { ErroDeNegocio } from "../lib/erro-negocio";
import { PADRAO_SLUG } from "../lib/padroes";
import { slugDeOutra, travarSlugs } from "../lib/slug";
import { exigirPapel } from "../plugins/auth";
import type { App } from "../tipos";

// O pedido de troca do link (bloco F4, decisão do dono, 2026-10-04): o
// dono não troca o link sozinho — pede, e o suporte avalia
// (routers/suporte.ts). O pedido já confere o que dá pra conferir agora
// (formato, reservado, livre); a aprovação confere de novo.

export function serializarSolicitacao(solicitacao: SolicitacaoTrocaLink) {
  return {
    id: solicitacao.id,
    slugPedido: solicitacao.slugPedido,
    motivo: solicitacao.motivo,
    status: solicitacao.status,
    resposta: solicitacao.resposta,
    criadoEm: solicitacao.criadoEm.toISOString(),
    decididoEm: solicitacao.decididoEm?.toISOString() ?? null,
  };
}

const corpoDoPedido = {
  type: "object",
  required: ["slug"],
  additionalProperties: false,
  properties: {
    slug: { type: "string", pattern: PADRAO_SLUG },
    motivo: { type: "string", maxLength: 500 },
  },
} as const;

// Violação do índice parcial "uma pendente por barbearia": dois pedidos
// ao mesmo tempo, o segundo bate aqui em vez de passar na conferência.
function pendenteJaExiste(erro: unknown): boolean {
  return (erro as { code?: string } | null)?.code === "P2002";
}

export function registrarRotasSolicitacaoDeLink(app: App): void {
  // A mais recente, de qualquer status: Configurações mostra a pendente,
  // e também a última decisão (com a resposta do suporte, se recusada).
  app.get(
    "/barbearias/me/solicitacao-de-link",
    { onRequest: exigirPapel("dono") },
    async (request) => {
      const solicitacao = await prisma.solicitacaoTrocaLink.findFirst({
        where: { barbeariaId: request.user.barbeariaId },
        orderBy: { criadoEm: "desc" },
      });
      return { solicitacao: solicitacao ? serializarSolicitacao(solicitacao) : null };
    }
  );

  app.post(
    "/barbearias/me/solicitacao-de-link",
    { schema: { body: corpoDoPedido }, onRequest: exigirPapel("dono") },
    async (request, reply) => {
      const { slug } = request.body;
      const motivo = request.body.motivo?.trim() || null;
      const barbeariaId = request.user.barbeariaId;

      if (slugReservado(slug)) {
        throw new ErroDeNegocio("esse endereço é reservado pelo sistema", "slug_reservado");
      }

      try {
        const criada = await prisma.$transaction(async (tx) => {
          const atual = await tx.barbearia.findUniqueOrThrow({ where: { id: barbeariaId } });
          if (atual.slug === slug) {
            throw new ErroDeNegocio("esse já é o link da barbearia", "slug_igual_ao_atual");
          }
          const pendente = await tx.solicitacaoTrocaLink.count({
            where: { barbeariaId, status: "pendente" },
          });
          if (pendente > 0) {
            throw new ErroHttp(409, "solicitacao_pendente", "já existe um pedido aguardando o suporte");
          }
          // A trava só pra ler com consistência: o pedido não grava slug,
          // e a aprovação confere de novo de qualquer jeito.
          await travarSlugs(tx);
          if (await slugDeOutra(tx, slug, barbeariaId)) {
            throw conflito("esse endereço já está em uso");
          }
          return tx.solicitacaoTrocaLink.create({
            data: { barbeariaId, slugPedido: slug, motivo },
          });
        });
        return reply.code(201).send(serializarSolicitacao(criada));
      } catch (erro) {
        if (pendenteJaExiste(erro)) {
          throw new ErroHttp(409, "solicitacao_pendente", "já existe um pedido aguardando o suporte");
        }
        throw erro;
      }
    }
  );

  app.post(
    "/barbearias/me/solicitacao-de-link/cancelar",
    { onRequest: exigirPapel("dono") },
    async (request) => {
      const pendente = await prisma.solicitacaoTrocaLink.findFirst({
        where: { barbeariaId: request.user.barbeariaId, status: "pendente" },
      });
      if (!pendente) throw naoEncontrado("nenhum pedido aguardando o suporte");

      // Status no predicado: se o suporte decidiu no meio, não sobrescreve.
      const { count } = await prisma.solicitacaoTrocaLink.updateMany({
        where: { id: pendente.id, status: "pendente" },
        data: { status: "cancelada", decididoEm: new Date() },
      });
      if (count === 0) throw naoEncontrado("nenhum pedido aguardando o suporte");

      return serializarSolicitacao(
        await prisma.solicitacaoTrocaLink.findUniqueOrThrow({ where: { id: pendente.id } })
      );
    }
  );
}
