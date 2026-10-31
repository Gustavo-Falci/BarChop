import type { CicloDoCliente } from "@barchop/formato";

// O que o BarChop pede a um provedor de pagamento (Onda 2, marco 3,
// plano planos-de-assinatura). Quem chama fala só com estes tipos:
// nenhum nome do provedor (status, ciclo, forma) sai do conector: o
// Asaas e a Stripe são dois conectores atrás da mesma interface.

export const PROVEDORES = ["asaas", "stripe"] as const;
export type NomeDoProvedor = (typeof PROVEDORES)[number];

// Se o provedor pede o CPF (ou CNPJ) de quem assina pra criar o cliente.
// Aqui, e não só no conector, porque a vitrine diz isso sem a chave de
// quem vende: o Asaas não cobra sem ele; a Stripe não usa.
export const PEDE_CPF: Record<NomeDoProvedor, boolean> = { asaas: true, stripe: false };

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
  // Só no provedor que pede (`pedeCpf`); nos outros, null.
  cpfCnpj: string | null;
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
  // O plano do BarChop: a Stripe guarda um produto por plano.
  planoId: string;
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
  // O `PEDE_CPF` do provedor.
  pedeCpf: boolean;
  // Lança `chave_invalida` se a chave não vale.
  conferirChave(): Promise<void>;
  // Devolve o id do webhook no provedor e, quando é o provedor que gera
  // o segredo que assina os eventos (a Stripe), o segredo: ele só volta
  // aqui. O Asaas usa o `token` do BarChop e devolve null.
  registrarWebhook(dados: { url: string; token: string; email: string | null }): Promise<{ id: string; segredo: string | null }>;
  // Já apagado não é erro.
  apagarWebhook(id: string): Promise<void>;
  // O webhook só é visto pela chave da conta que o criou: é assim que a
  // troca de chave sabe se a nova é da mesma conta.
  temWebhook(id: string): Promise<boolean>;
  criarCliente(dados: NovoCliente): Promise<string>;
  // O link é a fatura da primeira cobrança: o cliente escolhe ali como
  // paga, e o BarChop não vê cartão.
  criarAssinatura(dados: NovaAssinatura): Promise<{ id: string; linkDaFatura: string | null }>;
  // A fatura que falta pagar, pra quem volta a assinar com a pendente
  // viva; null = não há o que pagar.
  linkDaFatura(assinaturaId: string): Promise<string | null>;
  lerAssinatura(id: string): Promise<AssinaturaNoProvedor>;
  lerCobranca(id: string): Promise<CobrancaNoProvedor>;
  // Encerra a recorrência; já encerrada não é erro.
  cancelarAssinatura(id: string): Promise<void>;
  // O Asaas: o corpo já lido como JSON. A Stripe: o corpo cru e o
  // cabeçalho `stripe-signature`, conferido com o segredo do webhook.
  // Lança `recusado` se não é evento (ou a assinatura não confere).
  lerEvento(corpo: unknown, assinatura?: string): EventoDoProvedor;
}

// A conexão gravada no banco (`conexao_de_pagamento`).
export interface ConexaoGravada {
  provedor: string;
  modo: string;
  chaveCifrada: Uint8Array;
  // O segredo que assina os eventos da Stripe; null no Asaas.
  segredoDoWebhookCifrado: Uint8Array | null;
}

// Cada vendedor tem a própria chave: a instância guarda a fábrica, e não
// um conector.
export interface FabricaDeProvedores {
  nome: string;
  // O modo das chaves que a plataforma aceita (PAGAMENTOS_ONLINE_MODO).
  modoAceito: ModoDoProvedor;
  // A chave colada, cifrada pra gravar em `chave_cifrada`.
  cifrar(chave: string): Uint8Array;
  // Pra onde o provedor manda os eventos da conexão; null = a API não
  // sabe o próprio endereço (URL_DA_API).
  urlDoWebhook(provedor: NomeDoProvedor, conexaoId: string): string | null;
  // O modo pelo formato da chave; null = não é chave desse provedor.
  modoDaChave(provedor: NomeDoProvedor, chave: string): ModoDoProvedor | null;
  // A chave colada na tela, antes de gravar (o conectar confere com ela).
  daChave(dados: { provedor: NomeDoProvedor; chave: string }): Provedor;
  // A conexão gravada: decifra a chave na hora de usar.
  daConexao(conexao: ConexaoGravada): Provedor;
}
