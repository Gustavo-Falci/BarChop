// O arquivo .ics do "Adicionar à agenda". Montado no aparelho, sem rota
// na API: é o próprio agendamento que acabou de voltar dela, e um
// arquivo de texto de dez linhas não justifica uma ida ao servidor.

export interface EventoDoCalendario {
  uid: string;
  titulo: string;
  data: string; // "YYYY-MM-DD"
  horaInicio: string; // "HH:mm"
  horaFim: string;
  local: string | null;
}

// O formato exige vírgula, ponto e vírgula, barra e quebra de linha
// escapados no texto — vírgula crua é separador de lista, e o
// calendário cortaria o endereço nela.
function escapar(texto: string): string {
  return texto
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

// Sem fuso de propósito ("hora flutuante" no formato): o agendamento é
// às 10 no relógio da barbearia, e o calendário mostra 10 no relógio de
// quem está lá. Com Z (UTC) viraria 7 da manhã em São Paulo.
function horaLocal(data: string, hora: string): string {
  return `${data.replace(/-/g, "")}T${hora.replace(":", "")}00`;
}

// O DTSTAMP, ao contrário, é um instante — esse vai em UTC, como o
// formato pede.
function instanteUtc(agora: Date): string {
  return agora.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

export function gerarIcs(evento: EventoDoCalendario, agora: Date = new Date()): string {
  const linhas = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//GR Barber//Agendamento//PT-BR",
    "BEGIN:VEVENT",
    `UID:${evento.uid}@gr-barber`,
    `DTSTAMP:${instanteUtc(agora)}`,
    `DTSTART:${horaLocal(evento.data, evento.horaInicio)}`,
    `DTEND:${horaLocal(evento.data, evento.horaFim)}`,
    `SUMMARY:${escapar(evento.titulo)}`,
    ...(evento.local ? [`LOCATION:${escapar(evento.local)}`] : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  // CRLF, e não \n: é a quebra de linha que o formato (RFC 5545) define.
  return linhas.map((linha) => `${linha}\r\n`).join("");
}
