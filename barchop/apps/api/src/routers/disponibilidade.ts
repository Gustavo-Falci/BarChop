import { prisma } from "@barchop/database";
import {
  carregarServicos,
  descartarPassados,
  garantirBarbeiro,
  horariosLivres,
} from "../lib/disponibilidade";
import { ErroDeNegocio } from "../lib/erro-negocio";
import { agoraNaBarbearia, dataParaDate, dateParaData } from "../lib/horas";
import {
  PADRAO_DATA,
  PADRAO_MES,
  PADRAO_SLUG,
  PADRAO_UUID,
} from "../lib/padroes";
import type { App } from "../tipos";

const paramsSlug = {
  type: "object",
  required: ["slug"],
  additionalProperties: false,
  properties: { slug: { type: "string", pattern: PADRAO_SLUG } },
} as const;

// `servicoIds` vem repetido na query (`?servicoIds=a&servicoIds=b`). Um
// valor só também chega como array: o coerceTypes do AJV embrulha o
// escalar sozinho — medido, ver o plano da fase 5.
const filtroDia = {
  type: "object",
  additionalProperties: false,
  required: ["barbeiroId", "data", "servicoIds"],
  properties: {
    barbeiroId: { type: "string", pattern: PADRAO_UUID },
    data: { type: "string", pattern: PADRAO_DATA },
    servicoIds: {
      type: "array",
      minItems: 1,
      maxItems: 10,
      items: { type: "string", pattern: PADRAO_UUID },
    },
  },
} as const;

const filtroMes = {
  type: "object",
  additionalProperties: false,
  required: ["barbeiroId", "mes", "servicoIds"],
  properties: {
    barbeiroId: { type: "string", pattern: PADRAO_UUID },
    mes: { type: "string", pattern: PADRAO_MES },
    servicoIds: {
      type: "array",
      minItems: 1,
      maxItems: 10,
      items: { type: "string", pattern: PADRAO_UUID },
    },
  },
} as const;

// O pattern garante a forma "YYYY-MM-DD", não que a data exista:
// "2026-02-31" passa por ele e explode no dataParaDate. Sem este
// wrapper seria um RangeError não tratado, ou seja, 500 por culpa de
// quem chamou.
function dataDaQuery(valor: string): Date {
  try {
    return dataParaDate(valor);
  } catch {
    throw new ErroDeNegocio(`a data ${valor} não existe`, "data_invalida");
  }
}

// Públicas: são as telas de escolha de data e de horário, abertas pelo
// link do WhatsApp. Ficam fora do escopo protegido do app.ts.
export function registrarRotasDisponibilidade(app: App): void {
  app.get(
    "/barbearias/:slug/disponibilidade",
    { schema: { params: paramsSlug, querystring: filtroDia } },
    async (request) => {
      const { barbeiroId, data, servicoIds } = request.query;

      // findUniqueOrThrow: slug inexistente vira P2025 -> 404.
      const barbearia = await prisma.barbearia.findUniqueOrThrow({
        where: { slug: request.params.slug },
        select: { id: true },
      });

      await garantirBarbeiro(prisma, barbearia.id, barbeiroId);

      const { duracaoTotalMinutos } = await carregarServicos(
        prisma,
        barbearia.id,
        servicoIds
      );

      const dataDate = dataDaQuery(data);

      const janela = await prisma.horarioFuncionamento.findUnique({
        where: {
          barbeariaId_diaSemana: {
            barbeariaId: barbearia.id,
            diaSemana: dataDate.getUTCDay(),
          },
        },
      });

      // Mesmo filtro que a trava do banco usa: cancelado não ocupa.
      const ocupados = await prisma.agendamento.findMany({
        where: { barbeiroId, data: dataDate, status: { not: "cancelado" } },
        select: { horaInicio: true, horaFim: true },
      });

      return {
        horarios: descartarPassados({
          data,
          horarios: horariosLivres({ janela, ocupados, duracaoTotalMinutos }),
          agora: agoraNaBarbearia(),
        }),
      };
    }
  );

  app.get(
    "/barbearias/:slug/disponibilidade/mes",
    { schema: { params: paramsSlug, querystring: filtroMes } },
    async (request) => {
      const { barbeiroId, mes, servicoIds } = request.query;

      const barbearia = await prisma.barbearia.findUniqueOrThrow({
        where: { slug: request.params.slug },
        select: { id: true },
      });

      await garantirBarbeiro(prisma, barbearia.id, barbeiroId);

      const { duracaoTotalMinutos } = await carregarServicos(
        prisma,
        barbearia.id,
        servicoIds
      );

      const [ano, numeroDoMes] = mes.split("-").map(Number);
      const primeiroDia = new Date(Date.UTC(ano, numeroDoMes - 1, 1));
      // Dia 0 do mês seguinte é o último dia deste — o jeito de não
      // manter uma tabela de 28/30/31 e de acertar ano bissexto.
      const ultimoDia = new Date(Date.UTC(ano, numeroDoMes, 0));

      // Uma consulta pro mês inteiro, agrupada em memória logo abaixo.
      // Trinta consultas (uma por dia) desenhariam o mesmo calendário
      // com trinta idas ao banco.
      const agendamentos = await prisma.agendamento.findMany({
        where: {
          barbeiroId,
          data: { gte: primeiroDia, lte: ultimoDia },
          status: { not: "cancelado" },
        },
        select: { data: true, horaInicio: true, horaFim: true },
      });

      const ocupadosPorDia = new Map<
        string,
        { horaInicio: Date; horaFim: Date }[]
      >();
      for (const agendamento of agendamentos) {
        const chave = dateParaData(agendamento.data);
        const doDia = ocupadosPorDia.get(chave) ?? [];
        doDia.push({
          horaInicio: agendamento.horaInicio,
          horaFim: agendamento.horaFim,
        });
        ocupadosPorDia.set(chave, doDia);
      }

      // A segunda e última consulta: as sete linhas da semana.
      const janelas = await prisma.horarioFuncionamento.findMany({
        where: { barbeariaId: barbearia.id },
      });
      const janelaPorDiaSemana = new Map(
        janelas.map((janela) => [janela.diaSemana, janela])
      );

      // Um relógio só pro mês inteiro: o calendário não pode discordar
      // de si mesmo se a virada de minuto cair no meio do laço.
      const agora = agoraNaBarbearia();

      const dias: Record<string, boolean> = {};
      for (let dia = 1; dia <= ultimoDia.getUTCDate(); dia += 1) {
        const data = new Date(Date.UTC(ano, numeroDoMes - 1, dia));
        const chave = dateParaData(data);

        // Um dia é `true` se tem pelo menos um horário livre que ainda
        // não passou. Antes a rota não sabia que dia era hoje e quem
        // desabilitava o passado era a tela; agora qualquer consumidor
        // (o app do profissional, a IA) recebe o calendário certo.
        dias[chave] =
          descartarPassados({
            data: chave,
            horarios: horariosLivres({
              janela: janelaPorDiaSemana.get(data.getUTCDay()) ?? null,
              ocupados: ocupadosPorDia.get(chave) ?? [],
              duracaoTotalMinutos,
            }),
            agora,
          }).length > 0;
      }

      return { dias };
    }
  );
}
