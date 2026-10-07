// Quem responde pelo BarChop nos documentos legais (onda 1s-b). Num
// lugar só porque ainda não existem: preencher é item do checklist de
// produção, e enquanto isso as páginas dizem "a preencher" e saem com o
// aviso de texto em revisão. Trocar aqui atualiza termos e privacidade.
export const CONTROLADOR = {
  razaoSocial: null as string | null,
  cnpj: null as string | null,
  // O encarregado (DPO) da LGPD: quem recebe os pedidos dos titulares.
  emailDoEncarregado: null as string | null,
};

// A data em que a versão atual dos textos passou a valer.
export const VIGENCIA = "7 de outubro de 2026";

export function ouAPreencher(valor: string | null): string {
  return valor ?? "a preencher";
}
