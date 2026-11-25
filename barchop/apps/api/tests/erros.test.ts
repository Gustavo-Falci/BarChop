import { describe, expect, it } from "vitest";
import { prisma } from "@barchop/database";
import { buildApp } from "../src/app";
import { prepararAgenda } from "./helpers/agenda";
import { ErroDeNegocio } from "../src/lib/erro-negocio";
import { conflito, naoEncontrado } from "../src/lib/erro-http";

describe("tratamento de erros", () => {
  it("traduz ErroDeNegocio pra 422", async () => {
    const app = buildApp();
    app.get("/teste-negocio", async () => {
      throw new ErroDeNegocio("horário indisponível", "horario_indisponivel");
    });

    const resposta = await app.inject({ method: "GET", url: "/teste-negocio" });

    expect(resposta.statusCode).toBe(422);
    expect(resposta.json()).toEqual({
      erro: "horario_indisponivel",
      mensagem: "horário indisponível",
    });

    await app.close();
  });

  it("traduz P2025 do Prisma pra 404", async () => {
    const app = buildApp();
    const resposta = await app.inject({
      method: "GET",
      url: "/barbearias/nao-existe/servicos",
    });

    expect(resposta.statusCode).toBe(404);
    expect(resposta.json()).toEqual({ erro: "nao_encontrado" });

    await app.close();
  });

  it("mantém o 400 da validação de schema do Fastify", async () => {
    const app = buildApp();
    const resposta = await app.inject({
      method: "POST",
      url: "/auth/login",
      // Falta a senha: o schema recusa antes de a rota rodar.
      payload: { email: "gu@exemplo.com" },
    });

    expect(resposta.statusCode).toBe(400);
    // Fixar o corpo, não só o status: o FST_ERR_VALIDATION do Fastify
    // saía no campo `erro` e nada aqui reclamava.
    expect(resposta.json().erro).toBe("requisicao_invalida");
    expect(resposta.body).not.toContain("FST_ERR");

    await app.close();
  });

  it("devolve o mesmo formato de erro em rota inexistente", async () => {
    const app = buildApp();
    const resposta = await app.inject({
      method: "GET",
      url: "/rota-inexistente",
    });

    // Sem setNotFoundHandler o Fastify devolveria { message, error,
    // statusCode } — uma segunda forma de erro, incompatível com a
    // nossa, na mesma API.
    expect(resposta.statusCode).toBe(404);
    expect(resposta.json()).toEqual({ erro: "nao_encontrado" });

    await app.close();
  });

  it("normaliza qualquer 401 para nao_autenticado", async () => {
    const app = buildApp();
    app.get("/teste-401", async () => {
      // Imita o formato do que o @fastify/jwt lança: statusCode 401 com
      // um code interno do plugin. O contrato da API não deve expor esse
      // nome — as telas ramificariam em cima dele.
      const erro = new Error("token ausente") as Error & {
        statusCode: number;
        code: string;
      };
      erro.statusCode = 401;
      erro.code = "FST_JWT_NO_AUTHORIZATION_IN_HEADER";
      throw erro;
    });

    const resposta = await app.inject({ method: "GET", url: "/teste-401" });

    expect(resposta.statusCode).toBe(401);
    expect(resposta.json()).toEqual({ erro: "nao_autenticado" });
    expect(resposta.body).not.toContain("FST_JWT");

    await app.close();
  });

  it("trata o 400 do @fastify/jwt como falha de autenticação", async () => {
    const app = buildApp();
    app.get("/teste-jwt-400", async () => {
      // O plugin lança isto quando o cabeçalho Authorization existe mas
      // não está no formato "Bearer <token>".
      const erro = new Error(
        "Format is Authorization: Bearer [token]"
      ) as Error & { statusCode: number; code: string };
      erro.statusCode = 400;
      erro.code = "FST_JWT_BAD_REQUEST";
      throw erro;
    });

    const resposta = await app.inject({ method: "GET", url: "/teste-jwt-400" });

    expect(resposta.statusCode).toBe(401);
    expect(resposta.json()).toEqual({ erro: "nao_autenticado" });
    expect(resposta.body).not.toContain("FST_JWT");

    await app.close();
  });

  it("esconde erro inesperado atrás de 500 genérico", async () => {
    const app = buildApp();
    app.get("/teste-explosao", async () => {
      throw new Error("detalhe interno que não pode vazar");
    });

    const resposta = await app.inject({ method: "GET", url: "/teste-explosao" });

    expect(resposta.statusCode).toBe(500);
    expect(resposta.json()).toEqual({ erro: "erro_interno" });
    expect(resposta.body).not.toContain("detalhe interno");

    await app.close();
  });
  it("traduz ErroHttp de 404 com o código nao_encontrado", async () => {
    const app = buildApp();
    app.get("/teste-404", async () => {
      throw naoEncontrado("serviço não encontrado");
    });

    const resposta = await app.inject({ method: "GET", url: "/teste-404" });

    expect(resposta.statusCode).toBe(404);
    // O bug que este caso fecha: com o status certo no cabeçalho, o
    // corpo saía como `requisicao_invalida` — e as telas ramificam no
    // corpo, não no status.
    expect(resposta.json().erro).toBe("nao_encontrado");

    await app.close();
  });

  it("traduz ErroHttp de 409 com o código conflito", async () => {
    const app = buildApp();
    app.get("/teste-409", async () => {
      throw conflito("telefone já cadastrado nesta barbearia");
    });

    const resposta = await app.inject({ method: "GET", url: "/teste-409" });

    expect(resposta.statusCode).toBe(409);
    expect(resposta.json()).toEqual({
      erro: "conflito",
      mensagem: "telefone já cadastrado nesta barbearia",
    });

    await app.close();
  });

  it("dá código próprio a erro cru de 403 e de 409", async () => {
    const app = buildApp();
    app.get("/teste-403-cru", async () => {
      // Erro de biblioteca: tem statusCode, não tem código nosso. Antes,
      // qualquer coisa assim virava `requisicao_invalida`.
      throw Object.assign(new Error("proibido"), { statusCode: 403 });
    });
    app.get("/teste-409-cru", async () => {
      throw Object.assign(new Error("conflitou"), { statusCode: 409 });
    });

    const proibido = await app.inject({ method: "GET", url: "/teste-403-cru" });
    expect(proibido.statusCode).toBe(403);
    expect(proibido.json().erro).toBe("acesso_negado");

    const conflitou = await app.inject({ method: "GET", url: "/teste-409-cru" });
    expect(conflitou.statusCode).toBe(409);
    expect(conflitou.json().erro).toBe("conflito");

    await app.close();
  });

  it("traduz id fora do formato UUID pra 400", async () => {
    const app = buildApp();
    app.get("/teste-uuid-torto", async () => {
      // O Postgres recusa "nao-e-uuid" numa coluna uuid (22P02) e o
      // Prisma lança P2007 (era P2023 no Prisma 5). Sem tratamento isso
      // vira 500 — bug nosso — quando quem errou foi o chamador.
      return prisma.servico.findUniqueOrThrow({ where: { id: "nao-e-uuid" } });
    });

    const resposta = await app.inject({
      method: "GET",
      url: "/teste-uuid-torto",
    });

    expect(resposta.statusCode).toBe(400);
    expect(resposta.json().erro).toBe("requisicao_invalida");
    // A mensagem crua do Prisma traz nome de coluna e SQL; nada disso
    // pode sair no contrato.
    expect(resposta.body).not.toContain("Inconsistent column data");

    await app.close();
  });
  // A violação sai do banco de verdade: duas linhas no mesmo horário,
  // gravadas direto, sem a checagem de disponibilidade que pegaria antes
  // (essa é a janela que só a EXCLUDE fecha). O formato do erro mudou do
  // Prisma 5 pro 7; montado à mão, o teste passaria com o formato errado.
  //
  // A rota entra antes do prepararAgenda: o primeiro `inject` deixa o
  // Fastify pronto, e depois disso ele não aceita rota nova.
  async function rotaQueViolaAExclusao(app: ReturnType<typeof buildApp>, url: string) {
    const pronta: { agenda?: Awaited<ReturnType<typeof prepararAgenda>> } = {};
    app.get(url, async () => {
      const agenda = pronta.agenda;
      const linha = {
        barbeariaId: agenda!.barbeariaId,
        barbeiroId: agenda!.barbeiroId,
        clienteId: agenda!.cliente.id,
        data: new Date(Date.UTC(2026, 8, 10)),
        horaInicio: new Date(Date.UTC(1970, 0, 1, 10, 0)),
        horaFim: new Date(Date.UTC(1970, 0, 1, 10, 45)),
      };
      await prisma.agendamento.create({ data: linha });
      return prisma.agendamento.create({ data: linha });
    });
    pronta.agenda = await prepararAgenda(app);
  }

  it("traduz a violação da sem_conflito_horario em 409", async () => {
    const app = buildApp();
    await rotaQueViolaAExclusao(app, "/teste-23p01");

    const resposta = await app.inject({ method: "GET", url: "/teste-23p01" });

    expect(resposta.statusCode).toBe(409);
    expect(resposta.json().erro).toBe("horario_ocupado");

    await app.close();
  });

  it("não vaza a mensagem crua do Postgres no 409 de conflito", async () => {
    const app = buildApp();
    await rotaQueViolaAExclusao(app, "/teste-23p01-vazamento");

    const resposta = await app.inject({
      method: "GET",
      url: "/teste-23p01-vazamento",
    });

    // A mensagem crua traz o caminho do arquivo que fez a query e os
    // valores da chave em conflito — o id do barbeiro, a data e a hora
    // do agendamento alheio. É o oposto do que uma rota pública pode
    // devolver.
    expect(resposta.body).not.toContain("Invalid `prisma");
    expect(resposta.body).not.toContain("erros.test");
    expect(resposta.body).not.toContain("23P01");
    expect(resposta.body).not.toContain("sem_conflito_horario");

    await app.close();
  });

  it("não confunde outro erro do banco com conflito", async () => {
    const app = buildApp();
    app.get("/teste-outro-erro", async () => {
      // Erro de verdade do Postgres (22012), sem a EXCLUDE no meio:
      // continua sendo bug nosso, continua 500.
      return prisma.$executeRawUnsafe("select 1/0");
    });

    const resposta = await app.inject({
      method: "GET",
      url: "/teste-outro-erro",
    });

    expect(resposta.statusCode).toBe(500);
    expect(resposta.json()).toEqual({ erro: "erro_interno" });

    await app.close();
  });
  it("não expõe mais a calculadora sem estado", async () => {
    const app = buildApp();

    // Substituída pelas rotas de disponibilidade que leem do banco: esta
    // recebia horário de funcionamento e agendamentos pelo corpo, o que
    // nenhuma tela tem — e quem tivesse poderia mentir.
    const resposta = await app.inject({
      method: "POST",
      url: "/disponibilidade",
      payload: { duracaoTotalMinutos: 45 },
    });

    expect(resposta.statusCode).toBe(404);
    expect(resposta.json()).toEqual({ erro: "nao_encontrado" });

    await app.close();
  });
});
