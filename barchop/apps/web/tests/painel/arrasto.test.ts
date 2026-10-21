import { describe, expect, it } from "vitest";
import type { AgendamentoComCliente } from "@barchop/types";
import { destinoDoArrasto } from "../../src/painel/arrasto";
import { gradeDeTempo, MINUTOS_POR_LINHA } from "../../src/painel/grade";

// Arrastar e reordenar, PR 7: pra onde vai o bloco solto na agenda. A
// regra é pura — a tela só mede quantas linhas e colunas o ponteiro
// andou. Encaixa de 15 em 15, troca de dia (semana) ou de profissional
// (dia da equipe), e marca como inválido o destino ocupado, fechado ou
// passado: a tela não deixa soltar ali, e a API decide no fim.

const AGORA = new Date(2026, 9, 21, 8, 0); // 21/10/2026, 08:00
const QUINTA = "2026-10-22";
const SEXTA = "2026-10-23";
const HORARIOS = [0, 1, 2, 3, 4, 5, 6].map((diaSemana) => ({
  diaSemana,
  horaAbertura: "09:00",
  horaFechamento: "18:00",
  fechado: false,
}));

function agendamento(
  id: string,
  data: string,
  horaInicio: string,
  horaFim: string,
  barbeiroId = "bb1"
): AgendamentoComCliente {
  return {
    id,
    data,
    horaInicio,
    horaFim,
    status: "confirmado",
    origem: "barbeiro",
    observacoes: null,
    presencaConfirmadaEm: null,
    barbeiro: { id: barbeiroId, nome: barbeiroId === "bb1" ? "Rafael" : "Ana" },
    servicos: [{ servicoId: "s1", nome: "Corte", precoNoMomento: "40.00", duracaoNoMomento: 30 }],
    cliente: { id: "c1", nome: "João", telefone: "11999990000", email: null, temConta: false },
  } as AgendamentoComCliente;
}

const linhas = (minutos: number) => minutos / MINUTOS_POR_LINHA;

function semana(agendamentos: AgendamentoComCliente[]) {
  return gradeDeTempo({ dias: [QUINTA, SEXTA], horarios: HORARIOS, agendamentos, agora: AGORA });
}

describe("destinoDoArrasto", () => {
  const corte = agendamento("a1", QUINTA, "10:00", "10:30");

  it("desce 1h15 na mesma coluna: 11:15 – 11:45", () => {
    const destino = destinoDoArrasto(semana([corte]), "a1", { linhas: linhas(75), colunas: 0 }, AGORA);

    expect(destino).toMatchObject({ data: QUINTA, horaInicio: "11:15", horaFim: "11:45", valido: true });
  });

  it("encaixa de 15 em 15: andar 20 minutos vira 15", () => {
    const destino = destinoDoArrasto(semana([corte]), "a1", { linhas: linhas(20), colunas: 0 }, AGORA);

    expect(destino?.horaInicio).toBe("10:15");
  });

  it("na semana, uma coluna pro lado é o dia seguinte", () => {
    const destino = destinoDoArrasto(semana([corte]), "a1", { linhas: 0, colunas: 1 }, AGORA);

    expect(destino).toMatchObject({ data: SEXTA, horaInicio: "10:00", valido: true });
  });

  it("no dia da equipe, uma coluna pro lado é o outro profissional", () => {
    const grade = gradeDeTempo({
      dias: [QUINTA],
      horarios: HORARIOS,
      agendamentos: [corte],
      agora: AGORA,
      profissionais: [
        { id: "bb1", nome: "Rafael" },
        { id: "m2", nome: "Ana" },
      ],
    });

    const destino = destinoDoArrasto(grade, "a1", { linhas: 0, colunas: 1 }, AGORA);

    expect(destino).toMatchObject({ data: QUINTA, barbeiroId: "m2", valido: true });
  });

  it("em cima de outro agendamento do mesmo profissional: inválido", () => {
    const outro = agendamento("a2", QUINTA, "11:00", "11:30");

    const destino = destinoDoArrasto(semana([corte, outro]), "a1", { linhas: linhas(60), colunas: 0 }, AGORA);

    expect(destino).toMatchObject({ horaInicio: "11:00", valido: false });
  });

  it("sobre o próprio lugar (10:00 → 10:15) é válido: ele sai de lá", () => {
    const destino = destinoDoArrasto(semana([corte]), "a1", { linhas: linhas(15), colunas: 0 }, AGORA);

    expect(destino).toMatchObject({ horaInicio: "10:15", valido: true });
  });

  it("fora da janela da agenda: inválido", () => {
    const destino = destinoDoArrasto(semana([corte]), "a1", { linhas: linhas(-90), colunas: 0 }, AGORA);

    expect(destino).toMatchObject({ horaInicio: "08:30", valido: false });
  });

  it("pra um horário que já passou: inválido", () => {
    const hoje = gradeDeTempo({
      dias: ["2026-10-21"],
      horarios: HORARIOS,
      agendamentos: [agendamento("a1", "2026-10-21", "10:00", "10:30")],
      agora: new Date(2026, 9, 21, 9, 30),
    });

    const destino = destinoDoArrasto(hoje, "a1", { linhas: linhas(-60), colunas: 0 }, new Date(2026, 9, 21, 9, 30));

    expect(destino).toMatchObject({ horaInicio: "09:00", valido: false });
  });

  it("solto no mesmo lugar (ou quase): nada a mudar", () => {
    expect(destinoDoArrasto(semana([corte]), "a1", { linhas: 1, colunas: 0 }, AGORA)).toBeNull();
  });
});
