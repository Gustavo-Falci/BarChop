import type { CicloDoCliente } from "@barchop/formato";

// O que o BarChop pede a um provedor de pagamento (Onda 2, marco 3,
// plano planos-de-assinatura). Quem chama fala só com estes tipos:
// nenhum nome do Asaas (status, ciclo, forma) sai do conector, e o
// próximo provedor (Mercado Pago, Stripe) entra como outro conector.

export const PROVEDORES = ["asaas"] as const;
export type NomeDoProvedor = (typeof PROVEDORES)[number];

// O modo da chave: a de teste (sandbox) não move dinheiro.
export type ModoDoProvedor = "teste" | "real";

export type CodigoDoErroDoProvedor =
  // A chave não vale (revogada, do outro modo, torta).
  | "chave_invalida"
  // O provedor recusou o pedido (CPF inválido, valor fora do limite).
  | "recusado"
  | "nao_encontrado"
  | "limite"
  // Fora do ar, rede, ou resposta que não se entende.
  | "indisponivel";

// A mensagem é a do provedor quando ele explica (o 400); nunca carrega a
// chave nem os cabeçalhos do pedido.
export class ErroDoProvedor extends Error {
  readonly codigo: CodigoDoErroDoProvedor;
  readonly status: number | null;

  constructor(codigo: CodigoDoErroDoProvedor, mensagem: string, status: number | null = null) {
    super(mensagem);
    this.name = "ErroDoProvedor";
    this.codigo = codigo;
    this.status = status;
  }
}

export interface NovoCliente {
  nome: string;
  cpfCnpj: string;
  email: string | null;
  telefone: string | null;
  // O id do cliente no BarChop, pra achar de volta no painel do provedor.
  referencia: string;
}

export interface NovaAssinatura {
  clienteId: string;
  valorCentavos: number;
  ciclo: CicloDoCliente;
  // AAAA-MM-DD; hoje = a primeira cobrança já sai.
  primeiroVencimento: string;
  descricao: string;
  // O id da assinatura no BarChop.
  referencia: string;
}

export interface AssinaturaNoProvedor {
  id: string;
  // A primeira cobrança sai ao criar: daí em diante, o vencimento do
  // ciclo seguinte.
  // inativa = parou de gerar cobrança; expirada = chegou ao fim.
  situacao: "ativa" | "inativa" | "expirada";
  removida: boolean;
  valorCentavos: number;
  proximoVencimento: string;
}

export interface CobrancaNoProvedor {
  id: string;
  assinaturaId: string | null;
  situacao: "pendente" | "paga" | "vencida" | "estornada";
  removida: boolean;
  valorCentavos: number;
  vencimento: string;
  // O dia em que o cliente pagou; null enquanto não pagou.
  pagaEm: string | null;
  // Como pagou; null enquanto não pagou (a fatura deixa escolher). Pago
  // no cartão, o Asaas guarda o cartão na assinatura.
  forma: "pix" | "cartao" | "boleto" | "outra" | null;
  linkDaFatura: string | null;
}

// O que o webhook diz. Não é a verdade: quem trata relê a cobrança ou a
// assinatura no provedor antes de mudar qualquer coisa.
export interface EventoDoProvedor {
  id: string;
  tipo: string;
  cobrancaId: string | null;
  assinaturaId: string | null;
}

export interface Provedor {
  nome: NomeDoProvedor;
  modo: ModoDoProvedor;
  // Lança `chave_invalida` se a chave não vale.
  conferirChave(): Promise<void>;
  // Devolve o id do webhook no provedor.
  registrarWebhook(dados: { url: string; token: string; email: string | null }): Promise<string>;
  // Já apagado não é erro.
  apagarWebhook(id: string): Promise<void>;
  criarCliente(dados: NovoCliente): Promise<string>;
  // O link é a fatura da primeira cobrança: o cliente escolhe ali como
  // paga, e o BarChop não vê cartão.
  criarAssinatura(dados: NovaAssinatura): Promise<{ id: string; linkDaFatura: string | null }>;
  lerAssinatura(id: string): Promise<AssinaturaNoProvedor>;
  lerCobranca(id: string): Promise<CobrancaNoProvedor>;
  // Encerra a recorrência; já encerrada não é erro.
  cancelarAssinatura(id: string): Promise<void>;
  // O corpo já lido como JSON. Lança `recusado` se não é evento.
  lerEvento(corpo: unknown): EventoDoProvedor;
}

// A conexão gravada no banco (`conexao_de_pagamento`).
export interface ConexaoGravada {
  provedor: string;
  modo: string;
  chaveCifrada: Uint8Array;
}

// Cada vendedor tem a própria chave: a instância guarda a fábrica, e não
// um conector.
export interface FabricaDeProvedores {
  nome: string;
  // O modo pelo formato da chave; null = não é chave desse provedor.
  modoDaChave(provedor: NomeDoProvedor, chave: string): ModoDoProvedor | null;
  // A chave colada na tela, antes de gravar (o conectar confere com ela).
  daChave(dados: { provedor: NomeDoProvedor; chave: string }): Provedor;
  // A conexão gravada: decifra a chave na hora de usar.
  daConexao(conexao: ConexaoGravada): Provedor;
}
