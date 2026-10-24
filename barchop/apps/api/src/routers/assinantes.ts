import { Prisma, prisma } from "@barchop/database";
import {
  FORMAS_DE_PAGAMENTO,
  SITUACOES_DO_ASSINANTE,
  dividirMensalidade,
  fimDoCiclo,
  problemaDoRecebimento,
  type CicloDoCliente,
  type SituacaoDoAssinante,
} from "@barchop/formato";
import type { AssinantesDoPainel, AssinaturaDoPainel, FormaDoPagamento, RecebimentoDoBalcao } from "@barchop/types";
import { garantirRecurso } from "../lib/assinatura";
import { naoEncontrado } from "../lib/erro-http";
import { ErroDeNegocio } from "../lib/erro-negocio";
import { agoraNaBarbearia, dataParaDate, dateParaData, somarDias } from "../lib/horas";
import { PADRAO_UUID } from "../lib/padroes";
import {
  PODE_VENDER,
  assinaturasVisiveis,
  marcarAtrasadas,
  planosVisiveis,
  proximoDiaAberto,
} from "../lib/planos-do-cliente";
import { membroDoToken } from "../plugins/auth";
import type { App } from "../tipos";

// O assinante no balcão (Onda 2, marco 3, plano planos-de-assinatura,
// PR 5). O painel põe o cliente num plano que aceita o balcão, e cada
// ciclo pago ali é um "recebi" marcado à mão, com a forma. Quem pode:
// dono e recepção, qualquer assinatura; o profissional, só as dos planos
// dele (a de outro é 404, como a agenda do colega).
//
// Só assinar exige o Completo. A lista, o "recebi" e o cancelar seguem
// no Grátis: a assinatura é do cliente com quem vende, e continua valendo
// (decisão 6 do plano).
//
// O ciclo: o "recebi" abre um ciclo novo a partir de hoje, e antes do dia
// da renovação é recusado (`problemaDoRecebimento`). Sem "recebi", a
// assinatura fica em atraso no dia seguinte, marcada na leitura
// (`marcarAtrasadas`), sem tarefa agendada.

const paramsComId = {
  type: "object",
  required: ["id"],
  additionalProperties: false,
  properties: { id: { type: "string", pattern: PADRAO_UUID } },
} as const;

const corpoAssinar = {
  type: "object",
  additionalProperties: false,
  required: ["planoId"],
  properties: { planoId: { type: "string", pattern: PADRAO_UUID } },
} as const;

const filtroDosAssinantes = {
  type: "object",
  additionalProperties: false,
  properties: {
    situacao: { type: "string", enum: [...SITUACOES_DO_ASSINANTE] },
    clienteId: { type: "string", pattern: PADRAO_UUID },
  },
} as const;

const corpoRecebi = {
  type: "object",
  additionalProperties: false,
  required: ["forma"],
  properties: { forma: { type: "string", enum: [...FORMAS_DE_PAGAMENTO] } },
} as const;

const INCLUDE_ASSINATURA = {
  cliente: { select: { id: true, nome: true, telefone: true } },
  plano: { select: { id: true, nome: true, vendedorId: true, vendedor: { select: { id: true, nome: true } } } },
} satisfies Prisma.AssinaturaDoClienteInclude;

type AssinaturaComTudo = Prisma.AssinaturaDoClienteGetPayload<{ include: typeof INCLUDE_ASSINATURA }>;

function serializarAssinatura(assinatura: AssinaturaComTudo): AssinaturaDoPainel {
  return {
    id: assinatura.id,
    situacao: assinatura.situacao as SituacaoDoAssinante,
    forma: assinatura.forma as AssinaturaDoPainel["forma"],
    precoCentavos: assinatura.precoCentavos,
    ciclo: assinatura.ciclo as CicloDoCliente,
    cicloComecaEm: assinatura.cicloComecaEm ? dateParaData(assinatura.cicloComecaEm) : null,
    cicloTerminaEm: assinatura.cicloTerminaEm ? dateParaData(assinatura.cicloTerminaEm) : null,
    canceladaEm: assinatura.canceladaEm?.toISOString() ?? null,
    criadoEm: assinatura.criadoEm.toISOString(),
    cliente: assinatura.cliente,
    plano: {
      id: assinatura.plano.id,
      nome: assinatura.plano.nome,
      daCasa: assinatura.plano.vendedorId === null,
      vendedor: assinatura.plano.vendedor,
    },
  };
}

// "26/11", pra mensagem.
function diaEMes(data: string): string {
  const [, mes, dia] = data.split("-");
  return `${dia}/${mes}`;
}

export function registrarRotasAssinantes(app: App): void {
  app.post(
    "/clientes/:id/assinaturas",
    { schema: { params: paramsComId, body: corpoAssinar } },
    async (request, reply) => {
      const { barbeariaId } = request.user;
      const membro = membroDoToken(request);
      const hoje = agoraNaBarbearia().data;

      const assinatura = await prisma.$transaction(async (tx) => {
        await garantirRecurso(tx, barbeariaId, "planosDaBarbearia", new Date());
        const cliente = await tx.cliente.findFirst({ where: { id: request.params.id, barbeariaId }, select: { id: true } });
        if (!cliente) throw naoEncontrado();
        const plano = await tx.planoDeAssinatura.findFirst({
          where: { id: request.body.planoId, barbeariaId, ...planosVisiveis(membro) },
        });
        if (!plano) throw naoEncontrado();

        if (!plano.ativo) throw new ErroDeNegocio("este plano está desativado", "plano_inativo");
        if (!plano.aceitaNoBalcao) {
          throw new ErroDeNegocio("este plano não aceita pagamento no balcão", "plano_sem_balcao");
        }
        if (plano.vendedorId !== null) {
          const vende = await tx.barbeiro.count({ where: { id: plano.vendedorId, ...PODE_VENDER } });
          if (vende === 0) {
            throw new ErroDeNegocio("quem vende este plano não está liberado para vender", "vendedor_nao_vende");
          }
        }
        // Uma viva por cliente e plano. O índice único parcial segura a
        // corrida (409 pelo tratador central); isto dá a mensagem.
        const viva = await tx.assinaturaDoCliente.count({
          where: { planoId: plano.id, clienteId: cliente.id, situacao: { not: "cancelada" } },
        });
        if (viva > 0) throw new ErroDeNegocio("este cliente já assina este plano", "ja_assina");

        // Com dias grátis, o teste começa hoje; sem, espera o 1º "recebi".
        const emTeste = plano.diasDeTeste > 0;
        return tx.assinaturaDoCliente.create({
          data: {
            barbeariaId,
            planoId: plano.id,
            clienteId: cliente.id,
            situacao: emTeste ? "teste" : "pendente",
            forma: "no_balcao",
            precoCentavos: plano.precoCentavos,
            ciclo: plano.ciclo,
            cicloComecaEm: emTeste ? dataParaDate(hoje) : null,
            cicloTerminaEm: emTeste ? dataParaDate(somarDias(hoje, plano.diasDeTeste)) : null,
          },
          include: INCLUDE_ASSINATURA,
        });
      });
      return reply.code(201).send(serializarAssinatura(assinatura));
    }
  );

  app.get(
    "/barbearias/me/assinantes",
    { schema: { querystring: filtroDosAssinantes } },
    async (request): Promise<AssinantesDoPainel> => {
      const { barbeariaId } = request.user;
      const membro = membroDoToken(request);
      await marcarAtrasadas(prisma, barbeariaId, agoraNaBarbearia().data);
      const { situacao, clienteId } = request.query;
      const assinaturas = await prisma.assinaturaDoCliente.findMany({
        where: {
          barbeariaId,
          ...assinaturasVisiveis(membro),
          ...(situacao ? { situacao } : {}),
          ...(clienteId ? { clienteId } : {}),
        },
        include: INCLUDE_ASSINATURA,
        orderBy: [{ criadoEm: "desc" }, { id: "asc" }],
      });
      return { assinantes: assinaturas.map(serializarAssinatura) };
    }
  );

  app.post(
    "/assinaturas/:id/recebimentos",
    { schema: { params: paramsComId, body: corpoRecebi } },
    async (request, reply) => {
      const { barbeariaId } = request.user;
      const membro = membroDoToken(request);
      const hoje = agoraNaBarbearia().data;

      const { assinatura, recebimento } = await prisma.$transaction(async (tx) => {
        // A linha da barbearia é o cadeado: o fechar do dia trava a mesma,
        // e dois "recebi" ao mesmo tempo (o duplo clique) viram um só.
        await tx.$queryRaw`SELECT id FROM barbearia WHERE id = ${barbeariaId}::uuid FOR NO KEY UPDATE`;
        const visivel = { id: request.params.id, barbeariaId, ...assinaturasVisiveis(membro) };
        await marcarAtrasadas(tx, barbeariaId, hoje, visivel);
        const atual = await tx.assinaturaDoCliente.findFirst({
          where: visivel,
          include: { plano: { select: { vendedorId: true, vendedor: { select: { parteDaCasa: true } } } } },
        });
        if (!atual) throw naoEncontrado();

        if (atual.forma === "online") {
          throw new ErroDeNegocio("assinatura online: o pagamento entra pelo provedor", "assinatura_online");
        }
        const termina = atual.cicloTerminaEm ? dateParaData(atual.cicloTerminaEm) : null;
        const problema = problemaDoRecebimento(
          { situacao: atual.situacao as SituacaoDoAssinante, cicloTerminaEm: termina },
          hoje
        );
        if (problema === "cancelada") {
          throw new ErroDeNegocio("esta assinatura foi cancelada", "assinatura_cancelada");
        }
        if (problema === "ciclo_em_dia") {
          const oQue = atual.situacao === "teste" ? "o teste grátis" : "o ciclo pago";
          throw new ErroDeNegocio(
            `${oQue} vai até ${diaEMes(termina ?? hoje)}: marque o próximo pagamento a partir desse dia`,
            "ciclo_em_dia"
          );
        }

        // A parte da casa congelada agora, sobre o preço da assinatura
        // (decisão 4): no plano de barbeiro, a "parte da casa" de hoje
        // dele; no da casa, tudo. Parte de 0 não vem na lista.
        const partes = dividirMensalidade({
          precoCentavos: atual.precoCentavos,
          vendedor: atual.plano.vendedorId,
          parteDaCasa: atual.plano.vendedor?.parteDaCasa ?? 0,
        });
        const casaCentavos = partes.find((parte) => parte.beneficiario === null)?.valorCentavos ?? 0;
        const dia = await proximoDiaAberto(tx, barbeariaId, hoje);
        const gravado = await tx.recebimentoDoPlano.create({
          data: {
            barbeariaId,
            assinaturaId: atual.id,
            data: dataParaDate(dia),
            recebidoPorId: membro.id,
            valorCentavos: atual.precoCentavos,
            casaCentavos,
            forma: request.body.forma,
          },
        });
        // O ciclo segue o dia do pagamento, não o do caixa.
        const renovada = await tx.assinaturaDoCliente.update({
          where: { id: atual.id },
          data: {
            situacao: "ativa",
            cicloComecaEm: dataParaDate(hoje),
            cicloTerminaEm: dataParaDate(fimDoCiclo(hoje, atual.ciclo as CicloDoCliente)),
          },
          include: INCLUDE_ASSINATURA,
        });
        return { assinatura: renovada, recebimento: gravado };
      });

      const corpo: RecebimentoDoBalcao = {
        assinatura: serializarAssinatura(assinatura),
        recebimento: {
          id: recebimento.id,
          data: dateParaData(recebimento.data),
          valorCentavos: recebimento.valorCentavos,
          casaCentavos: recebimento.casaCentavos,
          forma: recebimento.forma as FormaDoPagamento,
        },
      };
      return reply.code(201).send(corpo);
    }
  );

  // Cancelada de novo não é erro. A online passa a cancelar também no
  // provedor no PR 10.
  app.delete(
    "/assinaturas/:id",
    { schema: { params: paramsComId } },
    async (request, reply) => {
      const { barbeariaId } = request.user;
      const membro = membroDoToken(request);
      const atual = await prisma.assinaturaDoCliente.findFirst({
        where: { id: request.params.id, barbeariaId, ...assinaturasVisiveis(membro) },
        select: { id: true, situacao: true },
      });
      if (!atual) throw naoEncontrado();
      if (atual.situacao !== "cancelada") {
        await prisma.assinaturaDoCliente.update({
          where: { id: atual.id },
          data: { situacao: "cancelada", canceladaEm: new Date() },
        });
      }
      return reply.code(204).send();
    }
  );
}
