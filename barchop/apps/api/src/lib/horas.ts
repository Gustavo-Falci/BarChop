// O Prisma mapeia colunas @db.Time e @db.Date pra Date do JS e grava a
// porção UTC dela. Construir a Date a partir de string local ("09:00"
// numa máquina em America/Sao_Paulo) gravaria 12:00 no banco, sem erro
// nenhum, e corromperia junto a coluna `periodo` — de onde sai a trava
// de conflito de horário. Por isso todo Date que chega no banco nasce
// aqui, sempre com Date.UTC.

const PADRAO_HORA = /^([01]\d|2[0-3]):([0-5]\d)$/;
const PADRAO_DATA = /^(\d{4})-(\d{2})-(\d{2})$/;

export function horaParaDate(hora: string): Date {
  const partes = PADRAO_HORA.exec(hora);
  if (!partes) throw new RangeError(`hora inválida: ${hora}`);
  return new Date(Date.UTC(1970, 0, 1, Number(partes[1]), Number(partes[2])));
}

export function dateParaHora(d: Date): string {
  // Uma Date inválida devolveria "NaN:NaN" sem reclamar, e essa string
  // seguiria pro contrato HTTP ou de volta pro banco. Este módulo existe
  // justamente pra não deixar horário malformado passar em silêncio.
  if (Number.isNaN(d.getTime())) throw new RangeError("Date inválida");

  const h = String(d.getUTCHours()).padStart(2, "0");
  const m = String(d.getUTCMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

export function dataParaDate(data: string): Date {
  const partes = PADRAO_DATA.exec(data);
  if (!partes) throw new RangeError(`data inválida: ${data}`);

  const d = new Date(
    Date.UTC(Number(partes[1]), Number(partes[2]) - 1, Number(partes[3]))
  );

  // Date.UTC normaliza 2026-02-31 pra 2026-03-03 em silêncio. O caminho
  // de volta não bater é o que denuncia a data inexistente.
  if (dateParaData(d) !== data) throw new RangeError(`data inválida: ${data}`);
  return d;
}

export function dateParaData(d: Date): string {
  // Mesma armadilha do dateParaHora: sem esta linha o retorno seria
  // "NaN-NaN-NaN".
  if (Number.isNaN(d.getTime())) throw new RangeError("Date inválida");

  const ano = String(d.getUTCFullYear()).padStart(4, "0");
  const mes = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dia = String(d.getUTCDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

export function somarMinutos(hora: string, minutos: number): string {
  const base = horaParaDate(hora);
  const total = base.getUTCHours() * 60 + base.getUTCMinutes() + minutos;

  // Um agendamento que vira o dia inverteria o tsrange da coluna
  // `periodo`. Melhor recusar aqui, com mensagem clara.
  if (total >= 24 * 60) {
    throw new RangeError(`soma passa da meia-noite: ${hora} + ${minutos}min`);
  }

  // O outro lado do mesmo limite. Não há CHECK em servico.duracao_minutos
  // na migration inicial, então uma duração negativa lida do banco
  // chegaria aqui e sairia como "-1:-5" — hora_fim corrompida e, com
  // ela, a coluna `periodo` de onde vem a trava de conflito.
  if (total < 0) {
    throw new RangeError(`soma cai antes da meia-noite: ${hora} + ${minutos}min`);
  }

  const h = String(Math.floor(total / 60)).padStart(2, "0");
  const m = String(total % 60).padStart(2, "0");
  return `${h}:${m}`;
}

// A barbearia do MVP fica em São Paulo, e barbearias em fusos
// diferentes estão fora de escopo. As colunas do agendamento não têm
// fuso (`@db.Date` e `@db.Time`), então "já passou" só faz sentido
// contra um fuso escolhido — e escolher é melhor que herdar o da
// máquina onde a API estiver rodando.
export const FUSO_DA_BARBEARIA = "America/Sao_Paulo";

// Devolve o instante já nos formatos do contrato HTTP, para poder
// comparar com string: "YYYY-MM-DD" e "HH:mm" ordenam
// lexicograficamente na mesma ordem que cronologicamente.
//
// O instante entra por parâmetro, com `new Date()` como padrão, e é o
// que torna a conversão de fuso testável sem fake timers: a suíte roda
// contra um Postgres real, e mockar o relógio do processo mexeria nos
// timeouts do pool de conexão junto.
export function agoraNaBarbearia(instante: Date = new Date()): {
  data: string;
  hora: string;
} {
  // Locale "sv-SE" porque o sueco formata data e hora em ISO
  // ("2026-09-04 23:30"), o que evita montar a string peça por peça a
  // partir de formatToParts.
  const formatado = new Intl.DateTimeFormat("sv-SE", {
    timeZone: FUSO_DA_BARBEARIA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(instante);

  const [data, hora] = formatado.split(" ");
  return { data, hora };
}
