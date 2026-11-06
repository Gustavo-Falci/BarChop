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
    expect(ics).toContain("UID:a1@barchop\r\n");
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

  // O link do horário (06/11): quem só adiciona à agenda também fica com
  // o link de confirmar ou cancelar, na descrição do evento.
  it("leva a descrição, quando há, e omite a linha quando não há", () => {
    const comLink = gerarIcs({ ...EVENTO, descricao: "Pra confirmar ou cancelar: https://x.com/a" }, AGORA);
    expect(comLink).toContain("DESCRIPTION:Pra confirmar ou cancelar: https://x.com/a\r\n");

    expect(gerarIcs(EVENTO, AGORA)).not.toContain("DESCRIPTION");
  });

  it("dobra linha comprida em 75 bytes, como o formato pede, sem perder nada", () => {
    // O token do link passa fácil de 75 caracteres; calendário estrito
    // recusa ou corta a linha longa.
    const link = `https://gr-barber.barchop.com.br/lembrete/${"a".repeat(160)}`;
    const ics = gerarIcs({ ...EVENTO, descricao: `Link: ${link}` }, AGORA);

    for (const linha of ics.split("\r\n")) {
      expect(new TextEncoder().encode(linha).length).toBeLessThanOrEqual(75);
    }
    // Desdobrar (CRLF + espaço some) devolve o texto inteiro.
    expect(ics.replace(/\r\n /g, "")).toContain(`DESCRIPTION:Link: ${link}\r\n`);
  });

  it("não dobra no meio de um caractere acentuado", () => {
    const ics = gerarIcs({ ...EVENTO, descricao: "é".repeat(80) }, AGORA);

    expect(ics.replace(/\r\n /g, "")).toContain(`DESCRIPTION:${"é".repeat(80)}\r\n`);
    for (const linha of ics.split("\r\n")) {
      expect(new TextEncoder().encode(linha).length).toBeLessThanOrEqual(75);
    }
  });
});
