import { describe, expect, it } from "vitest";
import { statusDoTopo } from "../../src/site/statusDoTopo";

// O status do topo (status.js do protótipo): a barbearia de exemplo abre
// de segunda a sexta das 9 às 20 e sábado das 9 às 18, horários de 20 em
// 20 minutos com 20 de folga, na hora de Brasília (UTC−3).
// 16/11/2026 é segunda; 21/11/2026, sábado; 22/11/2026, domingo.
const em = (iso: string) => new Date(`${iso}-03:00`);

describe("status do topo", () => {
  it("aberta: o próximo horário de 20 em 20, com 20 de folga", () => {
    expect(statusDoTopo(em("2026-11-16T14:20"))).toEqual({ aberto: true, texto: "próximo horário livre 14:40" });
    expect(statusDoTopo(em("2026-11-16T14:21"))).toEqual({ aberto: true, texto: "próximo horário livre 15:00" });
  });

  it("antes de abrir, diz quando abre hoje", () => {
    expect(statusDoTopo(em("2026-11-16T08:00"))).toEqual({ aberto: false, texto: "abre hoje às 9:00" });
  });

  it("perto de fechar, diz quando abre amanhã", () => {
    expect(statusDoTopo(em("2026-11-16T19:45"))).toEqual({ aberto: false, texto: "abre amanhã às 9:00" });
  });

  it("sábado à noite pula o domingo fechado", () => {
    expect(statusDoTopo(em("2026-11-21T17:50"))).toEqual({ aberto: false, texto: "abre na segunda às 9:00" });
  });

  it("domingo, abre amanhã", () => {
    expect(statusDoTopo(em("2026-11-22T10:00"))).toEqual({ aberto: false, texto: "abre amanhã às 9:00" });
  });

  it("usa a hora de Brasília, qualquer que seja o fuso de quem visita", () => {
    // 17:20 em UTC = 14:20 em Brasília.
    expect(statusDoTopo(new Date("2026-11-16T17:20:00Z")).texto).toBe("próximo horário livre 14:40");
  });
});
