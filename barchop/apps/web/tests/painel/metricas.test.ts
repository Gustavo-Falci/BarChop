import { describe, expect, it } from "vitest";
import type { AgendamentoComCliente, HorarioSerializado } from "@barchop/types";
import {
  minutosOcupados,
  ocupacao,
  previstoDoDia,
} from "../../src/painel/metricas";

const CLIENTE = {
  id: "c1",
  nome: "João Silva",
  telefone: "(11) 99999-0001",
  email: null,
  temConta: false,
};

function agendamento(
  status: string,
  minutos: number,
  preco: string
): AgendamentoComCliente {
  return {
    id: `a-${status}-${minutos}`,
    data: "2026-09-08",
    horaInicio: "09:00",
    horaFim: "09:30",
    status,
    origem: "barbeiro",
    observacoes: null,
    servicos: [
      {
        servicoId: "s1",
        nome: "Corte",
        precoNoMomento: preco,
        duracaoNoMomento: minutos,
      },
    ],
    cliente: CLIENTE,
  };
}

const ABERTO: HorarioSerializado = {
  diaSemana: 2,
  horaAbertura: "09:00",
  horaFechamento: "18:00",
  fechado: false,
};

const FECHADO: HorarioSerializado = {
  diaSemana: 0,
  horaAbertura: null,
  horaFechamento: null,
  fechado: true,
};

describe("métricas do dia", () => {
  it("soma minutos de pendente, confirmado e concluído", () => {
    const lista = [
      agendamento("pendente", 30, "40.00"),
      agendamento("confirmado", 20, "25.00"),
      agendamento("concluido", 45, "60.00"),
    ];

    expect(minutosOcupados(lista)).toBe(95);
  });

  it("ignora cancelado e no_show", () => {
    // Horário que voltou a ficar livre não ocupa a agenda nem promete
    // dinheiro.
    const lista = [
      agendamento("pendente", 30, "40.00"),
      agendamento("cancelado", 30, "40.00"),
      agendamento("no_show", 30, "40.00"),
    ];

    expect(minutosOcupados(lista)).toBe(30);
    expect(previstoDoDia(lista)).toBe("40.00");
  });

  it("a ocupação é minutos agendados sobre minutos de funcionamento", () => {
    // 09:00 às 18:00 são 540 minutos; 135 deles ocupados dão 25%.
    const lista = [
      agendamento("pendente", 90, "40.00"),
      agendamento("confirmado", 45, "60.00"),
    ];

    expect(ocupacao(lista, ABERTO)).toBe(25);
  });

  it("a ocupação arredonda pro inteiro mais próximo, não pra cima", () => {
    // Esta fixture existe pra prender o modo de arredondamento contra
    // Math.ceil especificamente. 30/540 (5,5556%) arredonda e "tetoriza"
    // pro mesmo 6; 135/540 é 25% exato — nenhuma das duas separa
    // Math.round de Math.ceil. 60/540 = 11,1111%: Math.round dá 11,
    // Math.ceil dá 12. Só esta fixture entrega valores diferentes pros
    // dois, então é ela que prova que o código não está arredondando
    // sempre pra cima.
    const lista = [agendamento("confirmado", 60, "50.00")];

    expect(ocupacao(lista, ABERTO)).toBe(11);
  });

  it("dia fechado não tem ocupação, e não é zero", () => {
    // Zero por cento diria "aberto e vazio". Dividir por zero seria o
    // outro erro.
    expect(ocupacao([], FECHADO)).toBeNull();
    expect(ocupacao([], undefined)).toBeNull();
  });

  it("o previsto soma o preço congelado, não o de hoje", () => {
    const lista = [
      agendamento("pendente", 30, "40.00"),
      agendamento("confirmado", 20, "25.50"),
    ];

    expect(previstoDoDia(lista)).toBe("65.50");
  });
});
