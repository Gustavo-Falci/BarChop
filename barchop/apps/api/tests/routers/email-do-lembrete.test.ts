import { describe, expect, it } from "vitest";
import { prisma } from "@barchop/database";
import { buildApp } from "../../src/app";
import { canalDeMemoria } from "../../src/lib/canal";
import { enviarLembrete } from "../../src/lib/lembrete";
import type { App } from "../../src/tipos";
import { auth } from "../helpers/barbearia";
import { criarClienteComToken } from "../helpers/cliente";
import { QUINTA, proximoDiaDaSemana } from "../helpers/datas";
import { prepararAgenda, type Agenda } from "../helpers/agenda";

// O e-mail que o cliente digita ao marcar pela página pública vai pro
// AGENDAMENTO, nunca pro cadastro. O cadastro é achado pelo telefone, e
// o e-mail do cadastro é o login do cliente (código por e-mail): gravar
// ali o que qualquer um digita deixaria quem sabe o telefone de alguém
// trocar o e-mail dessa pessoa — e receber os links de cancelar dela e
// entrar na conta dela.

const log = { info: () => {}, error: () => {} };
const antes = () => new Date("2000-01-01T00:00:00.000Z");

function marcarPublico(
  app: App,
  agenda: Agenda,
  cliente: { nome: string; telefone: string; email?: string },
  horaInicio = "10:00"
) {
  return app.inject({
    method: "POST",
    url: `/barbearias/${agenda.slug}/agendamentos`,
    payload: { servicoIds: [agenda.servico.id], data: QUINTA, horaInicio, cliente },
  });
}

describe("e-mail do lembrete na página pública", () => {
  it("fica no agendamento, normalizado, e não cria e-mail no cadastro novo", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);

    const resposta = await marcarPublico(app, agenda, {
      nome: "Maria",
      telefone: "11977776666",
      email: "Maria@Exemplo.COM",
    });

    expect(resposta.statusCode).toBe(201);
    const agendamento = await prisma.agendamento.findUniqueOrThrow({
      where: { id: resposta.json().id },
      include: { cliente: true },
    });
    expect(agendamento.emailLembrete).toBe("maria@exemplo.com");
    expect(agendamento.cliente.email).toBeNull();
  });

  it("não troca o e-mail de um cadastro que já tem um", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app, { email: "joao@exemplo.com" });

    const resposta = await marcarPublico(app, agenda, {
      nome: "João",
      telefone: agenda.telefone,
      email: "outro@exemplo.com",
    });

    expect(resposta.statusCode).toBe(201);
    const cliente = await prisma.cliente.findUniqueOrThrow({ where: { id: agenda.cliente.id } });
    expect(cliente.email).toBe("joao@exemplo.com");
  });

  it("não preenche o e-mail de um cadastro que não tinha", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);

    await marcarPublico(app, agenda, {
      nome: "João",
      telefone: agenda.telefone,
      email: "intruso@exemplo.com",
    });

    const cliente = await prisma.cliente.findUniqueOrThrow({ where: { id: agenda.cliente.id } });
    expect(cliente.email).toBeNull();
  });

  it("a resposta pública não devolve o e-mail", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);

    const resposta = await marcarPublico(app, agenda, {
      nome: "Maria",
      telefone: "11977776666",
      email: "maria@exemplo.com",
    });

    expect(resposta.body).not.toContain("maria@exemplo.com");
  });

  it("e-mail fora do formato é 400", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);

    const resposta = await marcarPublico(app, agenda, {
      nome: "Maria",
      telefone: "11977776666",
      email: "nao-e-email",
    });

    expect(resposta.statusCode).toBe(400);
  });

  it("o lembrete vai pro e-mail do agendamento, antes do do cadastro", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app, { email: "joao@exemplo.com" });
    const { id } = (
      await marcarPublico(app, agenda, {
        nome: "João",
        telefone: agenda.telefone,
        email: "joao.trabalho@exemplo.com",
      })
    ).json();
    const canal = canalDeMemoria();

    await enviarLembrete({ agendamentoId: id }, { canal, log, agora: antes });

    expect(canal.enviadas.map((m) => m.para)).toEqual(["joao.trabalho@exemplo.com"]);
  });

  it("sem e-mail no agendamento, vale o do cadastro", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app, { email: "joao@exemplo.com" });
    const { id } = (
      await marcarPublico(app, agenda, { nome: "João", telefone: agenda.telefone })
    ).json();
    const canal = canalDeMemoria();

    await enviarLembrete({ agendamentoId: id }, { canal, log, agora: antes });

    expect(canal.enviadas.map((m) => m.para)).toEqual(["joao@exemplo.com"]);
  });

  it("remarcar leva o e-mail do agendamento antigo", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);
    const cliente = await criarClienteComToken(app, agenda.slug, "11955554444");
    const original = (
      await marcarPublico(app, agenda, {
        nome: "Ana",
        telefone: "11955554444",
        email: "ana@exemplo.com",
      })
    ).json();

    const resposta = await app.inject({
      method: "POST",
      url: `/clientes/me/agendamentos/${original.id}/remarcar`,
      headers: auth(cliente.token),
      payload: { data: proximoDiaDaSemana(5), horaInicio: "15:00" },
    });

    expect(resposta.statusCode).toBe(201);
    const novo = await prisma.agendamento.findUniqueOrThrow({
      where: { id: resposta.json().agendamento.id },
    });
    expect(novo.emailLembrete).toBe("ana@exemplo.com");
  });
});
