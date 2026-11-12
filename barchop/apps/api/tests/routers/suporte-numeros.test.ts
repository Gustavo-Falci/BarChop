import { describe, expect, it } from "vitest";
import { prisma } from "@barchop/database";
import { buildApp } from "../../src/app";
import type { EventoDoSite } from "../../src/lib/contagem-do-site";
import { agoraNaBarbearia, dataParaDate, somarDias } from "../../src/lib/horas";
import { criarOperadorDeSuporte } from "../../src/lib/suporte";
import type { App } from "../../src/tipos";
import { auth, criarBarbeariaComToken } from "../helpers/barbearia";

// Home nova, marco 1 (PR B): o dono do produto vê a linha de base —
// visitas da home, cadastros e cadastros vindos da home — na aba
// Números do suporte. Escopo do suporte: só o token dele abre.

const SENHA = "senha-do-suporte-123";

async function entrarNoSuporte(app: App) {
  await criarOperadorDeSuporte({ nome: "Suporte", email: "suporte@barchop.com.br", senha: SENHA });
  const resposta = await app.inject({
    method: "POST",
    url: "/suporte/login",
    payload: { email: "suporte@barchop.com.br", senha: SENHA },
  });
  return resposta.json().token as string;
}

// O dia de hoje no relógio de São Paulo, como a contagem grava.
function diaAtras(dias: number): string {
  return somarDias(agoraNaBarbearia().data, -dias);
}

async function gravar(dia: string, evento: EventoDoSite, total: number) {
  await prisma.contagemDoSite.create({ data: { dia: dataParaDate(dia), evento, total } });
}

async function numeros(app: App, token: string, busca = "") {
  return app.inject({ method: "GET", url: `/suporte/numeros${busca}`, headers: auth(token) });
}

describe("GET /suporte/numeros", () => {
  it("token de barbeiro, ou nenhum, não abre os números", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");

    expect((await numeros(app, um.token)).statusCode).toBe(401);
    expect((await app.inject({ method: "GET", url: "/suporte/numeros" })).statusCode).toBe(401);

    await app.close();
  });

  it("sem dias, devolve os últimos 30, um por dia, de hoje pra trás e em ordem", async () => {
    const app = buildApp();
    const token = await entrarNoSuporte(app);

    const resposta = await numeros(app, token);

    expect(resposta.statusCode).toBe(200);
    const { dias } = resposta.json();
    expect(dias).toHaveLength(30);
    expect(dias[0].dia).toBe(diaAtras(29));
    expect(dias[29].dia).toBe(diaAtras(0));
    // Dia sem nada contado aparece zerado, não some.
    expect(dias[10]).toEqual({ dia: diaAtras(19), visitas: 0, cadastros: 0, cadastrosDaHome: 0 });

    await app.close();
  });

  it("soma o período e dá a taxa de cadastros da home por visita", async () => {
    const app = buildApp();
    const token = await entrarNoSuporte(app);
    await gravar(diaAtras(0), "visita_home", 30);
    await gravar(diaAtras(0), "cadastro", 2);
    await gravar(diaAtras(0), "cadastro_da_home", 1);
    await gravar(diaAtras(6), "visita_home", 10);
    await gravar(diaAtras(6), "cadastro_da_home", 1);
    await gravar(diaAtras(6), "cadastro", 3);
    // Fora dos 7 dias: entra só no de 30.
    await gravar(diaAtras(7), "visita_home", 60);
    await gravar(diaAtras(7), "cadastro_da_home", 2);
    // Fora dos 30.
    await gravar(diaAtras(30), "visita_home", 999);

    const semana = (await numeros(app, token, "?dias=7")).json();
    expect(semana.dias).toHaveLength(7);
    expect(semana.dias[0]).toEqual({ dia: diaAtras(6), visitas: 10, cadastros: 3, cadastrosDaHome: 1 });
    expect(semana.totais).toEqual({ visitas: 40, cadastros: 5, cadastrosDaHome: 2, taxa: 0.05 });

    const mes = (await numeros(app, token, "?dias=30")).json();
    expect(mes.totais).toEqual({ visitas: 100, cadastros: 5, cadastrosDaHome: 4, taxa: 0.04 });

    await app.close();
  });

  it("sem visitas no período, a taxa fica sem valor (não zero)", async () => {
    const app = buildApp();
    const token = await entrarNoSuporte(app);
    await gravar(diaAtras(1), "cadastro", 1);

    const { totais } = (await numeros(app, token, "?dias=7")).json();

    expect(totais).toEqual({ visitas: 0, cadastros: 1, cadastrosDaHome: 0, taxa: null });

    await app.close();
  });

  it("dias fora de 1 a 90 é 400", async () => {
    const app = buildApp();
    const token = await entrarNoSuporte(app);

    for (const busca of ["?dias=0", "?dias=91", "?dias=abc", "?outra=1"]) {
      expect((await numeros(app, token, busca)).statusCode, busca).toBe(400);
    }
    expect((await numeros(app, token, "?dias=90")).json().dias).toHaveLength(90);

    await app.close();
  });
});
