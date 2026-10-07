import { prisma } from "@barchop/database";
import { marcarAreas } from "../lib/areas";
import { ErroDeNegocio } from "../lib/erro-negocio";
import { naoEncontrado } from "../lib/erro-http";
import { agoraNaBarbearia, dataParaDate, dateParaData, dateParaHora, horaParaDate } from "../lib/horas";
import { PADRAO_DATA, PADRAO_HORA } from "../lib/padroes";
import { serializarHorario, type HorarioSerializado } from "../lib/serializar";
import { exigirPapel } from "../plugins/auth";
import type { App } from "../tipos";

// Domingo a sábado, na mesma ordem que a tela desenha.
const DIAS_DA_SEMANA = [0, 1, 2, 3, 4, 5, 6];

// O PUT grava sempre os 7 dias: dia ausente do corpo vira fechado. Sem
// isso, "não existe linha pra terça" e "terça está fechada" seriam
// estados diferentes no banco, e o cálculo de disponibilidade teria que
// escolher um significado — o tipo de ambiguidade que vira bug meses
// depois.
const corpoPutHorarios = {
  type: "object",
  additionalProperties: false,
  required: ["horarios"],
  properties: {
    horarios: {
      type: "array",
      maxItems: 7,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["diaSemana"],
        properties: {
          diaSemana: { type: "integer", minimum: 0, maximum: 6 },
          horaAbertura: { type: ["string", "null"], pattern: PADRAO_HORA },
          horaFechamento: { type: ["string", "null"], pattern: PADRAO_HORA },
          fechado: { type: "boolean" },
        },
      },
    },
  },
} as const;

// Exceções por data (painel v2, marco 3): a data vai no caminho, o
// estado no corpo — mandar de novo a mesma data substitui.
const paramsData = {
  type: "object",
  required: ["data"],
  properties: { data: { type: "string", pattern: PADRAO_DATA } },
} as const;

const corpoPutExcecao = {
  type: "object",
  additionalProperties: false,
  required: ["fechado"],
  properties: {
    fechado: { type: "boolean" },
    horaAbertura: { type: ["string", "null"], pattern: PADRAO_HORA },
    horaFechamento: { type: ["string", "null"], pattern: PADRAO_HORA },
    motivo: { type: ["string", "null"], maxLength: 120 },
  },
} as const;

function serializarExcecao(excecao: {
  data: Date;
  fechado: boolean;
  horaAbertura: Date | null;
  horaFechamento: Date | null;
  motivo: string | null;
}) {
  return {
    data: dateParaData(excecao.data),
    fechado: excecao.fechado,
    horaAbertura: excecao.horaAbertura ? dateParaHora(excecao.horaAbertura) : null,
    horaFechamento: excecao.horaFechamento ? dateParaHora(excecao.horaFechamento) : null,
    motivo: excecao.motivo,
  };
}

// A data do caminho como Date, recusando a que o calendário não tem
// ("2037-02-30" passa no pattern) e a que já passou: exceção é sobre o
// que ainda vai acontecer.
function dataDaExcecao(data: string): Date {
  let dataDate: Date;
  try {
    dataDate = dataParaDate(data);
  } catch {
    throw new ErroDeNegocio(`a data ${data} não existe`, "data_invalida");
  }
  if (data < agoraNaBarbearia().data) {
    throw new ErroDeNegocio("essa data já passou", "data_passada");
  }
  return dataDate;
}

// Completa o que o banco não tem: barbearia recém-criada não tem linha
// nenhuma, e a tela ainda precisa dos 7 dias pra desenhar a semana. O
// perfil público usa a mesma função.
export function completarSemana(
  linhas: {
    diaSemana: number;
    horaAbertura: Date | null;
    horaFechamento: Date | null;
    fechado: boolean;
  }[]
): HorarioSerializado[] {
  const porDia = new Map(linhas.map((linha) => [linha.diaSemana, linha]));

  return DIAS_DA_SEMANA.map((diaSemana) => {
    const linha = porDia.get(diaSemana);
    return linha
      ? serializarHorario(linha)
      : { diaSemana, horaAbertura: null, horaFechamento: null, fechado: true };
  });
}

export function registrarRotasHorarios(app: App): void {
  app.get("/barbearias/me/horarios", async (request) => {
    const linhas = await prisma.horarioFuncionamento.findMany({
      where: { barbeariaId: request.user.barbeariaId },
    });

    return { horarios: completarSemana(linhas) };
  });

  app.put(
    "/barbearias/me/horarios",
    { schema: { body: corpoPutHorarios }, onRequest: exigirPapel("dono") },
    async (request) => {
      const barbeariaId = request.user.barbeariaId;

      const enviados = new Map<
        number,
        (typeof request.body.horarios)[number]
      >();
      for (const horario of request.body.horarios) {
        // Sem esta checagem o upsert rodaria duas vezes no mesmo dia e a
        // última linha ganharia em silêncio.
        if (enviados.has(horario.diaSemana)) {
          throw new ErroDeNegocio(
            `o dia ${horario.diaSemana} aparece mais de uma vez`,
            "dia_semana_duplicado"
          );
        }
        enviados.set(horario.diaSemana, horario);
      }

      // A validação inteira acontece antes de qualquer escrita: um dia
      // inválido no meio da lista não pode deixar meia semana gravada.
      const linhas = DIAS_DA_SEMANA.map((diaSemana) => {
        const enviado = enviados.get(diaSemana);

        // Duas entradas caem aqui: dia ausente do corpo, e dia marcado
        // como fechado. `fechado: true` ganha das horas mandadas junto —
        // é a intenção explícita, e a tela costuma mandar as horas
        // antigas no formulário mesmo depois de marcar o dia como
        // fechado. As horas viram null em vez de ficarem gravadas num
        // dia que ninguém vai atender.
        if (!enviado || enviado.fechado) {
          return {
            diaSemana,
            horaAbertura: null,
            horaFechamento: null,
            fechado: true,
          };
        }

        const { horaAbertura, horaFechamento } = enviado;

        if (!horaAbertura || !horaFechamento) {
          throw new ErroDeNegocio(
            `o dia ${diaSemana} está aberto sem hora de abertura e de fechamento`,
            "horario_incompleto"
          );
        }

        // "HH:mm" com zero à esquerda compara lexicograficamente na
        // mesma ordem que cronologicamente — "09:00" < "18:00".
        if (horaAbertura >= horaFechamento) {
          throw new ErroDeNegocio(
            `no dia ${diaSemana} a abertura precisa ser antes do fechamento`,
            "intervalo_invalido"
          );
        }

        return {
          diaSemana,
          // horaParaDate e nada de `new Date(...)`: é o que impede o
          // fuso da máquina de entrar na coluna.
          horaAbertura: horaParaDate(horaAbertura),
          horaFechamento: horaParaDate(horaFechamento),
          fechado: false,
        };
      });

      // Transação: grava os sete ou nenhum.
      const gravados = await prisma.$transaction(
        linhas.map((linha) =>
          prisma.horarioFuncionamento.upsert({
            where: {
              barbeariaId_diaSemana: {
                barbeariaId,
                diaSemana: linha.diaSemana,
              },
            },
            create: { barbeariaId, ...linha },
            update: {
              horaAbertura: linha.horaAbertura,
              horaFechamento: linha.horaFechamento,
              fechado: linha.fechado,
            },
          })
        )
      );

      // Salvar a semana decide Horários, mesmo sem mudar nada (painel v2).
      await marcarAreas(barbeariaId, ["horarios"]);

      return { horarios: completarSemana(gravados) };
    }
  );

  // De hoje em diante: a que já passou não muda mais nada. Todos os
  // papéis leem — a agenda mostra o dia fechado.
  app.get("/barbearias/me/horarios/excecoes", async (request) => {
    const excecoes = await prisma.excecaoHorario.findMany({
      where: {
        barbeariaId: request.user.barbeariaId,
        data: { gte: dataParaDate(agoraNaBarbearia().data) },
      },
      orderBy: { data: "asc" },
    });
    return { excecoes: excecoes.map(serializarExcecao) };
  });

  app.put(
    "/barbearias/me/horarios/excecoes/:data",
    { schema: { params: paramsData, body: corpoPutExcecao }, onRequest: exigirPapel("dono") },
    async (request) => {
      const { barbeariaId } = request.user;
      const data = dataDaExcecao(request.params.data);
      const { fechado, horaAbertura, horaFechamento } = request.body;
      const motivo = request.body.motivo?.trim() || null;

      // As mesmas regras do PUT da semana: fechado ganha das horas, e
      // aberto precisa das duas na ordem do relógio.
      let horas: { horaAbertura: Date | null; horaFechamento: Date | null } = {
        horaAbertura: null,
        horaFechamento: null,
      };
      if (!fechado) {
        if (!horaAbertura || !horaFechamento) {
          throw new ErroDeNegocio(
            "a data está aberta sem hora de abertura e de fechamento",
            "horario_incompleto"
          );
        }
        if (horaAbertura >= horaFechamento) {
          throw new ErroDeNegocio(
            "a abertura precisa ser antes do fechamento",
            "intervalo_invalido"
          );
        }
        horas = { horaAbertura: horaParaDate(horaAbertura), horaFechamento: horaParaDate(horaFechamento) };
      }

      const excecao = await prisma.excecaoHorario.upsert({
        where: { barbeariaId_data: { barbeariaId, data } },
        create: { barbeariaId, data, fechado, motivo, ...horas },
        update: { fechado, motivo, ...horas },
      });

      // Os marcados na data ficam onde estão (o dono decide o que fazer
      // com cada um); a tela avisa quantos caem fora do horário novo.
      // "HH:mm" compara como texto na ordem do relógio.
      const marcados = await prisma.agendamento.findMany({
        where: { barbeariaId, data, status: { not: "cancelado" } },
        select: { horaInicio: true, horaFim: true },
      });
      const foraDoHorario = fechado
        ? marcados.length
        : marcados.filter(
            (marcado) =>
              dateParaHora(marcado.horaInicio) < horaAbertura! || dateParaHora(marcado.horaFim) > horaFechamento!
          ).length;

      await marcarAreas(barbeariaId, ["horarios"]);

      return { excecao: serializarExcecao(excecao), foraDoHorario };
    }
  );

  app.delete(
    "/barbearias/me/horarios/excecoes/:data",
    { schema: { params: paramsData }, onRequest: exigirPapel("dono") },
    async (request, reply) => {
      let data: Date;
      try {
        data = dataParaDate(request.params.data);
      } catch {
        throw naoEncontrado("não há exceção nessa data");
      }
      const { count } = await prisma.excecaoHorario.deleteMany({
        where: { barbeariaId: request.user.barbeariaId, data },
      });
      if (count === 0) throw naoEncontrado("não há exceção nessa data");
      return reply.code(204).send();
    }
  );
}
