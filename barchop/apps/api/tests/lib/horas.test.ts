import { describe, expect, it } from "vitest";
import {
  agoraNaBarbearia,
  dataParaDate,
  dateParaData,
  dateParaHora,
  horaParaDate,
  somarMinutos,
} from "../../src/lib/horas";

describe("horaParaDate", () => {
  it("constrói em UTC, independente do fuso da máquina", () => {
    // Esta é a asserção que pega o bug de fuso: toISOString sempre
    // imprime em UTC, então se a data tivesse sido montada em horário
    // local isso daria 12:00 numa máquina em America/Sao_Paulo.
    expect(horaParaDate("09:00").toISOString()).toBe("1970-01-01T09:00:00.000Z");
  });

  it("aceita a meia-noite e o último minuto do dia", () => {
    expect(horaParaDate("00:00").toISOString()).toBe("1970-01-01T00:00:00.000Z");
    expect(horaParaDate("23:59").toISOString()).toBe("1970-01-01T23:59:00.000Z");
  });

  it("rejeita formato inválido", () => {
    expect(() => horaParaDate("9:00")).toThrow(RangeError);
    expect(() => horaParaDate("24:00")).toThrow(RangeError);
    expect(() => horaParaDate("09:60")).toThrow(RangeError);
    expect(() => horaParaDate("nove")).toThrow(RangeError);
  });
});

describe("dateParaHora", () => {
  it("faz o caminho de volta", () => {
    expect(dateParaHora(horaParaDate("14:30"))).toBe("14:30");
  });

  it("preenche com zero à esquerda", () => {
    expect(dateParaHora(horaParaDate("07:05"))).toBe("07:05");
  });

  it("recusa Date inválida em vez de devolver NaN:NaN", () => {
    // Sem a guarda, o retorno seria a string "NaN:NaN", que seguiria
    // pro contrato HTTP ou pro banco sem ninguém reclamar.
    expect(() => dateParaHora(new Date("nada disso"))).toThrow(RangeError);
  });
});

describe("dataParaDate", () => {
  it("constrói em UTC", () => {
    expect(dataParaDate("2026-09-01").toISOString()).toBe("2026-09-01T00:00:00.000Z");
  });

  it("faz o caminho de volta", () => {
    expect(dateParaData(dataParaDate("2026-12-31"))).toBe("2026-12-31");
  });

  it("recusa Date inválida em vez de devolver NaN-NaN-NaN", () => {
    expect(() => dateParaData(new Date("nada disso"))).toThrow(RangeError);
  });

  it("rejeita data que não existe no calendário", () => {
    // Date.UTC normalizaria 2026-02-31 pra 2026-03-03 em silêncio.
    expect(() => dataParaDate("2026-02-31")).toThrow(RangeError);
    expect(() => dataParaDate("2026-13-01")).toThrow(RangeError);
    expect(() => dataParaDate("01/09/2026")).toThrow(RangeError);
  });
});

describe("somarMinutos", () => {
  it("soma dentro da mesma hora", () => {
    expect(somarMinutos("10:00", 45)).toBe("10:45");
  });

  it("vira a hora", () => {
    expect(somarMinutos("10:30", 45)).toBe("11:15");
  });

  it("rejeita soma que passa da meia-noite", () => {
    // A coluna `periodo` é tsrange((data + hora_inicio), (data + hora_fim)).
    // Se hora_fim virasse o dia, o range ficaria invertido e o Postgres
    // recusaria a linha com um erro bem menos claro que este.
    expect(() => somarMinutos("23:30", 45)).toThrow(RangeError);
  });

  it("rejeita soma que cai antes da meia-noite", () => {
    // Não há CHECK em servico.duracao_minutos: uma duração negativa
    // lida do banco chegaria aqui e sairia como "-1:-5", corrompendo
    // hora_fim e a coluna `periodo` junto.
    expect(() => somarMinutos("00:00", -5)).toThrow(RangeError);
    expect(() => somarMinutos("10:00", -601)).toThrow(RangeError);
  });

  it("aceita minutos negativos que ainda caem dentro do dia", () => {
    expect(somarMinutos("10:00", -30)).toBe("09:30");
    expect(somarMinutos("00:30", -30)).toBe("00:00");
  });
});

describe("agoraNaBarbearia", () => {
  it("devolve data e hora no formato do contrato", () => {
    const agora = agoraNaBarbearia();

    expect(agora.data).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(agora.hora).toMatch(/^([01]\d|2[0-3]):[0-5]\d$/);
  });

  it("lê o fuso da barbearia, não o da máquina", () => {
    // 2026-09-04T02:30:00Z é 23:30 do dia 3 em São Paulo (UTC-3). Se a
    // função usasse UTC ou o fuso do processo, a data sairia como dia 4.
    // O instante entra por parâmetro justamente pra este caso não
    // precisar de fake timers — ver o comentário na implementação.
    const instante = new Date("2026-09-04T02:30:00Z");

    expect(agoraNaBarbearia(instante)).toEqual({
      data: "2026-09-03",
      hora: "23:30",
    });
  });
});
