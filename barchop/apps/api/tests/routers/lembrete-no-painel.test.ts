import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@barchop/database";
import { buildApp } from "../../src/app";
import { assinarTokenDoLembrete, instanteNaBarbearia } from "../../src/lib/lembrete";
import { auth, criarMembroComToken } from "../helpers/barbearia";
import { QUINTA } from "../helpers/datas";
import { marcarPeloPainel, prepararAgenda } from "../helpers/agenda";

describe("antecedência do lembrete nas configurações", () => {
  it("o painel lê a antecedência; o padrão é 24 h", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);

    const resposta = await app.inject({ method: "GET", url: "/barbearias/me", headers: auth(agenda.token) });

    expect(resposta.json().lembreteAntecedenciaHoras).toBe(24);
  });

  it("o dono troca pra 2, 12 ou 24 h", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);

    const resposta = await app.inject({
      method: "PATCH",
      url: "/barbearias/me",
      headers: auth(agenda.token),
      payload: { lembreteAntecedenciaHoras: 12 },
    });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json().lembreteAntecedenciaHoras).toBe(12);
    const gravada = await prisma.barbearia.findUniqueOrThrow({ where: { id: agenda.barbeariaId } });
    expect(gravada.lembreteAntecedenciaHoras).toBe(12);
  });

  it("fora de 2, 12 ou 24 é 400", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);

    const resposta = await app.inject({
      method: "PATCH",
      url: "/barbearias/me",
      headers: auth(agenda.token),
      payload: { lembreteAntecedenciaHoras: 5 },
    });

    expect(resposta.statusCode).toBe(400);
  });

  it("a página pública não mostra a antecedência", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);

    const resposta = await app.inject({ method: "GET", url: `/barbearias/${agenda.slug}` });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).not.toHaveProperty("lembreteAntecedenciaHoras");
  });
});

describe("presença confirmada na agenda", () => {
  it("o agendamento do painel diz quando o cliente confirmou pelo link", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);
    const agendamento = await marcarPeloPainel(app, agenda, { data: QUINTA, horaInicio: "10:00" });
    const lido = () =>
      app.inject({ method: "GET", url: `/agendamentos/${agendamento.id}`, headers: auth(agenda.token) });

    expect((await lido()).json().presencaConfirmadaEm).toBeNull();

    await app.ready();
    const token = assinarTokenDoLembrete(app, {
      agendamentoId: agendamento.id,
      expiraEm: instanteNaBarbearia(QUINTA, "10:00"),
    });
    await app.inject({ method: "POST", url: `/lembretes/${token}/confirmar` });

    expect((await lido()).json().presencaConfirmadaEm).toEqual(expect.any(String));
  });
});

describe("GET /agendamentos/:id/lembrete-whatsapp", () => {
  const urlAntes = process.env.URL_DO_PAINEL;
  afterEach(() => {
    if (urlAntes === undefined) delete process.env.URL_DO_PAINEL;
    else process.env.URL_DO_PAINEL = urlAntes;
  });

  function pedir(app: ReturnType<typeof buildApp>, token: string, id: string) {
    return app.inject({ method: "GET", url: `/agendamentos/${id}/lembrete-whatsapp`, headers: auth(token) });
  }

  it("devolve o wa.me do cliente com o texto do lembrete e o link de confirmar", async () => {
    process.env.URL_DO_PAINEL = "http://localhost:3000";
    const app = buildApp();
    const agenda = await prepararAgenda(app);
    const agendamento = await marcarPeloPainel(app, agenda, { data: QUINTA, horaInicio: "10:00" });

    const resposta = await pedir(app, agenda.token, agendamento.id);

    expect(resposta.statusCode).toBe(200);
    // O link de cancelar funciona: não fica em cache nenhum.
    expect(resposta.headers["cache-control"]).toBe("no-store");
    const url = new URL(resposta.json().url);
    const digitos = agenda.telefone.replace(/\D/g, "");
    expect(`${url.origin}${url.pathname}`).toBe(`https://wa.me/55${digitos}`);
    const texto = url.searchParams.get("text")!;
    expect(texto).toContain("Barbearia um");
    expect(texto).toContain("10:00");
    expect(texto).toContain(`http://localhost:3000/${agenda.slug}/lembrete/`);
  });

  it("sem URL do site, o texto vai sem link", async () => {
    delete process.env.URL_DO_PAINEL;
    const app = buildApp();
    const agenda = await prepararAgenda(app);
    const agendamento = await marcarPeloPainel(app, agenda, { data: QUINTA, horaInicio: "10:00" });

    const resposta = await pedir(app, agenda.token, agendamento.id);

    expect(resposta.statusCode).toBe(200);
    expect(new URL(resposta.json().url).searchParams.get("text")).not.toContain("/lembrete/");
  });

  it("cancelado não se lembra", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);
    const agendamento = await marcarPeloPainel(app, agenda, { data: QUINTA, horaInicio: "10:00" });
    await prisma.agendamento.update({ where: { id: agendamento.id }, data: { status: "cancelado" } });

    const resposta = await pedir(app, agenda.token, agendamento.id);

    expect(resposta.statusCode).toBe(422);
  });

  it("recepção pede o de qualquer um; profissional só o dele", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);
    const agendamento = await marcarPeloPainel(app, agenda, { data: QUINTA, horaInicio: "10:00" });
    const recepcao = await criarMembroComToken(app, agenda.barbeariaId, "recepcao", "r");
    const profissional = await criarMembroComToken(app, agenda.barbeariaId, "profissional", "p");

    expect((await pedir(app, recepcao.token, agendamento.id)).statusCode).toBe(200);
    expect((await pedir(app, profissional.token, agendamento.id)).statusCode).toBe(404);
  });

  it("agendamento de outra barbearia é 404", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);
    const outra = await prepararAgenda(app, { sufixo: "dois" });
    const agendamento = await marcarPeloPainel(app, agenda, { data: QUINTA, horaInicio: "10:00" });

    expect((await pedir(app, outra.token, agendamento.id)).statusCode).toBe(404);
  });
});
