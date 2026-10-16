import { describe, expect, it } from "vitest";
import { prisma } from "@barchop/database";
import { buildApp } from "../../src/app";
import { auth, criarBarbeariaComToken, criarMembroComToken } from "../helpers/barbearia";

// A divisão do dinheiro (Onda 2, marco 2, PR 5 do plano caixa-do-dia):
// a parte da casa de cada membro e a matriz "cliente de A, atendido por
// B → % de A". Só o dono vê e muda. Entram os membros ativos que
// atendem; a recepção, quem saiu e quem não atende ficam de fora.

async function cenario() {
  const app = buildApp();
  const dono = await criarBarbeariaComToken(app);
  const parceiro = await criarMembroComToken(app, dono.barbeariaId, "profissional", "parceiro");
  const recepcao = await criarMembroComToken(app, dono.barbeariaId, "recepcao", "balcao");
  const saiu = await criarMembroComToken(app, dono.barbeariaId, "profissional", "saiu");
  await prisma.barbeiro.update({ where: { id: saiu.barbeiroId }, data: { ativo: false } });
  return { app, dono, parceiro, recepcao, saiu };
}

type Cenario = Awaited<ReturnType<typeof cenario>>;

function ver(c: Cenario, token = c.dono.token) {
  return c.app.inject({ method: "GET", url: "/barbearias/me/divisao", headers: auth(token) });
}

function salvar(c: Cenario, corpo: Record<string, unknown>, token = c.dono.token) {
  return c.app.inject({ method: "PUT", url: "/barbearias/me/divisao", headers: auth(token), payload: corpo });
}

describe("GET /barbearias/me/divisao", () => {
  it("começa com tudo em 0: os membros ativos que atendem, sem matriz", async () => {
    const c = await cenario();

    const resposta = await ver(c);

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toEqual({
      membros: [
        { id: c.dono.barbeiroId, nome: "Barbeiro um", parteDaCasa: 0 },
        { id: c.parceiro.barbeiroId, nome: "Membro parceiro", parteDaCasa: 0 },
      ],
      matriz: [],
    });
    await c.app.close();
  });

  it("quem deixou de atender sai da lista", async () => {
    const c = await cenario();
    await prisma.barbeiro.update({ where: { id: c.parceiro.barbeiroId }, data: { atende: false } });

    const membros = (await ver(c)).json().membros;

    expect(membros.map((m: { id: string }) => m.id)).toEqual([c.dono.barbeiroId]);
    await c.app.close();
  });
});

describe("PUT /barbearias/me/divisao", () => {
  it("grava a parte da casa e a matriz (a regra da GR), e devolve como ficou", async () => {
    const c = await cenario();

    const resposta = await salvar(c, {
      parteDaCasa: [{ membroId: c.parceiro.barbeiroId, percentual: 10 }],
      matriz: [
        { donoDoClienteId: c.dono.barbeiroId, atendenteId: c.parceiro.barbeiroId, percentual: 60 },
        { donoDoClienteId: c.parceiro.barbeiroId, atendenteId: c.dono.barbeiroId, percentual: 0 },
      ],
    });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toEqual({
      membros: [
        { id: c.dono.barbeiroId, nome: "Barbeiro um", parteDaCasa: 0 },
        { id: c.parceiro.barbeiroId, nome: "Membro parceiro", parteDaCasa: 10 },
      ],
      // Par em 0 é o mesmo que par sem linha: não fica gravado.
      matriz: [{ donoDoClienteId: c.dono.barbeiroId, atendenteId: c.parceiro.barbeiroId, percentual: 60 }],
    });
    expect(await prisma.regraDeDivisao.count()).toBe(1);
    expect((await ver(c)).json()).toEqual(resposta.json());
    await c.app.close();
  });

  it("a matriz enviada substitui a anterior; quem não veio na parte da casa fica como estava", async () => {
    const c = await cenario();
    await salvar(c, {
      parteDaCasa: [
        { membroId: c.dono.barbeiroId, percentual: 5 },
        { membroId: c.parceiro.barbeiroId, percentual: 10 },
      ],
      matriz: [{ donoDoClienteId: c.dono.barbeiroId, atendenteId: c.parceiro.barbeiroId, percentual: 60 }],
    });

    const resposta = await salvar(c, {
      parteDaCasa: [{ membroId: c.parceiro.barbeiroId, percentual: 0 }],
      matriz: [],
    });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toEqual({
      membros: [
        { id: c.dono.barbeiroId, nome: "Barbeiro um", parteDaCasa: 5 },
        { id: c.parceiro.barbeiroId, nome: "Membro parceiro", parteDaCasa: 0 },
      ],
      matriz: [],
    });
    await c.app.close();
  });

  it("a regra de quem saiu da equipe fica guardada (volta se ele voltar)", async () => {
    const c = await cenario();
    await prisma.regraDeDivisao.create({
      data: {
        barbeariaId: c.dono.barbeariaId,
        donoDoClienteId: c.saiu.barbeiroId,
        atendenteId: c.dono.barbeiroId,
        percentual: 30,
      },
    });

    const resposta = await salvar(c, { parteDaCasa: [], matriz: [] });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json().matriz).toEqual([]);
    expect(await prisma.regraDeDivisao.count()).toBe(1);
    await c.app.close();
  });

  it("membro que não está na divisão é 422 membro_invalido, e nada muda", async () => {
    const c = await cenario();
    const outra = await criarBarbeariaComToken(c.app, "outra");

    for (const corpo of [
      { parteDaCasa: [{ membroId: c.recepcao.barbeiroId, percentual: 10 }], matriz: [] },
      { parteDaCasa: [{ membroId: c.saiu.barbeiroId, percentual: 10 }], matriz: [] },
      { parteDaCasa: [], matriz: [{ donoDoClienteId: outra.barbeiroId, atendenteId: c.dono.barbeiroId, percentual: 10 }] },
      {
        parteDaCasa: [{ membroId: c.parceiro.barbeiroId, percentual: 10 }],
        matriz: [{ donoDoClienteId: c.dono.barbeiroId, atendenteId: c.recepcao.barbeiroId, percentual: 10 }],
      },
    ]) {
      const resposta = await salvar(c, corpo);
      expect(resposta.statusCode).toBe(422);
      expect(resposta.json().erro).toBe("membro_invalido");
    }
    const parceiro = await prisma.barbeiro.findUniqueOrThrow({ where: { id: c.parceiro.barbeiroId } });
    expect(parceiro.parteDaCasa).toBe(0);
    await c.app.close();
  });

  it("par com a mesma pessoa ou repetido é 422 regra_invalida", async () => {
    const c = await cenario();
    const par = { donoDoClienteId: c.dono.barbeiroId, atendenteId: c.parceiro.barbeiroId, percentual: 60 };

    for (const corpo of [
      { parteDaCasa: [], matriz: [{ ...par, atendenteId: c.dono.barbeiroId }] },
      { parteDaCasa: [], matriz: [par, { ...par, percentual: 50 }] },
      {
        parteDaCasa: [
          { membroId: c.dono.barbeiroId, percentual: 5 },
          { membroId: c.dono.barbeiroId, percentual: 6 },
        ],
        matriz: [],
      },
    ]) {
      const resposta = await salvar(c, corpo);
      expect(resposta.statusCode).toBe(422);
      expect(resposta.json().erro).toBe("regra_invalida");
    }
    expect(await prisma.regraDeDivisao.count()).toBe(0);
    await c.app.close();
  });

  it("corpo fora do formato é 400", async () => {
    const c = await cenario();
    const par = { donoDoClienteId: c.dono.barbeiroId, atendenteId: c.parceiro.barbeiroId };

    for (const corpo of [
      {},
      { parteDaCasa: [] },
      { parteDaCasa: [{ membroId: c.dono.barbeiroId, percentual: 101 }], matriz: [] },
      { parteDaCasa: [{ membroId: c.dono.barbeiroId, percentual: 2.5 }], matriz: [] },
      { parteDaCasa: [], matriz: [{ ...par, percentual: -1 }] },
      { parteDaCasa: [], matriz: [], extra: true },
    ]) {
      expect((await salvar(c, corpo)).statusCode).toBe(400);
    }
    await c.app.close();
  });
});

describe("quem pode", () => {
  it("profissional e recepção recebem 403 sem_permissao", async () => {
    const c = await cenario();

    for (const token of [c.parceiro.token, c.recepcao.token]) {
      for (const resposta of [await ver(c, token), await salvar(c, { parteDaCasa: [], matriz: [] }, token)]) {
        expect(resposta.statusCode).toBe(403);
        expect(resposta.json().erro).toBe("sem_permissao");
      }
    }
    await c.app.close();
  });

  it("plano sem caixa (Grátis): 403 recurso_do_plano", async () => {
    const c = await cenario();
    await prisma.assinatura.update({
      where: { barbeariaId: c.dono.barbeariaId },
      data: { situacao: "gratis", plano: "gratis", testeTerminaEm: null },
    });

    for (const resposta of [await ver(c), await salvar(c, { parteDaCasa: [], matriz: [] })]) {
      expect(resposta.statusCode).toBe(403);
      expect(resposta.json().erro).toBe("recurso_do_plano");
    }
    await c.app.close();
  });
});
