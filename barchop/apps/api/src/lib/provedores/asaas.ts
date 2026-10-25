import type { CicloDoCliente } from "@barchop/formato";
import {
  ErroDoProvedor,
  type AssinaturaNoProvedor,
  type CobrancaNoProvedor,
  type EventoDoProvedor,
  type ModoDoProvedor,
  type Provedor,
} from "./tipos";

// O conector do Asaas (Onda 2, marco 3, PR 8 do plano
// planos-de-assinatura). A chave vai no cabeçalho `access_token`, e cada
// modo tem o seu endereço: a chave de um no endereço do outro dá 401
// (`invalid_environment`). O Asaas acrescenta campos às respostas sem
// avisar antes: aqui só se lê o que se usa, e campo novo não quebra.

export const BASE_DO_ASAAS: Record<ModoDoProvedor, string> = {
  teste: "https://api-sandbox.asaas.com/v3",
  real: "https://api.asaas.com/v3",
};

// Obrigatório pras contas criadas desde 13/06/2024.
const USER_AGENT = "BarChop (https://barchop.com.br)";

// `$aact_prod_` na de produção, `$aact_hmlg_` na do sandbox.
export function modoDaChaveDoAsaas(chave: string): ModoDoProvedor | null {
  if (chave.startsWith("$aact_prod_")) return "real";
  if (chave.startsWith("$aact_hmlg_")) return "teste";
  return null;
}

const CICLO_DO_ASAAS: Record<CicloDoCliente, string> = {
  mensal: "MONTHLY",
  trimestral: "QUARTERLY",
  anual: "YEARLY",
};

// Os eventos que o webhook do BarChop lê: a cobrança paga (o CONFIRMED
// do cartão vem antes do RECEIVED, que espera o dinheiro cair), vencida,
// removida ou estornada, e a assinatura que parou.
const EVENTOS = [
  "PAYMENT_CONFIRMED",
  "PAYMENT_RECEIVED",
  "PAYMENT_OVERDUE",
  "PAYMENT_DELETED",
  "PAYMENT_REFUNDED",
  "SUBSCRIPTION_INACTIVATED",
  "SUBSCRIPTION_DELETED",
];

type Json = Record<string, unknown>;

const centavos = (reais: unknown): number => Math.round(Number(reais) * 100);
const reais = (valorCentavos: number): number => valorCentavos / 100;
const texto = (valor: unknown): string | null => (typeof valor === "string" && valor !== "" ? valor : null);
const soDigitos = (valor: string): string => valor.replace(/\D/g, "");

function situacaoDaAssinatura(status: unknown): AssinaturaNoProvedor["situacao"] {
  if (status === "INACTIVE") return "inativa";
  if (status === "EXPIRED") return "expirada";
  return "ativa";
}

function situacaoDaCobranca(status: unknown): CobrancaNoProvedor["situacao"] {
  switch (status) {
    case "CONFIRMED":
    case "RECEIVED":
    case "RECEIVED_IN_CASH":
      return "paga";
    case "OVERDUE":
    case "DUNNING_REQUESTED":
    case "DUNNING_RECEIVED":
      return "vencida";
    case "REFUNDED":
    case "REFUND_REQUESTED":
    case "REFUND_IN_PROGRESS":
    case "CHARGEBACK_REQUESTED":
    case "CHARGEBACK_DISPUTE":
    case "AWAITING_CHARGEBACK_REVERSAL":
      return "estornada";
    default:
      return "pendente";
  }
}

function formaDaCobranca(billingType: unknown): CobrancaNoProvedor["forma"] {
  switch (billingType) {
    case "PIX":
      return "pix";
    case "CREDIT_CARD":
    case "DEBIT_CARD":
      return "cartao";
    case "BOLETO":
      return "boleto";
    case "UNDEFINED":
    case undefined:
    case null:
      return null;
    default:
      return "outra";
  }
}

function cobrancaDoAsaas(cobranca: Json): CobrancaNoProvedor {
  const situacao = situacaoDaCobranca(cobranca.status);
  const pagaEm = texto(cobranca.clientPaymentDate) ?? texto(cobranca.paymentDate) ?? texto(cobranca.confirmedDate);
  return {
    id: String(cobranca.id),
    assinaturaId: texto(cobranca.subscription),
    situacao,
    removida: cobranca.deleted === true,
    valorCentavos: centavos(cobranca.value),
    vencimento: String(cobranca.dueDate),
    pagaEm: situacao === "pendente" || situacao === "vencida" ? null : pagaEm,
    forma: situacao === "pendente" || situacao === "vencida" ? null : formaDaCobranca(cobranca.billingType),
    linkDaFatura: texto(cobranca.invoiceUrl),
  };
}

// A primeira descrição do `errors[]` do Asaas, ou uma frase nossa.
function descricaoDoErro(corpo: unknown, padrao: string): string {
  const erros = (corpo as { errors?: { description?: unknown }[] } | null)?.errors;
  return texto(erros?.[0]?.description) ?? padrao;
}

export function lerEventoDoAsaas(corpo: unknown): EventoDoProvedor {
  const evento = corpo as Json | null;
  if (!evento || typeof evento !== "object" || !texto(evento.id) || !texto(evento.event)) {
    throw new ErroDoProvedor("recusado", "o corpo não é um evento do Asaas");
  }
  const cobranca = (evento.payment ?? null) as Json | null;
  const assinatura = (evento.subscription ?? null) as Json | null;
  return {
    id: String(evento.id),
    tipo: String(evento.event),
    cobrancaId: texto(cobranca?.id),
    assinaturaId: texto(cobranca?.subscription) ?? texto(assinatura?.id),
  };
}

export function provedorAsaas(opcoes: { chave: string; modo: ModoDoProvedor; fetch?: typeof fetch }): Provedor {
  const { chave, modo } = opcoes;
  const buscar = opcoes.fetch ?? fetch;
  const base = BASE_DO_ASAAS[modo];

  // `aceitarAusente`: o 404 de quem apaga o que já foi apagado.
  async function pedir(
    metodo: "GET" | "POST" | "DELETE",
    caminho: string,
    corpo?: Json,
    aceitarAusente = false
  ): Promise<Json | null> {
    let resposta: Response;
    try {
      resposta = await buscar(`${base}${caminho}`, {
        method: metodo,
        headers: {
          access_token: chave,
          "User-Agent": USER_AGENT,
          accept: "application/json",
          ...(corpo ? { "content-type": "application/json" } : {}),
        },
        ...(corpo ? { body: JSON.stringify(corpo) } : {}),
      });
    } catch {
      throw new ErroDoProvedor("indisponivel", "o Asaas não respondeu");
    }
    const lido: unknown = await resposta.json().catch(() => null);
    if (resposta.ok) return (lido ?? {}) as Json;
    const { status } = resposta;
    if (status === 404 && aceitarAusente) return null;
    if (status === 401 || status === 403) {
      throw new ErroDoProvedor("chave_invalida", "o Asaas não aceitou a chave", status);
    }
    if (status === 400) throw new ErroDoProvedor("recusado", descricaoDoErro(lido, "o Asaas recusou o pedido"), status);
    if (status === 404) throw new ErroDoProvedor("nao_encontrado", "o Asaas não achou o que foi pedido", status);
    if (status === 429) throw new ErroDoProvedor("limite", "limite de pedidos ao Asaas", status);
    throw new ErroDoProvedor("indisponivel", "o Asaas não está respondendo", status);
  }

  return {
    nome: "asaas",
    modo,
    async conferirChave() {
      await pedir("GET", "/customers?limit=1");
    },
    async registrarWebhook({ url, token, email }) {
      const criado = await pedir("POST", "/webhooks", {
        name: "BarChop",
        url,
        ...(email ? { email } : {}),
        enabled: true,
        interrupted: false,
        apiVersion: 3,
        authToken: token,
        sendType: "SEQUENTIALLY",
        events: EVENTOS,
      });
      return String(criado?.id);
    },
    async apagarWebhook(id) {
      await pedir("DELETE", `/webhooks/${encodeURIComponent(id)}`, undefined, true);
    },
    async temWebhook(id) {
      return (await pedir("GET", `/webhooks/${encodeURIComponent(id)}`, undefined, true)) !== null;
    },
    async criarCliente({ nome, cpfCnpj, email, telefone, referencia }) {
      const criado = await pedir("POST", "/customers", {
        name: nome,
        cpfCnpj: soDigitos(cpfCnpj),
        ...(email ? { email } : {}),
        ...(telefone ? { mobilePhone: soDigitos(telefone) } : {}),
        externalReference: referencia,
      });
      return String(criado?.id);
    },
    // Sem `callback` (a volta pro BarChop depois de pagar): o Asaas recusa
    // a assinatura inteira se a conta do vendedor não tem um site
    // cadastrado, e isso é configuração da conta dele, fora do BarChop.
    async criarAssinatura({ clienteId, valorCentavos, ciclo, primeiroVencimento, descricao, referencia }) {
      const criada = await pedir("POST", "/subscriptions", {
        customer: clienteId,
        // O cliente escolhe na fatura: Pix, boleto ou cartão.
        billingType: "UNDEFINED",
        value: reais(valorCentavos),
        nextDueDate: primeiroVencimento,
        cycle: CICLO_DO_ASAAS[ciclo],
        description: descricao,
        externalReference: referencia,
      });
      const id = String(criada?.id);
      // Criar não devolve o link: ele é da primeira cobrança, que a
      // assinatura gera junto.
      const cobrancas = await pedir("GET", `/subscriptions/${encodeURIComponent(id)}/payments`);
      const primeira = ((cobrancas?.data ?? []) as Json[])[0];
      return { id, linkDaFatura: texto(primeira?.invoiceUrl) };
    },
    async lerAssinatura(id) {
      const assinatura = (await pedir("GET", `/subscriptions/${encodeURIComponent(id)}`)) as Json;
      return {
        id: String(assinatura.id),
        situacao: situacaoDaAssinatura(assinatura.status),
        removida: assinatura.deleted === true,
        valorCentavos: centavos(assinatura.value),
        proximoVencimento: String(assinatura.nextDueDate),
      };
    },
    async lerCobranca(id) {
      return cobrancaDoAsaas((await pedir("GET", `/payments/${encodeURIComponent(id)}`)) as Json);
    },
    async cancelarAssinatura(id) {
      await pedir("DELETE", `/subscriptions/${encodeURIComponent(id)}`, undefined, true);
    },
    lerEvento: lerEventoDoAsaas,
  };
}
