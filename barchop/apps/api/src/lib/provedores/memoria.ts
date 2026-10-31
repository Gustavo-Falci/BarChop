import { modoDaChaveDoAsaas } from "./asaas";
import {
  ErroDoProvedor,
  type AssinaturaNoProvedor,
  type CobrancaNoProvedor,
  type FabricaDeProvedores,
  type ModoDoProvedor,
  type NovaAssinatura,
  type NovoCliente,
  type Provedor,
} from "./tipos";

// Os conectores de memória: cada teste com os seus, e o que foi pedido
// fica à vista (como a cobrancaDeMemoria). O formato da chave é o do
// Asaas, pra o modo sair do prefixo como no de verdade; a "cifra" é o
// próprio texto da chave, e a conexão gravada vale sem decifrar.

export interface ProvedoresDeMemoria extends FabricaDeProvedores {
  chavesInvalidas: Set<string>;
  // De que conta é cada chave; a que não está aqui é uma conta só dela.
  // A troca de chave da mesma conta põe a nova apontando pra antiga.
  contas: Map<string, string>;
  // Fora do ar: todo pedido falha como `indisponivel`.
  indisponivel: boolean;
  webhooks: { id: string; url: string; token: string; email: string | null }[];
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

  function provedor(chave: string): Provedor {
    const modo = modoDaChaveDoAsaas(chave) ?? "teste";
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
      nome: "asaas",
      modo,
      pedeCpf: true,
      async conferirChave() {
        atender();
      },
      async registrarWebhook(dados) {
        atender();
        const id = proximo("wh");
        fabrica.webhooks.push({ id, ...dados });
        contaDoWebhook.set(id, conta());
        return id;
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
      lerEvento(corpo) {
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
    modoDaChave: (_provedor, chave) => modoDaChaveDoAsaas(chave),
    cifrar: (chave) => Buffer.from(chave, "utf8"),
    urlDoWebhook: (provedor, conexaoId) => (urlDaApi === null ? null : `${urlDaApi}/webhooks/${provedor}/${conexaoId}`),
    daChave: ({ chave }) => provedor(chave),
    daConexao: ({ chaveCifrada }) => provedor(Buffer.from(chaveCifrada).toString("utf8")),
  };
  return fabrica;
}
