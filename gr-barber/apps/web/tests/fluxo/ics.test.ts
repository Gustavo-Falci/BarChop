import { describe, expect, it } from "vitest";
import { gerarIcs } from "../../src/fluxo/ics";

const EVENTO = {
  uid: "a1",
  titulo: "Corte e barba · Barbearia do Gu",
  data: "2026-09-29",
  horaInicio: "10:00",
  horaFim: "11:00",
  local: "Rua das Tesouras, 123",
};
const AGORA = new Date("2026-09-28T22:00:00Z");

describe("arquivo de calendário", () => {
  it("marca início e fim na hora local, sem fuso", () => {
    // Sem fuso de propósito ("hora flutuante"): o agendamento é às 10
    // no relógio da barbearia, e o calendário do celular mostra 10 no
    // relógio de quem está lá. Com Z viraria 7 da manhã em São Paulo.
    const ics = gerarIcs(EVENTO, AGORA);

    expect(ics).toContain("DTSTART:20260929T100000\r\n");
    expect(ics).toContain("DTEND:20260929T110000\r\n");
    expect(ics).toContain("SUMMARY:Corte e barba · Barbearia do Gu\r\n");
  });

  it("tem o que os calendários exigem pra aceitar o arquivo", () => {
    const ics = gerarIcs(EVENTO, AGORA);

    expect(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n")).toBe(true);
    expect(ics).toContain("PRODID:");
    expect(ics).toContain("UID:a1@gr-barber\r\n");
    expect(ics).toContain("DTSTAMP:20260928T220000Z\r\n");
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });

  it("escapa vírgula, ponto e vírgula e quebra de linha do texto", () => {
    // O endereço vem do cadastro do barbeiro; uma vírgula crua é
    // separador de lista no formato, e o calendário cortaria o endereço.
    const ics = gerarIcs({ ...EVENTO, local: "Rua A, 10; fundos\nsala 2" }, AGORA);

    expect(ics).toContain("LOCATION:Rua A\\, 10\\; fundos\\nsala 2\r\n");
  });

  it("sem endereço, não põe LOCATION vazio", () => {
    const ics = gerarIcs({ ...EVENTO, local: null }, AGORA);

    expect(ics).not.toContain("LOCATION");
  });
});
