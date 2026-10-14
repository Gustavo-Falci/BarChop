import { describe, expect, it } from "vitest";
import { prisma } from "@barchop/database";
import { buildApp } from "../../src/app";
import type { App } from "../../src/tipos";
import { prepararAgenda, type Agenda } from "../helpers/agenda";
import { auth, criarBarbeariaComToken, criarMembroComToken } from "../helpers/barbearia";
import { QUINTA } from "../helpers/datas";

// O limite de profissionais do plano (Onda 2, marco 1, PR 3 do plano
// cobranca-do-barchop). Na equipe: incluir, reativar ou passar a
// atender acima do limite do plano que vale agora é recusado. No link
// público: no Grátis com mais profissionais que o limite, só quem
// continua recebe agendamento novo; o painel segue vendo todos e os
// horários já marcados continuam valendo.

type Situacao = "teste" | "ativa" | "gratis";

function definirPlano(barbeariaId: string, situacao: Situacao, plano: "gratis" | "essencial" | "completo" = "gratis") {
  return prisma.assinatura.update({
    where: { barbeariaId },
    data: {
      situacao,
      plano,
      testeTerminaEm: situacao === "teste" ? new Date(Date.now() + 24 * 60 * 60 * 1000) : null,
    },
  });
}

let sequencia = 0;
function incluir(app: App, token: string, papel: "dono" | "profissional" | "recepcao" = "profissional") {
  sequencia += 1;
  return app.inject({
    method: "POST",
    url: "/equipe",
    headers: auth(token),
    payload: { nome: `Membro ${sequencia}`, email: `membro-${sequencia}@exemplo.com`, papel },
  });
}

function mudar(app: App, token: string, id: string, corpo: Record<string, unknown>) {
  return app.inject({ method: "PATCH", url: `/equipe/${id}`, headers: auth(token), payload: corpo });
}

describe("na equipe", () => {
  it("em teste não há limite", async () => {
    const app = buildApp();
    const { token } = await criarBarbeariaComToken(app);

    for (let i = 0; i < 4; i += 1) expect((await incluir(app, token)).statusCode).toBe(201);
    await app.close();
  });

  it("no Grátis, o 2º profissional é recusado com o convite de escolher um plano", async () => {
    const app = buildApp();
    const { token, barbeariaId } = await criarBarbeariaComToken(app);
    await definirPlano(barbeariaId, "gratis");

    const resposta = await incluir(app, token);

    expect(resposta.statusCode).toBe(422);
    expect(resposta.json().erro).toBe("limite_do_plano");
    expect(resposta.json().mensagem).toMatch(/escolha um plano/i);
    await app.close();
  });

  it("um dono a mais também conta", async () => {
    const app = buildApp();
    const { token, barbeariaId } = await criarBarbeariaComToken(app);
    await definirPlano(barbeariaId, "gratis");

    expect((await incluir(app, token, "dono")).statusCode).toBe(422);
    await app.close();
  });

  it("a recepção não conta: entra mesmo no limite", async () => {
    const app = buildApp();
    const { token, barbeariaId } = await criarBarbeariaComToken(app);
    await definirPlano(barbeariaId, "gratis");

    expect((await incluir(app, token, "recepcao")).statusCode).toBe(201);
    await app.close();
  });

  it("no Essencial, até 3; o 4º é recusado com o convite do Completo", async () => {
    const app = buildApp();
    const { token, barbeariaId } = await criarBarbeariaComToken(app);
    await definirPlano(barbeariaId, "ativa", "essencial");

    expect((await incluir(app, token)).statusCode).toBe(201);
    expect((await incluir(app, token)).statusCode).toBe(201);
    const quarto = await incluir(app, token);

    expect(quarto.statusCode).toBe(422);
    expect(quarto.json().erro).toBe("limite_do_plano");
    expect(quarto.json().mensagem).toMatch(/completo/i);
    await app.close();
  });

  it("no Completo não há limite", async () => {
    const app = buildApp();
    const { token, barbeariaId } = await criarBarbeariaComToken(app);
    await definirPlano(barbeariaId, "ativa", "completo");

    for (let i = 0; i < 4; i += 1) expect((await incluir(app, token)).statusCode).toBe(201);
    await app.close();
  });

  it("teste vencido vale o Grátis", async () => {
    const app = buildApp();
    const { token, barbeariaId } = await criarBarbeariaComToken(app);
    await prisma.assinatura.update({
      where: { barbeariaId },
      data: { testeTerminaEm: new Date(Date.now() - 1000) },
    });

    expect((await incluir(app, token)).statusCode).toBe(422);
    await app.close();
  });

  it("no limite, reativar quem saiu é recusado", async () => {
    const app = buildApp();
    const { token, barbeariaId } = await criarBarbeariaComToken(app);
    const saiu = await criarMembroComToken(app, barbeariaId, "profissional", "p");
    await prisma.barbeiro.update({ where: { id: saiu.barbeiroId }, data: { ativo: false } });
    await definirPlano(barbeariaId, "gratis");

    const resposta = await mudar(app, token, saiu.barbeiroId, { ativo: true });

    expect(resposta.statusCode).toBe(422);
    expect(resposta.json().erro).toBe("limite_do_plano");
    await app.close();
  });

  it("no limite, a recepção não passa a profissional", async () => {
    const app = buildApp();
    const { token, barbeariaId } = await criarBarbeariaComToken(app);
    const recepcao = await criarMembroComToken(app, barbeariaId, "recepcao", "r");
    await definirPlano(barbeariaId, "gratis");

    expect((await mudar(app, token, recepcao.barbeiroId, { papel: "profissional" })).statusCode).toBe(422);
    await app.close();
  });

  it("mudanças que não aumentam a conta passam, mesmo acima do limite", async () => {
    const app = buildApp();
    const { token, barbeariaId } = await criarBarbeariaComToken(app);
    const profissional = await criarMembroComToken(app, barbeariaId, "profissional", "p");
    await definirPlano(barbeariaId, "gratis");

    expect((await mudar(app, token, profissional.barbeiroId, { nome: "Outro nome" })).statusCode).toBe(200);
    expect((await mudar(app, token, profissional.barbeiroId, { papel: "recepcao" })).statusCode).toBe(200);
    await app.close();
  });
});

// Dono e um profissional, os dois atendendo e com senha; a barbearia no
// Grátis passa do limite.
async function gratisComExcedente(app: App) {
  const agenda = await prepararAgenda(app);
  const profissional = await criarMembroComToken(app, agenda.barbeariaId, "profissional", "p");
  await definirPlano(agenda.barbeariaId, "gratis");
  return { agenda, profissional };
}

async function barbeirosDoLink(app: App, slug: string): Promise<string[]> {
  const resposta = await app.inject({ method: "GET", url: `/barbearias/${slug}` });
  return resposta.json().barbeiros.map((b: { id: string }) => b.id);
}

function disponibilidade(app: App, agenda: Agenda, barbeiroId?: string, headers = {}) {
  const params = new URLSearchParams({ data: QUINTA, ...(barbeiroId ? { barbeiroId } : {}) });
  params.append("servicoIds", agenda.servico.id);
  return app.inject({ method: "GET", url: `/barbearias/${agenda.slug}/disponibilidade?${params}`, headers });
}

function agendarPeloLink(app: App, agenda: Agenda, barbeiroId: string | undefined, horaInicio: string) {
  return app.inject({
    method: "POST",
    url: `/barbearias/${agenda.slug}/agendamentos`,
    payload: {
      ...(barbeiroId ? { barbeiroId } : {}),
      servicoIds: [agenda.servico.id],
      data: QUINTA,
      horaInicio,
      cliente: { nome: "João da Silva", telefone: "11999998888" },
    },
  });
}

describe("no link público, no Grátis acima do limite", () => {
  it("a página mostra só o dono", async () => {
    const app = buildApp();
    const { agenda } = await gratisComExcedente(app);

    expect(await barbeirosDoLink(app, agenda.slug)).toEqual([agenda.barbeiroId]);
    await app.close();
  });

  it("em teste, a página mostra os dois", async () => {
    const app = buildApp();
    const { agenda, profissional } = await gratisComExcedente(app);
    await definirPlano(agenda.barbeariaId, "teste");

    expect(await barbeirosDoLink(app, agenda.slug)).toEqual([agenda.barbeiroId, profissional.barbeiroId]);
    await app.close();
  });

  it("o dono que não atende sai, e fica quem atende", async () => {
    const app = buildApp();
    const { agenda, profissional } = await gratisComExcedente(app);
    await prisma.barbeiro.update({ where: { id: agenda.barbeiroId }, data: { atende: false } });

    expect(await barbeirosDoLink(app, agenda.slug)).toEqual([profissional.barbeiroId]);
    await app.close();
  });

  it("a disponibilidade de quem ficou de fora é recusada como quem não existe", async () => {
    const app = buildApp();
    const { agenda, profissional } = await gratisComExcedente(app);

    const resposta = await disponibilidade(app, agenda, profissional.barbeiroId);

    expect(resposta.statusCode).toBe(422);
    expect(resposta.json().erro).toBe("barbeiro_invalido");
    await app.close();
  });

  it("o painel continua vendo a agenda de quem ficou de fora", async () => {
    const app = buildApp();
    const { agenda, profissional } = await gratisComExcedente(app);

    const resposta = await disponibilidade(app, agenda, profissional.barbeiroId, auth(agenda.token));

    expect(resposta.statusCode).toBe(200);
    await app.close();
  });

  it("o agendamento pelo link com quem ficou de fora é recusado", async () => {
    const app = buildApp();
    const { agenda, profissional } = await gratisComExcedente(app);

    const resposta = await agendarPeloLink(app, agenda, profissional.barbeiroId, "10:00");

    expect(resposta.statusCode).toBe(422);
    expect(resposta.json().erro).toBe("barbeiro_invalido");
    await app.close();
  });

  it("o \"qualquer um\" só escolhe quem continua", async () => {
    const app = buildApp();
    const { agenda, profissional } = await gratisComExcedente(app);
    // O dono ocupado às 10:00: sem o limite, o "qualquer um" cairia no
    // profissional.
    await app.inject({
      method: "POST",
      url: "/agendamentos",
      headers: auth(agenda.token),
      payload: {
        barbeiroId: agenda.barbeiroId,
        clienteId: agenda.cliente.id,
        servicoIds: [agenda.servico.id],
        data: QUINTA,
        horaInicio: "10:00",
      },
    });

    const resposta = await agendarPeloLink(app, agenda, undefined, "10:00");
    const livres = (await disponibilidade(app, agenda)).json();

    expect(resposta.statusCode).toBe(422);
    expect(resposta.json().erro).toBe("horario_indisponivel");
    expect(JSON.stringify(livres)).not.toContain(profissional.barbeiroId);
    await app.close();
  });

  it("os próximos horários não contam com quem ficou de fora", async () => {
    const app = buildApp();
    const { agenda } = await gratisComExcedente(app);
    // Só o profissional faz o Corte: sem ele, o serviço fica sem horário.
    await prisma.profissionalServico.deleteMany({ where: { barbeiroId: agenda.barbeiroId } });

    const resposta = await app.inject({ method: "GET", url: `/barbearias/${agenda.slug}/proximos-horarios` });
    const corte = resposta.json().servicos.find((s: { servicoId: string }) => s.servicoId === agenda.servico.id);

    expect(corte.horarios).toEqual([]);
    await app.close();
  });

  it("o painel marca com quem ficou de fora, e a equipe lista todos", async () => {
    const app = buildApp();
    const { agenda, profissional } = await gratisComExcedente(app);

    const marcado = await app.inject({
      method: "POST",
      url: "/agendamentos",
      headers: auth(agenda.token),
      payload: {
        barbeiroId: profissional.barbeiroId,
        clienteId: agenda.cliente.id,
        servicoIds: [agenda.servico.id],
        data: QUINTA,
        horaInicio: "11:00",
      },
    });
    const equipe = (await app.inject({ method: "GET", url: "/equipe", headers: auth(agenda.token) })).json();

    expect(marcado.statusCode).toBe(201);
    expect(equipe.membros).toHaveLength(2);
    await app.close();
  });
});
