// Duas identidades, dois tokens. Os escopos da API recusam o token um
// do outro (autenticar rejeita payload de cliente e vice-versa), então
// guardar na mesma chave faria a primeira tela que misturasse as duas
// receber 401 sem explicação.
//
// localStorage é legível por XSS. A alternativa — cookie httpOnly posto
// por route handler do Next — obrigaria a proxiar a API inteira, e está
// registrada como dívida na spec desta fase.
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

export const sessaoDoBarbeiro = sessaoNaChave("sessao.barbeiro");

// Por barbearia, porque o login do cliente é por barbearia: o token que
// vale em /barbearias/gr-barber não vale na de ninguém mais.
export function sessaoDoCliente(slug: string): Sessao {
  return sessaoNaChave(`sessao.cliente.${slug}`);
}

// O slug não vem do GET /me, que devolve só barbeariaId — ele chega no
// SessaoBarbeiro do login e do signup, e a tela de novo agendamento
// precisa dele para a disponibilidade, que é rota pública por slug.
export const sessaoDaBarbearia = sessaoNaChave("sessao.barbearia");

// Uma função e não duas chamadas soltas: um logout que esquecesse o
// slug deixaria lixo que a próxima sessão leria como se fosse dela.
export function encerrarSessaoDoBarbeiro(): void {
  sessaoDoBarbeiro.limpar();
  sessaoDaBarbearia.limpar();
}
