// Duas identidades, duas sessões. Os escopos da API recusam o token um
// do outro (autenticar rejeita payload de cliente e vice-versa), então
// guardar na mesma chave faria a primeira tela que misturasse as duas
// receber 401 sem explicação.
//
// O token não mora mais aqui: localStorage é legível por qualquer script
// da página (auditoria de 15/11, SEC-003). Ele vai no cookie httpOnly que
// a própria API põe no login, e o fetch leva junto (cliente-da-api.ts).
// O que fica aqui é só uma marca de que há sessão, pra a tela decidir
// entre o login e o carregamento sem perguntar à API. A marca não vale
// nada fora deste navegador: quem autentica é o cookie.
export interface Sessao {
  ler(): string | null;
  gravar(token: string): void;
  limpar(): void;
}

// Avisado a cada gravar e limpar. O evento `storage` do navegador só
// dispara nas OUTRAS abas, e quem mostra a sessão na mesma aba — a barra
// da barbearia, que mora no layout e não remonta — precisa saber do
// login e do "Não é você?" que acabaram de acontecer aqui.
export const EVENTO_DE_SESSAO = "barchop:sessao";

function avisar() {
  window.dispatchEvent(new Event(EVENTO_DE_SESSAO));
}

function sessaoNaChave(chave: string): Sessao {
  return {
    ler() {
      // No servidor não existe localStorage, e o layout do painel roda
      // lá antes de hidratar.
      if (typeof window === "undefined") return null;
      return window.localStorage.getItem(chave);
    },
    gravar(token: string) {
      if (typeof window === "undefined") return;
      window.localStorage.setItem(chave, token);
      avisar();
    },
    limpar() {
      if (typeof window === "undefined") return;
      window.localStorage.removeItem(chave);
      avisar();
    },
  };
}

export const MARCA_DE_SESSAO = "cookie";

// A sessão que vive no cookie. `gravar` recebe o token do login, como
// sempre, mas guarda só a marca. Um token de verdade guardado aqui é de
// antes do cookie: sai na primeira leitura, e a pessoa entra de novo.
function sessaoNoCookie(chave: string): Sessao {
  const base = sessaoNaChave(chave);
  return {
    ler() {
      const valor = base.ler();
      if (valor === null || valor === MARCA_DE_SESSAO) return valor;
      window.localStorage.removeItem(chave);
      return null;
    },
    gravar() {
      base.gravar(MARCA_DE_SESSAO);
    },
    limpar() {
      base.limpar();
    },
  };
}

export const sessaoDoBarbeiro = sessaoNoCookie("sessao.barbeiro");

// Por barbearia, porque o login do cliente é por barbearia: a sessão que
// vale em /barbearias/gr-barber não vale na de ninguém mais.
export function sessaoDoCliente(slug: string): Sessao {
  return sessaoNoCookie(`sessao.cliente.${slug}`);
}

// O slug não vem do GET /me, que devolve só barbeariaId — ele chega no
// SessaoBarbeiro do login e do signup, e a tela de novo agendamento
// precisa dele para a disponibilidade, que é rota pública por slug.
export const sessaoDaBarbearia = sessaoNaChave("sessao.barbearia");

// O suporte da plataforma (Onda 1, F4d): conta própria, fora de qualquer
// equipe. Chave à parte: sair do suporte não derruba o painel, e um
// token de um nunca vai nas chamadas do outro.
export const sessaoDoSuporte = sessaoNoCookie("sessao.suporte");

// Uma função e não duas chamadas soltas: um logout que esquecesse o
// slug deixaria lixo que a próxima sessão leria como se fosse dela.
export function encerrarSessaoDoBarbeiro(): void {
  sessaoDoBarbeiro.limpar();
  sessaoDaBarbearia.limpar();
}
