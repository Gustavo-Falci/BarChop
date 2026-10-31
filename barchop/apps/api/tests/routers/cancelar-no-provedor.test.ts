import { describe, expect, it } from "vitest";
import { prisma } from "@barchop/database";
import { buildApp } from "../../src/app";
import { provedoresDeMemoria } from "../../src/lib/provedores";
import { auth, criarBarbeariaComToken, criarMembroComToken } from "../helpers/barbearia";

// Cancelar no provedor pelo painel (Onda 2, marco 3, PR 10b do plano
// planos-de-assinatura). A assinatura online cancelada no BarChop é
// cancelada antes no Asaas: senão a cobrança seguiria caindo no cartão
// do cliente. Falhou no provedor, nada muda aqui. Se o provedor cancelou
// e o banco não gravou, o SUBSCRIPTION_DELETED do webhook cancela depois.

const CHAVE_DO_LUCAS = "$aact_hmlg_chave-do-lucas-5678";

async function cenario() {
  const provedores = provedoresDeMemoria();
  const app = buildApp({ provedores });
  const dono = await criarBarbeariaComToken(app);
  const lucas = await criarMembroComToken(app, dono.barbeariaId, "profissional", "lucas");
  await prisma.barbeiro.update({ where: { id: lucas.barbeiroId }, data: { podeVenderPlanos: true } });
  const conectou = await app.inject({
    method: "PUT",
    url: "/barbearias/me/pagamentos-online",
    headers: auth(lucas.token),
    payload: { provedor: "asaas", chave: CHAVE_DO_LUCAS },
  });
  expect(conectou.statusCode).toBe(200);
  const conexao = await prisma.conexaoDePagamento.findFirstOrThrow({ where: { barbeiroId: lucas.barbeiroId } });
  const plano = await prisma.planoDeAssinatura.create({
    data: {
      barbeariaId: dono.barbeariaId,
      vendedorId: lucas.barbeiroId,
      nome: "Barba do Lucas",
      ciclo: "mensal",
      precoCentavos: 8000,
      aceitaNoBalcao: true,
    },
  });
  let telefone = 0;

  // Uma assinatura viva; online também no "provedor".
  async function assinatura(forma: "online" | "no_balcao", situacao = "ativa") {
    const cliente = await prisma.cliente.create({
      data: { barbeariaId: dono.barbeariaId, nome: "Caio Rocha", telefone: `+551199999${String(++telefone).padStart(4, "0")}` },
    });
    const idExterno = forma === "online" ? `sub_${telefone}` : null;
    if (idExterno) {
      provedores.assinaturas.set(idExterno, {
        id: idExterno,
        situacao: "ativa",
        removida: false,
        valorCentavos: 8000,
        proximoVencimento: "2026-12-01",
      });
    }
    return prisma.assinaturaDoCliente.create({
      data: {
        barbeariaId: dono.barbeariaId,
        planoId: plano.id,
        clienteId: cliente.id,
        situacao,
        forma,
        conexaoId: forma === "online" ? conexao.id : null,
        idExterno,
        precoCentavos: 8000,
        ciclo: "mensal",
      },
    });
  }

  return { app, provedores, dono, lucas, conexao, assinatura };
}

type Cenario = Awaited<ReturnType<typeof cenario>>;

const situacaoDe = async (id: string) =>
  (await prisma.assinaturaDoCliente.findUniqueOrThrow({ where: { id } })).situacao;

function cancelar(c: Cenario, id: string, token = c.dono.token) {
  return c.app.inject({ method: "DELETE", url: `/assinaturas/${id}`, headers: auth(token) });
}

function desativarLucas(c: Cenario, extra: Record<string, unknown> = {}) {
  return c.app.inject({
    method: "PATCH",
    url: `/equipe/${c.lucas.barbeiroId}`,
    headers: auth(c.dono.token),
    payload: { ativo: false, ...extra },
  });
}

describe("cancelar uma assinatura no painel", () => {
  it("online: cancela no provedor e depois aqui", async () => {
    const c = await cenario();
    const online = await c.assinatura("online");

    const resposta = await cancelar(c, online.id);

    expect(resposta.statusCode).toBe(204);
    expect(c.provedores.cancelamentos).toEqual([online.idExterno]);
    expect(await situacaoDe(online.id)).toBe("cancelada");
    await c.app.close();
  });

  it("o provedor fora do ar: 502, e a assinatura segue viva aqui", async () => {
    const c = await cenario();
    const online = await c.assinatura("online");
    c.provedores.indisponivel = true;

    const resposta = await cancelar(c, online.id);

    expect(resposta.statusCode).toBe(502);
    expect(resposta.json().erro).toBe("provedor_indisponivel");
    expect(await situacaoDe(online.id)).toBe("ativa");
    await c.app.close();
  });

  it("a chave da conta revogada: 422 dizendo para trocar a chave, e nada muda", async () => {
    const c = await cenario();
    const online = await c.assinatura("online");
    c.provedores.chavesInvalidas.add(CHAVE_DO_LUCAS);

    const resposta = await cancelar(c, online.id);

    expect(resposta.statusCode).toBe(422);
    expect(resposta.json()).toMatchObject({
      erro: "chave_da_conta_recusada",
      mensagem: expect.stringContaining("Pagamentos online"),
    });
    expect(await situacaoDe(online.id)).toBe("ativa");
    await c.app.close();
  });

  it("com a Stripe: cancela lá; a chave revogada diz que foi a Stripe", async () => {
    const c = await cenario();
    const chave = "sk_test_chave-do-lucas-5678";
    const desligou = await c.app.inject({ method: "DELETE", url: "/barbearias/me/pagamentos-online", headers: auth(c.lucas.token) });
    expect(desligou.statusCode).toBe(204);
    const ligou = await c.app.inject({
      method: "PUT",
      url: "/barbearias/me/pagamentos-online",
      headers: auth(c.lucas.token),
      payload: { provedor: "stripe", chave },
    });
    expect(ligou.statusCode).toBe(200);
    const daStripe = await prisma.conexaoDePagamento.findFirstOrThrow({
      where: { barbeiroId: c.lucas.barbeiroId, provedor: "stripe", desconectadaEm: null },
    });
    const online = await c.assinatura("online");
    const outra = await c.assinatura("online");
    await prisma.assinaturaDoCliente.updateMany({ where: { id: { in: [online.id, outra.id] } }, data: { conexaoId: daStripe.id } });

    expect((await cancelar(c, online.id)).statusCode).toBe(204);
    expect(c.provedores.cancelamentos).toEqual([online.idExterno]);

    c.provedores.chavesInvalidas.add(chave);
    const recusada = await cancelar(c, outra.id);
    expect(recusada.statusCode).toBe(422);
    expect(recusada.json().mensagem).toMatch(/^a Stripe não aceitou a chave da conta conectada/);
    expect(await situacaoDe(outra.id)).toBe("ativa");
    await c.app.close();
  });

  it("no balcão, ou já cancelada, não fala com o provedor", async () => {
    const c = await cenario();
    const noBalcao = await c.assinatura("no_balcao");
    const cancelada = await c.assinatura("online", "cancelada");

    expect((await cancelar(c, noBalcao.id)).statusCode).toBe(204);
    expect((await cancelar(c, cancelada.id)).statusCode).toBe(204);

    expect(c.provedores.cancelamentos).toEqual([]);
    expect(await situacaoDe(noBalcao.id)).toBe("cancelada");
    await c.app.close();
  });

  it("o profissional cancela as dos planos dele, no provedor também", async () => {
    const c = await cenario();
    const online = await c.assinatura("online");

    expect((await cancelar(c, online.id, c.lucas.token)).statusCode).toBe(204);

    expect(c.provedores.cancelamentos).toEqual([online.idExterno]);
    await c.app.close();
  });
});

describe("desativar quem vende, cancelando as assinaturas", () => {
  it("as online são canceladas no provedor; as do balcão, só aqui", async () => {
    const c = await cenario();
    const online = await c.assinatura("online");
    const noBalcao = await c.assinatura("no_balcao");

    const resposta = await desativarLucas(c, { cancelarAssinaturas: true });

    expect(resposta.statusCode).toBe(200);
    expect(c.provedores.cancelamentos).toEqual([online.idExterno]);
    expect(await situacaoDe(online.id)).toBe("cancelada");
    expect(await situacaoDe(noBalcao.id)).toBe("cancelada");
    await c.app.close();
  });

  it("o provedor fora do ar: 502, o membro segue ativo e as assinaturas vivas", async () => {
    const c = await cenario();
    const online = await c.assinatura("online");
    c.provedores.indisponivel = true;

    const resposta = await desativarLucas(c, { cancelarAssinaturas: true });

    expect(resposta.statusCode).toBe(502);
    expect((await prisma.barbeiro.findUniqueOrThrow({ where: { id: c.lucas.barbeiroId } })).ativo).toBe(true);
    expect(await situacaoDe(online.id)).toBe("ativa");
    await c.app.close();
  });

  it("sem confirmar, a recusa não fala com o provedor e o texto não supõe gênero", async () => {
    const c = await cenario();
    await c.assinatura("online");
    await c.assinatura("no_balcao");

    const resposta = await desativarLucas(c);

    expect(resposta.statusCode).toBe(422);
    expect(resposta.json()).toMatchObject({
      erro: "assinaturas_ativas",
      mensagem: "este membro tem 2 assinantes nos planos que vende: cancele as assinaturas para desativar",
    });
    expect(c.provedores.cancelamentos).toEqual([]);
    await c.app.close();
  });
});
