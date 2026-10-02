import { describe, expect, it } from "vitest";
import { rotuloDoStatus } from "../../src/formato/status";

describe("rótulo do status de agendamento", () => {
  it("traduz concluido e no_show, que destoariam crus numa tela em português", () => {
    expect(rotuloDoStatus("concluido")).toBe("concluído");
    expect(rotuloDoStatus("no_show")).toBe("não compareceu");
  });

  it("os três que já são palavra em português passam como estão", () => {
    expect(rotuloDoStatus("pendente")).toBe("pendente");
    expect(rotuloDoStatus("confirmado")).toBe("confirmado");
    expect(rotuloDoStatus("cancelado")).toBe("cancelado");
  });

  it("um status que a tela ainda não conhece cai no próprio valor cru, em vez de quebrar", () => {
    expect(rotuloDoStatus("estornado")).toBe("estornado");
  });
});
