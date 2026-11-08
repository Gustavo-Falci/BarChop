import { describe, expect, it } from "vitest";
import { buildApp } from "../../src/app";
import type { App } from "../../src/tipos";
import { prepararAgenda, type Agenda } from "../helpers/agenda";
import { auth } from "../helpers/barbearia";
import { criarClienteComToken } from "../helpers/cliente";
import { QUINTA } from "../helpers/datas";

// O encaixe (pedido do barbeiro, 08/11/2026): o painel marca com uma
// duração menor que a dos serviços, pra caber num buraco. O preço e a
// duração congelada dos serviços não mudam; só o horaFim. Não tem
// coluna: encaixe é horaFim - horaInicio menor que a soma dos serviços.

function marcar(app: App, agenda: Agenda, horaInicio: string, extra: Record<string, unknown> = {}) {
  return app.inject({
    method: "POST",
    url: "/agendamentos",
    headers: auth(agenda.token),
    payload: {
      barbeiroId: agenda.barbeiroId,
      clienteId: agenda.cliente.id,
      servicoIds: [agenda.servico.id],
      data: QUINTA,
      horaInicio,
      ...extra,
    },
  });
}

function query(agenda: Agenda, extra: Record<string, string>) {
  const params = new URLSearchParams({ barbeiroId: agenda.barbeiroId, servicoIds: agenda.servico.id, ...extra });
  return params.toString();
}

function diaDoPainel(app: App, agenda: Agenda, extra: Record<string, string> = {}, comToken = true) {
  return app.inject({
    method: "GET",
    url: `/barbearias/${agenda.slug}/disponibilidade?${query(agenda, { data: QUINTA, ...extra })}`,
    headers: comToken ? auth(agenda.token) : {},
  });
}

function mesDoPainel(app: App, agenda: Agenda, extra: Record<string, string> = {}) {
  return app.inject({
    method: "GET",
    url: `/barbearias/${agenda.slug}/disponibilidade/mes?${query(agenda, { mes: QUINTA.slice(0, 7), ...extra })}`,
    headers: auth(agenda.token),
  });
}

// Só 09:00 – 09:20 livre na quinta: cabe um encaixe, não o Corte de 45.
async function sobraUmBuraco(app: App, agenda: Agenda) {
  const resposta = await app.inject({
    method: "POST",
    url: "/bloqueios",
    headers: auth(agenda.token),
    payload: {
      barbeiroId: agenda.barbeiroId,
      dataInicio: QUINTA,
      dataFim: QUINTA,
      horaInicio: "09:20",
      horaFim: "18:00",
      motivo: "Curso",
    },
  });
  if (resposta.statusCode !== 201) throw new Error(`bloqueio falhou: ${resposta.statusCode} ${resposta.body}`);
}

describe("encaixe", () => {
  it("encaixe de 15 min: termina 15 min depois, e o serviço continua com a duração dele", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);

    const resposta = await marcar(app, agenda, "10:00", { duracaoMinutos: 15 });

    expect(resposta.statusCode).toBe(201);
    expect(resposta.json()).toMatchObject({ horaInicio: "10:00", horaFim: "10:15" });
    expect(resposta.json().servicos[0]).toMatchObject({ duracaoNoMomento: 45, precoNoMomento: "45.00" });
    await app.close();
  });

  it("o próximo pode começar no fim do encaixe", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);
    await marcar(app, agenda, "10:00", { duracaoMinutos: 15 });

    const depois = await marcar(app, agenda, "10:15");

    expect(depois.statusCode).toBe(201);
    await app.close();
  });

  it("encaixe do tamanho do serviço ou maior: 422 encaixe_invalido", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);

    const igual = await marcar(app, agenda, "10:00", { duracaoMinutos: 45 });
    const maior = await marcar(app, agenda, "10:00", { duracaoMinutos: 60 });

    expect(igual.statusCode).toBe(422);
    expect(igual.json().erro).toBe("encaixe_invalido");
    expect(maior.json().erro).toBe("encaixe_invalido");
    await app.close();
  });

  it("fora do passo de 5 min: 400", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);

    const resposta = await marcar(app, agenda, "10:00", { duracaoMinutos: 12 });

    expect(resposta.statusCode).toBe(400);
    await app.close();
  });

  it("o buraco menor que o serviço só aparece com o encaixe, no dia e no mês", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);
    await sobraUmBuraco(app, agenda);

    const semEncaixe = (await diaDoPainel(app, agenda)).json().horarios;
    const comEncaixe = (await diaDoPainel(app, agenda, { duracaoMinutos: "15" })).json().horarios;
    const mesSem = (await mesDoPainel(app, agenda)).json().dias;
    const mesCom = (await mesDoPainel(app, agenda, { duracaoMinutos: "15" })).json().dias;

    expect(semEncaixe).toEqual([]);
    expect(comEncaixe).toEqual(["09:00"]);
    expect(mesSem[QUINTA]).toBe(false);
    expect(mesCom[QUINTA]).toBe(true);
    await app.close();
  });

  it("a conferência do outro horário também mede o encaixe", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);
    await sobraUmBuraco(app, agenda);

    const conferir = (extra: Record<string, string>) =>
      app.inject({
        method: "GET",
        url: `/agendamentos/cabe?${query(agenda, { data: QUINTA, horaInicio: "09:05", ...extra })}`,
        headers: auth(agenda.token),
      });

    expect((await conferir({ duracaoMinutos: "15" })).json()).toEqual({ cabe: true });
    expect((await conferir({})).json()).toMatchObject({ cabe: false, codigo: "horario_bloqueado" });
    await app.close();
  });

  it("encaixe é só do painel: o link pedindo duração recebe 422", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);

    const resposta = await diaDoPainel(app, agenda, { duracaoMinutos: "15" }, false);

    expect(resposta.statusCode).toBe(422);
    expect(resposta.json().erro).toBe("encaixe_so_no_painel");
    await app.close();
  });

  it("o painel remarca o encaixe e mantém a duração dele", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);
    const encaixe = (await marcar(app, agenda, "10:00", { duracaoMinutos: 15 })).json();

    const resposta = await app.inject({
      method: "POST",
      url: `/agendamentos/${encaixe.id}/remarcar`,
      headers: auth(agenda.token),
      payload: { data: QUINTA, horaInicio: "14:00" },
    });

    expect(resposta.statusCode).toBe(201);
    expect(resposta.json()).toMatchObject({ horaInicio: "14:00", horaFim: "14:15" });
    await app.close();
  });

  it("o cliente remarca o encaixe pelo link e volta pra duração do serviço (decisão do dono, 08/11)", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);
    const encaixe = (await marcar(app, agenda, "10:00", { duracaoMinutos: 15 })).json();
    const { token } = await criarClienteComToken(app, agenda.slug, agenda.telefone);

    const resposta = await app.inject({
      method: "POST",
      url: `/clientes/me/agendamentos/${encaixe.id}/remarcar`,
      headers: auth(token),
      payload: { data: QUINTA, horaInicio: "14:00" },
    });

    expect(resposta.statusCode).toBe(201);
    expect(resposta.json().agendamento).toMatchObject({ horaInicio: "14:00", horaFim: "14:45" });
    await app.close();
  });
});
