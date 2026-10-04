// Toda data trafega como "YYYY-MM-DD" e toda hora como "HH:mm", que é
// como a API fala. As duas comparam bem como string — zero à esquerda
// põe a ordem lexicográfica na mesma ordem do calendário e do relógio.

const FORMATADOR_LONGO = new Intl.DateTimeFormat("pt-BR", {
  day: "numeric",
  month: "long",
  // UTC, e não o fuso do aparelho: `new Date("2026-09-09")` é
  // meia-noite UTC, e em São Paulo isso ainda é dia 8.
  timeZone: "UTC",
});

export function formatarDataLonga(data: string): string {
  return FORMATADOR_LONGO.format(new Date(`${data}T00:00:00Z`));
}

// O Intl diz "terça-feira", e numa linha de resumo o "-feira" é peso
// sem informação — daí a tabela própria, na ordem do getUTCDay.
const DIAS_DA_SEMANA = [
  "domingo",
  "segunda",
  "terça",
  "quarta",
  "quinta",
  "sexta",
  "sábado",
];

// "terça, 29 de setembro". Separada da formatarDataLonga, e não uma
// opção dela: aquela é o nome acessível dos dias do Calendario e das
// grades do painel, e mudá-la mudaria o que o leitor de tela anuncia em
// todas. Esta é pra quem está conferindo a escolha, onde "29 de
// setembro" sozinho obriga a pessoa a contar no calendário que dia é.
export function formatarDataComSemana(data: string): string {
  const dia = DIAS_DA_SEMANA[new Date(`${data}T00:00:00Z`).getUTCDay()];
  return `${dia}, ${formatarDataLonga(data)}`;
}

// O instante entra por parâmetro, com `new Date()` como padrão — mesma
// forma do agoraNaBarbearia da API, e o que permite testar sem fake
// timers. O relógio é o do aparelho do cliente, não o da barbearia:
// limitação registrada na spec.
export function hojeIso(agora: Date = new Date()): string {
  const mes = String(agora.getMonth() + 1).padStart(2, "0");
  const dia = String(agora.getDate()).padStart(2, "0");
  return `${agora.getFullYear()}-${mes}-${dia}`;
}

export function ehPassado(data: string, agora: Date = new Date()): boolean {
  return data < hojeIso(agora);
}

// Hora só "já passou" no dia de hoje: amanhã às 9 continua valendo por
// mais tarde que seja agora.
export function horaJaPassou(
  data: string,
  hora: string,
  agora: Date = new Date()
): boolean {
  if (data !== hojeIso(agora)) return false;
  const atual = `${String(agora.getHours()).padStart(2, "0")}:${String(
    agora.getMinutes()
  ).padStart(2, "0")}`;
  return hora <= atual;
}

// Em UTC pelo mesmo motivo da formatarDataLonga: a data é um dia do
// calendário, não um instante, e somar no fuso local pularia ou
// repetiria um dia na virada do horário de verão.
export function somarDias(data: string, dias: number): string {
  const referencia = new Date(`${data}T00:00:00Z`);
  referencia.setUTCDate(referencia.getUTCDate() + dias);
  return referencia.toISOString().slice(0, 10);
}

// A grade do calendário começa no domingo, como no design system. Os
// `null` são as casas vazias antes do dia 1.
export function diasDoMes(mes: string): (string | null)[] {
  const [ano, numero] = mes.split("-").map(Number);
  const primeiro = new Date(Date.UTC(ano, numero - 1, 1));
  const ultimo = new Date(Date.UTC(ano, numero, 0)).getUTCDate();

  const vazios: null[] = Array(primeiro.getUTCDay()).fill(null);
  const dias = Array.from({ length: ultimo }, (_, indice) => {
    const dia = String(indice + 1).padStart(2, "0");
    return `${mes}-${dia}`;
  });

  return [...vazios, ...dias];
}

const DIA_CURTO = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

// O rótulo de um próximo horário na página da barbearia: curto, porque
// são três por serviço lado a lado. "hoje 11:00", "amanhã 09:00",
// "sex 02/10 14:30". Hoje e amanhã pelo relógio do aparelho, como o
// resto do fluxo (limitação registrada na spec).
export function rotuloDoProximoHorario(data: string, hora: string, agora: Date = new Date()): string {
  const hoje = hojeIso(agora);
  if (data === hoje) return `hoje ${hora}`;
  if (data === somarDias(hoje, 1)) return `amanhã ${hora}`;
  const dia = new Date(`${data}T00:00:00Z`);
  return `${DIA_CURTO[dia.getUTCDay()]} ${data.slice(8, 10)}/${data.slice(5, 7)} ${hora}`;
}
