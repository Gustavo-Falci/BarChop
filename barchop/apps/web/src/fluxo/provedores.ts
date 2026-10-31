import type { ProvedorDePagamento } from "@barchop/types";

// Os provedores dos pagamentos online nas telas (plano
// pagamentos-online-stripe, PR 6): o painel de quem vende e a página de
// quem assina falam deles com as mesmas palavras.

type Modo = "teste" | "real";

export interface TextosDoProvedor {
  nome: string;
  o: string;
  do: string;
  // Como quem assina paga, na fatura do provedor (a Stripe só cobra no
  // cartão: `payment_method_types` do conector).
  formas: string;
  // A escolha no painel, numa frase: como se paga e se pede o CPF.
  efeito: string;
  // O nome da chave que se cola, e a do modo de teste.
  chave: string;
  chaveDeTeste: string;
  // O selo da conta conectada no modo de teste.
  seloDeTeste: string;
  prefixo: Record<Modo, string>;
}

export const PROVEDORES: Record<ProvedorDePagamento, TextosDoProvedor> = {
  asaas: {
    nome: "Asaas",
    o: "o Asaas",
    do: "do Asaas",
    formas: "Pix, cartão ou boleto",
    efeito: "Pix, cartão ou boleto, e pede o CPF de quem assina.",
    chave: "chave de API do Asaas",
    chaveDeTeste: "a chave do sandbox do Asaas",
    seloDeTeste: "Sandbox",
    prefixo: { teste: "$aact_hmlg_", real: "$aact_prod_" },
  },
  stripe: {
    nome: "Stripe",
    o: "a Stripe",
    do: "da Stripe",
    formas: "Cartão",
    efeito: "Só cartão, e não pede o CPF de quem assina.",
    chave: "chave restrita da Stripe",
    chaveDeTeste: "a chave restrita de teste da Stripe",
    seloDeTeste: "Teste",
    prefixo: { teste: "rk_test_", real: "rk_live_" },
  },
};

// "a Stripe" → "A Stripe", no começo da frase.
export function comMaiuscula(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}
