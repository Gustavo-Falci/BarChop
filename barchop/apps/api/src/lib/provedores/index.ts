import { chaveDeCifra, cifrar, decifrar } from "../cifra";
import { ErroHttp } from "../erro-http";
import { modoDaChaveDoAsaas, provedorAsaas } from "./asaas";
import { provedoresDeMemoria } from "./memoria";
import { ErroDoProvedor, type FabricaDeProvedores, type ModoDoProvedor, type NomeDoProvedor } from "./tipos";

// Os provedores de pagamento online dos planos de assinatura (Onda 2,
// marco 3, plano planos-de-assinatura): por enquanto, o Asaas. Como a
// cobrança da Stripe, os testes usam o de memória e o de verdade só
// existe fora deles.

export * from "./tipos";
export { provedoresDeMemoria, type ProvedoresDeMemoria } from "./memoria";

// O modo que a plataforma aceita nas chaves dos vendedores. Não sai do
// NODE_ENV sozinho: o teste ponta a ponta dos pagamentos roda na API de
// produção com uma conta sandbox por um dia (PAGAMENTOS_ONLINE_MODO=teste).
export function modoDosPagamentosOnline(env: Record<string, string | undefined> = process.env): ModoDoProvedor {
  const valor = env.PAGAMENTOS_ONLINE_MODO;
  if (valor === undefined || valor === "") return env.NODE_ENV === "production" ? "real" : "teste";
  if (valor === "teste" || valor === "real") return valor;
  throw new Error(`PAGAMENTOS_ONLINE_MODO precisa ser "teste" ou "real", e é "${valor}"`);
}

function modoDaChave(provedor: NomeDoProvedor, chave: string): ModoDoProvedor | null {
  switch (provedor) {
    case "asaas":
      return modoDaChaveDoAsaas(chave);
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

  function conector(provedor: NomeDoProvedor, chave: string, modo: ModoDoProvedor) {
    switch (provedor) {
      case "asaas":
        return provedorAsaas({ chave, modo, fetch: opcoes.fetch });
    }
  }

  return {
    nome: "ambiente",
    modoAceito,
    modoDaChave,
    cifrar: (chave) => cifrar(chave, chaveDeCifra(env)),
    urlDoWebhook: (conexaoId) => (urlDaApi === null ? null : `${urlDaApi}/webhooks/asaas/${conexaoId}`),
    daChave({ provedor, chave }) {
      const modo = modoDaChave(provedor, chave);
      if (!modo) throw new ErroDoProvedor("chave_invalida", "isso não é uma chave de API do Asaas");
      return conector(provedor, chave, modo);
    },
    daConexao({ provedor, modo, chaveCifrada }) {
      if (provedor !== "asaas" || (modo !== "teste" && modo !== "real")) {
        throw new Error(`conexão com provedor ou modo desconhecido: ${provedor}/${modo}`);
      }
      return conector(provedor, decifrar(chaveCifrada, chaveDeCifra(env)), modo);
    },
  };
}

// A resposta HTTP de um erro do provedor, pras rotas que falam com ele
// (conectar, assinar). A mensagem do `recusado` é a do Asaas, que
// explica (CPF inválido, endereço do webhook inválido).
export function erroHttpDoProvedor(erro: ErroDoProvedor): ErroHttp {
  switch (erro.codigo) {
    case "chave_invalida":
      return new ErroHttp(
        422,
        "chave_recusada",
        "o Asaas não aceitou esta chave: confira se ela foi copiada inteira e se ainda está ativa"
      );
    case "recusado":
    case "nao_encontrado":
      return new ErroHttp(422, "recusado_pelo_provedor", erro.message);
    case "limite":
    case "indisponivel":
      return new ErroHttp(502, "provedor_indisponivel", "o Asaas não respondeu agora: tente de novo em alguns minutos");
  }
}
