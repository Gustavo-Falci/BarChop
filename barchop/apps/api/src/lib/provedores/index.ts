import { chaveDeCifra, decifrar } from "../cifra";
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

// A CHAVE_DE_CIFRA é lida só quando uma conexão gravada é usada: sem ela,
// o resto da API sobe e funciona.
export function provedoresDoAmbiente(
  env: Record<string, string | undefined> = process.env,
  opcoes: { fetch?: typeof fetch } = {}
): FabricaDeProvedores {
  if (env.NODE_ENV === "test") return provedoresDeMemoria();

  function conector(provedor: NomeDoProvedor, chave: string, modo: ModoDoProvedor) {
    switch (provedor) {
      case "asaas":
        return provedorAsaas({ chave, modo, fetch: opcoes.fetch });
    }
  }

  return {
    nome: "ambiente",
    modoDaChave,
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
