import { describe, expect, it } from "vitest";
import { prisma } from "@barchop/database";
import { buildApp } from "../src/app";
import { auth, criarBarbeariaComToken, criarMembroComToken } from "./helpers/barbearia";

// Onda 1, B1: cada membro tem a semana de trabalho (jornada), os
// serviços que faz e os bloqueios (folga, almoço, horário fechado).
//
// A jornada guarda sete dias, sempre, cada um num de três modos:
// `barbearia` (acompanha o horário de funcionamento), `proprio` (horas
// do membro) ou `folga`. Nasce tudo `barbearia` — o signup cria a
// barbearia sem horário, e copiar o funcionamento daria ao dono uma
// semana de folga e congelaria a jornada quando o horário mudasse.
//
// Quem garante os sete dias e os serviços é o banco (trigger no insert
// do membro e do serviço), e não cada rota: o membro criado por qualquer
// caminho — signup, convite, ou o Prisma cru dos testes — nasce inteiro.

async function jornadaDe(barbeiroId: string) {
  return prisma.jornadaProfissional.findMany({
    where: { barbeiroId },
    orderBy: { diaSemana: "asc" },
  });
}

async function servicosDe(barbeiroId: string) {
  const linhas = await prisma.profissionalServico.findMany({ where: { barbeiroId } });
  return linhas.map((linha) => linha.servicoId).sort();
}

function criarServico(app: ReturnType<typeof buildApp>, token: string, nome: string) {
  return app
    .inject({
      method: "POST",
      url: "/servicos",
      headers: auth(token),
      payload: { nome, duracaoMinutos: 30, preco: "40.00" },
    })
    .then((resposta) => resposta.json() as { id: string });
}

describe("jornada do membro", () => {
  it("o dono nasce com os sete dias acompanhando a barbearia", async () => {
    const app = buildApp();
    const dono = await criarBarbeariaComToken(app);

    const jornada = await jornadaDe(dono.barbeiroId);

    expect(jornada.map((dia) => dia.diaSemana)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    for (const dia of jornada) {
      expect(dia).toMatchObject({ modo: "barbearia", horaInicio: null, horaFim: null });
    }
    await app.close();
  });

  it("o convidado e o membro criado direto no banco também nascem com os sete dias", async () => {
    const app = buildApp();
    const dono = await criarBarbeariaComToken(app);
    const convidado = await app.inject({
      method: "POST",
      url: "/equipe",
      headers: auth(dono.token),
      payload: { nome: "Ana", email: "ana@exemplo.com", papel: "profissional" },
    });
    const direto = await criarMembroComToken(app, dono.barbeariaId, "recepcao", "r");

    expect(await jornadaDe(convidado.json().id)).toHaveLength(7);
    expect(await jornadaDe(direto.barbeiroId)).toHaveLength(7);
    await app.close();
  });

  it("o banco recusa hora própria pela metade, invertida, ou hora em dia que não é próprio", async () => {
    const app = buildApp();
    const dono = await criarBarbeariaComToken(app);
    const segunda = { barbeiroId_diaSemana: { barbeiroId: dono.barbeiroId, diaSemana: 1 } };
    const hora = (texto: string) => new Date(`1970-01-01T${texto}:00Z`);

    await expect(
      prisma.jornadaProfissional.update({
        where: segunda,
        data: { modo: "proprio", horaInicio: hora("09:00") },
      })
    ).rejects.toThrow();
    await expect(
      prisma.jornadaProfissional.update({
        where: segunda,
        data: { modo: "proprio", horaInicio: hora("18:00"), horaFim: hora("09:00") },
      })
    ).rejects.toThrow();
    await expect(
      prisma.jornadaProfissional.update({
        where: segunda,
        data: { modo: "folga", horaInicio: hora("09:00"), horaFim: hora("12:00") },
      })
    ).rejects.toThrow();
    await app.close();
  });
});

describe("serviços que cada membro faz", () => {
  it("serviço novo entra pra equipe inteira — inclusive quem hoje não atende", async () => {
    // Só pra quem atende faria a recepção que passa a atender sumir da
    // agenda sem serviço nenhum, e sem aviso.
    const app = buildApp();
    const dono = await criarBarbeariaComToken(app);
    const recepcao = await criarMembroComToken(app, dono.barbeariaId, "recepcao", "r");

    const corte = await criarServico(app, dono.token, "Corte");

    expect(await servicosDe(dono.barbeiroId)).toEqual([corte.id]);
    expect(await servicosDe(recepcao.barbeiroId)).toEqual([corte.id]);
    await app.close();
  });

  it("membro novo faz todos os serviços da barbearia, os inativos também", async () => {
    // Inativo junto: reativar o serviço não pode deixar o membro de fora.
    const app = buildApp();
    const dono = await criarBarbeariaComToken(app);
    const corte = await criarServico(app, dono.token, "Corte");
    const barba = await criarServico(app, dono.token, "Barba");
    await app.inject({ method: "DELETE", url: `/servicos/${barba.id}`, headers: auth(dono.token) });

    const ana = await criarMembroComToken(app, dono.barbeariaId, "profissional", "p");

    expect(await servicosDe(ana.barbeiroId)).toEqual([corte.id, barba.id].sort());
    await app.close();
  });

  it("serviço de outra barbearia não entra", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");
    const dois = await criarBarbeariaComToken(app, "dois");

    await criarServico(app, dois.token, "Corte");

    expect(await servicosDe(um.barbeiroId)).toEqual([]);
    await app.close();
  });
});

describe("bloqueio", () => {
  it("guarda um período, com hora opcional, e recusa período invertido ou hora pela metade", async () => {
    const app = buildApp();
    const dono = await criarBarbeariaComToken(app);
    const dia = (texto: string) => new Date(`${texto}T00:00:00Z`);
    const hora = (texto: string) => new Date(`1970-01-01T${texto}:00Z`);
    const base = { barbeariaId: dono.barbeariaId, barbeiroId: dono.barbeiroId };

    const ferias = await prisma.bloqueio.create({
      data: { ...base, dataInicio: dia("2037-01-05"), dataFim: dia("2037-01-09"), motivo: "Férias" },
    });
    expect(ferias.horaInicio).toBeNull();

    await expect(
      prisma.bloqueio.create({ data: { ...base, dataInicio: dia("2037-01-09"), dataFim: dia("2037-01-05") } })
    ).rejects.toThrow();
    await expect(
      prisma.bloqueio.create({
        data: { ...base, dataInicio: dia("2037-01-05"), dataFim: dia("2037-01-05"), horaInicio: hora("12:00") },
      })
    ).rejects.toThrow();
    await expect(
      prisma.bloqueio.create({
        data: {
          ...base,
          dataInicio: dia("2037-01-05"),
          dataFim: dia("2037-01-05"),
          horaInicio: hora("13:00"),
          horaFim: hora("12:00"),
        },
      })
    ).rejects.toThrow();
    await app.close();
  });
});
