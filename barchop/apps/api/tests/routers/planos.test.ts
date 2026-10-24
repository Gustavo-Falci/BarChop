import { describe, expect, it } from "vitest";
import { prisma } from "@barchop/database";
import { MAX_DIAS_DE_TESTE_DO_CLIENTE } from "@barchop/formato";
import { buildApp } from "../../src/app";
import { auth, criarBarbeariaComToken, criarMembroComToken } from "../helpers/barbearia";
import type { App } from "../../src/tipos";

// Os planos que a barbearia e os barbeiros vendem ao cliente (Onda 2,
// marco 3, PR 3). Quem pode:
// - dono: cria plano da casa e o dele, muda qualquer plano, liga a
//   vitrine e o "pode vender" de cada membro;
// - profissional com "pode vender": cria e muda só os dele, e vê só os
//   dele; sem o "pode vender", não cria nem muda;
// - recepção: vê todos (o balcão e o caixa precisam), não cria nem muda.
// Fora do Completo, 403 `recurso_do_plano`.

async function cenario() {
  const app = buildApp();
  const dono = await criarBarbeariaComToken(app);
  const servico = (
    await app.inject({
      method: "POST",
      url: "/servicos",
      headers: auth(dono.token),
      payload: { nome: "Corte", duracaoMinutos: 45, preco: "45.00" },
    })
  ).json();
  const barba = (
    await app.inject({
      method: "POST",
      url: "/servicos",
      headers: auth(dono.token),
      payload: { nome: "Barba", duracaoMinutos: 30, preco: "30.00" },
    })
  ).json();
  const lucas = await criarMembroComToken(app, dono.barbeariaId, "profissional", "lucas");
  const recepcao = await criarMembroComToken(app, dono.barbeariaId, "recepcao", "rec");
  return { app, dono, lucas, recepcao, servico, barba };
}

type Cenario = Awaited<ReturnType<typeof cenario>>;

function planoDaCasa(c: Cenario, extra: Record<string, unknown> = {}) {
  return {
    daCasa: true,
    nome: "Corte ilimitado",
    ciclo: "mensal",
    precoCentavos: 12000,
    fixoPorAtendimentoCentavos: 2500,
    servicos: [{ servicoId: c.servico.id, usosPorCiclo: null }],
    ...extra,
  };
}

function planoProprio(c: Cenario, extra: Record<string, unknown> = {}) {
  return {
    daCasa: false,
    nome: "2 cortes + barba",
    descricao: "Dois cortes e uma barba por mês.",
    ciclo: "mensal",
    precoCentavos: 9000,
    diasDeTeste: 7,
    servicos: [
      { servicoId: c.servico.id, usosPorCiclo: 2 },
      { servicoId: c.barba.id, usosPorCiclo: 1 },
    ],
    ...extra,
  };
}

function criar(app: App, token: string, payload: unknown) {
  return app.inject({ method: "POST", url: "/barbearias/me/planos", headers: auth(token), payload });
}

function mudar(app: App, token: string, id: string, payload: unknown) {
  return app.inject({ method: "PATCH", url: `/barbearias/me/planos/${id}`, headers: auth(token), payload });
}

function listar(app: App, token: string) {
  return app.inject({ method: "GET", url: "/barbearias/me/planos", headers: auth(token) });
}

async function liberarLucas(c: Cenario) {
  const resposta = await c.app.inject({
    method: "PATCH",
    url: `/equipe/${c.lucas.barbeiroId}`,
    headers: auth(c.dono.token),
    payload: { podeVenderPlanos: true },
  });
  expect(resposta.statusCode).toBe(200);
  expect(resposta.json().podeVenderPlanos).toBe(true);
}

async function assinanteNoBalcao(c: Cenario, planoId: string, situacao = "ativa") {
  const cliente = await prisma.cliente.create({
    data: { barbeariaId: c.dono.barbeariaId, nome: "Ana Souza", telefone: `1199${Math.random().toString().slice(2, 9)}` },
  });
  return prisma.assinaturaDoCliente.create({
    data: {
      barbeariaId: c.dono.barbeariaId,
      planoId,
      clienteId: cliente.id,
      situacao,
      forma: "no_balcao",
      precoCentavos: 9000,
      ciclo: "mensal",
    },
  });
}

describe("criar um plano", () => {
  it("o dono cria o da casa, com os serviços e o fixo", async () => {
    const c = await cenario();
    const resposta = await criar(c.app, c.dono.token, planoDaCasa(c));
    expect(resposta.statusCode).toBe(201);
    expect(resposta.json()).toMatchObject({
      daCasa: true,
      vendedor: null,
      nome: "Corte ilimitado",
      ciclo: "mensal",
      precoCentavos: 12000,
      diasDeTeste: 0,
      fixoPorAtendimentoCentavos: 2500,
      aceitaOnline: true,
      aceitaNoBalcao: false,
      ativo: true,
      assinantes: 0,
      servicos: [{ servicoId: c.servico.id, nome: "Corte", usosPorCiclo: null }],
    });
    await c.app.close();
  });

  it("o dono cria o dele, sem fixo, com ele de vendedor", async () => {
    const c = await cenario();
    const resposta = await criar(c.app, c.dono.token, planoProprio(c));
    expect(resposta.statusCode).toBe(201);
    expect(resposta.json()).toMatchObject({
      daCasa: false,
      vendedor: { id: c.dono.barbeiroId },
      fixoPorAtendimentoCentavos: null,
      diasDeTeste: 7,
      descricao: "Dois cortes e uma barba por mês.",
    });
    await c.app.close();
  });

  it("o profissional com 'pode vender' cria o dele; sem ele, 403", async () => {
    const c = await cenario();
    const antes = await criar(c.app, c.lucas.token, planoProprio(c));
    expect(antes.statusCode).toBe(403);
    expect(antes.json().erro).toBe("sem_permissao");

    await liberarLucas(c);
    const depois = await criar(c.app, c.lucas.token, planoProprio(c));
    expect(depois.statusCode).toBe(201);
    expect(depois.json().vendedor).toMatchObject({ id: c.lucas.barbeiroId });
    await c.app.close();
  });

  it("o plano da casa é só do dono", async () => {
    const c = await cenario();
    await liberarLucas(c);
    const resposta = await criar(c.app, c.lucas.token, planoDaCasa(c));
    expect(resposta.statusCode).toBe(403);
    expect(resposta.json().erro).toBe("sem_permissao");
    await c.app.close();
  });

  it("a recepção não cria", async () => {
    const c = await cenario();
    const resposta = await criar(c.app, c.recepcao.token, {});
    expect(resposta.statusCode).toBe(403);
    expect(resposta.json().erro).toBe("sem_permissao");
    await c.app.close();
  });

  it("cada problema do plano tem o seu código", async () => {
    const c = await cenario();
    const casos: [Record<string, unknown>, string][] = [
      [{ fixoPorAtendimentoCentavos: null }, "plano_fixo"],
      [{ servicos: [] }, "plano_servicos"],
      [{ aceitaOnline: false, aceitaNoBalcao: false }, "plano_formas"],
      [{ precoCentavos: 0 }, "plano_preco"],
    ];
    for (const [extra, codigo] of casos) {
      const resposta = await criar(c.app, c.dono.token, planoDaCasa(c, extra));
      expect(resposta.statusCode, codigo).toBe(422);
      expect(resposta.json().erro).toBe(codigo);
    }
    const comFixo = await criar(c.app, c.dono.token, planoProprio(c, { fixoPorAtendimentoCentavos: 1000 }));
    expect(comFixo.json().erro).toBe("plano_fixo");
    await c.app.close();
  });

  it("dias de teste acima do máximo e usos zero caem no schema (400)", async () => {
    const c = await cenario();
    const dias = await criar(c.app, c.dono.token, planoDaCasa(c, { diasDeTeste: MAX_DIAS_DE_TESTE_DO_CLIENTE + 1 }));
    expect(dias.statusCode).toBe(400);
    const usos = await criar(c.app, c.dono.token, planoDaCasa(c, { servicos: [{ servicoId: c.servico.id, usosPorCiclo: 0 }] }));
    expect(usos.statusCode).toBe(400);
    await c.app.close();
  });

  it("serviço repetido, de outra barbearia ou inativo é 422", async () => {
    const c = await cenario();
    const repetido = await criar(
      c.app,
      c.dono.token,
      planoDaCasa(c, {
        servicos: [
          { servicoId: c.servico.id, usosPorCiclo: 1 },
          { servicoId: c.servico.id, usosPorCiclo: 2 },
        ],
      })
    );
    expect(repetido.statusCode).toBe(422);
    expect(repetido.json().erro).toBe("servico_repetido");

    const outra = await criarBarbeariaComToken(c.app, "outra");
    const deFora = (
      await c.app.inject({
        method: "POST",
        url: "/servicos",
        headers: auth(outra.token),
        payload: { nome: "Corte", duracaoMinutos: 45, preco: "45.00" },
      })
    ).json();
    const alheio = await criar(c.app, c.dono.token, planoDaCasa(c, { servicos: [{ servicoId: deFora.id, usosPorCiclo: null }] }));
    expect(alheio.statusCode).toBe(422);
    expect(alheio.json().erro).toBe("servico_invalido");

    await prisma.servico.update({ where: { id: c.barba.id }, data: { ativo: false } });
    const inativo = await criar(c.app, c.dono.token, planoDaCasa(c, { servicos: [{ servicoId: c.barba.id, usosPorCiclo: null }] }));
    expect(inativo.json().erro).toBe("servico_invalido");
    await c.app.close();
  });

  it("no plano de barbeiro, só serviço que ele faz", async () => {
    const c = await cenario();
    await liberarLucas(c);
    await prisma.profissionalServico.deleteMany({ where: { barbeiroId: c.lucas.barbeiroId, servicoId: c.barba.id } });
    const resposta = await criar(c.app, c.lucas.token, planoProprio(c));
    expect(resposta.statusCode).toBe(422);
    expect(resposta.json().erro).toBe("servico_fora_do_vendedor");
    // No da casa vale qualquer serviço da barbearia: quem atende varia.
    const daCasa = await criar(c.app, c.dono.token, planoDaCasa(c, { servicos: [{ servicoId: c.barba.id, usosPorCiclo: 1 }] }));
    expect(daCasa.statusCode).toBe(201);
    await c.app.close();
  });

  it("quem não atende não vende plano próprio", async () => {
    const c = await cenario();
    await prisma.barbeiro.update({ where: { id: c.dono.barbeiroId }, data: { atende: false } });
    const resposta = await criar(c.app, c.dono.token, planoProprio(c));
    expect(resposta.statusCode).toBe(422);
    expect(resposta.json().erro).toBe("vendedor_nao_atende");
    await c.app.close();
  });
});

describe("ver os planos", () => {
  it("o dono e a recepção veem todos, com quantos assinantes vivos", async () => {
    const c = await cenario();
    await liberarLucas(c);
    const daCasa = (await criar(c.app, c.dono.token, planoDaCasa(c))).json();
    const doLucas = (await criar(c.app, c.lucas.token, planoProprio(c))).json();
    await assinanteNoBalcao(c, doLucas.id, "ativa");
    await assinanteNoBalcao(c, doLucas.id, "teste");
    await assinanteNoBalcao(c, doLucas.id, "cancelada");

    for (const token of [c.dono.token, c.recepcao.token]) {
      const resposta = await listar(c.app, token);
      expect(resposta.statusCode).toBe(200);
      const { planos } = resposta.json();
      expect(planos.map((p: { id: string }) => p.id).sort()).toEqual([daCasa.id, doLucas.id].sort());
      expect(planos.find((p: { id: string }) => p.id === doLucas.id).assinantes).toBe(2);
    }
    await c.app.close();
  });

  it("o profissional vê só os dele", async () => {
    const c = await cenario();
    await liberarLucas(c);
    await criar(c.app, c.dono.token, planoDaCasa(c));
    await criar(c.app, c.dono.token, planoProprio(c));
    const doLucas = (await criar(c.app, c.lucas.token, planoProprio(c))).json();
    const { planos } = (await listar(c.app, c.lucas.token)).json();
    expect(planos.map((p: { id: string }) => p.id)).toEqual([doLucas.id]);
    await c.app.close();
  });

  it("diz a vitrine e o que quem pediu pode criar", async () => {
    const c = await cenario();
    expect((await listar(c.app, c.dono.token)).json()).toMatchObject({
      vitrine: false,
      podeCriarDaCasa: true,
      podeCriarProprio: true,
    });
    expect((await listar(c.app, c.lucas.token)).json()).toMatchObject({ podeCriarDaCasa: false, podeCriarProprio: false });
    await liberarLucas(c);
    expect((await listar(c.app, c.lucas.token)).json()).toMatchObject({ podeCriarDaCasa: false, podeCriarProprio: true });
    expect((await listar(c.app, c.recepcao.token)).json()).toMatchObject({ podeCriarDaCasa: false, podeCriarProprio: false });
    await c.app.close();
  });
});

describe("mudar um plano", () => {
  it("o dono muda qualquer um; a lista de serviços vai inteira", async () => {
    const c = await cenario();
    await liberarLucas(c);
    const doLucas = (await criar(c.app, c.lucas.token, planoProprio(c))).json();
    const resposta = await mudar(c.app, c.dono.token, doLucas.id, {
      precoCentavos: 9900,
      servicos: [{ servicoId: c.servico.id, usosPorCiclo: 3 }],
    });
    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toMatchObject({
      precoCentavos: 9900,
      nome: "2 cortes + barba",
      servicos: [{ servicoId: c.servico.id, usosPorCiclo: 3 }],
    });
    await c.app.close();
  });

  it("desativar é `ativo: false`; o plano segue na lista", async () => {
    const c = await cenario();
    const plano = (await criar(c.app, c.dono.token, planoDaCasa(c))).json();
    const resposta = await mudar(c.app, c.dono.token, plano.id, { ativo: false });
    expect(resposta.json().ativo).toBe(false);
    expect((await listar(c.app, c.dono.token)).json().planos).toHaveLength(1);
    await c.app.close();
  });

  it("o profissional muda os dele; o de outro é 404", async () => {
    const c = await cenario();
    await liberarLucas(c);
    const doLucas = (await criar(c.app, c.lucas.token, planoProprio(c))).json();
    const doDono = (await criar(c.app, c.dono.token, planoProprio(c))).json();
    const daCasa = (await criar(c.app, c.dono.token, planoDaCasa(c))).json();
    expect((await mudar(c.app, c.lucas.token, doLucas.id, { nome: "Combo do Lucas" })).statusCode).toBe(200);
    expect((await mudar(c.app, c.lucas.token, doDono.id, { nome: "Meu agora" })).statusCode).toBe(404);
    expect((await mudar(c.app, c.lucas.token, daCasa.id, { nome: "Meu agora" })).statusCode).toBe(404);
    await c.app.close();
  });

  it("sem o 'pode vender', o profissional não muda nem o dele", async () => {
    const c = await cenario();
    await liberarLucas(c);
    const doLucas = (await criar(c.app, c.lucas.token, planoProprio(c))).json();
    await c.app.inject({
      method: "PATCH",
      url: `/equipe/${c.lucas.barbeiroId}`,
      headers: auth(c.dono.token),
      payload: { podeVenderPlanos: false },
    });
    const resposta = await mudar(c.app, c.lucas.token, doLucas.id, { nome: "Combo" });
    expect(resposta.statusCode).toBe(403);
    await c.app.close();
  });

  it("a recepção não muda", async () => {
    const c = await cenario();
    const plano = (await criar(c.app, c.dono.token, planoDaCasa(c))).json();
    expect((await mudar(c.app, c.recepcao.token, plano.id, {})).statusCode).toBe(403);
    await c.app.close();
  });

  it("confere o plano inteiro depois da mudança", async () => {
    const c = await cenario();
    const plano = (await criar(c.app, c.dono.token, planoDaCasa(c))).json();
    const semFormas = await mudar(c.app, c.dono.token, plano.id, { aceitaOnline: false });
    expect(semFormas.statusCode).toBe(422);
    expect(semFormas.json().erro).toBe("plano_formas");
    const semFixo = await mudar(c.app, c.dono.token, plano.id, { fixoPorAtendimentoCentavos: null });
    expect(semFixo.json().erro).toBe("plano_fixo");
    await c.app.close();
  });

  it("tipo e vendedor não mudam (400)", async () => {
    const c = await cenario();
    const plano = (await criar(c.app, c.dono.token, planoDaCasa(c))).json();
    expect((await mudar(c.app, c.dono.token, plano.id, { daCasa: false })).statusCode).toBe(400);
    await c.app.close();
  });
});

describe("vitrine", () => {
  it("o dono liga e desliga", async () => {
    const c = await cenario();
    const ligar = await c.app.inject({
      method: "PUT",
      url: "/barbearias/me/vitrine-de-planos",
      headers: auth(c.dono.token),
      payload: { ligada: true },
    });
    expect(ligar.statusCode).toBe(200);
    expect(ligar.json()).toEqual({ ligada: true });
    expect((await listar(c.app, c.dono.token)).json().vitrine).toBe(true);
    await c.app.close();
  });
});

describe("fora do Completo", () => {
  it("ver, criar, mudar e a vitrine dão 403 recurso_do_plano", async () => {
    const c = await cenario();
    const plano = (await criar(c.app, c.dono.token, planoDaCasa(c))).json();
    await prisma.assinatura.update({
      where: { barbeariaId: c.dono.barbeariaId },
      data: { situacao: "ativa", plano: "essencial", testeTerminaEm: null },
    });
    const respostas = [
      await listar(c.app, c.dono.token),
      await criar(c.app, c.dono.token, planoDaCasa(c)),
      await mudar(c.app, c.dono.token, plano.id, { nome: "Outro" }),
      await c.app.inject({
        method: "PUT",
        url: "/barbearias/me/vitrine-de-planos",
        headers: auth(c.dono.token),
        payload: { ligada: true },
      }),
    ];
    for (const resposta of respostas) {
      expect(resposta.statusCode).toBe(403);
      expect(resposta.json().erro).toBe("recurso_do_plano");
    }
    await c.app.close();
  });
});

describe("o 'pode vender' na equipe", () => {
  it("o membro nasce sem; o dono liga e a equipe mostra", async () => {
    const c = await cenario();
    const antes = (await c.app.inject({ method: "GET", url: "/equipe", headers: auth(c.dono.token) })).json();
    expect(antes.find((m: { id: string }) => m.id === c.lucas.barbeiroId).podeVenderPlanos).toBe(false);
    await liberarLucas(c);
    await c.app.close();
  });
});

describe("desativar quem tem assinantes", () => {
  async function comAssinante() {
    const c = await cenario();
    await liberarLucas(c);
    const plano = (await criar(c.app, c.lucas.token, planoProprio(c))).json();
    const viva = await assinanteNoBalcao(c, plano.id, "ativa");
    const antiga = await assinanteNoBalcao(c, plano.id, "cancelada");
    const desativar = (extra: Record<string, unknown> = {}) =>
      c.app.inject({
        method: "PATCH",
        url: `/equipe/${c.lucas.barbeiroId}`,
        headers: auth(c.dono.token),
        payload: { ativo: false, ...extra },
      });
    return { c, viva, antiga, desativar };
  }

  it("sem confirmar, recusa com assinaturas_ativas e não desativa", async () => {
    const { c, desativar } = await comAssinante();
    const resposta = await desativar();
    expect(resposta.statusCode).toBe(422);
    expect(resposta.json().erro).toBe("assinaturas_ativas");
    const lucas = await prisma.barbeiro.findUniqueOrThrow({ where: { id: c.lucas.barbeiroId } });
    expect(lucas.ativo).toBe(true);
    await c.app.close();
  });

  it("com cancelarAssinaturas, cancela as vivas e desativa no mesmo passo", async () => {
    const { c, viva, antiga, desativar } = await comAssinante();
    const resposta = await desativar({ cancelarAssinaturas: true });
    expect(resposta.statusCode).toBe(200);
    expect(resposta.json().ativo).toBe(false);
    const depois = await prisma.assinaturaDoCliente.findUniqueOrThrow({ where: { id: viva.id } });
    expect(depois.situacao).toBe("cancelada");
    expect(depois.canceladaEm).not.toBeNull();
    const intocada = await prisma.assinaturaDoCliente.findUniqueOrThrow({ where: { id: antiga.id } });
    expect(intocada.canceladaEm).toBeNull();
    await c.app.close();
  });

  it("vale também fora do Completo: a assinatura do cliente segue viva no Grátis", async () => {
    const { c, desativar } = await comAssinante();
    await prisma.assinatura.update({
      where: { barbeariaId: c.dono.barbeariaId },
      data: { situacao: "gratis", plano: "gratis", testeTerminaEm: null },
    });
    expect((await desativar()).json().erro).toBe("assinaturas_ativas");
    await c.app.close();
  });

  it("sem assinantes vivos, desativa como sempre", async () => {
    const c = await cenario();
    const resposta = await c.app.inject({
      method: "PATCH",
      url: `/equipe/${c.lucas.barbeiroId}`,
      headers: auth(c.dono.token),
      payload: { ativo: false },
    });
    expect(resposta.statusCode).toBe(200);
    await c.app.close();
  });
});
