import { describe, expect, it } from "vitest";
import type { AgendamentoComCliente } from "@barchop/types";
import { formatarHoras, percentual, previstoDoDia, proximos } from "../../src/painel/metricas";

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
  preco: string,
  { id, horaInicio = "09:00", horaFim = "09:30" }: { id?: string; horaInicio?: string; horaFim?: string } = {}
): AgendamentoComCliente {
  return {
    id: id ?? `a-${status}-${minutos}-${horaInicio}`,
    data: "2026-09-08",
    horaInicio,
    horaFim,
    status,
    origem: "barbeiro",
    observacoes: null,
    presencaConfirmadaEm: null,
    barbeiro: { id: "bb1", nome: "Rafael" },
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

// 2026-09-08 às 10:00 no fuso da barbearia (o vitest roda em
// America/Sao_Paulo).
const AGORA = new Date("2026-09-08T10:00:00-03:00");

describe("previsto do dia", () => {
  it("soma o preço congelado, não o de hoje", () => {
    const lista = [agendamento("pendente", 30, "40.00"), agendamento("confirmado", 20, "25.50")];

    expect(previstoDoDia(lista)).toBe("65.50");
  });

  it("ignora cancelado e no_show", () => {
    // Horário que voltou a ficar livre não promete dinheiro.
    const lista = [
      agendamento("pendente", 30, "40.00"),
      agendamento("cancelado", 30, "40.00"),
      agendamento("no_show", 30, "40.00"),
    ];

    expect(previstoDoDia(lista)).toBe("40.00");
  });
});

// A conta da ocupação é da API (painel v2, marco 4); a tela só divide.
describe("percentual da ocupação", () => {
  it("é agendado sobre trabalho", () => {
    expect(percentual({ minutosDeTrabalho: 540, minutosAgendados: 135 })).toBe(25);
  });

  it("arredonda pro inteiro mais próximo, não pra cima", () => {
    // 60/540 = 11,11%: Math.round dá 11, Math.ceil daria 12.
    expect(percentual({ minutosDeTrabalho: 540, minutosAgendados: 60 })).toBe(11);
  });

  it("sem trabalho no dia não tem ocupação, e não é zero", () => {
    // Zero por cento diria "aberto e vazio". Dividir por zero seria o
    // outro erro.
    expect(percentual({ minutosDeTrabalho: 0, minutosAgendados: 0 })).toBeNull();
    expect(percentual({ minutosDeTrabalho: 0, minutosAgendados: 30 })).toBeNull();
  });

  it("encaixe além do horário passa de 100, sem esconder", () => {
    expect(percentual({ minutosDeTrabalho: 60, minutosAgendados: 90 })).toBe(150);
  });
});

describe("próximos atendimentos", () => {
  it("deixa de fora o que já terminou, e marca o que está em curso", () => {
    const lista = [
      agendamento("confirmado", 30, "40.00", { id: "passou", horaInicio: "08:00", horaFim: "08:30" }),
      agendamento("confirmado", 45, "40.00", { id: "agora", horaInicio: "09:45", horaFim: "10:30" }),
      agendamento("pendente", 30, "40.00", { id: "depois", horaInicio: "11:00", horaFim: "11:30" }),
    ];

    expect(proximos(lista, AGORA).map(({ agendamento: a, emCurso }) => [a.id, emCurso])).toEqual([
      ["agora", true],
      ["depois", false],
    ]);
  });

  it("termina às 10:00 em ponto já não é próximo; começa às 10:00 está em curso", () => {
    const lista = [
      agendamento("confirmado", 30, "40.00", { id: "acabou", horaInicio: "09:30", horaFim: "10:00" }),
      agendamento("confirmado", 30, "40.00", { id: "comeca", horaInicio: "10:00", horaFim: "10:30" }),
    ];

    expect(proximos(lista, AGORA).map(({ agendamento: a, emCurso }) => [a.id, emCurso])).toEqual([
      ["comeca", true],
    ]);
  });

  it("só pendente e confirmado; em ordem de horário", () => {
    const lista = [
      agendamento("confirmado", 30, "40.00", { id: "c", horaInicio: "15:00", horaFim: "15:30" }),
      agendamento("cancelado", 30, "40.00", { id: "x", horaInicio: "11:00", horaFim: "11:30" }),
      agendamento("concluido", 30, "40.00", { id: "y", horaInicio: "12:00", horaFim: "12:30" }),
      agendamento("pendente", 30, "40.00", { id: "a", horaInicio: "13:00", horaFim: "13:30" }),
    ];

    expect(proximos(lista, AGORA).map(({ agendamento: a }) => a.id)).toEqual(["a", "c"]);
  });
});

describe("horas por extenso", () => {
  it("minutos, horas cheias e horas com minutos", () => {
    expect(formatarHoras(45)).toBe("45 min");
    expect(formatarHoras(540)).toBe("9h");
    expect(formatarHoras(270)).toBe("4h30");
    expect(formatarHoras(65)).toBe("1h05");
    expect(formatarHoras(0)).toBe("0 min");
  });
});
