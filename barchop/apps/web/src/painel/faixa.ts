// A faixa da assinatura fechada pelo dono: some por 24h. Guarda a chave
// do recado junto, e não só a hora — um recado novo (o teste virou
// cancelamento) tem de aparecer mesmo que o anterior tenha sido fechado
// há pouco. A chave é estável (o fim do teste, a data do cancelamento),
// não o texto, que muda quando a contagem de dias vira.

export const CHAVE_DA_FAIXA = "painel.faixa";

const VINTE_E_QUATRO_HORAS = 24 * 60 * 60 * 1000;

interface Fechada {
  chave: string;
  ate: number;
}

function ler(): Fechada | null {
  if (typeof window === "undefined") return null;
  try {
    const guardado = JSON.parse(window.localStorage.getItem(CHAVE_DA_FAIXA) ?? "null") as unknown;
    if (
      guardado &&
      typeof guardado === "object" &&
      typeof (guardado as Fechada).chave === "string" &&
      typeof (guardado as Fechada).ate === "number"
    ) {
      return guardado as Fechada;
    }
  } catch {
    // Guardado ilegível (ou o navegador sem storage): a faixa aparece.
  }
  return null;
}

export function faixaFechada(chave: string): boolean {
  const fechada = ler();
  return fechada !== null && fechada.chave === chave && Date.now() < fechada.ate;
}

export function fecharFaixa(chave: string): void {
  if (typeof window === "undefined") return;
  try {
    const valor: Fechada = { chave, ate: Date.now() + VINTE_E_QUATRO_HORAS };
    window.localStorage.setItem(CHAVE_DA_FAIXA, JSON.stringify(valor));
  } catch {
    // Sem storage, fecha só nesta visita (o estado do componente).
  }
}
