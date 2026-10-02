// Datas de teste relativas a hoje. Uma data fixa ("2026-09-10") começa
// a falhar sozinha quando passa — e as rotas que criam ou movem um
// agendamento recusam o passado (garantirFuturo). Fixar o relógio com
// vi.setSystemTime não serve aqui: mexeria nos timeouts do pool do
// Postgres que estas suítes usam de verdade.
//
// `minimoDeDias` à frente evita a virada de dia entre UTC e o fuso da
// barbearia: com uma semana de folga, "hoje" num e noutro nunca decide
// o resultado.
export function proximoDiaDaSemana(diaSemana: number, minimoDeDias = 7): string {
  const dia = new Date();
  dia.setUTCHours(12, 0, 0, 0);
  dia.setUTCDate(dia.getUTCDate() + minimoDeDias);
  while (dia.getUTCDay() !== diaSemana) {
    dia.setUTCDate(dia.getUTCDate() + 1);
  }
  return dia.toISOString().slice(0, 10);
}

// Uma quinta e um domingo futuros: os cenários abrem de segunda a
// sábado, então a quinta tem agenda e o domingo é dia fechado.
export const QUINTA = proximoDiaDaSemana(4);
export const DOMINGO = proximoDiaDaSemana(0);

// Uma quinta já passada, pras rotas que precisam recusar o passado.
export function quintaPassada(): string {
  const dia = new Date();
  dia.setUTCHours(12, 0, 0, 0);
  dia.setUTCDate(dia.getUTCDate() - 7);
  while (dia.getUTCDay() !== 4) {
    dia.setUTCDate(dia.getUTCDate() - 1);
  }
  return dia.toISOString().slice(0, 10);
}
