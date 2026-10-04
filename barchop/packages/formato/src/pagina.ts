// O que a página pública da barbearia pode mostrar além do nome: uma
// lista fechada, num lugar só (o padrão da ADR-0007). A API valida
// contra ela, o banco tem um CHECK com os mesmos valores (migration
// 20261004160000_pagina_da_barbearia, com teste que os compara) e as
// telas tiram daqui os rótulos. Valor novo entra aqui, numa migration
// que troca o CHECK, e no rótulo das telas.
export const COMODIDADES = [
  "wifi",
  "ar_condicionado",
  "estacionamento",
  "acessibilidade",
  "cafe",
  "bebidas",
  "tv",
  "espaco_kids",
] as const;

export type Comodidade = (typeof COMODIDADES)[number];

export const FORMAS_DE_PAGAMENTO = ["pix", "dinheiro", "debito", "credito"] as const;

export type FormaDePagamento = (typeof FORMAS_DE_PAGAMENTO)[number];

// O @ do Instagram, sem o @ e sem URL: a página monta o link. Aceitar
// URL deixaria qualquer endereço virar link na página mais pública do
// produto. Letras, números, ponto e sublinhado, até 30 — a regra do
// próprio Instagram.
export const PADRAO_INSTAGRAM = "^[A-Za-z0-9._]{1,30}$";
