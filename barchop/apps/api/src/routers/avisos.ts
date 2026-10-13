import { prisma } from "@barchop/database";
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

export function registrarRotasAvisos(app: App): void {
  app.post("/suporte/avisos", { schema: { body: corpoAviso } }, async (request, reply) => {
    const { operadorId } = operadorDoToken(request);
    const titulo = request.body.titulo.trim();
    const texto = request.body.texto.trim();
    const link = request.body.link ?? null;

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
