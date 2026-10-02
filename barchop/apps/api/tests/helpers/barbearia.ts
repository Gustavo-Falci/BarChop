import type { App } from "../../src/tipos";

export interface BarbeariaDeTeste {
  token: string;
  barbeariaId: string;
  barbeiroId: string;
  slug: string;
}

// Cria uma barbearia com barbeiro e devolve o token pronto. Quase todo
// teste desta fase precisa de duas: a que faz a requisição e uma
// segunda, que existe só pra provar que o recurso dela não é alcançável
// — o 404 cruzado entre barbearias é o ponto da fase inteira.
//
// O `sufixo` entra no slug e no email, então tem que casar com o pattern
// do signup: minúsculas, dígitos e hífen.
export async function criarBarbeariaComToken(
  app: App,
  sufixo = "um"
): Promise<BarbeariaDeTeste> {
  const resposta = await app.inject({
    method: "POST",
    url: "/auth/signup",
    payload: {
      barbearia: { nome: `Barbearia ${sufixo}`, slug: `barbearia-${sufixo}` },
      barbeiro: {
        nome: `Barbeiro ${sufixo}`,
        email: `${sufixo}@exemplo.com`,
        senha: "senha-forte-123",
      },
    },
  });

  // Sem esta guarda, um signup quebrado apareceria como "token
  // undefined" lá adiante, num 401 confuso a três arquivos de distância.
  if (resposta.statusCode !== 201) {
    throw new Error(
      `signup falhou no helper: ${resposta.statusCode} ${resposta.body}`
    );
  }

  const corpo = resposta.json();
  return {
    token: corpo.token,
    barbeariaId: corpo.barbearia.id,
    barbeiroId: corpo.barbeiro.id,
    slug: corpo.barbearia.slug,
  };
}

export function auth(token: string): { authorization: string } {
  return { authorization: `Bearer ${token}` };
}
