import { describe, expect, it } from "vitest";
import { buildApp } from "../../src/app";
import type { App } from "../../src/tipos";
import { auth, criarBarbeariaComToken, criarMembroComToken } from "../helpers/barbearia";
import { DOMINGO, QUINTA, quintaPassada } from "../helpers/datas";

// Painel v2, marco 3 (3c): exceções por data na barbearia — fechar num
// feriado ou mudar o horário de um dia. A exceção substitui o horário
// do dia da semana naquela data, pra toda a equipe, no link e no painel.
// Exceção de uma pessoa só continua sendo bloqueio.
//
// Barbearia aberta de segunda a sábado, 09:00–18:00; Corte de 30 min.

async function prepararAgenda(app: App) {
  const dono = await criarBarbeariaComToken(app);
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
  const corte = (
    await app.inject({
      method: "POST",
      url: "/servicos",
      headers: auth(dono.token),
      payload: { nome: "Corte", duracaoMinutos: 30, preco: "40.00" },
    })
  ).json();
  return { dono, corte };
}

type Agenda = Awaited<ReturnType<typeof prepararAgenda>>;

function putExcecao(app: App, token: string, data: string, corpo: Record<string, unknown>) {
  return app.inject({
    method: "PUT",
    url: `/barbearias/me/horarios/excecoes/${data}`,
    headers: auth(token),
    payload: corpo,
  });
}

function lerExcecoes(app: App, token: string) {
  return app.inject({ method: "GET", url: "/barbearias/me/horarios/excecoes", headers: auth(token) });
}

async function horariosDo(app: App, agenda: Agenda, data: string): Promise<string[]> {
  const params = new URLSearchParams({ barbeiroId: agenda.dono.barbeiroId, data });
  params.append("servicoIds", agenda.corte.id);
  const resposta = await app.inject({
    method: "GET",
    url: `/barbearias/${agenda.dono.slug}/disponibilidade?${params}`,
  });
  return resposta.json().horarios;
}

function agendarPublico(app: App, agenda: Agenda, data: string, horaInicio: string) {
  return app.inject({
    method: "POST",
    url: `/barbearias/${agenda.dono.slug}/agendamentos`,
    payload: {
      barbeiroId: agenda.dono.barbeiroId,
      servicoIds: [agenda.corte.id],
      data,
      horaInicio,
      cliente: { nome: "João", telefone: "11999990001" },
    },
  });
}

describe("PUT /barbearias/me/horarios/excecoes/:data", () => {
  it("fecha a data (feriado) e a lista mostra a exceção", async () => {
    const app = buildApp();
    const { dono } = await prepararAgenda(app);

    const resposta = await putExcecao(app, dono.token, QUINTA, { fechado: true, motivo: "Feriado" });
    const lista = await lerExcecoes(app, dono.token);

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toEqual({
      excecao: { data: QUINTA, fechado: true, horaAbertura: null, horaFechamento: null, motivo: "Feriado" },
      foraDoHorario: 0,
    });
    expect(lista.json().excecoes).toEqual([resposta.json().excecao]);
    await app.close();
  });

  it("muda o horário da data; mandar de novo substitui", async () => {
    const app = buildApp();
    const { dono } = await prepararAgenda(app);

    await putExcecao(app, dono.token, QUINTA, { fechado: true });
    const resposta = await putExcecao(app, dono.token, QUINTA, {
      fechado: false,
      horaAbertura: "10:00",
      horaFechamento: "14:00",
    });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json().excecao).toEqual({
      data: QUINTA,
      fechado: false,
      horaAbertura: "10:00",
      horaFechamento: "14:00",
      motivo: null,
    });
    expect((await lerExcecoes(app, dono.token)).json().excecoes).toHaveLength(1);
    await app.close();
  });

  it("aberto sem horas, horas invertidas ou data passada: 422", async () => {
    const app = buildApp();
    const { dono } = await prepararAgenda(app);

    const semHoras = await putExcecao(app, dono.token, QUINTA, { fechado: false });
    const invertido = await putExcecao(app, dono.token, QUINTA, {
      fechado: false,
      horaAbertura: "14:00",
      horaFechamento: "10:00",
    });
    const passada = await putExcecao(app, dono.token, quintaPassada(), { fechado: true });

    expect(semHoras.json().erro).toBe("horario_incompleto");
    expect(invertido.json().erro).toBe("intervalo_invalido");
    expect(passada.statusCode).toBe(422);
    expect(passada.json().erro).toBe("data_passada");
    expect((await lerExcecoes(app, dono.token)).json().excecoes).toEqual([]);
    await app.close();
  });

  it("data fora do formato é 400, e data que não existe é 422", async () => {
    const app = buildApp();
    const { dono } = await prepararAgenda(app);

    const formato = await putExcecao(app, dono.token, "amanha", { fechado: true });
    const inexistente = await putExcecao(app, dono.token, "2037-02-30", { fechado: true });

    expect(formato.statusCode).toBe(400);
    expect(inexistente.statusCode).toBe(422);
    expect(inexistente.json().erro).toBe("data_invalida");
    await app.close();
  });

  it("só o dono muda; todo papel lê", async () => {
    const app = buildApp();
    const { dono } = await prepararAgenda(app);
    const ana = await criarMembroComToken(app, dono.barbeariaId, "profissional", "a");
    await putExcecao(app, dono.token, QUINTA, { fechado: true });

    const mudar = await putExcecao(app, ana.token, QUINTA, { fechado: true });
    const ler = await lerExcecoes(app, ana.token);

    expect(mudar.statusCode).toBe(403);
    expect(ler.statusCode).toBe(200);
    expect(ler.json().excecoes).toHaveLength(1);
    await app.close();
  });

  it("a exceção de uma barbearia não aparece na outra", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");
    const dois = await criarBarbeariaComToken(app, "dois");
    await putExcecao(app, um.token, QUINTA, { fechado: true });

    expect((await lerExcecoes(app, dois.token)).json().excecoes).toEqual([]);
    await app.close();
  });

  it("salvar uma exceção decide Horários", async () => {
    const app = buildApp();
    const dono = await criarBarbeariaComToken(app);

    await putExcecao(app, dono.token, QUINTA, { fechado: true });
    const barbearia = await app.inject({ method: "GET", url: "/barbearias/me", headers: auth(dono.token) });

    expect(barbearia.json().areasDecididas).toContain("horarios");
    await app.close();
  });

  it("não mexe nos agendamentos da data: conta quantos ficam fora do horário novo", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);
    await agendarPublico(app, agenda, QUINTA, "15:00");
    await agendarPublico(app, agenda, QUINTA, "11:00");

    const encurtado = await putExcecao(app, agenda.dono.token, QUINTA, {
      fechado: false,
      horaAbertura: "10:00",
      horaFechamento: "14:00",
    });
    const fechado = await putExcecao(app, agenda.dono.token, QUINTA, { fechado: true });
    const agendamentos = await app.inject({
      method: "GET",
      url: `/agendamentos?data=${QUINTA}`,
      headers: auth(agenda.dono.token),
    });

    expect(encurtado.json().foraDoHorario).toBe(1);
    expect(fechado.json().foraDoHorario).toBe(2);
    expect(agendamentos.json().agendamentos).toHaveLength(2);
    await app.close();
  });
});

describe("DELETE /barbearias/me/horarios/excecoes/:data", () => {
  it("apaga a exceção, e a data volta ao horário da semana", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);
    await putExcecao(app, agenda.dono.token, QUINTA, { fechado: true });

    const resposta = await app.inject({
      method: "DELETE",
      url: `/barbearias/me/horarios/excecoes/${QUINTA}`,
      headers: auth(agenda.dono.token),
    });

    expect(resposta.statusCode).toBe(204);
    expect((await lerExcecoes(app, agenda.dono.token)).json().excecoes).toEqual([]);
    expect(await horariosDo(app, agenda, QUINTA)).toContain("09:00");
    await app.close();
  });

  it("data sem exceção: 404", async () => {
    const app = buildApp();
    const { dono } = await prepararAgenda(app);

    const resposta = await app.inject({
      method: "DELETE",
      url: `/barbearias/me/horarios/excecoes/${QUINTA}`,
      headers: auth(dono.token),
    });

    expect(resposta.statusCode).toBe(404);
    await app.close();
  });
});

// A exceção vale nos três caminhos da disponibilidade: o dia, o mês e o
// POST — pro link e pro painel.
describe("exceção na disponibilidade", () => {
  it("feriado: a data fica sem horários, sem vaga no mês, e marcar dá 422", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);
    await putExcecao(app, agenda.dono.token, QUINTA, { fechado: true });
    const params = new URLSearchParams({ barbeiroId: agenda.dono.barbeiroId, mes: QUINTA.slice(0, 7) });
    params.append("servicoIds", agenda.corte.id);

    const horarios = await horariosDo(app, agenda, QUINTA);
    const { dias } = (
      await app.inject({ method: "GET", url: `/barbearias/${agenda.dono.slug}/disponibilidade/mes?${params}` })
    ).json();
    const marcar = await agendarPublico(app, agenda, QUINTA, "10:00");

    expect(horarios).toEqual([]);
    expect(dias[QUINTA]).toBe(false);
    expect(marcar.statusCode).toBe(422);
    expect(marcar.json().erro).toBe("horario_indisponivel");
    await app.close();
  });

  it("horário especial: os horários da data seguem a exceção", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);
    await putExcecao(app, agenda.dono.token, QUINTA, {
      fechado: false,
      horaAbertura: "10:00",
      horaFechamento: "14:00",
    });

    const horarios = await horariosDo(app, agenda, QUINTA);

    expect(horarios[0]).toBe("10:00");
    // 13:30 + 30 min fecha às 14:00.
    expect(horarios.at(-1)).toBe("13:30");
    await app.close();
  });

  it("abre num dia que a semana deixa fechado", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);
    await putExcecao(app, agenda.dono.token, DOMINGO, {
      fechado: false,
      horaAbertura: "09:00",
      horaFechamento: "12:00",
    });

    const marcar = await agendarPublico(app, agenda, DOMINGO, "09:00");

    expect(await horariosDo(app, agenda, DOMINGO)).toContain("11:30");
    expect(marcar.statusCode).toBe(201);
    await app.close();
  });

  it("o painel também não marca numa data fechada", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);
    await putExcecao(app, agenda.dono.token, QUINTA, { fechado: true });
    const cliente = (
      await app.inject({
        method: "POST",
        url: "/clientes",
        headers: auth(agenda.dono.token),
        payload: { nome: "Maria", telefone: "11999990002" },
      })
    ).json();

    const resposta = await app.inject({
      method: "POST",
      url: "/agendamentos",
      headers: auth(agenda.dono.token),
      payload: {
        barbeiroId: agenda.dono.barbeiroId,
        clienteId: cliente.id,
        servicoIds: [agenda.corte.id],
        data: QUINTA,
        horaInicio: "10:00",
      },
    });

    expect(resposta.json().erro).toBe("horario_indisponivel");
    await app.close();
  });
});
