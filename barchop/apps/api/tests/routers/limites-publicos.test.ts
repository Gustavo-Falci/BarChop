import { describe, expect, it } from "vitest";
import { buildApp } from "../../src/app";
import { auth, criarBarbeariaComToken } from "../helpers/barbearia";
import { QUINTA } from "../helpers/datas";
import type { App } from "../../src/tipos";

// Onda 1, G2: as rotas abertas que custam caro ou mandam e-mail ganham
// limite antes de o Resend ir pra produção — a reputação do domínio é
// uma só. O limite roda antes da rota: até o 404 de um slug inexistente
// gasta o orçamento, que é o que segura quem varre.

const MAX_AGENDAR_POR_EMAIL = 5;
const MAX_AGENDAR_POR_IP = 20;
const MAX_PROXIMOS_POR_IP = 60;
const MAX_CONVITES_POR_BARBEARIA = 20;

const ID = "00000000-0000-4000-8000-000000000001";

function agendar(app: App, email?: string) {
  return app.inject({
    method: "POST",
    url: "/barbearias/nao-existe/agendamentos",
    payload: {
      servicoIds: [ID],
      data: QUINTA,
      horaInicio: "10:00",
      cliente: { nome: "Cliente", telefone: "(11) 99999-8888", ...(email ? { email } : {}) },
    },
  });
}

async function repetir(vezes: number, chamada: () => Promise<{ statusCode: number }>) {
  const status: number[] = [];
  for (let i = 0; i < vezes; i += 1) status.push((await chamada()).statusCode);
  return status;
}

describe("limite do agendamento público", () => {
  it("o mesmo e-mail de lembrete não recebe mais que o limite por hora", async () => {
    const app = buildApp();

    const antes = await repetir(MAX_AGENDAR_POR_EMAIL, () => agendar(app, "alvo@exemplo.com"));
    const bloqueado = await agendar(app, "ALVO@exemplo.com");

    expect(antes).not.toContain(429);
    expect(bloqueado.statusCode).toBe(429);
    expect(bloqueado.json().erro).toBe("tentativas_excedidas");
    // Outro endereço segue: o limite é da caixa que recebe.
    expect((await agendar(app, "outro@exemplo.com")).statusCode).not.toBe(429);
    await app.close();
  });

  it("sem e-mail, só o limite por IP vale", async () => {
    const app = buildApp();

    const antes = await repetir(MAX_AGENDAR_POR_IP, () => agendar(app));
    const bloqueado = await agendar(app);

    expect(antes).not.toContain(429);
    expect(bloqueado.statusCode).toBe(429);
    await app.close();
  });
});

describe("limite dos próximos horários", () => {
  it("recusa a chamada seguinte ao limite do IP", async () => {
    const app = buildApp();
    const chamar = () => app.inject({ method: "GET", url: "/barbearias/nao-existe/proximos-horarios" });

    const antes = await repetir(MAX_PROXIMOS_POR_IP, chamar);
    const bloqueado = await chamar();

    expect(antes).not.toContain(429);
    expect(bloqueado.statusCode).toBe(429);
    await app.close();
  });
});

describe("limite de convites da equipe", () => {
  it("convidar e reenviar dividem um orçamento por barbearia", async () => {
    const app = buildApp();
    const dono = await criarBarbeariaComToken(app, "um");
    const outra = await criarBarbeariaComToken(app, "dois");

    const convidar = (token: string, indice: number) =>
      app.inject({
        method: "POST",
        url: "/equipe",
        headers: auth(token),
        payload: { nome: `Membro ${indice}`, email: `membro-${indice}@exemplo.com`, papel: "profissional" },
      });

    let ultimoId = "";
    for (let indice = 0; indice < MAX_CONVITES_POR_BARBEARIA; indice += 1) {
      const resposta = await convidar(dono.token, indice);
      expect(resposta.statusCode).toBe(201);
      ultimoId = resposta.json().id;
    }

    const reenvio = await app.inject({
      method: "POST",
      url: `/equipe/${ultimoId}/convite`,
      headers: auth(dono.token),
    });
    expect(reenvio.statusCode).toBe(429);
    expect(reenvio.json().erro).toBe("tentativas_excedidas");
    expect((await convidar(dono.token, 99)).statusCode).toBe(429);

    // A outra barbearia tem o orçamento dela.
    expect((await convidar(outra.token, 100)).statusCode).toBe(201);
    await app.close();
  });
});
