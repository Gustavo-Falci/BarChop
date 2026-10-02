import { describe, expect, it } from "vitest";
import { prisma } from "@barchop/database";
import { buildApp } from "../../src/app";
import { criarBarbeariaComToken } from "../helpers/barbearia";
import { definirSenhaComCodigo } from "../helpers/cliente";
import { decodificarPayload } from "../helpers/decodificar-token";
import type { App } from "../../src/tipos";

const SENHA = "senha-forte-123";
const TELEFONE = "11999998888";

async function criarConta(app: App, slug: string) {
  return definirSenhaComCodigo(app, slug, { telefone: TELEFONE, senha: SENHA });
}

describe("POST /barbearias/:slug/auth/cliente/login", () => {
  it("devolve token de cliente com a senha certa", async () => {
    const app = buildApp();
    const { slug } = await criarBarbeariaComToken(app);
    await criarConta(app, slug);

    const resposta = await app.inject({
      method: "POST",
      url: `/barbearias/${slug}/auth/cliente/login`,
      payload: { telefone: TELEFONE, senha: SENHA },
    });

    expect(resposta.statusCode).toBe(200);
    expect(decodificarPayload(resposta.json().token).tipo).toBe("cliente");
  });

  it("entra com o telefone escrito de outro jeito", async () => {
    const app = buildApp();
    const { slug } = await criarBarbeariaComToken(app);
    // Cadastro feito com "11999998888"...
    await criarConta(app, slug);

    // ...e login digitando o mesmo número em três formatos diferentes.
    // Sem normalizar dos dois lados, nenhum deles acharia a conta.
    for (const forma of ["(11) 99999-8888", "+55 11 99999-8888", "11 99999 8888"]) {
      const resposta = await app.inject({
        method: "POST",
        url: `/barbearias/${slug}/auth/cliente/login`,
        payload: { telefone: forma, senha: SENHA },
      });

      expect(resposta.statusCode).toBe(200);
    }

    await app.close();
  });

  it("recusa telefone sem DDD com 400, antes de tocar no banco", async () => {
    const app = buildApp();
    const { slug } = await criarBarbeariaComToken(app);

    const resposta = await app.inject({
      method: "POST",
      url: `/barbearias/${slug}/auth/cliente/login`,
      payload: { telefone: "99999-8888", senha: SENHA },
    });

    // 400 e não 401: número sem DDD não é credencial errada, é pedido
    // malformado — não existe formato único que ele possa virar.
    expect(resposta.statusCode).toBe(400);

    await app.close();
  });

  it("responde igual para senha errada e para telefone inexistente", async () => {
    const app = buildApp();
    const { slug } = await criarBarbeariaComToken(app);
    await criarConta(app, slug);

    const senhaErrada = await app.inject({
      method: "POST",
      url: `/barbearias/${slug}/auth/cliente/login`,
      payload: { telefone: TELEFONE, senha: "outra-senha-123" },
    });

    const telefoneInexistente = await app.inject({
      method: "POST",
      url: `/barbearias/${slug}/auth/cliente/login`,
      payload: { telefone: "11888887777", senha: SENHA },
    });

    // Corpo idêntico: distinguir os dois entregaria quais telefones são
    // clientes desta barbearia.
    expect(senhaErrada.statusCode).toBe(401);
    expect(telefoneInexistente.statusCode).toBe(401);
    expect(senhaErrada.json()).toEqual(telefoneInexistente.json());

    // O CÓDIGO concreto, e não só "os dois são iguais": era esta
    // afirmação que faltava. Sem ela a rota pôde responder
    // `nao_autenticado` — o código de token inválido — enquanto o login
    // do barbeiro respondia `credenciais_invalidas`, e a divergência
    // sobreviveu até quebrar uma tela. Comparar as duas respostas entre
    // si não pega isso: elas eram iguais, e iguais no valor errado.
    expect(senhaErrada.json()).toEqual({ erro: "credenciais_invalidas" });
  });

  it("recusa cadastro que ainda não tem senha", async () => {
    const app = buildApp();
    const { slug, barbeariaId } = await criarBarbeariaComToken(app);

    // Cadastro criado pelo barbeiro no walk-in: sem senhaHash.
    await prisma.cliente.create({
      data: { barbeariaId, nome: "João da Silva", telefone: TELEFONE },
    });

    const resposta = await app.inject({
      method: "POST",
      url: `/barbearias/${slug}/auth/cliente/login`,
      payload: { telefone: TELEFONE, senha: SENHA },
    });

    expect(resposta.statusCode).toBe(401);
  });

  it("não alcança cliente de outra barbearia com o mesmo telefone", async () => {
    const app = buildApp();
    const primeira = await criarBarbeariaComToken(app, "um");
    const segunda = await criarBarbeariaComToken(app, "dois");
    await criarConta(app, primeira.slug);

    const resposta = await app.inject({
      method: "POST",
      url: `/barbearias/${segunda.slug}/auth/cliente/login`,
      payload: { telefone: TELEFONE, senha: SENHA },
    });

    // Cliente é por barbearia (@@unique([barbeariaId, telefone])): a
    // conta da primeira não vale na segunda.
    expect(resposta.statusCode).toBe(401);
  });
});
