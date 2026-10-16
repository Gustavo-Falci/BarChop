import { formatarReais } from "@barchop/formato";
import type { FormaDoPagamento, ParteDoPagamento } from "@barchop/types";
import { emLista } from "./assinatura";

// O caixa do dia no painel (Onda 2, marco 2): dinheiro digitado e
// mostrado, e a frase de como um pagamento se dividiu. A conta da
// divisão é da API (dividirPagamento); aqui só se lê o que ela gravou.

export const ROTULO_DA_FORMA: Record<FormaDoPagamento, string> = {
  pix: "Pix",
  dinheiro: "Dinheiro",
  debito: "Débito",
  credito: "Crédito",
};

// "R$ 45,00 no pix", "R$ 45,00 em dinheiro".
const NA_FORMA: Record<FormaDoPagamento, string> = {
  pix: "no pix",
  dinheiro: "em dinheiro",
  debito: "no débito",
  credito: "no crédito",
};

export function naForma(forma: FormaDoPagamento): string {
  return NA_FORMA[forma];
}

export const reais = formatarReais;

// O que se digita num campo de dinheiro, em centavos. "40", "40,5",
// "40,50" e "40.50" valem; vazio é 0 (desconto e gorjeta são opcionais);
// o resto é null. O teto é o da API: R$ 100.000,00.
export function paraCentavos(digitado: string): number | null {
  const limpo = digitado.trim();
  if (limpo === "") return 0;
  if (!/^\d{1,6}([.,]\d{1,2})?$/.test(limpo)) return null;
  const centavos = Math.round(Number(limpo.replace(",", ".")) * 100);
  return centavos > 10_000_000 ? null : centavos;
}

// O contrário, pra preencher o campo: 4000 → "40,00"; 0 → "".
export function centavosNoCampo(centavos: number): string {
  return centavos === 0 ? "" : (centavos / 100).toFixed(2).replace(".", ",");
}

// A linha de cada um no acerto do dia: o saldo é cabe − recebeu.
export function fraseDoSaldo(saldoCentavos: number): string {
  if (saldoCentavos > 0) return `Tem a receber ${reais(saldoCentavos)}`;
  if (saldoCentavos < 0) return `Tem a repassar ${reais(-saldoCentavos)}`;
  return "Está acertado";
}

// "Gustavo repassa R$ 60,00 para Rafael." Repasse pra casa = pro caixa
// da barbearia.
export function fraseDoRepasse(repasse: {
  de: { nome: string };
  para: { nome: string } | null;
  valorCentavos: number;
}): string {
  return `${repasse.de.nome} repassa ${reais(repasse.valorCentavos)} para ${repasse.para?.nome ?? "a casa"}.`;
}

// "Rafael fica com R$ 16,00 e Gustavo com R$ 24,00." Atendimento e
// gorjeta da mesma pessoa somam numa linha só; a casa vem por último.
export function fraseDaDivisao(partes: readonly ParteDoPagamento[]): string {
  const porPessoa = new Map<string | null, { nome: string; centavos: number }>();
  for (const { beneficiario, valorCentavos } of partes) {
    const chave = beneficiario?.id ?? null;
    const atual = porPessoa.get(chave) ?? { nome: beneficiario?.nome ?? "a casa", centavos: 0 };
    atual.centavos += valorCentavos;
    porPessoa.set(chave, atual);
  }
  const casa = porPessoa.get(null);
  porPessoa.delete(null);
  const linhas = [...porPessoa.values(), ...(casa ? [casa] : [])];
  if (linhas.length === 0) return "";
  const [primeira, ...resto] = linhas;
  const nome = primeira.nome.charAt(0).toUpperCase() + primeira.nome.slice(1);
  return `${emLista([
    `${nome} fica com ${reais(primeira.centavos)}`,
    ...resto.map((l) => `${l.nome} com ${reais(l.centavos)}`),
  ])}.`;
}
