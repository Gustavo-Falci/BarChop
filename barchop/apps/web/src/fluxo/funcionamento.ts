import type { HorarioSerializado } from "@barchop/types";

// Na ordem do getDay (0 = domingo), que é como `diaSemana` vem da API.
const NOMES = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

// A semana na ordem em que se fala dela no Brasil — "segunda a sábado",
// com o domingo por último —, e não na do getDay, que começaria a lista
// por um dia normalmente fechado.
const ORDEM = [1, 2, 3, 4, 5, 6, 0];

export interface LinhaDaSemana {
  dias: string;
  horario: string;
  hoje: boolean;
}

function faixa(dia: HorarioSerializado | undefined): string {
  // Dia que a API nem mandou é dia sem horário cadastrado: fechado.
  if (!dia || dia.fechado || !dia.horaAbertura || !dia.horaFechamento) {
    return "Fechado";
  }
  return `${dia.horaAbertura} às ${dia.horaFechamento}`;
}

function maiuscula(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

// Dias seguidos com o mesmo horário numa linha só. Visto no app: seis
// linhas iguais de "09:00 às 18:00" e o domingo sumido — quem queria
// saber se abre domingo ficava sem resposta, e o resto era repetição.
// O dia fechado aparece dizendo "Fechado": é informação, ao contrário
// de um "Domingo —" sem horário.
export function agruparSemana(
  horarios: HorarioSerializado[],
  agora: Date
): LinhaDaSemana[] {
  const porDia = new Map(horarios.map((dia) => [dia.diaSemana, dia]));
  const hoje = agora.getDay();

  const grupos: { dias: number[]; horario: string }[] = [];
  for (const diaSemana of ORDEM) {
    const horario = faixa(porDia.get(diaSemana));
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.horario === horario) ultimo.dias.push(diaSemana);
    else grupos.push({ dias: [diaSemana], horario });
  }

  return grupos.map(({ dias, horario }) => {
    const primeiro = NOMES[dias[0]];
    const ultimo = NOMES[dias[dias.length - 1]];
    const nome =
      dias.length === 1
        ? primeiro
        : dias.length === 2
          ? `${primeiro} e ${ultimo}`
          : `${primeiro} a ${ultimo}`;
    return { dias: maiuscula(nome), horario, hoje: dias.includes(hoje) };
  });
}

// "Aberto agora · fecha às 18:00", ou quando abre de novo. É a
// pergunta de quem abre o link: dá pra ir agora? O relógio é o do
// aparelho, como no resto do fluxo (limitação registrada na spec).
export function situacaoAgora(
  horarios: HorarioSerializado[],
  agora: Date
): string | null {
  const porDia = new Map(horarios.map((dia) => [dia.diaSemana, dia]));
  const hora = `${String(agora.getHours()).padStart(2, "0")}:${String(
    agora.getMinutes()
  ).padStart(2, "0")}`;

  const hoje = porDia.get(agora.getDay());
  if (hoje && !hoje.fechado && hoje.horaAbertura && hoje.horaFechamento) {
    if (hora >= hoje.horaAbertura && hora < hoje.horaFechamento) {
      return `Aberto agora · fecha às ${hoje.horaFechamento}`;
    }
    if (hora < hoje.horaAbertura) {
      return `Fechado agora · abre hoje às ${hoje.horaAbertura}`;
    }
  }

  for (let adiante = 1; adiante <= 7; adiante += 1) {
    const diaSemana = (agora.getDay() + adiante) % 7;
    const dia = porDia.get(diaSemana);
    if (dia && !dia.fechado && dia.horaAbertura) {
      const quando = adiante === 1 ? "amanhã" : NOMES[diaSemana];
      return `Fechado agora · abre ${quando} às ${dia.horaAbertura}`;
    }
  }

  // Nenhum dia aberto: barbearia sem horário cadastrado. Melhor não
  // dizer nada do que anunciar "fechado" pra sempre.
  return null;
}
