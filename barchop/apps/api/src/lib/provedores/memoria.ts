import { modoDaChaveDoAsaas } from "./asaas";
import {
  ErroDoProvedor,
  type AssinaturaNoProvedor,
  type CobrancaNoProvedor,
  type FabricaDeProvedores,
  type NovaAssinatura,
  type NovoCliente,
  type Provedor,
} from "./tipos";

// Os conectores de memória: cada teste com os seus, e o que foi pedido
// fica à vista (como a cobrancaDeMemoria). O formato da chave é o do
// Asaas, pra o modo sair do prefixo como no de verdade; a conexão
// gravada vale sem decifrar (`chaveCifrada` = o texto da chave).

export interface ProvedoresDeMemoria extends FabricaDeProvedores {
  chavesInvalidas: Set<string>;
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

export function provedoresDeMemoria(): ProvedoresDeMemoria {
  let contador = 0;
  const proximo = (prefixo: string) => `${prefixo}_memoria_${++contador}`;

  function provedor(chave: string): Provedor {
    const modo = modoDaChaveDoAsaas(chave) ?? "teste";
    return {
      nome: "asaas",
      modo,
      async conferirChave() {
        if (fabrica.chavesInvalidas.has(chave)) {
          throw new ErroDoProvedor("chave_invalida", "o Asaas não aceitou a chave", 401);
        }
      },
      async registrarWebhook(dados) {
        const id = proximo("wh");
        fabrica.webhooks.push({ id, ...dados });
        return id;
      },
      async apagarWebhook(id) {
        fabrica.webhooks = fabrica.webhooks.filter((webhook) => webhook.id !== id);
      },
      async criarCliente(dados) {
        const id = proximo("cus");
        fabrica.clientes.push({ id, ...dados });
        return id;
      },
      async criarAssinatura(dados) {
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
      async lerAssinatura(id) {
        const assinatura = fabrica.assinaturas.get(id);
        if (!assinatura) throw new ErroDoProvedor("nao_encontrado", "o Asaas não achou o que foi pedido", 404);
        return { ...assinatura };
      },
      async lerCobranca(id) {
        const cobranca = fabrica.cobrancas.get(id);
        if (!cobranca) throw new ErroDoProvedor("nao_encontrado", "o Asaas não achou o que foi pedido", 404);
        return { ...cobranca };
      },
      async cancelarAssinatura(id) {
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
    chavesInvalidas: new Set(),
    webhooks: [],
    clientes: [],
    pedidosDeAssinatura: [],
    assinaturas: new Map(),
    cobrancas: new Map(),
    cancelamentos: [],
    eventos: [],
    modoDaChave: (_provedor, chave) => modoDaChaveDoAsaas(chave),
    daChave: ({ chave }) => provedor(chave),
    daConexao: ({ chaveCifrada }) => provedor(Buffer.from(chaveCifrada).toString("utf8")),
  };
  return fabrica;
}
