import { prisma } from "@barchop/database";
import { registrarAuditoria } from "../lib/auditoria";
import { origemPermitida, origensPermitidas } from "../lib/borda";
import { ErroDeNegocio } from "../lib/erro-negocio";
import { operadorDoToken } from "../plugins/auth";
import type { App } from "../tipos";

// Os avisos da plataforma (plano barra-do-topo, PR B): o suporte escreve,
// e cada membro ativo de cada barbearia recebe no sino, na aba Avisos.
// Escopo do suporte (app.ts): token de barbeiro não chega aqui.

// O link do aviso leva pra dentro do painel ou pra um https de fora.
// Qualquer outro esquema (javascript:, http:, data:) fica de fora: o
// painel abre esse link no clique.
const PADRAO_LINK_DO_AVISO = "^(/painel(/\\S*)?|https://\\S+)$";

const corpoAviso = {
  type: "object",
  required: ["titulo", "texto"],
  additionalProperties: false,
  properties: {
    titulo: { type: "string", minLength: 2, maxLength: 120 },
    texto: { type: "string", minLength: 2, maxLength: 500 },
    link: { type: "string", maxLength: 300, pattern: PADRAO_LINK_DO_AVISO },
  },
} as const;

function serializarAviso(
  aviso: { id: string; titulo: string; texto: string; link: string | null; criadoEm: Date },
  contas: { destinatarios: number; lidas: number }
) {
  return {
    id: aviso.id,
    titulo: aviso.titulo,
    texto: aviso.texto,
    link: aviso.link,
    criadoEm: aviso.criadoEm.toISOString(),
    ...contas,
  };
}

// O https de fora só vale pros sites do próprio BarChop — os mesmos que
// podem chamar a API (ORIGENS_PERMITIDAS, lib/borda.ts). O aviso cai no
// sino de todos os membros de todas as barbearias, e o painel abre o
// link no clique: com qualquer https valendo, uma conta de suporte
// tomada virava phishing em massa com a cara do painel (auditoria de
// 15/11, SEC-008). Sem a variável, fora de produção, qualquer https (dev
// local); em produção a API não sobe sem ela.
function linkDeCasa(link: string, origens: ReturnType<typeof origensPermitidas>): boolean {
  if (link.startsWith("/")) return true;
  try {
    // `origin` do URL já resolvido: "https://barchop.com.br@isca.com" e
    // "https://barchop.com.br.isca.com" mostram aqui o host de verdade.
    return origemPermitida(origens, new URL(link).origin);
  } catch {
    return false;
  }
}

export function registrarRotasAvisos(app: App): void {
  const origens = origensPermitidas(process.env);

  app.post("/suporte/avisos", { schema: { body: corpoAviso } }, async (request, reply) => {
    const { operadorId } = operadorDoToken(request);
    const titulo = request.body.titulo.trim();
    const texto = request.body.texto.trim();
    const link = request.body.link ?? null;
    if (link !== null && !linkDeCasa(link, origens)) {
      throw new ErroDeNegocio(
        "o link do aviso só pode levar pra dentro do painel ou pra um site do BarChop",
        "link_de_fora"
      );
    }

    // Aviso e cópias numa transação: aviso publicado pela metade não
    // existe. Quem entra na equipe depois não recebe os antigos.
    const { aviso, destinatarios } = await prisma.$transaction(async (tx) => {
      const aviso = await tx.aviso.create({ data: { titulo, texto, link, criadoPor: operadorId } });
      const membros = await tx.barbeiro.findMany({ where: { ativo: true }, select: { id: true } });
      const { count } = await tx.notificacao.createMany({
        data: membros.map(({ id }) => ({
          barbeiroId: id,
          tipo: "plataforma" as const,
          titulo,
          texto,
          link,
          avisoId: aviso.id,
        })),
      });
      await registrarAuditoria(tx, {
        ator: { tipo: "suporte", id: operadorId },
        acao: "suporte.aviso.publicar",
        alvo: { tipo: "aviso", id: aviso.id },
        detalhe: { titulo, link, destinatarios: count },
        ip: request.ip,
      });
      return { aviso, destinatarios: count };
    });

    return reply.code(201).send({ aviso: serializarAviso(aviso, { destinatarios, lidas: 0 }) });
  });

  // Os publicados, do mais novo, com quantos receberam e quantos leram.
  app.get("/suporte/avisos", async (request) => {
    operadorDoToken(request);
    const avisos = await prisma.aviso.findMany({
      orderBy: { criadoEm: "desc" },
      take: 50,
      include: { _count: { select: { notificacoes: true } } },
    });
    const lidas = await prisma.notificacao.groupBy({
      by: ["avisoId"],
      where: { avisoId: { in: avisos.map((aviso) => aviso.id) }, lidaEm: { not: null } },
      _count: { _all: true },
    });
    const lidasPorAviso = new Map(lidas.map((linha) => [linha.avisoId, linha._count._all]));

    return {
      avisos: avisos.map((aviso) =>
        serializarAviso(aviso, {
          destinatarios: aviso._count.notificacoes,
          lidas: lidasPorAviso.get(aviso.id) ?? 0,
        })
      ),
    };
  });
}
