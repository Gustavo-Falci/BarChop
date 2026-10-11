import { describe, expect, it } from "vitest";
import type { AgendamentoComCliente, BloqueioSerializado, HorarioSerializado } from "@barchop/types";
import { gradeDeTempo, MINUTOS_POR_LINHA } from "../../src/painel/grade";

// Onda 1, C3: na vista de dia, uma coluna por profissional, com os
// agendamentos de cada um e os bloqueios dele.

const HORARIOS: HorarioSerializado[] = [0, 1, 2, 3, 4, 5, 6].map((diaSemana) => ({
  diaSemana,
  horaAbertura: diaSemana === 0 ? null : "09:00",
  horaFechamento: diaSemana === 0 ? null : "18:00",
  fechado: diaSemana === 0,
}));

const TERCA = "2026-09-08";
const AGORA = new Date("2026-09-08T08:00:00-03:00");
const EQUIPE = [
  { id: "bb1", nome: "Rafael" },
  { id: "m2", nome: "Ana" },
];

function agendamento(id: string, barbeiroId: string, horaInicio: string, horaFim: string): AgendamentoComCliente {
  return {
    id,
    data: TERCA,
    horaInicio,
    horaFim,
    status: "confirmado",
    origem: "cliente",
    observacoes: null,
    presencaConfirmadaEm: null,
    barbeiro: { id: barbeiroId, nome: barbeiroId === "m2" ? "Ana" : "Rafael" },
    servicos: [{ servicoId: "s1", nome: "Corte", precoNoMomento: "40.00", duracaoNoMomento: 30 }],
    cliente: { id: "c1", nome: "João", telefone: "(11) 99999-0001", email: null, temConta: false },
  };
}

function bloqueio(entrada: Partial<BloqueioSerializado>): BloqueioSerializado {
  return {
    id: "x1",
    barbeiroId: "m2",
    dataInicio: TERCA,
    dataFim: TERCA,
    horaInicio: null,
    horaFim: null,
    motivo: null,
    ...entrada,
  };
}

describe("gradeDeTempo por profissional", () => {
  it("uma coluna por profissional, com o nome e só os agendamentos dele", () => {
    const grade = gradeDeTempo({
      dias: [TERCA],
      horarios: HORARIOS,
      agendamentos: [agendamento("a1", "bb1", "10:00", "10:30"), agendamento("a2", "m2", "11:00", "11:30")],
      agora: AGORA,
      profissionais: EQUIPE,
    });

    expect(grade.colunas.map((coluna) => coluna.rotulo)).toEqual(["Rafael", "Ana"]);
    expect(grade.colunas.map((coluna) => coluna.barbeiroId)).toEqual(["bb1", "m2"]);
    expect(grade.colunas[0].eventos.map((e) => e.agendamento.id)).toEqual(["a1"]);
    expect(grade.colunas[1].eventos.map((e) => e.agendamento.id)).toEqual(["a2"]);
    // O horário do Rafael ocupado não tira o livre da Ana.
    expect(grade.colunas[1].livres.map((f) => f.hora)).toContain("10:00");
    expect(grade.colunas[0].livres.map((f) => f.hora)).not.toContain("10:00");
  });

  it("o almoço vira um bloco na coluna e some dos horários livres", () => {
    const grade = gradeDeTempo({
      dias: [TERCA],
      horarios: HORARIOS,
      agendamentos: [],
      agora: AGORA,
      profissionais: EQUIPE,
      bloqueios: [bloqueio({ horaInicio: "12:00", horaFim: "13:00", motivo: "Almoço" })],
    });

    const ana = grade.colunas[1];
    expect(ana.livres.map((f) => f.hora)).not.toContain("12:00");
    expect(ana.livres.map((f) => f.hora)).not.toContain("12:45");
    expect(ana.livres.map((f) => f.hora)).toContain("13:00");
    expect(ana.bloqueios).toEqual([
      { linha: (12 * 60 - 9 * 60) / MINUTOS_POR_LINHA + 1, linhas: 60 / MINUTOS_POR_LINHA, rotulo: "Almoço" },
    ]);
    expect(grade.colunas[0].bloqueios).toEqual([]);
  });

  it("bloqueio do dia inteiro cobre a coluna e não deixa horário livre", () => {
    const grade = gradeDeTempo({
      dias: [TERCA],
      horarios: HORARIOS,
      agendamentos: [],
      agora: AGORA,
      profissionais: EQUIPE,
      bloqueios: [bloqueio({ dataInicio: "2026-09-07", dataFim: "2026-09-09" })],
    });

    const ana = grade.colunas[1];
    expect(ana.livres).toEqual([]);
    expect(ana.bloqueios).toEqual([{ linha: 1, linhas: grade.totalLinhas, rotulo: "Bloqueado" }]);
  });

  it("sem profissionais, as colunas continuam sendo os dias", () => {
    const grade = gradeDeTempo({
      dias: [TERCA],
      horarios: HORARIOS,
      agendamentos: [],
      agora: AGORA,
    });

    expect(grade.colunas).toHaveLength(1);
    expect(grade.colunas[0].rotulo).toBeUndefined();
    expect(grade.colunas[0].bloqueios).toEqual([]);
  });
});

// Painel v2, marco 6: o expediente de cada profissional (da ocupação na
// API) sombreia o que está fechado e tira dali os horários livres — a
// API recusaria marcar no almoço (`horario_na_pausa`).
describe("gradeDeTempo com o expediente", () => {
  const linhaDe = (hora: string) => {
    const [h, m] = hora.split(":").map(Number);
    return (h * 60 + m - 9 * 60) / MINUTOS_POR_LINHA + 1;
  };
  const aberto = { abre: "09:00", fecha: "18:00" };

  it("a pausa vira faixa e some dos horários livres", () => {
    const grade = gradeDeTempo({
      dias: [TERCA],
      horarios: HORARIOS,
      agendamentos: [],
      agora: AGORA,
      profissionais: EQUIPE,
      expediente: { [TERCA]: [
        { id: "bb1", janela: aberto, pausa: { inicio: "12:00", fim: "13:00" } },
        { id: "m2", janela: aberto, pausa: null },
      ] },
    });

    const [rafael, ana] = grade.colunas;
    expect(rafael.fechadas).toEqual([{ linha: linhaDe("12:00"), linhas: 60 / MINUTOS_POR_LINHA, rotulo: "Pausa" }]);
    expect(rafael.livres.map((f) => f.hora)).not.toContain("12:00");
    expect(rafael.livres.map((f) => f.hora)).not.toContain("12:45");
    expect(rafael.livres.map((f) => f.hora)).toContain("13:00");
    expect(ana.fechadas).toEqual([]);
    expect(ana.livres.map((f) => f.hora)).toContain("12:00");
  });

  it("fora da jornada é fechado, antes e depois", () => {
    const grade = gradeDeTempo({
      dias: [TERCA],
      horarios: HORARIOS,
      agendamentos: [],
      agora: AGORA,
      profissionais: EQUIPE,
      expediente: { [TERCA]: [
        { id: "bb1", janela: aberto, pausa: null },
        { id: "m2", janela: { abre: "13:00", fecha: "17:00" }, pausa: null },
      ] },
    });

    const ana = grade.colunas[1];
    expect(ana.fechadas).toEqual([
      { linha: 1, linhas: (13 - 9) * 60 / MINUTOS_POR_LINHA, rotulo: "Fechado" },
      { linha: linhaDe("17:00"), linhas: 60 / MINUTOS_POR_LINHA, rotulo: "Fechado" },
    ]);
    expect(ana.livres[0].hora).toBe("13:00");
    expect(ana.livres.at(-1)?.hora).toBe("16:45");
  });

  it("sem janela, a coluna fica fechada e sem horário livre", () => {
    // Folga da Ana, ou data especial com a casa fechada.
    const grade = gradeDeTempo({
      dias: [TERCA],
      horarios: HORARIOS,
      agendamentos: [],
      agora: AGORA,
      profissionais: EQUIPE,
      expediente: { [TERCA]: [
        { id: "bb1", janela: aberto, pausa: null },
        { id: "m2", janela: null, pausa: null },
      ] },
    });

    expect(grade.colunas[1].fechado).toBe(true);
    expect(grade.colunas[1].livres).toEqual([]);
    expect(grade.colunas[0].fechado).toBe(false);
  });

  it("data especial que abre mais cedo estica a grade", () => {
    const grade = gradeDeTempo({
      dias: [TERCA],
      horarios: HORARIOS,
      agendamentos: [],
      agora: AGORA,
      profissionais: EQUIPE,
      expediente: { [TERCA]: [
        { id: "bb1", janela: { abre: "08:00", fecha: "18:00" }, pausa: null },
        { id: "m2", janela: { abre: "08:00", fecha: "18:00" }, pausa: null },
      ] },
    });

    expect(grade.minutoInicial).toBe(8 * 60);
    expect(grade.colunas[0].livres[0].hora).toBe("08:00");
  });

  it("a coluna única (quem trabalha sozinho) usa o único expediente", () => {
    const grade = gradeDeTempo({
      dias: [TERCA],
      horarios: HORARIOS,
      agendamentos: [],
      agora: AGORA,
      expediente: { [TERCA]: [{ id: "bb1", janela: aberto, pausa: { inicio: "12:00", fim: "13:00" } }] },
    });

    expect(grade.colunas[0].fechadas.map((f) => f.rotulo)).toEqual(["Pausa"]);
    expect(grade.colunas[0].livres.map((f) => f.hora)).not.toContain("12:30");
  });

  it("a coluna única desenha o bloqueio do único profissional", () => {
    // Quem trabalha sozinho: uma coluna sem barbeiroId. Antes os
    // bloqueios só apareciam nas colunas da equipe.
    const grade = gradeDeTempo({
      dias: [TERCA],
      horarios: HORARIOS,
      agendamentos: [],
      agora: AGORA,
      expediente: { [TERCA]: [{ id: "m2", janela: aberto, pausa: null }] },
      bloqueios: [bloqueio({ horaInicio: "15:00", horaFim: "16:00", motivo: "Médico" })],
    });

    expect(grade.colunas[0].bloqueios.map((b) => b.rotulo)).toEqual(["Médico"]);
    expect(grade.colunas[0].livres.map((f) => f.hora)).not.toContain("15:00");
  });

  it("sem expediente (vista de semana), nada muda", () => {
    const grade = gradeDeTempo({ dias: [TERCA], horarios: HORARIOS, agendamentos: [], agora: AGORA });

    expect(grade.colunas[0].fechadas).toEqual([]);
    expect(grade.colunas[0].livres.map((f) => f.hora)).toContain("12:00");
  });
});

// A vista de semana: uma coluna por dia, cada uma com o expediente
// daquele dia. Na equipe a coluna junta todo mundo, então só fica
// sombreado o que vale pra todos: fora do expediente de qualquer um é
// "Fechado", e "Pausa" só quando todos que estão no expediente param.
describe("gradeDeTempo na semana, com o expediente de cada dia", () => {
  const SEGUNDA = "2026-09-07";
  const linhaDe = (hora: string) => {
    const [h, m] = hora.split(":").map(Number);
    return (h * 60 + m - 9 * 60) / MINUTOS_POR_LINHA + 1;
  };
  const aberto = { abre: "09:00", fecha: "18:00" };
  const almoco = { inicio: "12:00", fim: "13:00" };
  const horas = (coluna: { livres: { hora: string }[] }) => coluna.livres.map((f) => f.hora);

  it("quem trabalha sozinho: cada dia usa o próprio expediente", () => {
    const grade = gradeDeTempo({
      dias: [SEGUNDA, TERCA],
      horarios: HORARIOS,
      agendamentos: [],
      agora: AGORA,
      expediente: {
        [SEGUNDA]: [{ id: "bb1", janela: aberto, pausa: null }],
        [TERCA]: [{ id: "bb1", janela: aberto, pausa: almoco }],
      },
    });

    const [segunda, terca] = grade.colunas;
    expect(segunda.fechadas).toEqual([]);
    expect(horas(segunda)).toContain("12:00");
    expect(terca.fechadas).toEqual([{ linha: linhaDe("12:00"), linhas: 60 / MINUTOS_POR_LINHA, rotulo: "Pausa" }]);
    expect(horas(terca)).not.toContain("12:00");
  });

  it("a grade cobre a janela mais larga da semana", () => {
    const grade = gradeDeTempo({
      dias: [SEGUNDA, TERCA],
      horarios: HORARIOS,
      agendamentos: [],
      agora: AGORA,
      expediente: {
        [SEGUNDA]: [{ id: "bb1", janela: aberto, pausa: null }],
        [TERCA]: [{ id: "bb1", janela: { abre: "08:00", fecha: "18:00" }, pausa: null }],
      },
    });

    expect(grade.minutoInicial).toBe(8 * 60);
    // A segunda abre às 9: a hora a mais da terça fica fechada nela.
    expect(grade.colunas[0].fechadas).toEqual([{ linha: 1, linhas: 60 / MINUTOS_POR_LINHA, rotulo: "Fechado" }]);
  });

  it("na equipe, o almoço de todos na mesma hora fica sombreado", () => {
    const grade = gradeDeTempo({
      dias: [TERCA],
      horarios: HORARIOS,
      agendamentos: [],
      agora: AGORA,
      expediente: {
        [TERCA]: [
          { id: "bb1", janela: aberto, pausa: almoco },
          { id: "m2", janela: aberto, pausa: almoco },
        ],
      },
    });

    expect(grade.colunas[0].fechadas).toEqual([
      { linha: linhaDe("12:00"), linhas: 60 / MINUTOS_POR_LINHA, rotulo: "Pausa" },
    ]);
    expect(horas(grade.colunas[0])).not.toContain("12:30");
  });

  it("na equipe, almoços em horas diferentes não sombreiam nada: sempre tem alguém", () => {
    const grade = gradeDeTempo({
      dias: [TERCA],
      horarios: HORARIOS,
      agendamentos: [],
      agora: AGORA,
      expediente: {
        [TERCA]: [
          { id: "bb1", janela: aberto, pausa: almoco },
          { id: "m2", janela: aberto, pausa: { inicio: "13:00", fim: "14:00" } },
        ],
      },
    });

    expect(grade.colunas[0].fechadas).toEqual([]);
    expect(horas(grade.colunas[0])).toContain("12:00");
    expect(horas(grade.colunas[0])).toContain("13:00");
  });

  it("na equipe, o vão entre um turno e outro é fechado", () => {
    const grade = gradeDeTempo({
      dias: [TERCA],
      horarios: HORARIOS,
      agendamentos: [],
      agora: AGORA,
      expediente: {
        [TERCA]: [
          { id: "bb1", janela: { abre: "09:00", fecha: "13:00" }, pausa: null },
          { id: "m2", janela: { abre: "14:00", fecha: "18:00" }, pausa: null },
        ],
      },
    });

    expect(grade.colunas[0].fechadas).toEqual([
      { linha: linhaDe("13:00"), linhas: 60 / MINUTOS_POR_LINHA, rotulo: "Fechado" },
    ]);
    expect(horas(grade.colunas[0])).not.toContain("13:30");
    expect(horas(grade.colunas[0])).toContain("14:00");
  });

  it("na equipe, quem está de folga não conta; todo mundo de folga fecha o dia", () => {
    const umDeFolga = gradeDeTempo({
      dias: [TERCA],
      horarios: HORARIOS,
      agendamentos: [],
      agora: AGORA,
      expediente: {
        [TERCA]: [
          { id: "bb1", janela: aberto, pausa: almoco },
          { id: "m2", janela: null, pausa: null },
        ],
      },
    });
    expect(umDeFolga.colunas[0].fechadas.map((f) => f.rotulo)).toEqual(["Pausa"]);

    const todosDeFolga = gradeDeTempo({
      dias: [TERCA],
      horarios: HORARIOS,
      agendamentos: [agendamento("a1", "bb1", "10:00", "10:30")],
      agora: AGORA,
      expediente: {
        [TERCA]: [
          { id: "bb1", janela: null, pausa: null },
          { id: "m2", janela: null, pausa: null },
        ],
      },
    });
    expect(todosDeFolga.colunas[0].fechado).toBe(true);
    expect(todosDeFolga.colunas[0].livres).toEqual([]);
    // O agendamento que já existia continua na grade.
    expect(todosDeFolga.colunas[0].eventos.map((e) => e.agendamento.id)).toEqual(["a1"]);
  });
});

// Pedido do dono (2026-10-11): na coluna que junta a equipe, um horário
// fica livre se ALGUÉM pode atender, e leva junto quem pode — o Novo
// agendamento oferece só essas pessoas. Pausa, folga e agendamento de um
// tiram só ele da lista.
describe("gradeDeTempo na semana: quem pode atender em cada horário livre", () => {
  const aberto = { abre: "09:00", fecha: "18:00" };
  const almoco = { inicio: "12:00", fim: "13:00" };
  const livre = (coluna: { livres: { hora: string; profissionais?: string[] }[] }, hora: string) =>
    coluna.livres.find((f) => f.hora === hora);

  it("na pausa do Rafael, o horário fica livre só pra Ana", () => {
    const grade = gradeDeTempo({
      dias: [TERCA],
      horarios: HORARIOS,
      agendamentos: [],
      agora: AGORA,
      expediente: {
        [TERCA]: [
          { id: "bb1", janela: aberto, pausa: almoco },
          { id: "m2", janela: aberto, pausa: null },
        ],
      },
    });

    expect(livre(grade.colunas[0], "12:00")?.profissionais).toEqual(["m2"]);
    expect(livre(grade.colunas[0], "11:00")?.profissionais).toEqual(["bb1", "m2"]);
  });

  it("o agendamento do Rafael não tira o horário da Ana", () => {
    const grade = gradeDeTempo({
      dias: [TERCA],
      horarios: HORARIOS,
      agendamentos: [agendamento("a1", "bb1", "10:00", "10:30")],
      agora: AGORA,
      expediente: {
        [TERCA]: [
          { id: "bb1", janela: aberto, pausa: null },
          { id: "m2", janela: aberto, pausa: null },
        ],
      },
    });

    expect(livre(grade.colunas[0], "10:00")?.profissionais).toEqual(["m2"]);
    expect(livre(grade.colunas[0], "10:30")?.profissionais).toEqual(["bb1", "m2"]);
  });

  it("folga da Ana na hora da pausa do Rafael: ninguém atende, sem horário livre", () => {
    const grade = gradeDeTempo({
      dias: [TERCA],
      horarios: HORARIOS,
      agendamentos: [],
      agora: AGORA,
      bloqueios: [bloqueio({ barbeiroId: "m2", horaInicio: "12:00", horaFim: "13:00", motivo: "Médico" })],
      expediente: {
        [TERCA]: [
          { id: "bb1", janela: aberto, pausa: almoco },
          { id: "m2", janela: aberto, pausa: null },
        ],
      },
    });

    expect(livre(grade.colunas[0], "12:00")).toBeUndefined();
    expect(livre(grade.colunas[0], "13:00")?.profissionais).toEqual(["bb1", "m2"]);
  });

  it("todos em pausa na mesma hora: nenhum horário livre ali", () => {
    const grade = gradeDeTempo({
      dias: [TERCA],
      horarios: HORARIOS,
      agendamentos: [],
      agora: AGORA,
      expediente: {
        [TERCA]: [
          { id: "bb1", janela: aberto, pausa: almoco },
          { id: "m2", janela: aberto, pausa: almoco },
        ],
      },
    });

    expect(grade.colunas[0].livres.map((f) => f.hora).filter((h) => h >= "12:00" && h < "13:00")).toEqual([]);
  });

  it("coluna de um profissional só não leva a lista: ele já é o profissional", () => {
    const sozinho = gradeDeTempo({
      dias: [TERCA],
      horarios: HORARIOS,
      agendamentos: [],
      agora: AGORA,
      expediente: { [TERCA]: [{ id: "bb1", janela: aberto, pausa: null }] },
    });
    expect(livre(sozinho.colunas[0], "11:00")?.profissionais).toBeUndefined();

    const daEquipe = gradeDeTempo({
      dias: [TERCA],
      horarios: HORARIOS,
      agendamentos: [],
      agora: AGORA,
      profissionais: EQUIPE,
      expediente: {
        [TERCA]: [
          { id: "bb1", janela: aberto, pausa: null },
          { id: "m2", janela: aberto, pausa: null },
        ],
      },
    });
    expect(livre(daEquipe.colunas[1], "11:00")?.profissionais).toBeUndefined();
  });
});
