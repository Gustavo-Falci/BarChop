import { describe, expect, it } from "vitest";
import { prisma } from "@barchop/database";
import { buildApp } from "../../src/app";
import { assinarTokenDoLembrete, instanteNaBarbearia } from "../../src/lib/lembrete";
import { ocultarTokenDoLembrete } from "../../src/routers/lembretes";
import type { App } from "../../src/tipos";
import { auth } from "../helpers/barbearia";
import { criarClienteComToken } from "../helpers/cliente";
import { QUINTA } from "../helpers/datas";
import { marcarPeloPainel, prepararAgenda } from "../helpers/agenda";

// O destino do link do e-mail: o cliente confirma ou cancela sem login.
// Quem prova que ele pode é o token, assinado pela API, que vale só pra
// esse agendamento e só até o horário começar.
async function cenario() {
  const app = buildApp();
  const agenda = await prepararAgenda(app, { email: "joao@exemplo.com" });
  const agendamento = await marcarPeloPainel(app, agenda, { data: QUINTA, horaInicio: "10:00" });
  await app.ready();
  const token = assinarTokenDoLembrete(app, {
    agendamentoId: agendamento.id,
    expiraEm: instanteNaBarbearia(QUINTA, "10:00"),
  });
  return { app, agenda, agendamento, token };
}

function post(app: App, token: string, acao: "confirmar" | "cancelar") {
  return app.inject({ method: "POST", url: `/lembretes/${token}/${acao}` });
}

describe("GET /lembretes/:token", () => {
  it("mostra o agendamento pra tela de confirmar ou cancelar", async () => {
    const { app, agendamento, token } = await cenario();

    const resposta = await app.inject({ method: "GET", url: `/lembretes/${token}` });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toEqual({
      agendamento: {
        id: agendamento.id,
        data: QUINTA,
        horaInicio: "10:00",
        status: "confirmado",
        presencaConfirmadaEm: null,
        // O prazo de cancelar e o contato (painel v2, 3g): passado o
        // prazo, a tela esconde o Cancelar e mostra com quem falar.
        barbearia: {
          nome: "Barbearia um",
          slug: "barbearia-um",
          prazoCancelarHoras: 0,
          whatsapp: null,
          telefone: null,
        },
        barbeiro: { nome: "Barbeiro um" },
        servicos: [{ nome: "Corte" }],
      },
    });
  });

  it("ler não confirma nada: o leitor de e-mail abre links sozinho", async () => {
    const { app, agendamento, token } = await cenario();

    await app.inject({ method: "GET", url: `/lembretes/${token}` });

    const gravado = await prisma.agendamento.findUniqueOrThrow({ where: { id: agendamento.id } });
    expect(gravado.presencaConfirmadaEm).toBeNull();
    expect(gravado.status).toBe("confirmado");
  });
});

describe("POST /lembretes/:token/confirmar", () => {
  it("grava a confirmação de presença", async () => {
    const { app, agendamento, token } = await cenario();

    const resposta = await post(app, token, "confirmar");

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json().agendamento.presencaConfirmadaEm).not.toBeNull();
    const gravado = await prisma.agendamento.findUniqueOrThrow({ where: { id: agendamento.id } });
    expect(gravado.presencaConfirmadaEm).not.toBeNull();
  });

  it("confirmar de novo devolve a mesma confirmação", async () => {
    const { app, token } = await cenario();

    const primeira = (await post(app, token, "confirmar")).json();
    const segunda = await post(app, token, "confirmar");

    expect(segunda.statusCode).toBe(200);
    expect(segunda.json().agendamento.presencaConfirmadaEm).toBe(
      primeira.agendamento.presencaConfirmadaEm
    );
  });

  it("agendamento cancelado não confirma", async () => {
    const { app, agendamento, token } = await cenario();
    await prisma.agendamento.update({ where: { id: agendamento.id }, data: { status: "cancelado" } });

    const resposta = await post(app, token, "confirmar");

    expect(resposta.statusCode).toBe(422);
    expect(resposta.json().erro).toBe("status_nao_permite");
  });
});

describe("POST /lembretes/:token/cancelar", () => {
  it("cancela o agendamento", async () => {
    const { app, agendamento, token } = await cenario();

    const resposta = await post(app, token, "cancelar");

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json().agendamento.status).toBe("cancelado");
    const gravado = await prisma.agendamento.findUniqueOrThrow({ where: { id: agendamento.id } });
    expect(gravado.status).toBe("cancelado");
  });

  it("cancelar de novo é o mesmo cancelamento, não um erro", async () => {
    const { app, token } = await cenario();

    await post(app, token, "cancelar");
    const segunda = await post(app, token, "cancelar");

    expect(segunda.statusCode).toBe(200);
    expect(segunda.json().agendamento.status).toBe("cancelado");
  });

  it("concluído ou falta não se cancela", async () => {
    const { app, agendamento, token } = await cenario();
    await prisma.agendamento.update({ where: { id: agendamento.id }, data: { status: "no_show" } });

    const resposta = await post(app, token, "cancelar");

    expect(resposta.statusCode).toBe(422);
    expect(resposta.json().erro).toBe("status_nao_permite");
  });
});

describe("o token do lembrete", () => {
  it("vencido (o horário já começou) responde 410", async () => {
    const { app, agendamento } = await cenario();
    const vencido = assinarTokenDoLembrete(app, {
      agendamentoId: agendamento.id,
      expiraEm: new Date(Date.now() - 60_000),
    });

    for (const resposta of [
      await app.inject({ method: "GET", url: `/lembretes/${vencido}` }),
      await post(app, vencido, "confirmar"),
      await post(app, vencido, "cancelar"),
    ]) {
      expect(resposta.statusCode).toBe(410);
      expect(resposta.json().erro).toBe("link_expirado");
    }
  });

  it("lixo ou assinatura trocada responde 401", async () => {
    const { app, token } = await cenario();
    const adulterado = token.slice(0, -4) + (token.endsWith("AAAA") ? "BBBB" : "AAAA");

    for (const ruim of ["lixo", adulterado]) {
      const resposta = await app.inject({ method: "GET", url: `/lembretes/${ruim}` });
      expect(resposta.statusCode).toBe(401);
      expect(resposta.json().erro).toBe("link_invalido");
    }
  });

  it("token de barbeiro ou de cliente não abre o lembrete", async () => {
    const { app, agenda } = await cenario();
    const cliente = await criarClienteComToken(app, agenda.slug, "11933332222");

    for (const outro of [agenda.token, cliente.token]) {
      const resposta = await post(app, outro, "cancelar");
      expect(resposta.statusCode).toBe(401);
      expect(resposta.json().erro).toBe("link_invalido");
    }
  });

  it("token do lembrete não abre o painel nem a conta do cliente", async () => {
    const { app, token } = await cenario();

    expect((await app.inject({ method: "GET", url: "/me", headers: auth(token) })).statusCode).toBe(401);
    expect(
      (await app.inject({ method: "GET", url: "/clientes/me", headers: auth(token) })).statusCode
    ).toBe(401);
  });

  it("agendamento apagado responde 404", async () => {
    const { app, agendamento, token } = await cenario();
    await prisma.agendamento.delete({ where: { id: agendamento.id } });

    const resposta = await app.inject({ method: "GET", url: `/lembretes/${token}` });

    expect(resposta.statusCode).toBe(404);
  });
});

describe("ocultarTokenDoLembrete", () => {
  // O token no caminho é um link de cancelar que funciona: no log de
  // requisições do Fastify, é a conta de qualquer um que leia o log.
  it("tira o token da URL que vai pro log", () => {
    expect(ocultarTokenDoLembrete("/lembretes/eyJhbGc.eyJ0.c2ln/confirmar")).toBe(
      "/lembretes/***/confirmar"
    );
    expect(ocultarTokenDoLembrete("/lembretes/eyJhbGc.eyJ0.c2ln")).toBe("/lembretes/***");
  });

  it("não mexe nas outras rotas", () => {
    expect(ocultarTokenDoLembrete("/agendamentos?data=2026-10-10")).toBe(
      "/agendamentos?data=2026-10-10"
    );
  });
});
