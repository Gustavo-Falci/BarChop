import { describe, expect, it } from "vitest";
import { prisma } from "@barchop/database";
import { buildApp } from "../../src/app";
import { criarAgendamento } from "../../src/lib/agendamento";
import { travarQualquerUm } from "../../src/lib/disponibilidade";
import type { App } from "../../src/tipos";
import { auth, criarBarbeariaComToken, criarMembroComToken } from "../helpers/barbearia";
import { QUINTA } from "../helpers/datas";

// Onda 1, C1: "qualquer um". Sem `barbeiroId`, a disponibilidade é a
// união da agenda de quem pode atender — ativo, que atende, que já
// entrou e faz todos os serviços —, e o POST público escolhe, dentro da
// transação, o livre com menos agendamentos no dia.
//
// Barbearia de segunda a sábado, 09:00–18:00; Corte de 30 min; o dono
// (primeiro a entrar) e a Ana atendem. QUINTA é futura.

async function prepararEquipe(app: App) {
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
  const ana = await criarMembroComToken(app, dono.barbeariaId, "profissional", "a");
  return { dono, corte, ana };
}

type Equipe = Awaited<ReturnType<typeof prepararEquipe>>;

function naQuinta(app: App, equipe: Equipe, barbeiroId: string, dia: Record<string, unknown>) {
  return app.inject({
    method: "PUT",
    url: `/equipe/${barbeiroId}/jornada`,
    headers: auth(equipe.dono.token),
    payload: {
      jornada: [0, 1, 2, 3, 4, 5, 6].map((diaSemana) =>
        diaSemana === 4 ? { diaSemana, ...dia } : { diaSemana, modo: "barbearia" }
      ),
    },
  });
}

async function horariosDeQualquerUm(app: App, equipe: Equipe) {
  const params = new URLSearchParams({ data: QUINTA });
  params.append("servicoIds", equipe.corte.id);
  const resposta = await app.inject({
    method: "GET",
    url: `/barbearias/${equipe.dono.slug}/disponibilidade?${params}`,
  });
  expect(resposta.statusCode).toBe(200);
  return resposta.json().horarios as string[];
}

function agendar(app: App, equipe: Equipe, horaInicio: string, extra: Record<string, unknown> = {}) {
  return app.inject({
    method: "POST",
    url: `/barbearias/${equipe.dono.slug}/agendamentos`,
    payload: {
      servicoIds: [equipe.corte.id],
      data: QUINTA,
      horaInicio,
      cliente: { nome: "João", telefone: `1199999${String(Math.floor(Math.random() * 9000) + 1000)}` },
      ...extra,
    },
  });
}

describe("disponibilidade de qualquer um", () => {
  it("é a união da agenda de quem atende", async () => {
    const app = buildApp();
    const equipe = await prepararEquipe(app);
    await naQuinta(app, equipe, equipe.dono.barbeiroId, { modo: "proprio", horaInicio: "09:00", horaFim: "12:00" });
    await naQuinta(app, equipe, equipe.ana.barbeiroId, { modo: "proprio", horaInicio: "14:00", horaFim: "18:00" });

    const horarios = await horariosDeQualquerUm(app, equipe);

    expect(horarios).toContain("09:00");
    expect(horarios).toContain("14:00");
    expect(horarios).not.toContain("12:30");
    // Ordenada e sem repetir, mesmo que dois atendam na mesma hora.
    expect(horarios).toEqual([...new Set(horarios)].sort());
    await app.close();
  });

  it("não conta quem não faz o serviço, quem não atende nem quem ainda não aceitou o convite", async () => {
    const app = buildApp();
    const equipe = await prepararEquipe(app);
    await naQuinta(app, equipe, equipe.dono.barbeiroId, { modo: "folga" });
    await app.inject({
      method: "PUT",
      url: `/equipe/${equipe.ana.barbeiroId}/servicos`,
      headers: auth(equipe.dono.token),
      payload: { servicoIds: [] },
    });
    await criarMembroComToken(app, equipe.dono.barbeariaId, "recepcao", "r");
    await app.inject({
      method: "POST",
      url: "/equipe",
      headers: auth(equipe.dono.token),
      payload: { nome: "Convidado", email: "convidado@exemplo.com", papel: "profissional" },
    });

    expect(await horariosDeQualquerUm(app, equipe)).toEqual([]);
    await app.close();
  });

  it("no mês, o dia tem vaga se alguém tem", async () => {
    // Setembro de 2037: 3 e 10 são quintas.
    const app = buildApp();
    const equipe = await prepararEquipe(app);
    await naQuinta(app, equipe, equipe.dono.barbeiroId, { modo: "folga" });
    const mes = async () => {
      const params = new URLSearchParams({ mes: "2037-09" });
      params.append("servicoIds", equipe.corte.id);
      return (
        await app.inject({
          method: "GET",
          url: `/barbearias/${equipe.dono.slug}/disponibilidade/mes?${params}`,
        })
      ).json().dias as Record<string, boolean>;
    };

    expect((await mes())["2037-09-03"]).toBe(true);
    await naQuinta(app, equipe, equipe.ana.barbeiroId, { modo: "folga" });
    const semNinguem = await mes();
    expect(semNinguem["2037-09-03"]).toBe(false);
    expect(semNinguem["2037-09-04"]).toBe(true);
    await app.close();
  });
});

describe("POST público sem profissional", () => {
  it("marca com quem está livre na hora, e diz quem foi", async () => {
    const app = buildApp();
    const equipe = await prepararEquipe(app);
    await agendar(app, equipe, "10:00", { barbeiroId: equipe.dono.barbeiroId });

    const resposta = await agendar(app, equipe, "10:00");

    expect(resposta.statusCode).toBe(201);
    expect(resposta.json().barbeiro).toEqual({ id: equipe.ana.barbeiroId, nome: "Membro a" });
    await app.close();
  });

  it("entre os livres, escolhe quem tem menos agendamentos no dia", async () => {
    const app = buildApp();
    const equipe = await prepararEquipe(app);
    await agendar(app, equipe, "09:00", { barbeiroId: equipe.dono.barbeiroId });
    await agendar(app, equipe, "09:30", { barbeiroId: equipe.dono.barbeiroId });

    const resposta = await agendar(app, equipe, "15:00");

    expect(resposta.json().barbeiro.id).toBe(equipe.ana.barbeiroId);
    await app.close();
  });

  it("empate fica com quem entrou primeiro na equipe", async () => {
    const app = buildApp();
    const equipe = await prepararEquipe(app);

    const resposta = await agendar(app, equipe, "15:00");

    expect(resposta.json().barbeiro.id).toBe(equipe.dono.barbeiroId);
    await app.close();
  });

  it("ninguém livre na hora: 422 horario_indisponivel", async () => {
    const app = buildApp();
    const equipe = await prepararEquipe(app);
    await agendar(app, equipe, "10:00", { barbeiroId: equipe.dono.barbeiroId });
    await agendar(app, equipe, "10:00", { barbeiroId: equipe.ana.barbeiroId });

    const resposta = await agendar(app, equipe, "10:00");

    expect(resposta.statusCode).toBe(422);
    expect(resposta.json().erro).toBe("horario_indisponivel");
    await app.close();
  });

  it("o agendamento com profissional escolhido também diz quem é", async () => {
    const app = buildApp();
    const equipe = await prepararEquipe(app);

    const resposta = await agendar(app, equipe, "10:00", { barbeiroId: equipe.ana.barbeiroId });

    expect(resposta.json().barbeiro).toEqual({ id: equipe.ana.barbeiroId, nome: "Membro a" });
    await app.close();
  });

  it("dois pedidos de qualquer um na mesma hora: o segundo espera e fica com o outro profissional", async () => {
    // Promise.all de dois inject não prova a trava (ver a memória do A4).
    // Aqui o primeiro pedido é uma transação do próprio teste: pega a
    // trava do "qualquer um", marca com o dono e para antes do commit.
    // Sem a trava, a rota leria os dois com zero agendamentos, escolheria
    // o dono (entrou primeiro) e bateria na EXCLUDE: 409. Com ela, espera
    // o commit, vê o dono ocupado e fica com a Ana.
    const app = buildApp();
    const equipe = await prepararEquipe(app);
    const cliente = await prisma.cliente.create({
      data: { barbeariaId: equipe.dono.barbeariaId, nome: "Primeiro", telefone: "(11) 98888-0001" },
    });

    let soltar!: () => void;
    const segurando = new Promise<void>((resolver) => (soltar = resolver));
    let travou!: () => void;
    const comATrava = new Promise<void>((resolver) => (travou = resolver));

    const primeiro = prisma.$transaction(
      async (tx) => {
        await travarQualquerUm(tx, equipe.dono.barbeariaId, QUINTA);
        await criarAgendamento(tx, {
          barbeariaId: equipe.dono.barbeariaId,
          barbeiroId: equipe.dono.barbeiroId,
          clienteId: cliente.id,
          servicoIds: [equipe.corte.id],
          data: QUINTA,
          horaInicio: "10:00",
          origem: "cliente",
        });
        travou();
        await segurando;
      },
      { timeout: 10_000 }
    );

    await comATrava;
    const segundo = agendar(app, equipe, "10:00");
    await new Promise((resolver) => setTimeout(resolver, 300));
    soltar();
    await primeiro;

    const resposta = await segundo;
    expect(resposta.statusCode).toBe(201);
    expect(resposta.json().barbeiro.id).toBe(equipe.ana.barbeiroId);
    await app.close();
  });
});
