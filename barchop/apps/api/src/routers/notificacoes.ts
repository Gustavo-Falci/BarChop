import { prisma, type Prisma } from "@barchop/database";
import { naoEncontrado } from "../lib/erro-http";
import { PADRAO_UUID } from "../lib/padroes";
import type { App } from "../tipos";

// O sino da barra de topo do painel (plano barra-do-topo). Tudo pelo
// barbeiroId do token, nunca da URL: é o que impede um membro de ler ou
// marcar a notificação de outro.

// "Não lidas", "Todas" e "Avisos" — as abas do sino.
const FILTROS = ["nao-lidas", "todas", "avisos"] as const;
type Filtro = (typeof FILTROS)[number];

const consultaDaLista = {
  type: "object",
  additionalProperties: false,
  properties: { filtro: { type: "string", enum: FILTROS } },
} as const;

const paramsComId = {
  type: "object",
  required: ["id"],
  additionalProperties: false,
  properties: { id: { type: "string", pattern: PADRAO_UUID } },
} as const;

// As 50 mais novas bastam pro sino; histórico mais longo é pra outra tela.
const LIMITE = 50;

function ondeDoFiltro(barbeiroId: string, filtro: Filtro): Prisma.NotificacaoWhereInput {
  if (filtro === "nao-lidas") return { barbeiroId, lidaEm: null };
  if (filtro === "avisos") return { barbeiroId, tipo: "plataforma" };
  return { barbeiroId };
}

export function registrarRotasNotificacoes(app: App): void {
  app.get(
    "/me/notificacoes",
    { schema: { querystring: consultaDaLista } },
    async (request) => {
      const filtro = request.query.filtro ?? "todas";
      const linhas = await prisma.notificacao.findMany({
        where: ondeDoFiltro(request.user.barbeiroId, filtro),
        orderBy: [{ criadaEm: "desc" }, { id: "desc" }],
        take: LIMITE,
      });
      return {
        notificacoes: linhas.map((linha) => ({
          id: linha.id,
          tipo: linha.tipo,
          titulo: linha.titulo,
          texto: linha.texto,
          link: linha.link,
          lida: linha.lidaEm !== null,
          criadaEm: linha.criadaEm.toISOString(),
        })),
      };
    }
  );

  // A conta do número no sino: roda a cada minuto em cada painel aberto,
  // e cai no índice parcial das não lidas (migration 20261013120000).
  app.get("/me/notificacoes/contagem", async (request) => {
    const naoLidas = await prisma.notificacao.count({
      where: { barbeiroId: request.user.barbeiroId, lidaEm: null },
    });
    return { naoLidas };
  });

  app.post(
    "/me/notificacoes/:id/lida",
    { schema: { params: paramsComId } },
    async (request, reply) => {
      const onde = { id: request.params.id, barbeiroId: request.user.barbeiroId };
      // `lidaEm: null` no WHERE: ler de novo não troca a hora da leitura.
      const { count } = await prisma.notificacao.updateMany({
        where: { ...onde, lidaEm: null },
        data: { lidaEm: new Date() },
      });
      // 404 só pra a de outro membro (ou id que não existe); a já lida
      // responde como a recém-lida.
      if (count === 0 && (await prisma.notificacao.count({ where: onde })) === 0) {
        throw naoEncontrado("notificação não encontrada");
      }
      return reply.code(204).send();
    }
  );

  app.post("/me/notificacoes/ler-todas", async (request) => {
    const { count } = await prisma.notificacao.updateMany({
      where: { barbeiroId: request.user.barbeiroId, lidaEm: null },
      data: { lidaEm: new Date() },
    });
    return { lidas: count };
  });
}
