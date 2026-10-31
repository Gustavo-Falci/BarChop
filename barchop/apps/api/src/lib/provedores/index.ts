import { chaveDeCifra, cifrar, decifrar } from "../cifra";
import { ErroHttp } from "../erro-http";
import { modoDaChaveDoAsaas, provedorAsaas } from "./asaas";
import { modoDaChaveDaInfinitePay, provedorInfinitePay } from "./infinitepay";
import { provedoresDeMemoria } from "./memoria";
import { modoDaChaveDaStripe, provedorStripe } from "./stripe";
import {
  ErroDoProvedor,
  PROVEDORES,
  type FabricaDeProvedores,
  type ModoDoProvedor,
  type NomeDoProvedor,
  type ProvedorDe,
} from "./tipos";

// Os provedores de pagamento online dos planos de assinatura (Onda 2,
// marco 3, plano planos-de-assinatura): o Asaas, a Stripe (plano
// pagamentos-online-stripe) e a InfinitePay (plano
// pagamentos-online-infinitepay). Como a
// cobrança da Stripe, os testes usam o de memória e o de verdade só
// existe fora deles.

export * from "./tipos";
export { provedoresDeMemoria, type ProvedoresDeMemoria } from "./memoria";
export { lerAvisoDaInfinitePay } from "./infinitepay";

// O modo que a plataforma aceita nas chaves dos vendedores. Não sai do
// NODE_ENV sozinho: o teste ponta a ponta dos pagamentos roda na API de
// produção com uma conta sandbox por um dia (PAGAMENTOS_ONLINE_MODO=teste).
export function modoDosPagamentosOnline(env: Record<string, string | undefined> = process.env): ModoDoProvedor {
  const valor = env.PAGAMENTOS_ONLINE_MODO;
  if (valor === undefined || valor === "") return env.NODE_ENV === "production" ? "real" : "teste";
  if (valor === "teste" || valor === "real") return valor;
  throw new Error(`PAGAMENTOS_ONLINE_MODO precisa ser "teste" ou "real", e é "${valor}"`);
}

// Como cada provedor aparece nas mensagens: com o artigo ("o Asaas", "a
// Stripe"), o começo da chave e como ele chama os dois modos.
export interface NomesDoProvedor {
  o: string;
  do: string;
  inicioDaChave: string;
  teste: string;
  real: string;
}

export function nomeDoProvedor(provedor: NomeDoProvedor): NomesDoProvedor {
  switch (provedor) {
    case "asaas":
      return { o: "o Asaas", do: "do Asaas", inicioDaChave: "$aact_", teste: "do sandbox", real: "de produção" };
    case "stripe":
      return { o: "a Stripe", do: "da Stripe", inicioDaChave: "sk_ ou rk_", teste: "de teste", real: "de produção" };
    case "infinitepay":
      return { o: "a InfinitePay", do: "da InfinitePay", inicioDaChave: "inchk_", teste: "de teste", real: "de produção" };
  }
}

// O provedor gravado na conexão (texto no banco), conferido.
export function provedorGravado(provedor: string): NomeDoProvedor {
  if (!(PROVEDORES as readonly string[]).includes(provedor)) {
    throw new Error(`conexão com provedor desconhecido: ${provedor}`);
  }
  return provedor as NomeDoProvedor;
}

// "o Asaas" no começo da frase.
export function comMaiuscula(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function modoDaChave(provedor: NomeDoProvedor, chave: string): ModoDoProvedor | null {
  switch (provedor) {
    case "asaas":
      return modoDaChaveDoAsaas(chave);
    case "stripe":
      return modoDaChaveDaStripe(chave);
    case "infinitepay":
      return modoDaChaveDaInfinitePay(chave);
  }
}

// Em produção, a API não sobe sem a CHAVE_DE_CIFRA, nem com ela torta
// (decisão 10), como com o JWT_SECRET. Fora de produção, ela é lida só
// ao cifrar ou decifrar: o resto da API sobe e funciona sem.
export function provedoresDoAmbiente(
  env: Record<string, string | undefined> = process.env,
  opcoes: { fetch?: typeof fetch } = {}
): FabricaDeProvedores {
  if (env.NODE_ENV === "test") return provedoresDeMemoria();
  if (env.NODE_ENV === "production") chaveDeCifra(env);
  const modoAceito = modoDosPagamentosOnline(env);
  // Sem barra no fim. O Asaas recusa endereço que não é público
  // (`localhost` dá "A url informada é inválida"): em desenvolvimento,
  // conectar pede um túnel https na URL_DA_API.
  const urlDaApi = env.URL_DA_API?.replace(/\/+$/, "") || null;

  // O segredo do webhook vem da conexão gravada; a chave colada só
  // confere e registra o webhook. A InfinitePay pede a InfiniteTag em
  // todo pedido.
  function conector(
    provedor: NomeDoProvedor,
    chave: string,
    modo: ModoDoProvedor,
    { segredoDoWebhook = null, tag = null }: { segredoDoWebhook?: string | null; tag?: string | null } = {}
  ) {
    switch (provedor) {
      case "asaas":
        return provedorAsaas({ chave, modo, fetch: opcoes.fetch });
      case "stripe":
        return provedorStripe({ chave, modo, segredoDoWebhook, fetch: opcoes.fetch });
      case "infinitepay":
        if (!tag) throw new Error("a InfinitePay pede a InfiniteTag da conta");
        return provedorInfinitePay({ chave, tag, fetch: opcoes.fetch });
    }
  }

  return {
    nome: "ambiente",
    modoAceito,
    modoDaChave,
    cifrar: (chave) => cifrar(chave, chaveDeCifra(env)),
    urlDoWebhook: (provedor, conexaoId) => (urlDaApi === null ? null : `${urlDaApi}/webhooks/${provedor}/${conexaoId}`),
    daChave<P extends NomeDoProvedor>({ provedor, chave, tag }: { provedor: P; chave: string; tag?: string }) {
      const modo = modoDaChave(provedor, chave);
      if (!modo) throw new ErroDoProvedor("chave_invalida", `isso não é uma chave de API ${nomeDoProvedor(provedor).do}`);
      // O conector do provedor pedido é do tipo dele (COBRA); o TypeScript
      // não resolve o condicional sobre um genérico.
      return conector(provedor, chave, modo, { tag }) as ProvedorDe<P>;
    },
    daConexao({ provedor, modo, chaveCifrada, segredoDoWebhookCifrado, infiniteTag }) {
      if (!(PROVEDORES as readonly string[]).includes(provedor) || (modo !== "teste" && modo !== "real")) {
        throw new Error(`conexão com provedor ou modo desconhecido: ${provedor}/${modo}`);
      }
      const cifra = chaveDeCifra(env);
      const segredo = segredoDoWebhookCifrado ? decifrar(segredoDoWebhookCifrado, cifra) : null;
      return conector(provedor as NomeDoProvedor, decifrar(chaveCifrada, cifra), modo, {
        segredoDoWebhook: segredo,
        tag: infiniteTag,
      });
    },
  };
}

// A resposta HTTP de um erro do provedor, pras rotas que falam com ele
// (conectar, assinar). A mensagem do `recusado` é a do provedor, que
// explica (CPF inválido, endereço do webhook inválido).
export function erroHttpDoProvedor(erro: ErroDoProvedor, provedor: NomeDoProvedor): ErroHttp {
  const nome = nomeDoProvedor(provedor);
  switch (erro.codigo) {
    case "chave_invalida":
      return new ErroHttp(
        422,
        "chave_recusada",
        `${nome.o} não aceitou esta chave: confira se ela foi copiada inteira e se ainda está ativa`
      );
    case "recusado":
    case "nao_encontrado":
      return new ErroHttp(422, "recusado_pelo_provedor", erro.message);
    case "limite":
    case "indisponivel":
      return new ErroHttp(502, "provedor_indisponivel", `${nome.o} não respondeu agora: tente de novo em alguns minutos`);
  }
}
