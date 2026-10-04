import { prisma } from "@barchop/database";
import {
  candidatosDoQualquerUm,
  carregarServicos,
  descartarPassados,
  diasComVaga,
  garantirBarbeiro,
  garantirServicosDoProfissional,
  horariosDoProfissionalNoDia,
  type ClientePrisma,
} from "../lib/disponibilidade";
import { ErroDeNegocio } from "../lib/erro-negocio";
import { agoraNaBarbearia, dataParaDate } from "../lib/horas";
import { proximosHorarios } from "../lib/proximos-horarios";
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
//
// Sem `barbeiroId` é "qualquer um" (bloco C): a união da agenda de quem
// pode atender e faz os serviços.
const filtroDia = {
  type: "object",
  additionalProperties: false,
  required: ["data", "servicoIds"],
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
  required: ["mes", "servicoIds"],
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

// De quem é a agenda pedida. Com o profissional, as checagens dele
// (existe, atende, faz os serviços) respondem 422 com o motivo; sem,
// são os candidatos do "qualquer um" — lista vazia quando ninguém faz a
// combinação, e aí a resposta é só "sem horário".
async function agendaDe(
  db: ClientePrisma,
  barbeariaId: string,
  barbeiroId: string | undefined,
  servicoIds: string[]
): Promise<string[]> {
  if (!barbeiroId) return candidatosDoQualquerUm(db, barbeariaId, servicoIds);
  await garantirBarbeiro(db, barbeariaId, barbeiroId);
  await garantirServicosDoProfissional(db, barbeiroId, servicoIds);
  return [barbeiroId];
}

// Públicas: são as telas de escolha de data e de horário, abertas pelo
// link do WhatsApp. Ficam fora do escopo protegido do app.ts.
export function registrarRotasDisponibilidade(app: App): void {
  // Os próximos 3 horários livres de cada serviço, pra página da
  // barbearia (bloco E1). Sem token, como as outras daqui.
  app.get(
    "/barbearias/:slug/proximos-horarios",
    { schema: { params: paramsSlug } },
    async (request) => {
      // findUniqueOrThrow: slug inexistente vira P2025 → 404.
      const barbearia = await prisma.barbearia.findUniqueOrThrow({
        where: { slug: request.params.slug },
        select: { id: true },
      });
      return {
        servicos: await proximosHorarios(prisma, {
          barbeariaId: barbearia.id,
          agora: agoraNaBarbearia(),
        }),
      };
    }
  );

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

      // Os serviços antes da agenda: serviço de outra barbearia ou
      // inativo é 422 também no "qualquer um".
      const { duracaoTotalMinutos } = await carregarServicos(prisma, barbearia.id, servicoIds);
      const barbeiroIds = await agendaDe(prisma, barbearia.id, barbeiroId, servicoIds);
      const dataDate = dataDaQuery(data);

      // A mesma função que o POST do "qualquer um" usa pra escolher: o
      // horário oferecido aqui é o que ele aceita lá.
      const porProfissional = await Promise.all(
        barbeiroIds.map((id) =>
          horariosDoProfissionalNoDia(prisma, {
            barbeariaId: barbearia.id,
            barbeiroId: id,
            data: dataDate,
            duracaoTotalMinutos,
          })
        )
      );
      // "HH:mm" ordena como texto na ordem do relógio.
      const uniao = [...new Set(porProfissional.flat())].sort();

      return {
        horarios: descartarPassados({ data, horarios: uniao, agora: agoraNaBarbearia() }),
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

      const { duracaoTotalMinutos } = await carregarServicos(prisma, barbearia.id, servicoIds);
      const barbeiroIds = await agendaDe(prisma, barbearia.id, barbeiroId, servicoIds);

      const [ano, numeroDoMes] = mes.split("-").map(Number);
      const primeiroDia = new Date(Date.UTC(ano, numeroDoMes - 1, 1));
      // Dia 0 do mês seguinte é o último dia deste — o jeito de não
      // manter uma tabela de 28/30/31 e de acertar ano bissexto.
      const ultimoDia = new Date(Date.UTC(ano, numeroDoMes, 0));

      // Um relógio só pro mês inteiro: o calendário não pode discordar
      // de si mesmo se a virada de minuto cair no meio do cálculo. A rota
      // sabe que dia é hoje, então dia passado já chega `false` pra
      // qualquer consumidor (a tela, o app do profissional, a IA).
      const dias = await diasComVaga(prisma, {
        barbeariaId: barbearia.id,
        barbeiroIds,
        primeiroDia,
        ultimoDia,
        duracaoTotalMinutos,
        agora: agoraNaBarbearia(),
      });

      return { dias };
    }
  );
}
