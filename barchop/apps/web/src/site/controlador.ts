// Quem vende o BarChop e responde por ele nos documentos legais (onda
// 1s-b; Onda 2, PR 6). É pessoa física — a conta da Stripe é de CPF
// (ADR-0010) —, e a lei do comércio eletrônico (Decreto 7.962/2013) pede
// nome e CPF de quem vende. Os valores entram no build pelas
// NEXT_PUBLIC_VENDEDOR_* (infra/.env, web.Dockerfile): o repositório é
// público e não guarda o CPF. Sem elas (desenvolvimento), as páginas
// dizem "a preencher". Lidas a cada chamada, e não na carga do módulo,
// pros testes poderem trocar.

export interface Vendedor {
  nome: string | null;
  // Já formatado: 000.000.000-00.
  cpf: string | null;
  // O contato de quem vende, que também recebe os pedidos da LGPD.
  email: string | null;
}

export function vendedor(): Vendedor {
  const cpf = process.env.NEXT_PUBLIC_VENDEDOR_CPF;
  return {
    nome: process.env.NEXT_PUBLIC_VENDEDOR_NOME || null,
    cpf: cpf ? formatarCpf(cpf) : null,
    email: process.env.NEXT_PUBLIC_VENDEDOR_EMAIL || null,
  };
}

// Aceita o CPF com ou sem pontuação; fora de 11 dígitos, devolve como
// veio, pra um erro de digitação aparecer na página e não sumir.
export function formatarCpf(cpf: string): string {
  const digitos = cpf.replace(/\D/g, "");
  if (digitos.length !== 11) return cpf;
  return `${digitos.slice(0, 3)}.${digitos.slice(3, 6)}.${digitos.slice(6, 9)}-${digitos.slice(9)}`;
}

// A data em que a versão atual dos textos passou a valer. Muda junto com
// a entrada no ar da cobrança.
export const VIGENCIA = "15 de outubro de 2026";

export function ouAPreencher(valor: string | null): string {
  return valor ?? "a preencher";
}
