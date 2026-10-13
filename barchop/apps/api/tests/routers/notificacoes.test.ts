import { describe, expect, it } from "vitest";
import { prisma } from "@barchop/database";
import { buildApp } from "../../src/app";
import { assinarTokenDoLembrete, instanteNaBarbearia } from "../../src/lib/lembrete";
import { criarOperadorDeSuporte } from "../../src/lib/suporte";
import type { App } from "../../src/tipos";
import { prepararAgenda, marcarPeloPainel, type Agenda } from "../helpers/agenda";
import { auth, criarBarbeariaComToken, criarMembroComToken } from "../helpers/barbearia";
import { criarClienteComToken } from "../helpers/cliente";
import { QUINTA } from "../helpers/datas";

// As notificações do painel (plano barra-do-topo, PR B): o que o
// CLIENTE faz sozinho avisa a equipe — marcar pelo link, cancelar,
// remarcar, confirmar presença. O que a própria equipe faz no painel
// não avisa ninguém. Quem recebe: o profissional do agendamento, e
// donos e recepção (que veem a agenda de todos). Avisos da plataforma
// saem do suporte pra todos os membros ativos.

const TELEFONE = "11977776666";

function marcarPeloLink(app: App, agenda: Agenda, horaInicio = "10:00") {
  return app.inject({
    method: "POST",
    url: `/barbearias/${agenda.slug}/agendamentos`,
    payload: {
      barbeiroId: agenda.barbeiroId,
      servicoIds: [agenda.servico.id],
      data: QUINTA,
      horaInicio,
      cliente: { nome: "Maria Souza", telefone: TELEFONE },
    },
  });
}

async function notificacoes(app: App, token: string, filtro?: string) {
  const resposta = await app.inject({
    method: "GET",
    url: `/me/notificacoes${filtro ? `?filtro=${filtro}` : ""}`,
    headers: auth(token),
  });
  expect(resposta.statusCode).toBe(200);
  return resposta.json().notificacoes as {
    id: string;
    tipo: string;
    titulo: string;
    texto: string;
    link: string | null;
    lida: boolean;
    criadaEm: string;
  }[];
}

async function naoLidas(app: App, token: string): Promise<number> {
  const resposta = await app.inject({
    method: "GET",
    url: "/me/notificacoes/contagem",
    headers: auth(token),
  });
  expect(resposta.statusCode).toBe(200);
  return resposta.json().naoLidas;
}

async function entrarNoSuporte(app: App) {
  await criarOperadorDeSuporte({ nome: "Suporte", email: "suporte@barchop.com.br", senha: "senha-do-suporte-123" });
  const resposta = await app.inject({
    method: "POST",
    url: "/suporte/login",
    payload: { email: "suporte@barchop.com.br", senha: "senha-do-suporte-123" },
  });
  return resposta.json().token as string;
}

describe("quem recebe a notificação de um agendamento", () => {
  it("marcar pelo link avisa o dono com o nome do cliente e o caminho do agendamento", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);

    const resposta = await marcarPeloLink(app, agenda);
    expect(resposta.statusCode).toBe(201);

    const lista = await notificacoes(app, agenda.token);
    expect(lista).toHaveLength(1);
    expect(lista[0]).toMatchObject({
      tipo: "agendamento",
      titulo: "Novo agendamento",
      link: `/painel/agendamentos/${resposta.json().id}`,
      lida: false,
    });
    expect(lista[0]!.texto).toContain("Maria Souza");
    expect(lista[0]!.texto).toContain("10:00");
    expect(await naoLidas(app, agenda.token)).toBe(1);

    await app.close();
  });

  it("recepção recebe; profissional só recebe o que é da agenda dele", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);
    const recepcao = await criarMembroComToken(app, agenda.barbeariaId, "recepcao", "r1");
    const outro = await criarMembroComToken(app, agenda.barbeariaId, "profissional", "p1");

    // Com o dono: a recepção vê, o outro profissional não.
    await marcarPeloLink(app, agenda, "10:00");
    expect(await notificacoes(app, recepcao.token)).toHaveLength(1);
    expect(await notificacoes(app, outro.token)).toHaveLength(0);

    // Na agenda do profissional: ele vê.
    const resposta = await app.inject({
      method: "POST",
      url: `/barbearias/${agenda.slug}/agendamentos`,
      payload: {
        barbeiroId: outro.barbeiroId,
        servicoIds: [agenda.servico.id],
        data: QUINTA,
        horaInicio: "14:00",
        cliente: { nome: "Maria Souza", telefone: TELEFONE },
      },
    });
    expect(resposta.statusCode).toBe(201);
    expect(await notificacoes(app, outro.token)).toHaveLength(1);
    expect(await notificacoes(app, agenda.token)).toHaveLength(2);

    await app.close();
  });

  it("membro desativado não recebe", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);
    const recepcao = await criarMembroComToken(app, agenda.barbeariaId, "recepcao", "r1");
    await prisma.barbeiro.update({ where: { id: recepcao.barbeiroId }, data: { ativo: false } });

    await marcarPeloLink(app, agenda);

    expect(await prisma.notificacao.count({ where: { barbeiroId: recepcao.barbeiroId } })).toBe(0);

    await app.close();
  });

  it("o que a equipe marca pelo painel não vira notificação", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);

    await marcarPeloPainel(app, agenda, { data: QUINTA, horaInicio: "10:00" });

    expect(await prisma.notificacao.count()).toBe(0);

    await app.close();
  });
});

describe("o que o cliente faz depois de marcar", () => {
  it("cancelar pela área do cliente avisa", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);
    const id = (await marcarPeloLink(app, agenda)).json().id;
    const cliente = await criarClienteComToken(app, agenda.slug, TELEFONE);

    const resposta = await app.inject({
      method: "POST",
      url: `/clientes/me/agendamentos/${id}/cancelar`,
      headers: auth(cliente.token),
    });
    expect(resposta.statusCode).toBe(200);

    const [maisNova] = await notificacoes(app, agenda.token);
    expect(maisNova).toMatchObject({
      tipo: "agendamento",
      titulo: "Agendamento cancelado",
      link: `/painel/agendamentos/${id}`,
    });

    await app.close();
  });

  it("remarcar avisa e leva pro agendamento novo", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);
    const id = (await marcarPeloLink(app, agenda)).json().id;
    const cliente = await criarClienteComToken(app, agenda.slug, TELEFONE);

    const resposta = await app.inject({
      method: "POST",
      url: `/clientes/me/agendamentos/${id}/remarcar`,
      headers: auth(cliente.token),
      payload: { data: QUINTA, horaInicio: "15:00" },
    });
    expect(resposta.statusCode).toBe(201);

    const [maisNova] = await notificacoes(app, agenda.token);
    expect(maisNova).toMatchObject({
      titulo: "Agendamento remarcado",
      link: `/painel/agendamentos/${resposta.json().agendamento.id}`,
    });
    expect(maisNova!.texto).toContain("15:00");

    await app.close();
  });

  it("confirmar e cancelar pelo link do lembrete avisam uma vez só, mesmo com clique duplo", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);
    const id = (await marcarPeloLink(app, agenda)).json().id;
    await app.ready();
    const token = assinarTokenDoLembrete(app, {
      agendamentoId: id,
      expiraEm: instanteNaBarbearia(QUINTA, "10:00"),
    });

    for (let vez = 0; vez < 2; vez += 1) {
      await app.inject({ method: "POST", url: `/lembretes/${token}/confirmar` });
    }
    for (let vez = 0; vez < 2; vez += 1) {
      await app.inject({ method: "POST", url: `/lembretes/${token}/cancelar` });
    }

    const titulos = (await notificacoes(app, agenda.token)).map((n) => n.titulo);
    expect(titulos).toEqual(["Agendamento cancelado", "Presença confirmada", "Novo agendamento"]);

    await app.close();
  });
});

describe("as rotas do sino", () => {
  it("cada membro só vê as próprias — nem de outra barbearia, nem do colega", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);
    const outra = await criarBarbeariaComToken(app, "dois");
    await marcarPeloLink(app, agenda);

    expect(await notificacoes(app, outra.token)).toHaveLength(0);
    const [minha] = await notificacoes(app, agenda.token);

    const alheia = await app.inject({
      method: "POST",
      url: `/me/notificacoes/${minha!.id}/lida`,
      headers: auth(outra.token),
    });
    expect(alheia.statusCode).toBe(404);

    await app.close();
  });

  it("marcar como lida tira das não lidas; Todas segue mostrando", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);
    await marcarPeloLink(app, agenda, "10:00");
    await marcarPeloLink(app, agenda, "14:00");
    const [maisNova] = await notificacoes(app, agenda.token);

    const resposta = await app.inject({
      method: "POST",
      url: `/me/notificacoes/${maisNova!.id}/lida`,
      headers: auth(agenda.token),
    });
    expect(resposta.statusCode).toBe(204);

    expect(await naoLidas(app, agenda.token)).toBe(1);
    expect(await notificacoes(app, agenda.token, "nao-lidas")).toHaveLength(1);
    const todas = await notificacoes(app, agenda.token, "todas");
    expect(todas).toHaveLength(2);
    expect(todas.find((n) => n.id === maisNova!.id)!.lida).toBe(true);

    await app.close();
  });

  it("ler todas zera a contagem", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);
    await marcarPeloLink(app, agenda, "10:00");
    await marcarPeloLink(app, agenda, "14:00");

    const resposta = await app.inject({
      method: "POST",
      url: "/me/notificacoes/ler-todas",
      headers: auth(agenda.token),
    });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toEqual({ lidas: 2 });
    expect(await naoLidas(app, agenda.token)).toBe(0);

    await app.close();
  });

  it("filtro desconhecido é 400", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);

    const resposta = await app.inject({
      method: "GET",
      url: "/me/notificacoes?filtro=banana",
      headers: auth(agenda.token),
    });

    expect(resposta.statusCode).toBe(400);

    await app.close();
  });
});

describe("avisos da plataforma", () => {
  it("o suporte publica e todo membro ativo, de toda barbearia, recebe em Avisos", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);
    const outra = await criarBarbeariaComToken(app, "dois");
    const inativo = await criarMembroComToken(app, outra.barbeariaId, "profissional", "x");
    await prisma.barbeiro.update({ where: { id: inativo.barbeiroId }, data: { ativo: false } });
    const suporte = await entrarNoSuporte(app);

    const resposta = await app.inject({
      method: "POST",
      url: "/suporte/avisos",
      headers: auth(suporte),
      payload: {
        titulo: "Manutenção no domingo",
        texto: "O painel fica fora do ar das 2h às 3h.",
        link: "/painel/ajuda",
      },
    });

    expect(resposta.statusCode).toBe(201);
    expect(resposta.json().aviso).toMatchObject({ titulo: "Manutenção no domingo", destinatarios: 2 });

    for (const token of [agenda.token, outra.token]) {
      const avisos = await notificacoes(app, token, "avisos");
      expect(avisos).toHaveLength(1);
      expect(avisos[0]).toMatchObject({
        tipo: "plataforma",
        titulo: "Manutenção no domingo",
        texto: "O painel fica fora do ar das 2h às 3h.",
        link: "/painel/ajuda",
      });
    }
    expect(await prisma.notificacao.count({ where: { barbeiroId: inativo.barbeiroId } })).toBe(0);

    await app.close();
  });

  it("Avisos mostra só os da plataforma", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);
    const suporte = await entrarNoSuporte(app);
    await marcarPeloLink(app, agenda);
    await app.inject({
      method: "POST",
      url: "/suporte/avisos",
      headers: auth(suporte),
      payload: { titulo: "Novidade", texto: "Agora tem barra de topo." },
    });

    expect(await notificacoes(app, agenda.token, "avisos")).toHaveLength(1);
    expect(await notificacoes(app, agenda.token, "todas")).toHaveLength(2);

    await app.close();
  });

  it("lista os avisos publicados, do mais novo, com quantos leram", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);
    const suporte = await entrarNoSuporte(app);
    for (const titulo of ["Primeiro", "Segundo"]) {
      await app.inject({
        method: "POST",
        url: "/suporte/avisos",
        headers: auth(suporte),
        payload: { titulo, texto: "Texto do aviso." },
      });
    }
    const [segundo] = await notificacoes(app, agenda.token, "avisos");
    await app.inject({
      method: "POST",
      url: `/me/notificacoes/${segundo!.id}/lida`,
      headers: auth(agenda.token),
    });

    const resposta = await app.inject({ method: "GET", url: "/suporte/avisos", headers: auth(suporte) });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json().avisos).toMatchObject([
      { titulo: "Segundo", destinatarios: 1, lidas: 1 },
      { titulo: "Primeiro", destinatarios: 1, lidas: 0 },
    ]);

    await app.close();
  });

  it("recusa link fora do painel que não seja https, e token de barbeiro", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);
    const suporte = await entrarNoSuporte(app);

    const linkRuim = await app.inject({
      method: "POST",
      url: "/suporte/avisos",
      headers: auth(suporte),
      payload: { titulo: "Golpe", texto: "Clique aqui.", link: "javascript:alert(1)" },
    });
    expect(linkRuim.statusCode).toBe(400);

    const deBarbeiro = await app.inject({
      method: "POST",
      url: "/suporte/avisos",
      headers: auth(agenda.token),
      payload: { titulo: "Oi", texto: "Tchau." },
    });
    expect(deBarbeiro.statusCode).toBe(401);

    await app.close();
  });
});
