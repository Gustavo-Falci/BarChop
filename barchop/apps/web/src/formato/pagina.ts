import {
  CATEGORIAS_DE_SERVICO,
  type CategoriaDeServico,
  type Comodidade,
  type FormaDePagamento,
} from "@barchop/formato";

// Os nomes de gente das listas de @barchop/formato. `Record` com a
// união dos valores: valor novo na lista sem rótulo aqui é erro de
// type-check, não uma chave crua na página pública.
export const ROTULO_DA_COMODIDADE: Record<Comodidade, string> = {
  wifi: "Wi-Fi",
  ar_condicionado: "Ar-condicionado",
  estacionamento: "Estacionamento",
  acessibilidade: "Acessível",
  cafe: "Café",
  bebidas: "Bebidas",
  tv: "TV",
  espaco_kids: "Espaço kids",
};

export const ROTULO_DA_CATEGORIA: Record<CategoriaDeServico, string> = {
  cabelo: "Cabelo",
  barba: "Barba",
  combo: "Combo",
  sobrancelha: "Sobrancelha",
  quimica: "Química e tratamentos",
  infantil: "Infantil",
};

export const ROTULO_DO_PAGAMENTO: Record<FormaDePagamento, string> = {
  pix: "Pix",
  dinheiro: "Dinheiro",
  debito: "Cartão de débito",
  credito: "Cartão de crédito",
};

// A API só devolve valores da lista; o `?? valor` é pra uma barbearia
// gravada por uma versão mais nova da API não quebrar a página.
export function rotuloDaComodidade(valor: string): string {
  return (ROTULO_DA_COMODIDADE as Record<string, string>)[valor] ?? valor;
}

// A categoria que a tela sabe desenhar, ou null. O tipo diz que a API só
// devolve valor da lista, mas um valor de fora já chegou no ar (o
// "Cebelo", com o web novo e a migração ainda por rodar) e o serviço
// sumiu da página. Fora da lista conta como sem categoria: o serviço
// aparece na sobra em vez de sumir.
export function categoriaConhecida(valor: string | null): CategoriaDeServico | null {
  return (CATEGORIAS_DE_SERVICO as readonly (string | null)[]).includes(valor)
    ? (valor as CategoriaDeServico)
    : null;
}

export function rotuloDoPagamento(valor: string): string {
  return (ROTULO_DO_PAGAMENTO as Record<string, string>)[valor] ?? valor;
}
