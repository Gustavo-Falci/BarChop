import { describe, expect, it } from "vitest";
import { prisma } from "@barchop/database";
import { buildApp } from "../../src/app";
import { assinarSessao } from "../../src/plugins/auth";
import type { App } from "../../src/tipos";
import { prepararAgenda } from "../helpers/agenda";
import { auth } from "../helpers/barbearia";
import { criarClienteComToken } from "../helpers/cliente";
import { QUINTA } from "../helpers/datas";

// Auditoria de segurança de 15/11, SEC-001. O telefone nunca é provado
// (no piloto o código só sai por e-mail), e era ele a chave do cadastro:
// quem criasse a conta primeiro com o número de outra pessoa passava a
// receber, na própria conta, os horários que ela marcasse pelo link — e
// podia ver e cancelar.
//
// A regra agora: horário marcado pelo link só entra num cadastro que tem
// senha quando vem com o token daquele cliente. Sem ele, a resposta pede
// o login e nada é criado.

const TELEFONE = "11987654321";

type Agenda = Awaited<ReturnType<typeof prepararAgenda>>;

function agendar(
  app: App,
  agenda: Agenda,
  { token, telefone = TELEFONE, hora = "10:00" }: { token?: string; telefone?: string; hora?: string } = {}
) {
  return app.inject({
    method: "POST",
    url: `/barbearias/${agenda.slug}/agendamentos`,
    headers: token ? auth(token) : {},
    payload: {
      barbeiroId: agenda.barbeiroId,
      servicoIds: [agenda.servico.id],
      data: QUINTA,
      horaInicio: hora,
      cliente: { nome: "Vítima da Silva", telefone },
    },
  });
}

async function horariosDaConta(app: App, token: string): Promise<unknown[]> {
  const resposta = await app.inject({ method: "GET", url: "/clientes/me/agendamentos", headers: auth(token) });
  expect(resposta.statusCode).toBe(200);
  const corpo = resposta.json();
  return Array.isArray(corpo) ? corpo : (corpo.agendamentos ?? corpo.itens ?? []);
}

describe("agendamento pelo link com telefone de quem tem conta", () => {
  it("sem login, não entra na conta: pede pra entrar e não cria nada", async () => {
    // A conta com o telefone de outra pessoa já existe. Ela marca pelo
    // link, sem conta: antes, o horário caía na conta de quem chegou
    // primeiro.
    const app = buildApp();
    const agenda = await prepararAgenda(app);
    const dono = await criarClienteComToken(app, agenda.slug, TELEFONE);

    const resposta = await agendar(app, agenda);

    expect(resposta.statusCode).toBe(422);
    expect(resposta.json()).toEqual({
      erro: "telefone_com_conta",
      mensagem: "Esse telefone já tem conta nesta barbearia. Entre para agendar.",
    });
    expect(await prisma.agendamento.count()).toBe(0);
    expect(await prisma.notificacao.count()).toBe(0);
    expect(await horariosDaConta(app, dono.token)).toHaveLength(0);
    await app.close();
  });

  it("escrever o telefone de outro jeito não passa pela regra", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);
    await criarClienteComToken(app, agenda.slug, TELEFONE);

    const resposta = await agendar(app, agenda, { telefone: "(11) 98765-4321" });

    expect(resposta.statusCode).toBe(422);
    expect(resposta.json().erro).toBe("telefone_com_conta");
    await app.close();
  });

  it("logado, o dono da conta agenda e o horário aparece na conta dele", async () => {
    // É o caminho de quem tem conta: a tela manda o token junto.
    const app = buildApp();
    const agenda = await prepararAgenda(app);
    const dono = await criarClienteComToken(app, agenda.slug, TELEFONE);

    const resposta = await agendar(app, agenda, { token: dono.token });

    expect(resposta.statusCode).toBe(201);
    expect(await horariosDaConta(app, dono.token)).toHaveLength(1);
    await app.close();
  });

  it("o token de outra conta não abre o telefone desta", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);
    await criarClienteComToken(app, agenda.slug, TELEFONE);
    const outro = await criarClienteComToken(app, agenda.slug, "11911112222");

    const resposta = await agendar(app, agenda, { token: outro.token });

    expect(resposta.statusCode).toBe(422);
    expect(resposta.json().erro).toBe("telefone_com_conta");
    expect(await prisma.agendamento.count()).toBe(0);
    await app.close();
  });

  it("token vencido, de membro da equipe ou lixo vale como não estar logado", async () => {
    // Nunca 401: a rota é pública, e quem não tem conta naquele telefone
    // segue agendando com um token torto no navegador.
    const app = buildApp();
    const agenda = await prepararAgenda(app);
    const dono = await criarClienteComToken(app, agenda.slug, TELEFONE);
    await app.ready();
    const vencido = app.jwt.sign({
      tipo: "cliente",
      clienteId: dono.clienteId,
      barbeariaId: agenda.barbeariaId,
      exp: Math.floor(Date.now() / 1000) - 60,
    } as never);
    const daEquipe = assinarSessao(app, {
      tipo: "barbeiro",
      barbeiroId: agenda.barbeiroId,
      barbeariaId: agenda.barbeariaId,
    });

    for (const token of [vencido, daEquipe, "lixo"]) {
      const comConta = await agendar(app, agenda, { token });
      expect(comConta.statusCode).toBe(422);
      expect(comConta.json().erro).toBe("telefone_com_conta");
    }
    const semConta = await agendar(app, agenda, { token: "lixo", telefone: "11933334444" });
    expect(semConta.statusCode).toBe(201);
    await app.close();
  });

  it("cadastro sem senha continua recebendo o horário pelo telefone", async () => {
    // O cliente recorrente que nunca criou conta: é pelo telefone que o
    // barbeiro o reconhece, e isso não muda.
    const app = buildApp();
    const agenda = await prepararAgenda(app);

    const primeiro = await agendar(app, agenda, { hora: "10:00" });
    const segundo = await agendar(app, agenda, { hora: "11:00" });

    expect(primeiro.statusCode).toBe(201);
    expect(segundo.statusCode).toBe(201);
    expect(await prisma.cliente.count({ where: { telefone: { contains: "98765" } } })).toBe(1);
    await app.close();
  });

  it("a conta é por barbearia: o mesmo telefone agenda sem login na outra", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);
    const outra = await prepararAgenda(app, { sufixo: "dois" });
    await criarClienteComToken(app, agenda.slug, TELEFONE);

    const resposta = await agendar(app, outra);

    expect(resposta.statusCode).toBe(201);
    await app.close();
  });
});
