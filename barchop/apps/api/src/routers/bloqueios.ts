import { prisma } from "@barchop/database";
import { ErroHttp, naoEncontrado } from "../lib/erro-http";
import { ErroDeNegocio } from "../lib/erro-negocio";
import { dataParaDate, dateParaData, dateParaHora, horaParaDate } from "../lib/horas";
import { PADRAO_DATA, PADRAO_HORA, PADRAO_UUID } from "../lib/padroes";
import { membroDoToken } from "../plugins/auth";
import type { App } from "../tipos";

// Folga, almoço e horário fechado de cada membro (bloco B). Um período
// de datas; sem horas é o dia inteiro, com horas é a mesma faixa em cada
// dia do período. A disponibilidade trata o bloqueio como ocupado.
//
// Quem pode: dono e recepção, de qualquer membro — a recepção cuida da
// agenda; o profissional, só os dele. Por isso não há `exigirPapel`
// aqui: a regra depende de quem é o dono do bloqueio, não só do papel.

// Um ano: além disso é desligar o membro, e para isso existe o "ativo".
const MAX_DIAS_DO_PERIODO = 366;
const DIA_MS = 24 * 60 * 60 * 1000;

const corpoNovoBloqueio = {
  type: "object",
  additionalProperties: false,
  required: ["barbeiroId", "dataInicio", "dataFim"],
  properties: {
    barbeiroId: { type: "string", pattern: PADRAO_UUID },
    dataInicio: { type: "string", pattern: PADRAO_DATA },
    dataFim: { type: "string", pattern: PADRAO_DATA },
    horaInicio: { type: ["string", "null"], pattern: PADRAO_HORA },
    horaFim: { type: ["string", "null"], pattern: PADRAO_HORA },
    motivo: { type: ["string", "null"], maxLength: 120 },
  },
} as const;

const filtroPeriodo = {
  type: "object",
  additionalProperties: false,
  required: ["de", "ate"],
  properties: {
    de: { type: "string", pattern: PADRAO_DATA },
    ate: { type: "string", pattern: PADRAO_DATA },
    barbeiroId: { type: "string", pattern: PADRAO_UUID },
  },
} as const;

const paramsComId = {
  type: "object",
  required: ["id"],
  additionalProperties: false,
  properties: { id: { type: "string", pattern: PADRAO_UUID } },
} as const;

// O pattern garante a forma, não que a data exista ("2037-02-31").
function data(valor: string): Date {
  try {
    return dataParaDate(valor);
  } catch {
    throw new ErroDeNegocio(`a data ${valor} não existe`, "data_invalida");
  }
}

function serializarBloqueio(bloqueio: {
  id: string;
  barbeiroId: string;
  dataInicio: Date;
  dataFim: Date;
  horaInicio: Date | null;
  horaFim: Date | null;
  motivo: string | null;
}) {
  return {
    id: bloqueio.id,
    barbeiroId: bloqueio.barbeiroId,
    dataInicio: dateParaData(bloqueio.dataInicio),
    dataFim: dateParaData(bloqueio.dataFim),
    horaInicio: bloqueio.horaInicio ? dateParaHora(bloqueio.horaInicio) : null,
    horaFim: bloqueio.horaFim ? dateParaHora(bloqueio.horaFim) : null,
    motivo: bloqueio.motivo,
  };
}

export function registrarRotasBloqueios(app: App): void {
  // Os bloqueios que tocam o período (começam antes e terminam dentro
  // também). O profissional só enxerga os dele, como na agenda.
  app.get("/bloqueios", { schema: { querystring: filtroPeriodo } }, async (request) => {
    const membro = membroDoToken(request);
    const de = data(request.query.de);
    const ate = data(request.query.ate);
    const soDele = membro.papel === "profissional" ? membro.id : request.query.barbeiroId;

    const bloqueios = await prisma.bloqueio.findMany({
      where: {
        barbeariaId: membro.barbeariaId,
        ...(soDele ? { barbeiroId: soDele } : {}),
        dataInicio: { lte: ate },
        dataFim: { gte: de },
      },
      orderBy: [{ dataInicio: "asc" }, { horaInicio: "asc" }],
    });

    return { bloqueios: bloqueios.map(serializarBloqueio) };
  });

  app.post("/bloqueios", { schema: { body: corpoNovoBloqueio } }, async (request, reply) => {
    const membro = membroDoToken(request);
    const { barbeiroId, horaInicio, horaFim, motivo } = request.body;

    // 403 e não 404, como marcar na agenda do colega: o profissional
    // sabe que o colega existe — o que ele não pode é mexer na agenda.
    if (membro.papel === "profissional" && barbeiroId !== membro.id) {
      throw new ErroHttp(403, "sem_permissao", "seu papel na equipe não permite isto");
    }

    const dataInicio = data(request.body.dataInicio);
    const dataFim = data(request.body.dataFim);
    if (dataInicio > dataFim) {
      throw new ErroDeNegocio("o fim do período vem antes do início", "periodo_invalido");
    }
    if ((dataFim.getTime() - dataInicio.getTime()) / DIA_MS >= MAX_DIAS_DO_PERIODO) {
      throw new ErroDeNegocio("o bloqueio pode durar no máximo um ano", "periodo_invalido");
    }
    // As duas horas ou nenhuma: só uma não diz qual faixa fica fechada.
    if (Boolean(horaInicio) !== Boolean(horaFim)) {
      throw new ErroDeNegocio("informe o início e o fim do horário bloqueado", "horario_incompleto");
    }
    if (horaInicio && horaFim && horaInicio >= horaFim) {
      throw new ErroDeNegocio("o início do horário precisa ser antes do fim", "intervalo_invalido");
    }

    const alvo = await prisma.barbeiro.findFirst({
      where: { id: barbeiroId, barbeariaId: membro.barbeariaId },
      select: { id: true },
    });
    if (!alvo) {
      throw new ErroDeNegocio("membro não encontrado nesta barbearia", "barbeiro_invalido");
    }

    const bloqueio = await prisma.bloqueio.create({
      data: {
        barbeariaId: membro.barbeariaId,
        barbeiroId,
        dataInicio,
        dataFim,
        horaInicio: horaInicio ? horaParaDate(horaInicio) : null,
        horaFim: horaFim ? horaParaDate(horaFim) : null,
        motivo: motivo?.trim() || null,
      },
    });

    return reply.code(201).send(serializarBloqueio(bloqueio));
  });

  app.delete("/bloqueios/:id", { schema: { params: paramsComId } }, async (request, reply) => {
    const membro = membroDoToken(request);

    // A barbearia e, pro profissional, o próprio id no MESMO where da
    // escrita: o bloqueio do colega não existe pra ele.
    const apagados = await prisma.bloqueio.deleteMany({
      where: {
        id: request.params.id,
        barbeariaId: membro.barbeariaId,
        ...(membro.papel === "profissional" ? { barbeiroId: membro.id } : {}),
      },
    });
    if (apagados.count === 0) throw naoEncontrado();

    return reply.code(204).send();
  });
}
