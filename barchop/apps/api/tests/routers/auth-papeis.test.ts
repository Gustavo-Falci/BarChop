import { describe, expect, it } from "vitest";
import { prisma } from "@barchop/database";
import { buildApp } from "../../src/app";
import { QUINTA } from "../helpers/datas";
import { auth, criarBarbeariaComToken, criarMembroComToken } from "../helpers/barbearia";
import type { App } from "../../src/tipos";

// O que cada papel pode fazer no painel, num lugar só. A matriz do
// piloto (plano da Onda 1, A3):
// - dono: tudo;
// - recepção: agenda e clientes de todos; vê serviços, horários e a
//   barbearia, mas não muda nada disso;
// - profissional: só a própria agenda; vê e cadastra clientes (o
//   walk-in chega pra ele), e também não muda a configuração.
// Quem não pode recebe 403 `sem_permissao` antes de o corpo ser lido —
// a resposta não pode depender de o corpo estar certo.

const ID_QUALQUER = "00000000-0000-4000-8000-000000000000";

// As rotas que só o dono usa. Corpos vazios de propósito: o 403 vem
// antes da validação.
const SO_DO_DONO = [
  { method: "PATCH", url: "/barbearias/me" },
  { method: "PATCH", url: "/barbearias/me/slug" },
  { method: "PUT", url: "/barbearias/me/horarios" },
  { method: "POST", url: "/servicos" },
  { method: "PATCH", url: `/servicos/${ID_QUALQUER}` },
  { method: "DELETE", url: `/servicos/${ID_QUALQUER}` },
  { method: "POST", url: "/equipe" },
  { method: "PATCH", url: `/equipe/${ID_QUALQUER}` },
  { method: "POST", url: `/equipe/${ID_QUALQUER}/convite` },
  { method: "PUT", url: `/equipe/${ID_QUALQUER}/jornada` },
  { method: "PUT", url: `/equipe/${ID_QUALQUER}/servicos` },
] as const;

async function prepararEquipe(app: App) {
  const dono = await criarBarbeariaComToken(app);
  const recepcao = await criarMembroComToken(app, dono.barbeariaId, "recepcao", "r");
  const profissional = await criarMembroComToken(app, dono.barbeariaId, "profissional", "p");

  await app.inject({
    method: "PUT",
    url: "/barbearias/me/horarios",
    headers: auth(dono.token),
    payload: {
      horarios: [1, 2, 3, 4, 5, 6].map((diaSemana) => ({
        diaSemana,
        horaAbertura: "09:00",
        horaFechamento: "18:00",
      })),
    },
  });
  const servico = (
    await app.inject({
      method: "POST",
      url: "/servicos",
      headers: auth(dono.token),
      payload: { nome: "Corte", duracaoMinutos: 30, preco: "40.00" },
    })
  ).json();
  const cliente = (
    await app.inject({
      method: "POST",
      url: "/clientes",
      headers: auth(dono.token),
      payload: { nome: "João", telefone: "11999990001" },
    })
  ).json();

  return { dono, recepcao, profissional, servico, cliente };
}

function agendar(
  app: App,
  token: string,
  equipe: Awaited<ReturnType<typeof prepararEquipe>>,
  barbeiroId: string,
  horaInicio: string
) {
  return app.inject({
    method: "POST",
    url: "/agendamentos",
    headers: auth(token),
    payload: {
      barbeiroId,
      clienteId: equipe.cliente.id,
      servicoIds: [equipe.servico.id],
      data: QUINTA,
      horaInicio,
    },
  });
}

describe("configuração é do dono", () => {
  for (const rota of SO_DO_DONO) {
    it(`${rota.method} ${rota.url}: recepção e profissional recebem 403`, async () => {
      const app = buildApp();
      const equipe = await prepararEquipe(app);

      for (const membro of [equipe.recepcao, equipe.profissional]) {
        const resposta = await app.inject({ ...rota, headers: auth(membro.token), payload: {} });
        expect(resposta.statusCode).toBe(403);
        expect(resposta.json().erro).toBe("sem_permissao");
      }

      // O dono passa da guarda: o que vier depois (400 do corpo vazio,
      // 404 do id inventado) é da rota, não do papel.
      const doDono = await app.inject({ ...rota, headers: auth(equipe.dono.token), payload: {} });
      expect(doDono.statusCode).not.toBe(403);
      await app.close();
    });
  }

  it("recepção e profissional ainda leem serviços, horários e a barbearia", async () => {
    const app = buildApp();
    const equipe = await prepararEquipe(app);

    for (const membro of [equipe.recepcao, equipe.profissional]) {
      for (const url of ["/servicos", "/barbearias/me/horarios", "/barbearias/me"]) {
        const resposta = await app.inject({ method: "GET", url, headers: auth(membro.token) });
        expect(resposta.statusCode, url).toBe(200);
      }
    }
    await app.close();
  });
});

describe("agenda por papel", () => {
  it("a recepção vê e marca na agenda de qualquer profissional", async () => {
    const app = buildApp();
    const equipe = await prepararEquipe(app);

    const criado = await agendar(app, equipe.recepcao.token, equipe, equipe.profissional.barbeiroId, "10:00");
    expect(criado.statusCode).toBe(201);

    const lista = await app.inject({
      method: "GET",
      url: `/agendamentos?data=${QUINTA}`,
      headers: auth(equipe.recepcao.token),
    });
    expect(lista.json().agendamentos).toHaveLength(1);
    await app.close();
  });

  it("o profissional vê só a própria agenda", async () => {
    const app = buildApp();
    const equipe = await prepararEquipe(app);
    await agendar(app, equipe.dono.token, equipe, equipe.dono.barbeiroId, "10:00");
    const dele = (
      await agendar(app, equipe.dono.token, equipe, equipe.profissional.barbeiroId, "11:00")
    ).json();

    const lista = await app.inject({
      method: "GET",
      url: `/agendamentos?data=${QUINTA}`,
      headers: auth(equipe.profissional.token),
    });

    const agendamentos = lista.json().agendamentos;
    expect(agendamentos).toHaveLength(1);
    expect(agendamentos[0].id).toBe(dele.id);
    await app.close();
  });

  it("o agendamento de outro profissional não existe pra ele: 404, não 403", async () => {
    // 404 e não 403: o profissional não precisa saber que o horário do
    // colega existe — mesmo raciocínio do 404 entre barbearias.
    const app = buildApp();
    const equipe = await prepararEquipe(app);
    const doDono = (await agendar(app, equipe.dono.token, equipe, equipe.dono.barbeiroId, "10:00")).json();

    const ler = await app.inject({
      method: "GET",
      url: `/agendamentos/${doDono.id}`,
      headers: auth(equipe.profissional.token),
    });
    const mudar = await app.inject({
      method: "PATCH",
      url: `/agendamentos/${doDono.id}`,
      headers: auth(equipe.profissional.token),
      payload: { status: "cancelado" },
    });

    expect(ler.statusCode).toBe(404);
    expect(mudar.statusCode).toBe(404);
    await app.close();
  });

  it("o profissional marca na própria agenda, mas não na de outro", async () => {
    const app = buildApp();
    const equipe = await prepararEquipe(app);

    const proprio = await agendar(app, equipe.profissional.token, equipe, equipe.profissional.barbeiroId, "10:00");
    const alheio = await agendar(app, equipe.profissional.token, equipe, equipe.dono.barbeiroId, "11:00");

    expect(proprio.statusCode).toBe(201);
    expect(alheio.statusCode).toBe(403);
    expect(alheio.json().erro).toBe("sem_permissao");
    await app.close();
  });

  it("o profissional cadastra o cliente que chegou no balcão", async () => {
    const app = buildApp();
    const equipe = await prepararEquipe(app);

    const resposta = await app.inject({
      method: "POST",
      url: "/clientes",
      headers: auth(equipe.profissional.token),
      payload: { nome: "Walk-in", telefone: "11999990002" },
    });

    expect(resposta.statusCode).toBe(201);
    await app.close();
  });
});

describe("o papel vale na próxima requisição", () => {
  it("promover o membro dá o acesso sem esperar um token novo", async () => {
    // O papel é lido do banco no hook, não do token: trocar o papel não
    // pode esperar sete dias pra valer — nem pra dar, nem pra tirar.
    const app = buildApp();
    const equipe = await prepararEquipe(app);
    await prisma.barbeiro.update({
      where: { id: equipe.recepcao.barbeiroId },
      data: { papel: "dono" },
    });

    const promovido = await app.inject({
      method: "PATCH",
      url: "/barbearias/me",
      headers: auth(equipe.recepcao.token),
      payload: { nome: "Barbearia renomeada" },
    });

    expect(promovido.statusCode).toBe(200);
    await app.close();
  });
});
