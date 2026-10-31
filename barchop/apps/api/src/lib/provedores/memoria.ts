import { modoDaChaveDoAsaas } from "./asaas";
import { lerEventoDaStripe, modoDaChaveDaStripe } from "./stripe";
import {
  ErroDoProvedor,
  type AssinaturaNoProvedor,
  type CobrancaNoProvedor,
  type FabricaDeProvedores,
  type ModoDoProvedor,
  type NomeDoProvedor,
  type NovaAssinatura,
  type NovoCliente,
  type Provedor,
} from "./tipos";

// Os conectores de memória: cada teste com os seus, e o que foi pedido
// fica à vista (como a cobrancaDeMemoria). Servem o Asaas e a Stripe: o
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
}

export function provedoresDeMemoria(
  opcoes: { modoAceito?: ModoDoProvedor; urlDaApi?: string | null } = {}
): ProvedoresDeMemoria {
  let contador = 0;
  const proximo = (prefixo: string) => `${prefixo}_memoria_${++contador}`;
  const urlDaApi = opcoes.urlDaApi === undefined ? "https://api.barchop.test" : opcoes.urlDaApi;
  const contaDoWebhook = new Map<string, string>();

  const modoDaChave = (nome: NomeDoProvedor, chave: string): ModoDoProvedor | null =>
    nome === "stripe" ? modoDaChaveDaStripe(chave) : modoDaChaveDoAsaas(chave);

  // `segredo`: o do webhook da conexão da Stripe, que confere os eventos
  // como no de verdade.
  function provedor(nome: NomeDoProvedor, chave: string, segredo: string | null = null): Provedor {
    const modo = modoDaChave(nome, chave) ?? "teste";
    const conta = () => fabrica.contas.get(chave) ?? chave;
    // Como o Asaas: fora do ar, nada responde; a chave revogada não
    // passa de nenhum pedido.
    const atender = () => {
      if (fabrica.indisponivel) throw new ErroDoProvedor("indisponivel", "o Asaas não respondeu");
      if (fabrica.chavesInvalidas.has(chave)) {
        throw new ErroDoProvedor("chave_invalida", "o Asaas não aceitou a chave", 401);
      }
    };
    return {
      nome,
      modo,
      pedeCpf: nome === "asaas",
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
        return { id, linkDaFatura: `https://sandbox.asaas.com/i/${id}` };
      },
      async linkDaFatura(assinaturaId) {
        atender();
        return fabrica.assinaturas.has(assinaturaId) ? `https://sandbox.asaas.com/i/${assinaturaId}` : null;
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
    modoDaChave,
    cifrar: (chave) => Buffer.from(chave, "utf8"),
    urlDoWebhook: (provedor, conexaoId) => (urlDaApi === null ? null : `${urlDaApi}/webhooks/${provedor}/${conexaoId}`),
    daChave: ({ provedor: nome, chave }) => provedor(nome, chave),
    daConexao: ({ provedor: nome, chaveCifrada, segredoDoWebhookCifrado }) =>
      provedor(
        nome === "stripe" ? "stripe" : "asaas",
        Buffer.from(chaveCifrada).toString("utf8"),
        segredoDoWebhookCifrado ? Buffer.from(segredoDoWebhookCifrado).toString("utf8") : null
      ),
  };
  return fabrica;
}
