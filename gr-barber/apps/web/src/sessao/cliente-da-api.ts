import { criarApiClient } from "@gr-barber/api-client";
import {
  encerrarSessaoDoBarbeiro,
  sessaoDoBarbeiro,
  sessaoDoCliente,
} from "./armazenamento";

// A URL da API muda por ambiente e é lida no navegador, então precisa
// do prefixo NEXT_PUBLIC_. O padrão é o dev local da API.
const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3333";

export function apiDoBarbeiro(fetchInjetado?: typeof globalThis.fetch) {
  return criarApiClient({
    baseUrl: BASE_URL,
    obterToken: () => sessaoDoBarbeiro.ler(),
    // Limpar aqui, e não em cada tela: o 401 chega de qualquer chamada,
    // e uma tela que esquecesse deixaria um token morto no navegador.
    aoExpirarSessao: () => sessaoDoBarbeiro.limpar(),
    fetch: fetchInjetado,
  }).barbeiro;
}

// Só o escopo público, sem sessão nenhuma: é o que o servidor do Next
// usa pra montar título e prévia do link, e lá não existe token — nem
// o do barbeiro nem o do cliente — pra mandar.
export function apiPublica(fetchInjetado?: typeof globalThis.fetch) {
  return criarApiClient({ baseUrl: BASE_URL, fetch: fetchInjetado }).publico;
}

// Devolve o client inteiro, e não só `.cliente` como o de cima: o fluxo
// público usa `publico` antes de existir conta, e a mesma tela precisa
// de `cliente` depois do login. Separar em duas fábricas obrigaria a
// tela a saber de qual delas pedir cada chamada.
export function apiDoCliente(
  slug: string,
  fetchInjetado?: typeof globalThis.fetch
) {
  const sessao = sessaoDoCliente(slug);

  return criarApiClient({
    baseUrl: BASE_URL,
    obterToken: () => sessao.ler(),
    aoExpirarSessao: () => sessao.limpar(),
    fetch: fetchInjetado,
  });
}

// Um 401 pode chegar de qualquer tela guardada, não só da checagem
// inicial de sessão — e este módulo, que monta o client uma vez em
// `ProvedorDoPainel`, não tem router. `SessaoDoPainel` empresta o
// próprio `sair` (que já limpa a sessão e navega) registrando-o aqui
// assim que monta; um registro só, porque só existe um painel montado
// por vez. Sem registro nenhum (SSR, ou um client de teste construído
// fora da árvore do painel), o 401 ainda limpa a sessão — só não navega.
let saidaDoPainel: (() => void) | null = null;

export function registrarSaidaDoPainel(sair: (() => void) | null): void {
  saidaDoPainel = sair;
}

// Dois escopos, e não só `.barbeiro`: a disponibilidade é rota pública
// por slug e não tem gêmea no escopo do barbeiro, mas a tela de novo
// agendamento precisa dela. Montar um segundo client dentro da tela
// duplicaria baseUrl e aoExpirarSessao. O `apiDoBarbeiro` acima
// continua para quem só quer o escopo protegido.
export function apiDoPainel(fetchInjetado?: typeof globalThis.fetch) {
  const client = criarApiClient({
    baseUrl: BASE_URL,
    obterToken: () => sessaoDoBarbeiro.ler(),
    // As duas chaves, e não só o token: um 401 no meio da sessão
    // termina a sessão do mesmo jeito que um "Sair" — e um logout que
    // esquecesse o slug deixaria lixo que a sessão seguinte leria como
    // se fosse dela (ver o comentário de `encerrarSessaoDoBarbeiro` em
    // armazenamento.ts). Navegar é responsabilidade de quem se
    // registrou acima.
    aoExpirarSessao: () => {
      encerrarSessaoDoBarbeiro();
      saidaDoPainel?.();
    },
    fetch: fetchInjetado,
  });
  return { barbeiro: client.barbeiro, publico: client.publico };
}
