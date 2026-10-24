import type { FastifyRequest } from "fastify";
import { Prisma, prisma } from "@barchop/database";
import {
  CICLOS_DO_CLIENTE,
  MAX_DIAS_DE_TESTE_DO_CLIENTE,
  problemaDoPlano,
  type PlanoParaConferir,
  type ProblemaDoPlano,
} from "@barchop/formato";
import type { CicloDoCliente, PlanoDoPainel, PlanosDoPainel, VitrineDePlanos } from "@barchop/types";
import { garantirRecurso, temORecurso } from "../lib/assinatura";
import { PODE_ATENDER } from "../lib/disponibilidade";
import { ErroHttp, naoEncontrado } from "../lib/erro-http";
import { ErroDeNegocio } from "../lib/erro-negocio";
import { PADRAO_SLUG, PADRAO_UUID } from "../lib/padroes";
import { temContaQueRecebe } from "../lib/planos-do-cliente";
import { exigirPapel, membroDoToken, type Membro } from "../plugins/auth";
import type { App } from "../tipos";

// Os planos que a barbearia e os barbeiros vendem ao cliente (Onda 2,
// marco 3, plano planos-de-assinatura, PR 3). A conta e as listas moram
// em @barchop/formato (planos-do-cliente.ts). Quem pode:
// - dono: cria o plano da casa e o dele, muda qualquer plano, liga a
//   vitrine;
// - profissional com "pode vender": cria e muda os dele, e vê só os dele
//   (o de outro é 404, como a agenda do colega);
// - recepção: vê todos (o balcão e o caixa usam), não cria nem muda.
// Fora do Completo, 403 `recurso_do_plano`. Plano não é apagado: sai com
// `ativo = false`, porque assinatura antiga aponta pra ele.

// R$ 100.000,00 por ciclo: folga de sobra, e longe do limite do INTEGER.
const CENTAVOS = { type: "integer", minimum: 0, maximum: 10_000_000 } as const;

const propriedadesDoPlano = {
  nome: { type: "string", minLength: 2, maxLength: 80 },
  descricao: { type: ["string", "null"], maxLength: 300 },
  ciclo: { type: "string", enum: [...CICLOS_DO_CLIENTE] },
  precoCentavos: CENTAVOS,
  diasDeTeste: { type: "integer", minimum: 0, maximum: MAX_DIAS_DE_TESTE_DO_CLIENTE },
  fixoPorAtendimentoCentavos: { type: ["integer", "null"], minimum: 0, maximum: 10_000_000 },
  aceitaOnline: { type: "boolean" },
  aceitaNoBalcao: { type: "boolean" },
  // A lista inteira. Usos nulo = ilimitado; o teto é do SMALLINT, com
  // folga.
  servicos: {
    type: "array",
    maxItems: 50,
    items: {
      type: "object",
      additionalProperties: false,
      required: ["servicoId", "usosPorCiclo"],
      properties: {
        servicoId: { type: "string", pattern: PADRAO_UUID },
        usosPorCiclo: { type: ["integer", "null"], minimum: 1, maximum: 999 },
      },
    },
  },
} as const;

const corpoNovoPlano = {
  type: "object",
  additionalProperties: false,
  required: ["daCasa", "nome", "ciclo", "precoCentavos", "servicos"],
  properties: { daCasa: { type: "boolean" }, ...propriedadesDoPlano },
} as const;

// Tipo e vendedor ficam de fora: `daCasa` aqui é 400.
const corpoMudancaDoPlano = {
  type: "object",
  additionalProperties: false,
  minProperties: 1,
  properties: { ...propriedadesDoPlano, ativo: { type: "boolean" } },
} as const;

const corpoVitrine = {
  type: "object",
  additionalProperties: false,
  required: ["ligada"],
  properties: { ligada: { type: "boolean" } },
} as const;

const paramsComId = {
  type: "object",
  required: ["id"],
  additionalProperties: false,
  properties: { id: { type: "string", pattern: PADRAO_UUID } },
} as const;

const MENSAGEM_DO_PROBLEMA: Record<Exclude<ProblemaDoPlano, "fixo">, string> = {
  preco: "o preço do plano tem que ser maior que zero",
  dias_de_teste: `os dias grátis vão de 0 a ${MAX_DIAS_DE_TESTE_DO_CLIENTE}`,
  servicos: "escolha pelo menos um serviço para o plano",
  usos: "os usos por ciclo começam em 1, ou ficam ilimitados",
  formas: "escolha como o cliente paga: online, no balcão ou os dois",
};

// Um código por problema (`plano_preco`, `plano_fixo`…): a tela marca o
// campo certo.
function garantirPlanoCerto(plano: PlanoParaConferir): void {
  const problema = problemaDoPlano(plano);
  if (problema === null) return;
  const mensagem =
    problema === "fixo"
      ? plano.daCasa
        ? "o plano da casa precisa do valor que quem atende ganha por atendimento (pode ser R$ 0)"
        : "plano de barbeiro não tem valor fixo por atendimento"
      : MENSAGEM_DO_PROBLEMA[problema];
  throw new ErroDeNegocio(mensagem, `plano_${problema}`);
}

// Dono sempre; profissional só com o "pode vender". onRequest, como o
// `exigirPapel`: a recusa vem antes de o corpo ser lido.
async function exigirQuemVende(request: FastifyRequest): Promise<void> {
  const membro = membroDoToken(request);
  if (membro.papel === "dono" || (membro.papel === "profissional" && membro.podeVenderPlanos)) return;
  throw new ErroHttp(403, "sem_permissao", "seu papel na equipe não permite vender planos");
}

// O profissional só enxerga os planos dele; dono e recepção, todos.
function planosVisiveis(membro: Membro): Prisma.PlanoDeAssinaturaWhereInput {
  return membro.papel === "profissional" ? { vendedorId: membro.id } : {};
}

const INCLUDE_PLANO = {
  vendedor: { select: { id: true, nome: true } },
  servicos: {
    include: { servico: { select: { nome: true } } },
    orderBy: [{ servico: { ordem: "asc" } }, { servicoId: "asc" }],
  },
  _count: { select: { assinaturas: { where: { situacao: { not: "cancelada" } } } } },
} satisfies Prisma.PlanoDeAssinaturaInclude;

type PlanoComTudo = Prisma.PlanoDeAssinaturaGetPayload<{ include: typeof INCLUDE_PLANO }>;

function serializarPlano(plano: PlanoComTudo): PlanoDoPainel {
  return {
    id: plano.id,
    daCasa: plano.vendedorId === null,
    vendedor: plano.vendedor,
    nome: plano.nome,
    descricao: plano.descricao,
    ciclo: plano.ciclo as CicloDoCliente,
    precoCentavos: plano.precoCentavos,
    diasDeTeste: plano.diasDeTeste,
    fixoPorAtendimentoCentavos: plano.fixoPorAtendimentoCentavos,
    aceitaOnline: plano.aceitaOnline,
    aceitaNoBalcao: plano.aceitaNoBalcao,
    ativo: plano.ativo,
    servicos: plano.servicos.map((s) => ({ servicoId: s.servicoId, nome: s.servico.nome, usosPorCiclo: s.usosPorCiclo })),
    assinantes: plano._count.assinaturas,
  };
}

// Cada serviço uma vez, da barbearia e ativo. No plano de barbeiro, só
// o que ele faz: o plano vale só com ele, e um serviço que ele não faz
// nunca seria usado. No da casa vale qualquer um, porque quem atende
// varia.
async function garantirServicos(
  tx: Prisma.TransactionClient,
  barbeariaId: string,
  vendedorId: string | null,
  servicos: readonly { servicoId: string }[]
): Promise<void> {
  const ids = servicos.map((s) => s.servicoId);
  if (new Set(ids).size !== ids.length) {
    throw new ErroDeNegocio("o mesmo serviço aparece duas vezes no plano", "servico_repetido");
  }
  const daBarbearia = await tx.servico.count({ where: { id: { in: ids }, barbeariaId, ativo: true } });
  if (daBarbearia !== ids.length) {
    throw new ErroDeNegocio("o plano só cobre serviços ativos desta barbearia", "servico_invalido");
  }
  if (vendedorId === null) return;
  const feitos = await tx.profissionalServico.count({ where: { barbeiroId: vendedorId, servicoId: { in: ids } } });
  if (feitos !== ids.length) {
    throw new ErroDeNegocio("o plano de barbeiro só cobre serviços que ele faz", "servico_fora_do_vendedor");
  }
}

// Quem vende o plano próprio precisa atender: o plano vale só com ele.
async function garantirQueAtende(tx: Prisma.TransactionClient, vendedorId: string): Promise<void> {
  const vendedor = await tx.barbeiro.findUniqueOrThrow({ where: { id: vendedorId }, select: { atende: true } });
  if (!vendedor.atende) {
    throw new ErroDeNegocio("quem não atende não vende plano próprio: crie um plano da casa", "vendedor_nao_atende");
  }
}

export function registrarRotasPlanos(app: App): void {
  app.get("/barbearias/me/planos", async (request): Promise<PlanosDoPainel> => {
    const { barbeariaId } = request.user;
    await garantirRecurso(prisma, barbeariaId, "planosDaBarbearia", new Date());
    const membro = membroDoToken(request);
    const [barbearia, eu, planos] = await Promise.all([
      prisma.barbearia.findUniqueOrThrow({ where: { id: barbeariaId }, select: { vitrineDePlanos: true } }),
      prisma.barbeiro.findUniqueOrThrow({ where: { id: membro.id }, select: { atende: true } }),
      prisma.planoDeAssinatura.findMany({
        where: { barbeariaId, ...planosVisiveis(membro) },
        include: INCLUDE_PLANO,
        orderBy: [{ ativo: "desc" }, { ordem: "asc" }, { criadoEm: "asc" }, { id: "asc" }],
      }),
    ]);
    const vende = membro.papel === "dono" || (membro.papel === "profissional" && membro.podeVenderPlanos);
    return {
      vitrine: barbearia.vitrineDePlanos,
      podeCriarDaCasa: membro.papel === "dono",
      podeCriarProprio: vende && eu.atende,
      planos: planos.map(serializarPlano),
    };
  });

  app.post(
    "/barbearias/me/planos",
    { onRequest: exigirQuemVende, schema: { body: corpoNovoPlano } },
    async (request, reply) => {
      const { barbeariaId } = request.user;
      const membro = membroDoToken(request);
      const { daCasa, servicos, ...campos } = request.body;
      if (daCasa && membro.papel !== "dono") {
        throw new ErroHttp(403, "sem_permissao", "só o dono cria plano da casa");
      }
      const vendedorId = daCasa ? null : membro.id;
      const fixo = campos.fixoPorAtendimentoCentavos ?? null;

      const plano = await prisma.$transaction(async (tx) => {
        await garantirRecurso(tx, barbeariaId, "planosDaBarbearia", new Date());
        garantirPlanoCerto({
          daCasa,
          precoCentavos: campos.precoCentavos,
          diasDeTeste: campos.diasDeTeste ?? 0,
          fixoPorAtendimentoCentavos: fixo,
          servicos,
          aceitaOnline: campos.aceitaOnline ?? true,
          aceitaNoBalcao: campos.aceitaNoBalcao ?? false,
        });
        if (vendedorId !== null) await garantirQueAtende(tx, vendedorId);
        await garantirServicos(tx, barbeariaId, vendedorId, servicos);
        return tx.planoDeAssinatura.create({
          data: {
            ...campos,
            fixoPorAtendimentoCentavos: fixo,
            barbeariaId,
            vendedorId,
            servicos: { create: servicos.map((s) => ({ servicoId: s.servicoId, usosPorCiclo: s.usosPorCiclo })) },
          },
          include: INCLUDE_PLANO,
        });
      });
      return reply.code(201).send(serializarPlano(plano));
    }
  );

  // Preço e ciclo mudam só pra assinatura nova (cada uma guarda os
  // seus). Serviços e usos valem na hora, também pra quem já assina.
  app.patch(
    "/barbearias/me/planos/:id",
    { onRequest: exigirQuemVende, schema: { params: paramsComId, body: corpoMudancaDoPlano } },
    async (request): Promise<PlanoDoPainel> => {
      const { barbeariaId } = request.user;
      const membro = membroDoToken(request);
      const { servicos, ...campos } = request.body;

      const plano = await prisma.$transaction(async (tx) => {
        await garantirRecurso(tx, barbeariaId, "planosDaBarbearia", new Date());
        const atual = await tx.planoDeAssinatura.findFirst({
          where: { id: request.params.id, barbeariaId, ...planosVisiveis(membro) },
          include: { servicos: true },
        });
        if (!atual) throw naoEncontrado();

        garantirPlanoCerto({
          daCasa: atual.vendedorId === null,
          precoCentavos: campos.precoCentavos ?? atual.precoCentavos,
          diasDeTeste: campos.diasDeTeste ?? atual.diasDeTeste,
          fixoPorAtendimentoCentavos:
            campos.fixoPorAtendimentoCentavos !== undefined ? campos.fixoPorAtendimentoCentavos : atual.fixoPorAtendimentoCentavos,
          servicos: servicos ?? atual.servicos,
          aceitaOnline: campos.aceitaOnline ?? atual.aceitaOnline,
          aceitaNoBalcao: campos.aceitaNoBalcao ?? atual.aceitaNoBalcao,
        });
        if (servicos !== undefined) {
          await garantirServicos(tx, barbeariaId, atual.vendedorId, servicos);
          await tx.planoServico.deleteMany({ where: { planoId: atual.id } });
          await tx.planoServico.createMany({
            data: servicos.map((s) => ({ planoId: atual.id, servicoId: s.servicoId, usosPorCiclo: s.usosPorCiclo })),
          });
        }
        return tx.planoDeAssinatura.update({ where: { id: atual.id }, data: campos, include: INCLUDE_PLANO });
      });
      return serializarPlano(plano);
    }
  );

  app.put(
    "/barbearias/me/vitrine-de-planos",
    { onRequest: exigirPapel("dono"), schema: { body: corpoVitrine } },
    async (request) => {
      const { barbeariaId } = request.user;
      await garantirRecurso(prisma, barbeariaId, "planosDaBarbearia", new Date());
      const { vitrineDePlanos } = await prisma.barbearia.update({
        where: { id: barbeariaId },
        data: { vitrineDePlanos: request.body.ligada },
        select: { vitrineDePlanos: true },
      });
      return { ligada: vitrineDePlanos };
    }
  );
}

const paramsSlug = {
  type: "object",
  required: ["slug"],
  additionalProperties: false,
  properties: { slug: { type: "string", pattern: PADRAO_SLUG } },
} as const;

// A vitrine da página pública (PR 4), sem login. Fora do Completo ou com
// a vitrine desligada, a lista vem vazia e não 403: a página não pode
// quebrar nem contar qual plano do BarChop a barbearia paga. O fixo da
// casa e quantos assinam nunca saem daqui.
export function registrarRotasPlanosPublicos(app: App): void {
  app.get(
    "/barbearias/:slug/planos",
    { schema: { params: paramsSlug } },
    async (request): Promise<VitrineDePlanos> => {
      const barbearia = await prisma.barbearia.findUniqueOrThrow({
        where: { slug: request.params.slug },
        select: { id: true, vitrineDePlanos: true },
      });
      if (!barbearia.vitrineDePlanos) return { planos: [] };
      if (!(await temORecurso(prisma, barbearia.id, "planosDaBarbearia", new Date()))) return { planos: [] };

      const [planos, contas] = await Promise.all([
        prisma.planoDeAssinatura.findMany({
          // O de barbeiro só com vendedor que atende e pode vender (o dono
          // vende sem a liberação). Tirar o "pode vender" tira da vitrine.
          where: {
            barbeariaId: barbearia.id,
            ativo: true,
            OR: [
              { vendedorId: null },
              { vendedor: { ...PODE_ATENDER, OR: [{ papel: "dono" }, { podeVenderPlanos: true }] } },
            ],
          },
          // Campos um a um: o vendedor é um barbeiro, e um include traria
          // o senhaHash.
          select: {
            id: true,
            vendedorId: true,
            nome: true,
            descricao: true,
            ciclo: true,
            precoCentavos: true,
            diasDeTeste: true,
            aceitaOnline: true,
            aceitaNoBalcao: true,
            vendedor: { select: { id: true, nome: true, fotoChave: true } },
            servicos: {
              where: { servico: { ativo: true } },
              select: { servicoId: true, usosPorCiclo: true, servico: { select: { nome: true } } },
              orderBy: [{ servico: { ordem: "asc" } }, { servicoId: "asc" }],
            },
          },
          orderBy: [{ ordem: "asc" }, { criadoEm: "asc" }, { id: "asc" }],
        }),
        prisma.conexaoDePagamento.findMany({
          where: { barbeariaId: barbearia.id },
          select: { barbeiroId: true, daCasa: true },
        }),
      ]);

      return {
        planos: planos.flatMap((plano) => {
          // Online só com a conta de quem vende conectada. Plano que ninguém
          // consegue assinar, ou que não cobre nada, não entra.
          const aceitaOnline = plano.aceitaOnline && temContaQueRecebe(contas, plano.vendedorId);
          if (plano.servicos.length === 0 || (!aceitaOnline && !plano.aceitaNoBalcao)) return [];
          return [
            {
              id: plano.id,
              daCasa: plano.vendedorId === null,
              vendedor: plano.vendedor && {
                id: plano.vendedor.id,
                nome: plano.vendedor.nome,
                fotoUrl: plano.vendedor.fotoChave ? app.armazenamento.urlPublica(plano.vendedor.fotoChave) : null,
              },
              nome: plano.nome,
              descricao: plano.descricao,
              ciclo: plano.ciclo as CicloDoCliente,
              precoCentavos: plano.precoCentavos,
              diasDeTeste: plano.diasDeTeste,
              aceitaOnline,
              aceitaNoBalcao: plano.aceitaNoBalcao,
              servicos: plano.servicos.map((s) => ({ servicoId: s.servicoId, nome: s.servico.nome, usosPorCiclo: s.usosPorCiclo })),
            },
          ];
        }),
      };
    }
  );
}
