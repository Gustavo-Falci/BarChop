import type { DiaDaJornada } from "@barchop/types";
import { fraseDaRotina } from "./configuracoes/rotina";

// A pausa do almoço é de cada membro, por dia (painel v2, marco 3). Um
// dia tem pausa quando trabalha e tem as duas horas — a folga não conta,
// mesmo que a semana em edição ainda guarde uma.
export function temPausa(dia: DiaDaJornada): boolean {
  return dia.modo !== "folga" && !!dia.pausaInicio && !!dia.pausaFim;
}

// "Seg a sex, 12:00–13:00", no mesmo jeito de escrever a rotina. Uma
// frase só cabe quando todos os dias têm a mesma pausa.
export function resumoDaPausa(jornada: DiaDaJornada[]): string {
  const comPausa = jornada.filter(temPausa);
  if (comPausa.length === 0) return "Sem pausa";

  const [primeiro] = comPausa;
  const igual = comPausa.every(
    (dia) => dia.pausaInicio === primeiro!.pausaInicio && dia.pausaFim === primeiro!.pausaFim
  );
  if (!igual) return "Pausas diferentes por dia";

  return fraseDaRotina({
    dias: comPausa.map((dia) => dia.diaSemana),
    abre: primeiro!.pausaInicio!,
    fecha: primeiro!.pausaFim!,
  });
}
