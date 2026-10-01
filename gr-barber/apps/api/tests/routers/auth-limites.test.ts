import { describe, expect, it } from "vitest";
import { buildApp } from "../../src/app";
import { criarBarbeariaComToken } from "../helpers/barbearia";
import { definirSenhaComCodigo } from "../helpers/cliente";
import type { App } from "../../src/tipos";

// Os limites moram em src/lib/limites.ts. Estes números são os de lá; se
// eles mudarem, é aqui que o teste avisa.
const MAX_POR_CONTA = 10;
const MAX_SIGNUP_BARBEIRO = 5;

const SENHA = "senha-forte-123";

// Cada teste chama buildApp(), e cada app tem o próprio contador em
// memória — é isso que impede um arquivo de teste de gastar o orçamento
// do outro. Vale lembrar antes de mover qualquer coisa pra um beforeAll
// compartilhado.
function loginDoBarbeiro(app: App, email: string, senha = "errada12") {
  return app.inject({
    method: "POST",
    url: "/auth/login",
    payload: { email, senha },
  });
}

async function gastarOrcamento(app: App, email: string) {
  for (let tentativa = 0; tentativa < MAX_POR_CONTA; tentativa += 1) {
    const resposta = await loginDoBarbeiro(app, email);
    // A garantia de que o orçamento foi gasto com 401, e não que o
    // limite já tinha estourado antes da hora.
    expect(resposta.statusCode).toBe(401);
  }
}

describe("limite de tentativas de login", () => {
  it("recusa a tentativa seguinte ao limite com 429 e tentativas_excedidas", async () => {
    // Sem limite, adivinhar senha é de graça: a rota responde igual pra
    // conta inexistente e pra senha errada, e nada se cansa.
    const app = buildApp();
    await criarBarbeariaComToken(app);

    await gastarOrcamento(app, "um@exemplo.com");
    const bloqueada = await loginDoBarbeiro(app, "um@exemplo.com");

    expect(bloqueada.statusCode).toBe(429);
    expect(bloqueada.json().erro).toBe("tentativas_excedidas");
    // Mensagem nossa, em português: a do plugin é "retry in 1 minute", e
    // ela viraria texto de tela. Com maiúscula e ponto, sem o /i: as
    // telas põem esta string como o aviso inteiro, e minúscula ficaria
    // torta ao lado de "E-mail ou senha incorretos."
    expect(bloqueada.json().mensagem).toMatch(
      /^Muitas tentativas\. Tente de novo em .+\.$/
    );
    // O plugin põe o Retry-After antes de lançar; é o que diz à tela (e
    // a qualquer cliente HTTP) quanto esperar.
    expect(Number(bloqueada.headers["retry-after"])).toBeGreaterThan(0);
  });

  it("a senha certa também é recusada enquanto o limite vale", async () => {
    // O limite não é um filtro de senha errada: ele fecha a rota pra
    // aquela conta. Se a senha certa passasse, bastaria intercalar.
    const app = buildApp();
    await criarBarbeariaComToken(app);

    await gastarOrcamento(app, "um@exemplo.com");
    const comSenhaCerta = await loginDoBarbeiro(app, "um@exemplo.com", SENHA);

    expect(comSenhaCerta.statusCode).toBe(429);
  });

  it("variar a caixa do e-mail não renova o orçamento", async () => {
    // A chave do contador é o e-mail normalizado. Com o texto cru,
    // alternar maiúsculas daria orçamento novo a cada variação — e o
    // login acha a conta do mesmo jeito, porque ele também normaliza.
    const app = buildApp();
    await criarBarbeariaComToken(app);

    await gastarOrcamento(app, "um@exemplo.com");

    for (const variacao of ["UM@exemplo.com", "Um@Exemplo.Com", "um@EXEMPLO.com"]) {
      const resposta = await loginDoBarbeiro(app, variacao);
      expect(resposta.statusCode).toBe(429);
    }
  });

  it("o limite é da conta, não da API: outro e-mail continua entrando", async () => {
    // Se fosse global, quem esgotasse o próprio orçamento trancaria
    // todas as barbearias da plataforma.
    const app = buildApp();
    await criarBarbeariaComToken(app, "um");
    await criarBarbeariaComToken(app, "dois");

    await gastarOrcamento(app, "um@exemplo.com");

    const outra = await loginDoBarbeiro(app, "dois@exemplo.com", SENHA);
    expect(outra.statusCode).toBe(200);
  });

  it("gastar o orçamento do login não fecha o signup", async () => {
    // Chaves com prefixos diferentes. Sem eles, uma tentativa de login
    // gastaria o orçamento do signup do mesmo IP, e um limite explicaria
    // o bloqueio do outro.
    const app = buildApp();
    await criarBarbeariaComToken(app, "um");

    await gastarOrcamento(app, "um@exemplo.com");

    const resposta = await app.inject({
      method: "POST",
      url: "/auth/signup",
      payload: {
        barbearia: { nome: "Barbearia Nova", slug: "barbearia-nova" },
        barbeiro: { nome: "Novo", email: "novo@exemplo.com", senha: SENHA },
      },
    });

    expect(resposta.statusCode).toBe(201);
  });
});

describe("limite de signup de barbearia", () => {
  it("recusa o signup seguinte ao limite do IP", async () => {
    // Criar barbearia é raro — uma vez por cliente da plataforma. É
    // também o que estreita a sondagem de e-mails que o 409 permite:
    // sondar em série deixou de ser grátis.
    const app = buildApp();

    for (let indice = 0; indice < MAX_SIGNUP_BARBEIRO; indice += 1) {
      const resposta = await app.inject({
        method: "POST",
        url: "/auth/signup",
        payload: {
          barbearia: { nome: `Barbearia ${indice}`, slug: `barbearia-${indice}` },
          barbeiro: {
            nome: `Barbeiro ${indice}`,
            email: `barbeiro-${indice}@exemplo.com`,
            senha: SENHA,
          },
        },
      });
      expect(resposta.statusCode).toBe(201);
    }

    const bloqueado = await app.inject({
      method: "POST",
      url: "/auth/signup",
      payload: {
        barbearia: { nome: "Barbearia Extra", slug: "barbearia-extra" },
        barbeiro: { nome: "Extra", email: "extra@exemplo.com", senha: SENHA },
      },
    });

    expect(bloqueado.statusCode).toBe(429);
    expect(bloqueado.json().erro).toBe("tentativas_excedidas");
  });
});

describe("limite de login do cliente", () => {
  const TELEFONE = "11999998888";

  async function criarConta(app: App, slug: string) {
    const resposta = await definirSenhaComCodigo(app, slug, { telefone: TELEFONE, senha: SENHA });
    expect(resposta.statusCode).toBe(201);
  }

  function login(app: App, slug: string, telefone = TELEFONE, senha = "errada12") {
    return app.inject({
      method: "POST",
      url: `/barbearias/${slug}/auth/cliente/login`,
      payload: { telefone, senha },
    });
  }

  it("recusa a tentativa seguinte ao limite daquele telefone", async () => {
    const app = buildApp();
    const { slug } = await criarBarbeariaComToken(app);
    await criarConta(app, slug);

    for (let tentativa = 0; tentativa < MAX_POR_CONTA; tentativa += 1) {
      expect((await login(app, slug)).statusCode).toBe(401);
    }

    const bloqueada = await login(app, slug);
    expect(bloqueada.statusCode).toBe(429);
    expect(bloqueada.json().erro).toBe("tentativas_excedidas");
  });

  it("escrever o telefone de outro jeito não renova o orçamento", async () => {
    // Mesmo motivo da caixa do e-mail, e a mesma normalização que o
    // login usa pra achar a conta: sem ela, trocar a pontuação daria
    // orçamento novo e o limite não limitaria nada.
    const app = buildApp();
    const { slug } = await criarBarbeariaComToken(app);
    await criarConta(app, slug);

    for (let tentativa = 0; tentativa < MAX_POR_CONTA; tentativa += 1) {
      expect((await login(app, slug)).statusCode).toBe(401);
    }

    for (const forma of ["(11) 99999-8888", "+55 11 99999-8888", "11 99999 8888"]) {
      expect((await login(app, slug, forma)).statusCode).toBe(429);
    }
  });

  it("o limite é por barbearia: o mesmo telefone na outra continua entrando", async () => {
    // O login do cliente é por barbearia — o mesmo número em duas são
    // duas contas, e uma não pode gastar o limite da outra.
    const app = buildApp();
    const primeira = await criarBarbeariaComToken(app, "um");
    const segunda = await criarBarbeariaComToken(app, "dois");
    await criarConta(app, primeira.slug);
    await criarConta(app, segunda.slug);

    for (let tentativa = 0; tentativa < MAX_POR_CONTA; tentativa += 1) {
      expect((await login(app, primeira.slug)).statusCode).toBe(401);
    }

    expect((await login(app, primeira.slug)).statusCode).toBe(429);
    expect((await login(app, segunda.slug, TELEFONE, SENHA)).statusCode).toBe(200);
  });
});

describe("limite de pedido de código", () => {
  const TELEFONE = "11988887777";
  const MAX_CODIGO_POR_TELEFONE = 3;

  it("recusa o pedido seguinte ao limite daquele telefone", async () => {
    // Cada pedido é uma mensagem paga no provedor e um incômodo no
    // celular de alguém. Sem teto por destino, qualquer um dispara
    // códigos em série pro número de outra pessoa.
    const app = buildApp();
    const { slug } = await criarBarbeariaComToken(app);

    function pedir() {
      return app.inject({
        method: "POST",
        url: `/barbearias/${slug}/auth/cliente/codigo`,
        payload: { telefone: TELEFONE },
      });
    }

    for (let pedido = 0; pedido < MAX_CODIGO_POR_TELEFONE; pedido += 1) {
      expect((await pedir()).statusCode).toBe(202);
    }

    const bloqueado = await pedir();
    expect(bloqueado.statusCode).toBe(429);
    expect(bloqueado.json().erro).toBe("tentativas_excedidas");
  });
});

describe("limite de definir senha", () => {
  const TELEFONE = "11988887777";

  it("recusa a tentativa seguinte ao limite daquele telefone", async () => {
    // O teto de tentativas do código já segura quem chuta um código; este
    // segura quem chuta muitos, pedindo códigos novos entre um e outro.
    const app = buildApp();
    const { slug } = await criarBarbeariaComToken(app);

    function definir() {
      return app.inject({
        method: "POST",
        url: `/barbearias/${slug}/auth/cliente/senha`,
        payload: { telefone: TELEFONE, codigo: "000000", senha: SENHA, nome: "Maria Souza" },
      });
    }

    for (let tentativa = 0; tentativa < MAX_POR_CONTA; tentativa += 1) {
      expect((await definir()).statusCode).toBe(422);
    }

    const bloqueado = await definir();
    expect(bloqueado.statusCode).toBe(429);
    expect(bloqueado.json().erro).toBe("tentativas_excedidas");
  });
});

describe("o escopo dos limites não perde o que vem da raiz", () => {
  it("o preflight de CORS continua respondendo em /auth/login", async () => {
    // As quatro rotas de auth mudaram pra um `app.register` encapsulado,
    // pra poder dar `await` no plugin de limite. O @fastify/cors é `fp` e
    // carrega antes, então deveria continuar valendo lá dentro — mas se
    // não valesse, o login quebraria só no navegador, onde teste nenhum
    // olha.
    const app = buildApp();

    const resposta = await app.inject({
      method: "OPTIONS",
      url: "/auth/login",
      headers: {
        origin: "http://localhost:3000",
        "access-control-request-method": "POST",
      },
    });

    expect(resposta.statusCode).toBeLessThan(300);
    expect(resposta.headers["access-control-allow-origin"]).toBe(
      "http://localhost:3000"
    );
  });
});
