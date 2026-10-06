import { prisma } from "@barchop/database";
import { marcarAreas } from "../lib/areas";
import { ErroDeNegocio } from "../lib/erro-negocio";
import { horaParaDate } from "../lib/horas";
import { PADRAO_HORA } from "../lib/padroes";
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
}
