import { describe, expect, it } from "vitest";
import { prisma } from "@barchop/database";
import { buildApp } from "../../src/app";
import { auth, criarBarbeariaComToken, criarMembroComToken } from "../helpers/barbearia";

// A vitrine de planos na página pública (Onda 2, marco 3, PR 4). Sem
// login. Entra o plano ativo, com a vitrine ligada e o recurso no plano
// do BarChop; o de barbeiro, só com vendedor que atende e pode vender.
// Plano que só aceita online entra quando quem vende tem conta conectada.
// Fora disso a lista vem vazia, nunca 403: a página não pode quebrar nem
// contar qual plano do BarChop a barbearia paga.

async function cenario() {
  const app = buildApp();
  const dono = await criarBarbeariaComToken(app);
  const novoServico = async (nome: string) =>
    (
      await app.inject({
        method: "POST",
        url: "/servicos",
        headers: auth(dono.token),
        payload: { nome, duracaoMinutos: 30, preco: "40.00" },
      })
    ).json();
  const corte = await novoServico("Corte");
  const barba = await novoServico("Barba");
  const lucas = await criarMembroComToken(app, dono.barbeariaId, "profissional", "lucas");
  await prisma.barbearia.update({ where: { id: dono.barbeariaId }, data: { vitrineDePlanos: true } });
  return { app, dono, lucas, corte, barba };
}

type Cenario = Awaited<ReturnType<typeof cenario>>;

// Direto no banco: a vitrine não pode depender das rotas do painel.
async function plano(c: Cenario, extra: Partial<{
  vendedorId: string | null;
  nome: string;
  ativo: boolean;
  aceitaOnline: boolean;
  aceitaNoBalcao: boolean;
  servicoIds: string[];
}> = {}) {
  const { servicoIds = [c.corte.id], vendedorId = null, ...resto } = extra;
  return prisma.planoDeAssinatura.create({
    data: {
      barbeariaId: c.dono.barbeariaId,
      vendedorId,
      nome: "Corte ilimitado",
      ciclo: "mensal",
      precoCentavos: 12000,
      fixoPorAtendimentoCentavos: vendedorId === null ? 2500 : null,
      aceitaOnline: false,
      aceitaNoBalcao: true,
      ...resto,
      servicos: { create: servicoIds.map((servicoId) => ({ servicoId, usosPorCiclo: 2 })) },
    },
  });
}

function conectar(c: Cenario, barbeiroId: string, daCasa: boolean, provedor = "asaas") {
  return prisma.conexaoDePagamento.create({
    data: {
      barbeariaId: c.dono.barbeariaId,
      barbeiroId,
      daCasa,
      provedor,
      modo: "teste",
      chaveCifrada: Buffer.from("cifrada"),
      chaveFinal: "9F3A",
      webhookTokenHash: "hash",
    },
  });
}

async function vitrine(c: Cenario, slug = c.dono.slug) {
  return c.app.inject({ method: "GET", url: `/barbearias/${slug}/planos` });
}

async function idsNaVitrine(c: Cenario): Promise<string[]> {
  const resposta = await vitrine(c);
  expect(resposta.statusCode).toBe(200);
  return resposta.json().planos.map((p: { id: string }) => p.id);
}

describe("a vitrine", () => {
  it("mostra o plano da casa, sem login, com os serviços e os usos", async () => {
    const c = await cenario();
    const daCasa = await plano(c, { servicoIds: [c.corte.id, c.barba.id] });
    const resposta = await vitrine(c);
    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toEqual({
      planos: [
        {
          id: daCasa.id,
          daCasa: true,
          vendedor: null,
          nome: "Corte ilimitado",
          descricao: null,
          ciclo: "mensal",
          precoCentavos: 12000,
          diasDeTeste: 0,
          aceitaOnline: false,
          onlineIndisponivel: false,
          pagamento: null,
          aceitaNoBalcao: true,
          servicos: [
            { servicoId: c.corte.id, nome: "Corte", usosPorCiclo: 2 },
            { servicoId: c.barba.id, nome: "Barba", usosPorCiclo: 2 },
          ],
        },
      ],
    });
    await c.app.close();
  });

  it("nunca mostra o fixo da casa nem dado interno do vendedor", async () => {
    const c = await cenario();
    await prisma.barbeiro.update({ where: { id: c.lucas.barbeiroId }, data: { podeVenderPlanos: true } });
    await plano(c);
    await plano(c, { vendedorId: c.lucas.barbeiroId });
    const { planos } = (await vitrine(c)).json();
    for (const p of planos) {
      expect(p).not.toHaveProperty("fixoPorAtendimentoCentavos");
      expect(p).not.toHaveProperty("assinantes");
      expect(p).not.toHaveProperty("ativo");
    }
    const doLucas = planos.find((p: { daCasa: boolean }) => !p.daCasa);
    expect(doLucas.vendedor).toEqual({ id: c.lucas.barbeiroId, nome: "Membro lucas", fotoUrl: null });
    await c.app.close();
  });

  it("slug que não existe é 404", async () => {
    const c = await cenario();
    expect((await vitrine(c, "nao-existe")).statusCode).toBe(404);
    await c.app.close();
  });
});

describe("o que fica fora", () => {
  it("vitrine desligada: lista vazia", async () => {
    const c = await cenario();
    await plano(c);
    await prisma.barbearia.update({ where: { id: c.dono.barbeariaId }, data: { vitrineDePlanos: false } });
    expect(await idsNaVitrine(c)).toEqual([]);
    await c.app.close();
  });

  it("no Essencial e no Grátis: lista vazia, não 403", async () => {
    const c = await cenario();
    await plano(c);
    for (const plano of ["essencial", "gratis"]) {
      await prisma.assinatura.update({
        where: { barbeariaId: c.dono.barbeariaId },
        data: { situacao: plano === "gratis" ? "gratis" : "ativa", plano, testeTerminaEm: null },
      });
      expect(await idsNaVitrine(c)).toEqual([]);
    }
    await c.app.close();
  });

  it("plano desativado", async () => {
    const c = await cenario();
    await plano(c, { ativo: false });
    expect(await idsNaVitrine(c)).toEqual([]);
    await c.app.close();
  });

  it("plano de quem não pode vender, não atende ou saiu da equipe; o do dono entra sem a liberação", async () => {
    const c = await cenario();
    const doDono = await plano(c, { vendedorId: c.dono.barbeiroId });
    const doLucas = await plano(c, { vendedorId: c.lucas.barbeiroId });
    expect(await idsNaVitrine(c)).toEqual([doDono.id]);

    await prisma.barbeiro.update({ where: { id: c.lucas.barbeiroId }, data: { podeVenderPlanos: true } });
    expect((await idsNaVitrine(c)).sort()).toEqual([doDono.id, doLucas.id].sort());

    await prisma.barbeiro.update({ where: { id: c.lucas.barbeiroId }, data: { atende: false } });
    expect(await idsNaVitrine(c)).toEqual([doDono.id]);

    await prisma.barbeiro.update({ where: { id: c.lucas.barbeiroId }, data: { atende: true, ativo: false } });
    expect(await idsNaVitrine(c)).toEqual([doDono.id]);
    await c.app.close();
  });

  it("serviço desativado sai da lista; plano sem serviço ativo sai da vitrine", async () => {
    const c = await cenario();
    const dois = await plano(c, { servicoIds: [c.corte.id, c.barba.id] });
    const soBarba = await plano(c, { nome: "Só barba", servicoIds: [c.barba.id] });
    await prisma.servico.update({ where: { id: c.barba.id }, data: { ativo: false } });
    const { planos } = (await vitrine(c)).json();
    expect(planos.map((p: { id: string }) => p.id)).toEqual([dois.id]);
    expect(planos[0].servicos.map((s: { servicoId: string }) => s.servicoId)).toEqual([c.corte.id]);
    expect(planos.map((p: { id: string }) => p.id)).not.toContain(soBarba.id);
    await c.app.close();
  });
});

// Os ids dos planos que dá pra assinar online agora.
async function idsOnline(c: Cenario): Promise<string[]> {
  const { planos } = (await vitrine(c)).json();
  return planos.filter((p: { aceitaOnline: boolean }) => p.aceitaOnline).map((p: { id: string }) => p.id);
}

describe("pagar online", () => {
  it("só online e sem conta conectada: entra com o pagamento online indisponível; com a conta, vende", async () => {
    const c = await cenario();
    const daCasa = await plano(c, { aceitaOnline: true, aceitaNoBalcao: false });
    let { planos } = (await vitrine(c)).json();
    expect(planos.map((p: { id: string }) => p.id)).toEqual([daCasa.id]);
    expect(planos[0]).toMatchObject({ aceitaOnline: false, onlineIndisponivel: true, aceitaNoBalcao: false });

    await conectar(c, c.dono.barbeiroId, true);
    ({ planos } = (await vitrine(c)).json());
    expect(planos[0]).toMatchObject({ aceitaOnline: true, onlineIndisponivel: false });
    await c.app.close();
  });

  // A página pergunta o CPF e diz onde se paga pelo provedor da conta
  // de quem vende.
  it("diz o provedor de cada plano online e se ele pede o CPF; sem online, nulo", async () => {
    const c = await cenario();
    const daCasa = await plano(c, { aceitaOnline: true, aceitaNoBalcao: false });
    const doDono = await plano(c, { vendedorId: c.dono.barbeiroId, aceitaOnline: true, aceitaNoBalcao: false });
    const soBalcao = await plano(c, { aceitaOnline: false, aceitaNoBalcao: true });
    await conectar(c, c.dono.barbeiroId, true, "asaas");
    await conectar(c, c.dono.barbeiroId, false, "stripe");

    const { planos } = (await vitrine(c)).json();
    const pagamentoDe = (id: string) => planos.find((p: { id: string }) => p.id === id).pagamento;
    expect(pagamentoDe(daCasa.id)).toEqual({ provedor: "asaas", pedeCpf: true });
    expect(pagamentoDe(doDono.id)).toEqual({ provedor: "stripe", pedeCpf: false });
    expect(pagamentoDe(soBalcao.id)).toBeNull();

    // Sem a conta, o online fica indisponível e não há onde pagar.
    await prisma.conexaoDePagamento.updateMany({ data: { desconectadaEm: new Date() } });
    const depois = (await vitrine(c)).json().planos;
    expect(depois.map((p: { pagamento: unknown }) => p.pagamento)).toEqual([null, null, null]);
    await c.app.close();
  });

  it("a conta de outro modo não conta (a do sandbox, com a plataforma no real)", async () => {
    const c = await cenario();
    await plano(c, { aceitaOnline: true, aceitaNoBalcao: false });
    const conexao = await conectar(c, c.dono.barbeiroId, true);
    await prisma.conexaoDePagamento.update({ where: { id: conexao.id }, data: { modo: "real" } });

    expect(await idsOnline(c)).toEqual([]);
    expect((await vitrine(c)).json().planos[0].onlineIndisponivel).toBe(true);
    await c.app.close();
  });

  it("a conta desconectada não conta", async () => {
    const c = await cenario();
    await plano(c, { aceitaOnline: true, aceitaNoBalcao: false });
    const conexao = await conectar(c, c.dono.barbeiroId, true);
    await prisma.conexaoDePagamento.update({ where: { id: conexao.id }, data: { desconectadaEm: new Date() } });

    expect(await idsOnline(c)).toEqual([]);
    expect((await vitrine(c)).json().planos[0].onlineIndisponivel).toBe(true);
    await c.app.close();
  });

  it("a conta pessoal do dono não serve pro plano da casa, e a da casa não serve pro dele", async () => {
    const c = await cenario();
    const daCasa = await plano(c, { aceitaOnline: true, aceitaNoBalcao: false });
    const doDono = await plano(c, { vendedorId: c.dono.barbeiroId, aceitaOnline: true, aceitaNoBalcao: false });
    await conectar(c, c.dono.barbeiroId, false);
    expect(await idsOnline(c)).toEqual([doDono.id]);
    await prisma.conexaoDePagamento.deleteMany();
    await conectar(c, c.dono.barbeiroId, true);
    expect(await idsOnline(c)).toEqual([daCasa.id]);
    await c.app.close();
  });

  it("online e no balcão, sem conta: o balcão vale e o online fica indisponível", async () => {
    const c = await cenario();
    await plano(c, { aceitaOnline: true, aceitaNoBalcao: true });
    const { planos } = (await vitrine(c)).json();
    expect(planos[0]).toMatchObject({ aceitaOnline: false, onlineIndisponivel: true, aceitaNoBalcao: true });
    await c.app.close();
  });

  it("só no balcão: o online não está indisponível, só não é oferecido", async () => {
    const c = await cenario();
    await plano(c, { aceitaOnline: false, aceitaNoBalcao: true });
    const { planos } = (await vitrine(c)).json();
    expect(planos[0]).toMatchObject({ aceitaOnline: false, onlineIndisponivel: false });
    await c.app.close();
  });
});
