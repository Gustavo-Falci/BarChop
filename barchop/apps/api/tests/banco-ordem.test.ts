import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { prisma } from "@barchop/database";
import { CATEGORIAS_DE_SERVICO } from "@barchop/formato";
import { buildApp } from "../src/app";
import { auth, criarBarbeariaComToken } from "./helpers/barbearia";

// A ordem no banco (arrastar e reordenar, PR 1 — migration
// 20261021120000_ordem). As rotas que salvam a ordem chegam no PR 2;
// aqui só o que o banco garante sozinho: quem nasce, nasce no fim, a
// lista do CHECK das categorias e o preenchimento das linhas antigas.

const MIGRACAO = join(__dirname, "../../../packages/database/prisma/migrations/20261021120000_ordem/migration.sql");

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

async function ordemDos(ids: string[]) {
  const linhas = await prisma.servico.findMany({ where: { id: { in: ids } } });
  return ids.map((id) => linhas.find((linha) => linha.id === id)?.ordem);
}

describe("quem nasce, nasce no fim", () => {
  it("serviço novo entra depois do último, de 10 em 10, por barbearia", async () => {
    const app = buildApp();
    const uma = await criarBarbeariaComToken(app, "uma");
    const outra = await criarBarbeariaComToken(app, "outra");

    const corte = await criarServico(app, uma.token, "Corte");
    const barba = await criarServico(app, uma.token, "Barba");
    const daOutra = await criarServico(app, outra.token, "Corte");

    expect(await ordemDos([corte.id, barba.id, daOutra.id])).toEqual([10, 20, 10]);
    await app.close();
  });

  it("vale também pro Prisma cru, e a ordem que vem explícita é respeitada", async () => {
    const app = buildApp();
    const dono = await criarBarbeariaComToken(app);
    const base = { barbeariaId: dono.barbeariaId, duracaoMinutos: 30, preco: "40.00" };

    const explicito = await prisma.servico.create({ data: { ...base, nome: "Escolhido", ordem: 500 } });
    const depois = await prisma.servico.create({ data: { ...base, nome: "Depois" } });

    expect(explicito.ordem).toBe(500);
    expect(depois.ordem).toBe(510);
    await app.close();
  });

  it("membro novo entra depois do último da equipe", async () => {
    const app = buildApp();
    const dono = await criarBarbeariaComToken(app);

    const membro = await prisma.barbeiro.create({
      data: { barbeariaId: dono.barbeariaId, nome: "Parceiro", papel: "profissional" },
    });
    const doDono = await prisma.barbeiro.findUniqueOrThrow({ where: { id: dono.barbeiroId } });

    expect(doDono.ordem).toBe(10);
    expect(membro.ordem).toBe(20);
    await app.close();
  });
});

describe("a ordem das categorias", () => {
  it("nasce vazia (= a ordem padrão)", async () => {
    const app = buildApp();
    const dono = await criarBarbeariaComToken(app);

    const barbearia = await prisma.barbearia.findUniqueOrThrow({ where: { id: dono.barbeariaId } });

    expect(barbearia.ordemCategorias).toEqual([]);
    await app.close();
  });

  it("aceita categorias da lista e recusa as de fora", async () => {
    const app = buildApp();
    const dono = await criarBarbeariaComToken(app);

    await prisma.barbearia.update({
      where: { id: dono.barbeariaId },
      data: { ordemCategorias: ["barba", "cabelo"] },
    });
    await expect(
      prisma.barbearia.update({
        where: { id: dono.barbeariaId },
        data: { ordemCategorias: ["barba", "massagem"] },
      })
    ).rejects.toThrow(/barbearia_ordem_categorias_check/);
    await app.close();
  });

  it("o CHECK tem exatamente CATEGORIAS_DE_SERVICO", () => {
    // Categoria nova no código sem mexer no banco deixaria o dono
    // arrastá-la e tomar erro ao salvar.
    const sql = readFileSync(MIGRACAO, "utf-8");
    const check = sql.slice(sql.indexOf('CHECK ("ordem_categorias"'));
    const lista = [...check.slice(0, check.indexOf("]")).matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);

    expect(lista).toEqual([...CATEGORIAS_DE_SERVICO]);
  });
});

describe("o preenchimento da migração", () => {
  // Os UPDATEs rodam uma vez só, no deploy, e o banco de teste chega
  // vazio neles. Aqui o mesmo SQL do arquivo roda de novo, com linhas de
  // verdade na mesa e a ordem embaralhada.
  async function preencher(marca: string) {
    const sql = readFileSync(MIGRACAO, "utf-8");
    const trecho = sql.slice(sql.indexOf(marca));
    const update = trecho.slice(trecho.indexOf("UPDATE"), trecho.indexOf(";"));
    await prisma.$executeRawUnsafe(update);
  }

  it("serviços: ativos primeiro, por nome, de 10 em 10 dentro de cada barbearia", async () => {
    const app = buildApp();
    const uma = await criarBarbeariaComToken(app, "uma");
    const outra = await criarBarbeariaComToken(app, "outra");
    const base = { duracaoMinutos: 30, preco: "40.00" };
    const criar = (barbeariaId: string, nome: string, ativo: boolean, ordem: number) =>
      prisma.servico.create({ data: { ...base, barbeariaId, nome, ativo, ordem } });

    const sobrancelha = await criar(uma.barbeariaId, "Sobrancelha", false, 1);
    const corte = await criar(uma.barbeariaId, "Corte", true, 2);
    const barba = await criar(uma.barbeariaId, "Barba", true, 3);
    const daOutra = await criar(outra.barbeariaId, "Corte", true, 4);

    await preencher("-- Preenche a ordem dos serviços");

    expect(await ordemDos([barba.id, corte.id, sobrancelha.id, daOutra.id])).toEqual([10, 20, 30, 10]);
    await app.close();
  });

  it("equipe: por entrada, de 10 em 10", async () => {
    const app = buildApp();
    const dono = await criarBarbeariaComToken(app);
    const segundo = await prisma.barbeiro.create({
      data: { barbeariaId: dono.barbeariaId, nome: "Segundo", ordem: 1 },
    });
    await prisma.barbeiro.update({ where: { id: dono.barbeiroId }, data: { ordem: 99 } });

    await preencher("-- Preenche a ordem da equipe");

    const equipe = await prisma.barbeiro.findMany({
      where: { barbeariaId: dono.barbeariaId },
      orderBy: { ordem: "asc" },
    });
    expect(equipe.map((membro) => [membro.id, membro.ordem])).toEqual([
      [dono.barbeiroId, 10],
      [segundo.id, 20],
    ]);
    await app.close();
  });
});
