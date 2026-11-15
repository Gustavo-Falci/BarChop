import { describe, expect, it } from "vitest";
import { prisma } from "@barchop/database";
import { buildApp } from "../../src/app";
import type { CanalDeMemoria, Mensagem } from "../../src/lib/canal";
import { dataParaDate, horaParaDate } from "../../src/lib/horas";
import { normalizarTelefoneObrigatorio } from "../../src/lib/telefone";
import { auth, criarBarbeariaComToken, criarMembroComToken } from "../helpers/barbearia";
import { criarClienteComToken } from "../helpers/cliente";
import type { App } from "../../src/tipos";

// Auditoria de segurança de 15/11: o que a equipe enxerga e muda no
// cadastro de um cliente (SEC-013 e SEC-014).

const TELEFONE = "11999998888";

function enviadas(app: App): Mensagem[] {
  return (app.canal as CanalDeMemoria).enviadas;
}

async function semearAgendamento(barbeariaId: string, barbeiroId: string, clienteId: string, hora: string) {
  const servico = await prisma.servico.create({
    data: { barbeariaId, nome: "Corte", duracaoMinutos: 30, preco: "45.00" },
  });
  const [h, m] = hora.split(":").map(Number);
  const fim = `${String(h).padStart(2, "0")}:${String(m + 30).padStart(2, "0")}`;
  return prisma.agendamento.create({
    data: {
      barbeariaId,
      barbeiroId,
      clienteId,
      data: dataParaDate("2026-09-10"),
      horaInicio: horaParaDate(hora),
      horaFim: horaParaDate(fim),
      servicos: { create: [{ servicoId: servico.id, precoNoMomento: "45.00", duracaoNoMomento: 30 }] },
    },
  });
}

async function cenario() {
  const app = buildApp();
  const dono = await criarBarbeariaComToken(app, "um");
  const profissional = await criarMembroComToken(app, dono.barbeariaId, "profissional", "p");
  const colega = await criarMembroComToken(app, dono.barbeariaId, "profissional", "c");
  const recepcao = await criarMembroComToken(app, dono.barbeariaId, "recepcao", "r");
  return { app, dono, profissional, colega, recepcao };
}

function detalhe(app: App, token: string, clienteId: string) {
  return app.inject({ method: "GET", url: `/clientes/${clienteId}`, headers: auth(token) });
}

function editar(app: App, token: string, clienteId: string, corpo: Record<string, unknown>) {
  return app.inject({ method: "PATCH", url: `/clientes/${clienteId}`, headers: auth(token), payload: corpo });
}

describe("histórico do cliente por papel (SEC-014)", () => {
  it("o profissional vê só os atendimentos dele; dono e recepção, todos", async () => {
    // A agenda já esconde do profissional o que é dos colegas
    // (`agendaVisivel`). O detalhe do cliente devolvia os 50 últimos
    // atendimentos de qualquer um: o que a agenda escondia, o cadastro
    // mostrava.
    const c = await cenario();
    const cliente = await prisma.cliente.create({
      data: { barbeariaId: c.dono.barbeariaId, nome: "João da Silva", telefone: TELEFONE },
    });
    const meu = await semearAgendamento(c.dono.barbeariaId, c.profissional.barbeiroId, cliente.id, "10:00");
    const doColega = await semearAgendamento(c.dono.barbeariaId, c.colega.barbeiroId, cliente.id, "11:00");

    const doProfissional = (await detalhe(c.app, c.profissional.token, cliente.id)).json();
    expect(doProfissional.agendamentos.map((a: { id: string }) => a.id)).toEqual([meu.id]);

    for (const token of [c.dono.token, c.recepcao.token]) {
      const corpo = (await detalhe(c.app, token, cliente.id)).json();
      expect(corpo.agendamentos.map((a: { id: string }) => a.id).sort()).toEqual([meu.id, doColega.id].sort());
    }
    await c.app.close();
  });

  it("o cadastro continua aparecendo pro profissional mesmo sem atendimento dele", async () => {
    // Ele cadastra e acha o cliente (o walk-in chega pra ele): some o
    // histórico dos colegas, não o cliente.
    const c = await cenario();
    const cliente = await prisma.cliente.create({
      data: { barbeariaId: c.dono.barbeariaId, nome: "João da Silva", telefone: TELEFONE },
    });
    await semearAgendamento(c.dono.barbeariaId, c.colega.barbeiroId, cliente.id, "11:00");

    const resposta = await detalhe(c.app, c.profissional.token, cliente.id);

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json().nome).toBe("João da Silva");
    expect(resposta.json().agendamentos).toEqual([]);
    await c.app.close();
  });
});

describe("contato de cadastro que já tem conta (SEC-013)", () => {
  // O e-mail e o telefone são o login e o destino do código de redefinir
  // a senha. Qualquer membro da equipe trocava os dois: bastava pôr um
  // e-mail próprio no cadastro de um cliente, pedir o código e entrar
  // como ele.
  async function comConta() {
    const c = await cenario();
    const { token, clienteId } = await criarClienteComToken(c.app, c.dono.slug, TELEFONE);
    await prisma.cliente.update({ where: { id: clienteId }, data: { email: "joao@exemplo.com" } });
    enviadas(c.app).length = 0;
    return { ...c, tokenDoCliente: token, clienteId };
  }

  it("profissional e recepção não trocam e-mail nem telefone de quem tem conta", async () => {
    const c = await comConta();

    for (const token of [c.profissional.token, c.recepcao.token]) {
      for (const corpo of [{ email: "outro@exemplo.com" }, { email: null }, { telefone: "11988887777" }]) {
        const resposta = await editar(c.app, token, c.clienteId, corpo);
        expect(resposta.statusCode).toBe(403);
        expect(resposta.json().erro).toBe("cliente_com_conta");
      }
    }
    const cliente = await prisma.cliente.findUniqueOrThrow({ where: { id: c.clienteId } });
    expect(cliente.email).toBe("joao@exemplo.com");
    expect(cliente.telefone).toBe(normalizarTelefoneObrigatorio(TELEFONE));
    expect(enviadas(c.app)).toHaveLength(0);
    await c.app.close();
  });

  it("o nome segue aberto à equipe, e reenviar o mesmo contato não é troca", async () => {
    // A tela manda o formulário inteiro: o contato igual ao que já está
    // gravado não pode virar recusa.
    const c = await comConta();

    const resposta = await editar(c.app, c.profissional.token, c.clienteId, {
      nome: "João Souza",
      email: "JOAO@exemplo.com",
      telefone: "(11) 99999-8888",
    });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json().nome).toBe("João Souza");
    expect(enviadas(c.app)).toHaveLength(0);
    await c.app.close();
  });

  it("o dono troca, e o e-mail antigo é avisado", async () => {
    const c = await comConta();

    const resposta = await editar(c.app, c.dono.token, c.clienteId, { email: "novo@exemplo.com" });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json().email).toBe("novo@exemplo.com");
    const avisos = enviadas(c.app);
    expect(avisos).toHaveLength(1);
    expect(avisos[0].para).toBe("joao@exemplo.com");
    expect(avisos[0].texto).toContain("e-mail");
    // O endereço novo não vai no aviso: quem lê o antigo é avisado da
    // troca, e pergunta à barbearia.
    expect(avisos[0].texto).not.toContain("novo@exemplo.com");
    await c.app.close();
  });

  it("o dono troca o telefone, e o e-mail da conta é avisado", async () => {
    const c = await comConta();

    const resposta = await editar(c.app, c.dono.token, c.clienteId, { telefone: "11988887777" });

    expect(resposta.statusCode).toBe(200);
    const avisos = enviadas(c.app);
    expect(avisos).toHaveLength(1);
    expect(avisos[0].para).toBe("joao@exemplo.com");
    expect(avisos[0].texto).toContain("telefone");
    await c.app.close();
  });

  it("cadastro sem conta segue aberto a toda a equipe, sem aviso", async () => {
    // É o caminho de juntar cadastros: o balcão anota o e-mail do
    // cliente que ainda não entrou.
    const c = await cenario();
    const cliente = await prisma.cliente.create({
      data: { barbeariaId: c.dono.barbeariaId, nome: "João da Silva", telefone: TELEFONE, email: "velho@exemplo.com" },
    });

    const resposta = await editar(c.app, c.recepcao.token, cliente.id, {
      email: "joao@exemplo.com",
      telefone: "11988887777",
    });

    expect(resposta.statusCode).toBe(200);
    expect(enviadas(c.app)).toHaveLength(0);
    await c.app.close();
  });

  it("o próprio cliente troca o e-mail, e o antigo é avisado", async () => {
    // Quem tem a sessão troca. O aviso é o que deixa o dono da conta
    // perceber uma troca que não foi ele.
    const c = await comConta();

    const resposta = await c.app.inject({
      method: "PATCH",
      url: "/clientes/me",
      headers: auth(c.tokenDoCliente),
      payload: { email: "novo@exemplo.com" },
    });

    expect(resposta.statusCode).toBe(200);
    const avisos = enviadas(c.app);
    expect(avisos).toHaveLength(1);
    expect(avisos[0].para).toBe("joao@exemplo.com");
    expect(avisos[0].texto).not.toContain("novo@exemplo.com");
    await c.app.close();
  });

  it("o cliente mandar o mesmo e-mail, ou só o nome, não gera aviso", async () => {
    const c = await comConta();

    for (const payload of [{ email: "Joao@Exemplo.com" }, { nome: "João Souza" }]) {
      const resposta = await c.app.inject({
        method: "PATCH",
        url: "/clientes/me",
        headers: auth(c.tokenDoCliente),
        payload,
      });
      expect(resposta.statusCode).toBe(200);
    }
    expect(enviadas(c.app)).toHaveLength(0);
    await c.app.close();
  });
});
