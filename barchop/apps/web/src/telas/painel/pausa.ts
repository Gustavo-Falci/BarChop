import type { DiaDaJornada, FaixaDePausa } from "@barchop/types";
import { fraseDosDias } from "./configuracoes/rotina";

// As pausas são de cada membro, por dia (painel v2, marco 3), e desde
// 08/11 quantas ele precisar no mesmo dia. A folga não tem nenhuma,
// mesmo que a semana em edição ainda guarde alguma.
export function pausasDe(dia: DiaDaJornada): FaixaDePausa[] {
  return dia.modo === "folga" ? [] : (dia.pausas ?? []);
}

export function temPausa(dia: DiaDaJornada): boolean {
  return pausasDe(dia).length > 0;
}

// "12:00–13:00", "12:00–13:00 e 16:00–16:15", "a, b e c".
export function textoDasPausas(pausas: FaixaDePausa[]): string {
  const faixas = pausas.map((pausa) => `${pausa.inicio}–${pausa.fim}`);
  return faixas.length <= 1 ? (faixas[0] ?? "") : `${faixas.slice(0, -1).join(", ")} e ${faixas[faixas.length - 1]}`;
}

// "Seg a sex, 12:00–13:00 e 16:00–16:15", no mesmo jeito de escrever a
// rotina. Uma frase só cabe quando todos os dias têm as mesmas pausas.
export function resumoDaPausa(jornada: DiaDaJornada[]): string {
  const comPausa = jornada.filter(temPausa);
  if (comPausa.length === 0) return "Sem pausa";

  const texto = textoDasPausas(pausasDe(comPausa[0]!));
  if (!comPausa.every((dia) => textoDasPausas(pausasDe(dia)) === texto)) return "Pausas diferentes por dia";

  return fraseDosDias(
    comPausa.map((dia) => dia.diaSemana),
    texto
  );
}
