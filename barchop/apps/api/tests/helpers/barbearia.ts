import { prisma } from "@barchop/database";
import { gerarHashSenha } from "../../src/lib/senha";
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

export interface MembroDeTeste {
  token: string;
  barbeiroId: string;
}

// Um membro da equipe com papel e senha, já logado. Criado direto no
// banco, e não pela rota de equipe: os testes de papel não podem
// depender da rota que eles mesmos protegem.
export async function criarMembroComToken(
  app: App,
  barbeariaId: string,
  papel: "dono" | "profissional" | "recepcao",
  sufixo: string
): Promise<MembroDeTeste> {
  const email = `${papel}-${sufixo}@exemplo.com`;
  const membro = await prisma.barbeiro.create({
    data: {
      barbeariaId,
      nome: `Membro ${sufixo}`,
      email,
      senhaHash: await gerarHashSenha("senha-forte-123"),
      papel,
      atende: papel !== "recepcao",
    },
  });

  const resposta = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: { email, senha: "senha-forte-123" },
  });
  if (resposta.statusCode !== 200) {
    throw new Error(`login do membro falhou: ${resposta.statusCode} ${resposta.body}`);
  }

  return { token: resposta.json().token, barbeiroId: membro.id };
}
