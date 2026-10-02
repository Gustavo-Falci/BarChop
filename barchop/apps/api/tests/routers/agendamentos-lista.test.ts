import { describe, expect, it } from "vitest";
import { buildApp } from "../../src/app";
import { auth, criarBarbeariaComToken } from "../helpers/barbearia";
import type { App } from "../../src/tipos";

// Telefone único por cadastro. Deriva de um contador, e não do sufixo:
// `sufixo.length` colidiria entre dois sufixos do mesmo tamanho, e o
// erro só apareceria quando alguém acrescentasse um cenário novo.
let sequenciaDeTelefone = 0;
function proximoTelefone(): string {
  sequenciaDeTelefone += 1;
  return `1199999${String(sequenciaDeTelefone).padStart(4, "0")}`;
}

// 2026-09-10 é quinta, 2026-09-11 é sexta.
async function prepararAgenda(app: App, sufixo = "um") {
  const barbearia = await criarBarbeariaComToken(app, sufixo);

  await app.inject({
    method: "PUT",
    url: "/barbearias/me/horarios",
    headers: auth(barbearia.token),
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
      headers: auth(barbearia.token),
      payload: { nome: "Corte", duracaoMinutos: 45, preco: "45.00" },
    })
  ).json();

  const cliente = (
    await app.inject({
      method: "POST",
      url: "/clientes",
      headers: auth(barbearia.token),
      payload: { nome: "João da Silva", telefone: proximoTelefone() },
    })
  ).json();

  return { ...barbearia, servico, cliente };
}

async function agendar(
  app: App,
  agenda: Awaited<ReturnType<typeof prepararAgenda>>,
  data: string,
  horaInicio: string
) {
  return app.inject({
    method: "POST",
    url: "/agendamentos",
    headers: auth(agenda.token),
    payload: {
      barbeiroId: agenda.barbeiroId,
      clienteId: agenda.cliente.id,
      servicoIds: [agenda.servico.id],
      data,
      horaInicio,
    },
  });
}

describe("GET /agendamentos", () => {
  it("lista o dia pedido, em ordem de hora", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);

    await agendar(app, agenda, "2026-09-10", "14:00");
    await agendar(app, agenda, "2026-09-10", "10:00");
    await agendar(app, agenda, "2026-09-11", "10:00");

    const resposta = await app.inject({
      method: "GET",
      url: "/agendamentos?data=2026-09-10",
      headers: auth(agenda.token),
    });

    expect(resposta.statusCode).toBe(200);

    const { agendamentos } = resposta.json();
    expect(agendamentos).toHaveLength(2);
    // A tela desenha o dia de cima pra baixo e não deveria ter que
    // ordenar.
    expect(
      agendamentos.map((a: { horaInicio: string }) => a.horaInicio)
    ).toEqual(["10:00", "14:00"]);
    // O nome do cliente aparece em cada linha da agenda.
    expect(agendamentos[0].cliente.nome).toBe("João da Silva");

    await app.close();
  });

  it("lista o intervalo fechado nas duas pontas", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);

    await agendar(app, agenda, "2026-09-10", "10:00");
    await agendar(app, agenda, "2026-09-11", "10:00");
    await agendar(app, agenda, "2026-09-12", "10:00");

    const resposta = await app.inject({
      method: "GET",
      url: "/agendamentos?de=2026-09-10&ate=2026-09-11",
      headers: auth(agenda.token),
    });

    expect(resposta.json().agendamentos).toHaveLength(2);

    await app.close();
  });

  it("recusa as duas formas juntas com 400", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);

    const resposta = await app.inject({
      method: "GET",
      url: "/agendamentos?data=2026-09-10&de=2026-09-10&ate=2026-09-11",
      headers: auth(agenda.token),
    });

    expect(resposta.statusCode).toBe(400);

    await app.close();
  });

  it("recusa nenhuma das duas formas com 400", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);

    // Sem filtro, a resposta seria a base inteira — e a tela não tem
    // como paginar isso.
    const resposta = await app.inject({
      method: "GET",
      url: "/agendamentos",
      headers: auth(agenda.token),
    });

    expect(resposta.statusCode).toBe(400);

    await app.close();
  });

  it("recusa intervalo pela metade com 400", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);

    const resposta = await app.inject({
      method: "GET",
      url: "/agendamentos?de=2026-09-10",
      headers: auth(agenda.token),
    });

    expect(resposta.statusCode).toBe(400);

    await app.close();
  });

  it("recusa intervalo maior que 92 dias com 422", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);

    const resposta = await app.inject({
      method: "GET",
      url: "/agendamentos?de=2026-01-01&ate=2026-12-31",
      headers: auth(agenda.token),
    });

    expect(resposta.statusCode).toBe(422);
    expect(resposta.json().erro).toBe("intervalo_longo_demais");

    await app.close();
  });

  it("recusa intervalo invertido com 422", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);

    const resposta = await app.inject({
      method: "GET",
      url: "/agendamentos?de=2026-09-11&ate=2026-09-10",
      headers: auth(agenda.token),
    });

    expect(resposta.statusCode).toBe(422);
    expect(resposta.json().erro).toBe("intervalo_invalido");

    await app.close();
  });

  it("recusa data que não existe no calendário com 422", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);

    // O pattern do schema aceita a forma; quem sabe que 31 de fevereiro
    // não existe é o dataParaDate.
    const resposta = await app.inject({
      method: "GET",
      url: "/agendamentos?data=2026-02-31",
      headers: auth(agenda.token),
    });

    expect(resposta.statusCode).toBe(422);
    expect(resposta.json().erro).toBe("data_invalida");

    await app.close();
  });

  it("não enxerga agendamento de outra barbearia", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app, "um");
    const outra = await prepararAgenda(app, "outra");

    await agendar(app, outra, "2026-09-10", "10:00");

    const resposta = await app.inject({
      method: "GET",
      url: "/agendamentos?data=2026-09-10",
      headers: auth(agenda.token),
    });

    expect(resposta.json().agendamentos).toEqual([]);

    await app.close();
  });

  it("recusa requisição sem token com 401", async () => {
    const app = buildApp();

    const resposta = await app.inject({
      method: "GET",
      url: "/agendamentos?data=2026-09-10",
    });

    expect(resposta.statusCode).toBe(401);

    await app.close();
  });
});
