import { ErroDoProvedor, type AvisoDoLink, type ModoDoProvedor, type PagamentoDoLink, type ProvedorDeLink } from "./tipos";

// O conector da InfinitePay (plano pagamentos-online-infinitepay, PR 2).
// A API só cria link de pagamento e confere pagamento: sem assinatura,
// sem cliente, sem webhook da conta, sem cancelar nem estornar. O BarChop
// toca o ciclo e gera um link por ciclo.
//
// A chave (`inchk_`) vai no cabeçalho `X-Api-Key`, e a InfiniteTag
// (`handle`, sem o `$`) no corpo de todo pedido: o `payment_check` pede a
// tag, e chave e tag de contas diferentes dão 403.
//
// A documentação (conferida em 31/10/2026) não mostra a resposta do
// criar link nem o que o `payment_check` devolve para um pedido
// inventado, e não há sandbox (decisão 16 do plano): onde ela é vaga,
// o conector aceita mais de uma forma, e o erro diz os nomes dos campos
// que vieram (nunca os valores) pra corrigir quando a primeira conta real
// mostrar a forma de verdade.

export const BASE_DA_INFINITEPAY = "https://api.checkout.infinitepay.io";

// Como o do Asaas: bem abaixo dos 15 s da transação do desconectar.
export const PRAZO_DA_INFINITEPAY_MS = 8_000;

// Sem sandbox: toda chave move dinheiro.
export function modoDaChaveDaInfinitePay(chave: string): ModoDoProvedor | null {
  return chave.startsWith("inchk_") && chave.length > "inchk_".length ? "real" : null;
}

type Json = Record<string, unknown>;

const texto = (valor: unknown): string | null => (typeof valor === "string" && valor !== "" ? valor : null);

// O exemplo da documentação é "+5511999887766". O BarChop grava o
// celular com o país; o que vier sem ele ganha o 55.
function celularDaInfinitePay(telefone: string): string {
  const digitos = telefone.replace(/\D/g, "");
  return digitos.length > 11 && digitos.startsWith("55") ? `+${digitos}` : `+55${digitos}`;
}

function formaDoPagamento(captureMethod: unknown): PagamentoDoLink["forma"] {
  if (captureMethod === "pix") return "pix";
  if (captureMethod === "credit_card") return "cartao";
  return null;
}

const NAO_PAGO: PagamentoDoLink = { pago: false, valorCentavos: 0, forma: null };

// Um pedido de conferir inventado: só a chave e a tag importam.
const PEDIDO_INVENTADO = "barchop-conferir-chave";

export function lerAvisoDaInfinitePay(corpo: unknown): AvisoDoLink {
  const aviso = corpo as Json | null;
  const orderNsu = aviso && typeof aviso === "object" ? texto(aviso.order_nsu) : null;
  const transactionNsu = aviso && typeof aviso === "object" ? texto(aviso.transaction_nsu) : null;
  const slug = aviso && typeof aviso === "object" ? texto(aviso.invoice_slug) : null;
  if (!orderNsu || !transactionNsu || !slug) {
    throw new ErroDoProvedor("recusado", "o corpo não é um aviso de pagamento da InfinitePay");
  }
  return { orderNsu, transactionNsu, slug };
}

export function provedorInfinitePay(opcoes: { chave: string; tag: string; fetch?: typeof fetch }): ProvedorDeLink {
  const { chave, tag } = opcoes;
  const buscar = opcoes.fetch ?? fetch;

  // `tolerar`: os status que voltam como `null` em vez de erro (o pedido
  // que não bate no `payment_check`).
  async function pedir(caminho: string, corpo: Json, tolerar: readonly number[] = []): Promise<Json | null> {
    let resposta: Response;
    try {
      resposta = await buscar(`${BASE_DA_INFINITEPAY}${caminho}`, {
        method: "POST",
        headers: { "X-Api-Key": chave, accept: "application/json", "content-type": "application/json" },
        body: JSON.stringify({ handle: tag, ...corpo }),
        signal: AbortSignal.timeout(PRAZO_DA_INFINITEPAY_MS),
      });
    } catch {
      throw new ErroDoProvedor("indisponivel", "a InfinitePay não respondeu");
    }
    const lido: unknown = await resposta.json().catch((erro: unknown) => {
      if (erro instanceof Error && (erro.name === "TimeoutError" || erro.name === "AbortError")) {
        throw new ErroDoProvedor("indisponivel", "a InfinitePay não respondeu");
      }
      return null;
    });
    const { status } = resposta;
    if (status === 401 || status === 403) {
      throw new ErroDoProvedor("chave_invalida", "a InfinitePay não aceitou a chave (ou a InfiniteTag é de outra conta)", status);
    }
    // O único código de erro que a documentação nomeia.
    if (lido !== null && JSON.stringify(lido).includes("external_checkout_not_enabled")) {
      throw new ErroDoProvedor(
        "recusado",
        "o checkout integrado está desligado nesta conta: ligue em Configurações do Checkout, no painel da InfinitePay",
        status
      );
    }
    if (resposta.ok) return (lido ?? {}) as Json;
    if (tolerar.includes(status)) return null;
    if (status === 400 || status === 422) {
      const mensagem = texto((lido as Json | null)?.message);
      throw new ErroDoProvedor("recusado", mensagem ?? "a InfinitePay recusou o pedido", status);
    }
    if (status === 404) throw new ErroDoProvedor("nao_encontrado", "a InfinitePay não achou o que foi pedido", status);
    if (status === 429) throw new ErroDoProvedor("limite", "limite de pedidos à InfinitePay", status);
    throw new ErroDoProvedor("indisponivel", "a InfinitePay não está respondendo", status);
  }

  return {
    nome: "infinitepay",
    modo: "real",
    pedeCpf: false,
    cobra: "link",
    // Um `payment_check` inventado: a chave e a tag de contas diferentes
    // (ou a chave revogada) dão 401/403; qualquer outra resposta quer
    // dizer que as duas valem juntas.
    async conferirChave() {
      await pedir(
        "/payment_check",
        { order_nsu: PEDIDO_INVENTADO, transaction_nsu: PEDIDO_INVENTADO, slug: PEDIDO_INVENTADO },
        [400, 404, 422]
      );
    },
    async criarLink({ orderNsu, valorCentavos, descricao, cliente, redirectUrl, webhookUrl, validoAte }) {
      const criado = await pedir("/links", {
        items: [{ quantity: 1, price: valorCentavos, description: descricao }],
        order_nsu: orderNsu,
        redirect_url: redirectUrl,
        webhook_url: webhookUrl,
        customer: {
          name: cliente.nome,
          ...(cliente.email ? { email: cliente.email } : {}),
          ...(cliente.telefone ? { phone_number: celularDaInfinitePay(cliente.telefone) } : {}),
        },
        options: {
          // Um pagamento por link: o mesmo link não paga o ciclo duas vezes.
          single_payment: true,
          // O fim do último dia no fuso da barbearia (Brasil sem horário
          // de verão desde 2019).
          valid_until: `${validoAte}T23:59:59-03:00`,
          payment_methods_enabled: ["credit_card", "pix"],
        },
      });
      const url = texto(criado?.url) ?? texto(criado?.link) ?? texto(criado?.checkout_url);
      if (!url) {
        const campos = Object.keys(criado ?? {}).join(", ") || "nenhum";
        throw new ErroDoProvedor("indisponivel", `a InfinitePay criou o link sem devolver a URL (campos: ${campos})`);
      }
      return { url };
    },
    async conferirPagamento({ orderNsu, transactionNsu, slug }) {
      const conferido = await pedir(
        "/payment_check",
        { order_nsu: orderNsu, transaction_nsu: transactionNsu, slug },
        [400, 404, 422]
      );
      if (!conferido || conferido.success !== true || conferido.paid !== true) return NAO_PAGO;
      const { amount } = conferido;
      if (typeof amount !== "number" || !Number.isInteger(amount) || amount <= 0) {
        throw new ErroDoProvedor("indisponivel", "a InfinitePay confirmou o pagamento sem um valor que se entenda");
      }
      // `amount` é o valor do link; `paid_amount` pode ter os juros do
      // parcelamento que o comprador pagou a mais.
      return { pago: true, valorCentavos: amount, forma: formaDoPagamento(conferido.capture_method) };
    },
    lerAviso: lerAvisoDaInfinitePay,
  };
}
