import { modoDaChaveDoAsaas } from "./asaas";
import { lerAvisoDaInfinitePay, modoDaChaveDaInfinitePay } from "./infinitepay";
import { lerEventoDaStripe, modoDaChaveDaStripe } from "./stripe";
import {
  ErroDoProvedor,
  PEDE_CPF,
  type AssinaturaNoProvedor,
  type CobrancaNoProvedor,
  type FabricaDeProvedores,
  type ModoDoProvedor,
  type NomeDoProvedor,
  type NovaAssinatura,
  type NovoCliente,
  type NovoLink,
  type PagamentoDoLink,
  type ProvedorDe,
  type ProvedorDeLink,
  type ProvedorRecorrente,
} from "./tipos";

// Os conectores de memória: cada teste com os seus, e o que foi pedido
// fica à vista (como a cobrancaDeMemoria). Servem os três provedores: o
// formato da chave é o de cada um, pra o modo sair do prefixo como no de
// verdade, e o webhook da Stripe devolve um segredo. A "cifra" é o
// próprio texto, e a conexão gravada vale sem decifrar.

export interface ProvedoresDeMemoria extends FabricaDeProvedores {
  chavesInvalidas: Set<string>;
  // De que conta é cada chave; a que não está aqui é uma conta só dela.
  // A troca de chave da mesma conta põe a nova apontando pra antiga.
  contas: Map<string, string>;
  // Fora do ar: todo pedido falha como `indisponivel`.
  indisponivel: boolean;
  // `segredo` só no da Stripe.
  webhooks: { id: string; url: string; token: string; email: string | null; segredo?: string }[];
  clientes: (NovoCliente & { id: string })[];
  pedidosDeAssinatura: (NovaAssinatura & { id: string })[];
  // O que o "provedor" diz quando o webhook relê.
  assinaturas: Map<string, AssinaturaNoProvedor>;
  cobrancas: Map<string, CobrancaNoProvedor>;
  cancelamentos: string[];
  // Os eventos que o webhook recebeu e leu.
  eventos: unknown[];
  // A InfinitePay: de que conta é cada InfiniteTag (a chave de outra
  // conta com essa tag dá 403, como na de verdade); os links criados; e o
  // que o `payment_check` responde, por `transactionNsu`.
  tagsDasContas: Map<string, string>;
  links: (NovoLink & { url: string; tag: string })[];
  pagamentosDosLinks: Map<string, { orderNsu: string; slug: string; pagamento: PagamentoDoLink }>;
}

export function provedoresDeMemoria(
  opcoes: { modoAceito?: ModoDoProvedor; urlDaApi?: string | null } = {}
): ProvedoresDeMemoria {
  let contador = 0;
  const proximo = (prefixo: string) => `${prefixo}_memoria_${++contador}`;
  const urlDaApi = opcoes.urlDaApi === undefined ? "https://api.barchop.test" : opcoes.urlDaApi;
  const contaDoWebhook = new Map<string, string>();

  const modoDaChave = (nome: NomeDoProvedor, chave: string): ModoDoProvedor | null => {
    if (nome === "stripe") return modoDaChaveDaStripe(chave);
    if (nome === "infinitepay") return modoDaChaveDaInfinitePay(chave);
    return modoDaChaveDoAsaas(chave);
  };

  // A InfinitePay: sem webhook nem assinatura; a chave só vale com a tag
  // da mesma conta.
  function provedorDeLink(chave: string, tag: string | null | undefined): ProvedorDeLink {
    if (!tag) throw new Error("a InfinitePay pede a InfiniteTag da conta");
    const conta = () => fabrica.contas.get(chave) ?? chave;
    const atender = () => {
      if (fabrica.indisponivel) throw new ErroDoProvedor("indisponivel", "a InfinitePay não respondeu");
      const dona = fabrica.tagsDasContas.get(tag);
      if (fabrica.chavesInvalidas.has(chave) || (dona !== undefined && dona !== conta())) {
        throw new ErroDoProvedor("chave_invalida", "a InfinitePay não aceitou a chave (ou a InfiniteTag é de outra conta)", 403);
      }
    };
    return {
      nome: "infinitepay",
      modo: "real",
      pedeCpf: PEDE_CPF.infinitepay,
      cobra: "link",
      async conferirChave() {
        atender();
      },
      async criarLink(dados) {
        atender();
        const url = `https://checkout.infinitepay.io/${tag}/${proximo("link")}`;
        fabrica.links.push({ ...dados, url, tag });
        return { url };
      },
      async conferirPagamento({ orderNsu, transactionNsu, slug }) {
        atender();
        const conferido = fabrica.pagamentosDosLinks.get(transactionNsu);
        if (!conferido || conferido.orderNsu !== orderNsu || conferido.slug !== slug) {
          return { pago: false, valorCentavos: 0, forma: null };
        }
        return { ...conferido.pagamento };
      },
      lerAviso: lerAvisoDaInfinitePay,
    };
  }

  // `segredo`: o do webhook da conexão da Stripe, que confere os eventos
  // como no de verdade.
  function provedor(nome: NomeDoProvedor, chave: string, segredo: string | null = null): ProvedorRecorrente {
    const modo = modoDaChave(nome, chave) ?? "teste";
    const conta = () => fabrica.contas.get(chave) ?? chave;
    const o = nome === "stripe" ? "a Stripe" : "o Asaas";
    // Como o de verdade: fora do ar, nada responde; a chave revogada não
    // passa de nenhum pedido.
    const atender = () => {
      if (fabrica.indisponivel) throw new ErroDoProvedor("indisponivel", `${o} não respondeu`);
      if (fabrica.chavesInvalidas.has(chave)) {
        throw new ErroDoProvedor("chave_invalida", `${o} não aceitou a chave`, 401);
      }
    };
    const link = (id: string) =>
      nome === "stripe" ? `https://invoice.stripe.com/i/memoria/${id}` : `https://sandbox.asaas.com/i/${id}`;
    return {
      nome,
      modo,
      pedeCpf: PEDE_CPF[nome],
      cobra: "recorrente",
      async conferirChave() {
        atender();
      },
      async registrarWebhook(dados) {
        atender();
        const id = proximo("wh");
        const segredo = nome === "stripe" ? proximo("whsec") : null;
        fabrica.webhooks.push({ id, ...dados, ...(segredo ? { segredo } : {}) });
        contaDoWebhook.set(id, conta());
        return { id, segredo };
      },
      async apagarWebhook(id) {
        atender();
        if (contaDoWebhook.get(id) !== conta()) return;
        fabrica.webhooks = fabrica.webhooks.filter((webhook) => webhook.id !== id);
      },
      async temWebhook(id) {
        atender();
        return fabrica.webhooks.some((webhook) => webhook.id === id) && contaDoWebhook.get(id) === conta();
      },
      async criarCliente(dados) {
        atender();
        const id = proximo("cus");
        fabrica.clientes.push({ id, ...dados });
        return id;
      },
      async criarAssinatura(dados) {
        atender();
        const id = proximo("sub");
        fabrica.pedidosDeAssinatura.push({ id, ...dados });
        fabrica.assinaturas.set(id, {
          id,
          situacao: "ativa",
          removida: false,
          valorCentavos: dados.valorCentavos,
          proximoVencimento: dados.primeiroVencimento,
        });
        return { id, linkDaFatura: link(id) };
      },
      async linkDaFatura(assinaturaId) {
        atender();
        return fabrica.assinaturas.has(assinaturaId) ? link(assinaturaId) : null;
      },
      async lerAssinatura(id) {
        atender();
        const assinatura = fabrica.assinaturas.get(id);
        if (!assinatura) throw new ErroDoProvedor("nao_encontrado", "o Asaas não achou o que foi pedido", 404);
        return { ...assinatura };
      },
      async lerCobranca(id) {
        atender();
        const cobranca = fabrica.cobrancas.get(id);
        if (!cobranca) throw new ErroDoProvedor("nao_encontrado", "o Asaas não achou o que foi pedido", 404);
        return { ...cobranca };
      },
      async cancelarAssinatura(id) {
        atender();
        const assinatura = fabrica.assinaturas.get(id);
        if (assinatura) fabrica.assinaturas.set(id, { ...assinatura, removida: true });
        fabrica.cancelamentos.push(id);
      },
      lerEvento(corpo, assinatura) {
        if (nome === "stripe") {
          const lido = lerEventoDaStripe(corpo, assinatura, segredo);
          fabrica.eventos.push(JSON.parse(String(corpo)));
          return lido;
        }
        const evento = corpo as { id?: unknown; event?: unknown; cobrancaId?: unknown; assinaturaId?: unknown } | null;
        if (!evento || typeof evento.id !== "string" || typeof evento.event !== "string") {
          throw new ErroDoProvedor("recusado", "o corpo não é um evento do Asaas");
        }
        fabrica.eventos.push(corpo);
        return {
          id: evento.id,
          tipo: evento.event,
          cobrancaId: typeof evento.cobrancaId === "string" ? evento.cobrancaId : null,
          assinaturaId: typeof evento.assinaturaId === "string" ? evento.assinaturaId : null,
        };
      },
    };
  }

  const fabrica: ProvedoresDeMemoria = {
    nome: "memoria",
    modoAceito: opcoes.modoAceito ?? "teste",
    chavesInvalidas: new Set(),
    contas: new Map(),
    indisponivel: false,
    webhooks: [],
    clientes: [],
    pedidosDeAssinatura: [],
    assinaturas: new Map(),
    cobrancas: new Map(),
    cancelamentos: [],
    eventos: [],
    tagsDasContas: new Map(),
    links: [],
    pagamentosDosLinks: new Map(),
    modoDaChave,
    cifrar: (chave) => Buffer.from(chave, "utf8"),
    urlDoWebhook: (provedor, conexaoId) => (urlDaApi === null ? null : `${urlDaApi}/webhooks/${provedor}/${conexaoId}`),
    // O conector é o do tipo do provedor pedido (COBRA); o TypeScript não
    // resolve o condicional sobre um genérico, daí a conversão.
    daChave: <P extends NomeDoProvedor>({ provedor: nome, chave, tag }: { provedor: P; chave: string; tag?: string }) =>
      (nome === "infinitepay" ? provedorDeLink(chave, tag) : provedor(nome, chave)) as ProvedorDe<P>,
    daConexao: ({ provedor: nome, chaveCifrada, segredoDoWebhookCifrado, infiniteTag }) => {
      const chave = Buffer.from(chaveCifrada).toString("utf8");
      if (nome === "infinitepay") return provedorDeLink(chave, infiniteTag);
      return provedor(
        nome === "stripe" ? "stripe" : "asaas",
        chave,
        segredoDoWebhookCifrado ? Buffer.from(segredoDoWebhookCifrado).toString("utf8") : null
      );
    },
  };
  return fabrica;
}
