import { describe, expect, it } from "vitest";
import { calcularHorariosDisponiveis } from "../src/index";

const ABERTO = {
  horaAbertura: "09:00",
  horaFechamento: "18:00",
  fechado: false,
};

describe("calcularHorariosDisponiveis", () => {
  it("devolve lista vazia quando o dia está fechado", () => {
    expect(
      calcularHorariosDisponiveis({
        horarioFuncionamento: { horaAbertura: null, horaFechamento: null, fechado: true },
        agendamentosExistentes: [],
        duracaoTotalMinutos: 45,
      })
    ).toEqual([]);
  });

  it("devolve lista vazia quando falta hora de abertura", () => {
    expect(
      calcularHorariosDisponiveis({
        horarioFuncionamento: { horaAbertura: null, horaFechamento: "18:00", fechado: false },
        agendamentosExistentes: [],
        duracaoTotalMinutos: 45,
      })
    ).toEqual([]);
  });

  it("preenche o expediente inteiro quando não há agendamento", () => {
    const horarios = calcularHorariosDisponiveis({
      horarioFuncionamento: ABERTO,
      agendamentosExistentes: [],
      duracaoTotalMinutos: 45,
    });

    expect(horarios[0]).toBe("09:00");
    // 18:00 menos 45min de duração: o último início possível é 17:15
    expect(horarios.at(-1)).toBe("17:15");
  });

  it("pula o intervalo ocupado e retoma no fim dele", () => {
    const horarios = calcularHorariosDisponiveis({
      horarioFuncionamento: ABERTO,
      agendamentosExistentes: [{ horaInicio: "10:00", horaFim: "10:45" }],
      duracaoTotalMinutos: 45,
    });

    // 09:00 e 09:15 cabem antes das 10:00; 09:30 não (terminaria 10:15).
    expect(horarios.slice(0, 3)).toEqual(["09:00", "09:15", "10:45"]);
    expect(horarios).not.toContain("09:30");
  });

  it("descarta gap curto demais pra duração pedida", () => {
    const horarios = calcularHorariosDisponiveis({
      horarioFuncionamento: ABERTO,
      agendamentosExistentes: [
        { horaInicio: "09:00", horaFim: "10:00" },
        { horaInicio: "10:30", horaFim: "11:00" },
      ],
      duracaoTotalMinutos: 45,
    });

    // O gap 10:00–10:30 tem 30min e não comporta 45min.
    expect(horarios).not.toContain("10:00");
    expect(horarios[0]).toBe("11:00");
  });

  it("alinha os candidatos ao grid, não ao fim do agendamento anterior", () => {
    const horarios = calcularHorariosDisponiveis({
      horarioFuncionamento: ABERTO,
      agendamentosExistentes: [{ horaInicio: "09:00", horaFim: "09:07" }],
      duracaoTotalMinutos: 30,
    });

    // Sem alinhamento sairia "09:07". O grid de 15min a partir da
    // meia-noite manda sugerir 09:15.
    expect(horarios[0]).toBe("09:15");
  });

  it("respeita intervaloMinutos customizado", () => {
    const horarios = calcularHorariosDisponiveis({
      horarioFuncionamento: ABERTO,
      agendamentosExistentes: [],
      duracaoTotalMinutos: 30,
      intervaloMinutos: 30,
    });

    expect(horarios.slice(0, 3)).toEqual(["09:00", "09:30", "10:00"]);
  });

  it("devolve lista vazia quando a duração não cabe no expediente", () => {
    expect(
      calcularHorariosDisponiveis({
        horarioFuncionamento: { horaAbertura: "09:00", horaFechamento: "09:30", fechado: false },
        agendamentosExistentes: [],
        duracaoTotalMinutos: 45,
      })
    ).toEqual([]);
  });

  it("trata o fim do agendamento como exclusivo, igual à constraint do banco", () => {
    const horarios = calcularHorariosDisponiveis({
      horarioFuncionamento: ABERTO,
      agendamentosExistentes: [{ horaInicio: "10:00", horaFim: "10:45" }],
      duracaoTotalMinutos: 45,
    });

    // A EXCLUDE constraint usa tsrange '[)', então 10:45 encosta mas
    // não colide. As duas regras têm que concordar.
    expect(horarios).toContain("10:45");
  });
});

// "Serviço cabe antes de fechar" (painel v2, marco 3): desligado, o
// atendimento pode COMEÇAR antes de fechar e terminar depois. Só a ponta
// do fechamento muda — agendamento, pausa e bloqueio seguem inteiros.
describe("cabeAntesDeFechar", () => {
  it("ligado (o padrão) termina até o fechamento, como sempre", () => {
    const horarios = calcularHorariosDisponiveis({
      horarioFuncionamento: ABERTO,
      agendamentosExistentes: [],
      duracaoTotalMinutos: 45,
      cabeAntesDeFechar: true,
    });

    expect(horarios[horarios.length - 1]).toBe("17:15");
  });

  it("desligado, começa até o último horário da grade antes de fechar", () => {
    const horarios = calcularHorariosDisponiveis({
      horarioFuncionamento: ABERTO,
      agendamentosExistentes: [],
      duracaoTotalMinutos: 45,
      cabeAntesDeFechar: false,
    });

    expect(horarios.slice(-4)).toEqual(["17:00", "17:15", "17:30", "17:45"]);
  });

  it("desligado, segue respeitando o que está ocupado no meio do dia", () => {
    const horarios = calcularHorariosDisponiveis({
      horarioFuncionamento: ABERTO,
      agendamentosExistentes: [{ horaInicio: "10:00", horaFim: "11:00" }],
      duracaoTotalMinutos: 45,
      cabeAntesDeFechar: false,
    });

    // 09:30 + 45 = 10:15, invade o agendamento das 10:00.
    expect(horarios).not.toContain("09:30");
    expect(horarios).toContain("09:15");
  });

  it("desligado, não estica pra cima de um ocupado depois do fechamento", () => {
    const horarios = calcularHorariosDisponiveis({
      horarioFuncionamento: ABERTO,
      agendamentosExistentes: [{ horaInicio: "18:15", horaFim: "19:00" }],
      duracaoTotalMinutos: 45,
      cabeAntesDeFechar: false,
    });

    // 17:30 + 45 = 18:15, encosta; 17:45 invadiria.
    expect(horarios[horarios.length - 1]).toBe("17:30");
  });

  it("desligado, nunca passa da meia-noite", () => {
    const horarios = calcularHorariosDisponiveis({
      horarioFuncionamento: { horaAbertura: "22:00", horaFechamento: "23:59", fechado: false },
      agendamentosExistentes: [],
      duracaoTotalMinutos: 30,
      cabeAntesDeFechar: false,
    });

    // 23:30 + 30 = 24:00 viraria o dia; o agendamento não atravessa.
    expect(horarios[horarios.length - 1]).toBe("23:15");
  });

  it("desligado, respeita a grade escolhida", () => {
    const horarios = calcularHorariosDisponiveis({
      horarioFuncionamento: ABERTO,
      agendamentosExistentes: [],
      duracaoTotalMinutos: 45,
      intervaloMinutos: 30,
      cabeAntesDeFechar: false,
    });

    expect(horarios.slice(-2)).toEqual(["17:00", "17:30"]);
  });
});

// "Oferecer logo depois do anterior" (pedido do barbeiro, 08/11): além da
// grade, o minuto em que um atendimento termina. Fim de pausa ou de
// bloqueio não conta: ali o vão já é do profissional.
describe("logo depois do anterior", () => {
  const atendimento = (horaInicio: string, horaFim: string) => ({ horaInicio, horaFim, atendimento: true });

  it("desligado (o padrão), segue só a grade", () => {
    const horarios = calcularHorariosDisponiveis({
      horarioFuncionamento: ABERTO,
      agendamentosExistentes: [atendimento("09:00", "09:40")],
      duracaoTotalMinutos: 30,
    });

    expect(horarios[0]).toBe("09:45");
  });

  it("ligado, oferece o fim do atendimento antes da grade", () => {
    const horarios = calcularHorariosDisponiveis({
      horarioFuncionamento: ABERTO,
      agendamentosExistentes: [atendimento("09:00", "09:40")],
      duracaoTotalMinutos: 30,
      logoDepoisDoAnterior: true,
    });

    expect(horarios.slice(0, 3)).toEqual(["09:40", "09:45", "10:00"]);
  });

  it("fim que já cai na grade não aparece duas vezes", () => {
    const horarios = calcularHorariosDisponiveis({
      horarioFuncionamento: ABERTO,
      agendamentosExistentes: [atendimento("09:00", "09:30")],
      duracaoTotalMinutos: 30,
      logoDepoisDoAnterior: true,
    });

    expect(horarios.filter((h) => h === "09:30")).toHaveLength(1);
  });

  it("só oferece se a duração cabe no vão", () => {
    const horarios = calcularHorariosDisponiveis({
      horarioFuncionamento: ABERTO,
      agendamentosExistentes: [atendimento("09:00", "09:40"), atendimento("10:00", "11:00")],
      duracaoTotalMinutos: 30,
      logoDepoisDoAnterior: true,
    });

    // 09:40 + 30 = 10:10, invade o das 10:00.
    expect(horarios).not.toContain("09:40");
    expect(horarios[0]).toBe("11:00");
  });

  it("fim de pausa ou bloqueio não conta", () => {
    const horarios = calcularHorariosDisponiveis({
      horarioFuncionamento: ABERTO,
      agendamentosExistentes: [{ horaInicio: "12:00", horaFim: "12:40" }],
      duracaoTotalMinutos: 30,
      logoDepoisDoAnterior: true,
    });

    expect(horarios).not.toContain("12:40");
    expect(horarios).toContain("12:45");
  });

  it("o vão é de quem terminou por último: bloqueio depois do atendimento não conta", () => {
    const horarios = calcularHorariosDisponiveis({
      horarioFuncionamento: ABERTO,
      agendamentosExistentes: [atendimento("13:00", "13:40"), { horaInicio: "13:00", horaFim: "14:10" }],
      duracaoTotalMinutos: 30,
      logoDepoisDoAnterior: true,
    });

    expect(horarios).not.toContain("13:40");
    expect(horarios).not.toContain("14:10");
    expect(horarios).toContain("14:15");
  });

  it("pausa e atendimento terminando no mesmo minuto: conta como atendimento", () => {
    const horarios = calcularHorariosDisponiveis({
      horarioFuncionamento: ABERTO,
      agendamentosExistentes: [{ horaInicio: "12:00", horaFim: "12:50" }, atendimento("12:20", "12:50")],
      duracaoTotalMinutos: 30,
      logoDepoisDoAnterior: true,
    });

    expect(horarios).toContain("12:50");
  });

  it("com o serviço podendo passar do fechamento, oferece o fim do último antes de fechar", () => {
    const horarios = calcularHorariosDisponiveis({
      horarioFuncionamento: ABERTO,
      agendamentosExistentes: [atendimento("17:00", "17:50")],
      duracaoTotalMinutos: 30,
      cabeAntesDeFechar: false,
      logoDepoisDoAnterior: true,
    });

    expect(horarios.slice(-1)).toEqual(["17:50"]);
  });

  it("a lista continua em ordem do relógio", () => {
    const horarios = calcularHorariosDisponiveis({
      horarioFuncionamento: ABERTO,
      agendamentosExistentes: [atendimento("09:00", "09:40"), atendimento("11:00", "11:20")],
      duracaoTotalMinutos: 15,
      logoDepoisDoAnterior: true,
    });

    expect(horarios).toEqual([...horarios].sort());
    expect(horarios).toContain("11:20");
  });
});
