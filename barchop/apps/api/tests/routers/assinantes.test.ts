import { describe, expect, it } from "vitest";
import { prisma } from "@barchop/database";
import { fimDoCiclo } from "@barchop/formato";
import { buildApp } from "../../src/app";
import { agoraNaBarbearia, dataParaDate, somarDias } from "../../src/lib/horas";
import { auth, criarBarbeariaComToken, criarMembroComToken } from "../helpers/barbearia";
import type { App } from "../../src/tipos";

// O assinante no balcão (Onda 2, marco 3, PR 5): o painel cadastra o
// cliente num plano que aceita o balcão, e cada ciclo pago ali é um
// "recebi" marcado à mão, com a forma. O "recebi" abre um ciclo novo a
// partir de hoje; antes do dia da renovação, o ciclo está em dia e é
// recusado. Sem "recebi", a assinatura fica em atraso no dia seguinte
// ao da renovação (marcado na leitura, não por tarefa agendada).
//
// Dono e recepção mexem em qualquer assinatura; o profissional, só nas
// dos planos dele (a de outro é 404). Só assinar exige o Completo: a
// lista, o "recebi" e o cancelar seguem no Grátis (decisão 6 do plano).
//
// As datas saem do "hoje" de verdade, na barbearia: sem relógio falso.

const HOJE = agoraNaBarbearia().data;

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
  const lucas = await criarMembroComToken(app, dono.barbeariaId, "profissional", "lucas");
  const pedro = await criarMembroComToken(app, dono.barbeariaId, "profissional", "pedro");
  const recepcao = await criarMembroComToken(app, dono.barbeariaId, "recepcao", "rec");
  await prisma.barbeiro.updateMany({
    where: { id: { in: [lucas.barbeiroId, pedro.barbeiroId] } },
    data: { podeVenderPlanos: true },
  });
  const cliente = await novoCliente(app, dono.token, "11999990001");

  const novoPlano = (extra: Record<string, unknown> = {}) =>
    prisma.planoDeAssinatura.create({
      data: {
        barbeariaId: dono.barbeariaId,
        nome: "Plano",
        ciclo: "mensal",
        precoCentavos: 12000,
        fixoPorAtendimentoCentavos: typeof extra.vendedorId === "string" ? null : 2500,
        aceitaOnline: false,
        aceitaNoBalcao: true,
        ...extra,
        servicos: { create: [{ servicoId: servico.id, usosPorCiclo: 2 }] },
      },
    });
  const daCasa = await novoPlano({ nome: "Corte ilimitado" });
  const doLucas = await novoPlano({
    nome: "2 cortes",
    vendedorId: lucas.barbeiroId,
    precoCentavos: 9999,
    diasDeTeste: 7,
  });
  return { app, dono, lucas, pedro, recepcao, cliente, daCasa, doLucas, novoPlano };
}

type Cenario = Awaited<ReturnType<typeof cenario>>;

async function novoCliente(app: App, token: string, telefone: string) {
  return (
    await app.inject({
      method: "POST",
      url: "/clientes",
      headers: auth(token),
      payload: { nome: "Ana Souza", telefone },
    })
  ).json();
}

function assinar(c: Cenario, token: string, planoId: string, clienteId = c.cliente.id) {
  return c.app.inject({
    method: "POST",
    url: `/clientes/${clienteId}/assinaturas`,
    headers: auth(token),
    payload: { planoId },
  });
}

function receber(c: Cenario, token: string, assinaturaId: string, forma = "pix") {
  return c.app.inject({
    method: "POST",
    url: `/assinaturas/${assinaturaId}/recebimentos`,
    headers: auth(token),
    payload: { forma },
  });
}

function cancelar(c: Cenario, token: string, assinaturaId: string) {
  return c.app.inject({ method: "DELETE", url: `/assinaturas/${assinaturaId}`, headers: auth(token) });
}

function listar(c: Cenario, token: string, query = "") {
  return c.app.inject({ method: "GET", url: `/barbearias/me/assinantes${query}`, headers: auth(token) });
}

// Direto no banco, com o ciclo que o teste precisa.
function assinaturaPronta(
  c: Cenario,
  planoId: string,
  extra: { situacao?: string; comeca?: string; termina?: string; forma?: string; conexaoId?: string } = {}
) {
  const { situacao = "ativa", comeca, termina, forma = "no_balcao", conexaoId } = extra;
  return prisma.assinaturaDoCliente.create({
    data: {
      barbeariaId: c.dono.barbeariaId,
      planoId,
      clienteId: c.cliente.id,
      situacao,
      forma,
      conexaoId,
      precoCentavos: 12000,
      ciclo: "mensal",
      cicloComecaEm: comeca ? dataParaDate(comeca) : null,
      cicloTerminaEm: termina ? dataParaDate(termina) : null,
    },
  });
}

function irParaOEssencial(c: Cenario) {
  return prisma.assinatura.update({
    where: { barbeariaId: c.dono.barbeariaId },
    data: { situacao: "ativa", plano: "essencial", testeTerminaEm: null },
  });
}

describe("assinar no balcão", () => {
  it("sem dias grátis, nasce pendente, sem ciclo, com o preço congelado", async () => {
    const c = await cenario();
    const resposta = await assinar(c, c.dono.token, c.daCasa.id);
    expect(resposta.statusCode).toBe(201);
    expect(resposta.json()).toMatchObject({
      situacao: "pendente",
      forma: "no_balcao",
      precoCentavos: 12000,
      ciclo: "mensal",
      cicloComecaEm: null,
      cicloTerminaEm: null,
      cliente: { id: c.cliente.id, nome: "Ana Souza" },
      plano: { id: c.daCasa.id, nome: "Corte ilimitado", daCasa: true, vendedor: null },
    });
    await prisma.planoDeAssinatura.update({ where: { id: c.daCasa.id }, data: { precoCentavos: 15000 } });
    const { assinantes } = (await listar(c, c.dono.token)).json();
    expect(assinantes[0].precoCentavos).toBe(12000);
    await c.app.close();
  });

  it("com dias grátis, nasce em teste, de hoje até o fim do teste", async () => {
    const c = await cenario();
    const resposta = await assinar(c, c.lucas.token, c.doLucas.id);
    expect(resposta.statusCode).toBe(201);
    expect(resposta.json()).toMatchObject({
      situacao: "teste",
      cicloComecaEm: HOJE,
      cicloTerminaEm: somarDias(HOJE, 7),
      plano: { daCasa: false, vendedor: { id: c.lucas.barbeiroId } },
    });
    await c.app.close();
  });

  it("plano desativado, que não aceita o balcão, ou de quem não vende mais: 422", async () => {
    const c = await cenario();
    const inativo = await c.novoPlano({ ativo: false });
    expect((await assinar(c, c.dono.token, inativo.id)).json().erro).toBe("plano_inativo");

    const soOnline = await c.novoPlano({ aceitaOnline: true, aceitaNoBalcao: false });
    expect((await assinar(c, c.dono.token, soOnline.id)).json().erro).toBe("plano_sem_balcao");

    await prisma.barbeiro.update({ where: { id: c.lucas.barbeiroId }, data: { podeVenderPlanos: false } });
    const semVender = await assinar(c, c.dono.token, c.doLucas.id);
    expect(semVender.statusCode).toBe(422);
    expect(semVender.json().erro).toBe("vendedor_nao_vende");
    await c.app.close();
  });

  it("uma viva por cliente e plano: a segunda é 422; depois de cancelar, pode de novo", async () => {
    const c = await cenario();
    const primeira = (await assinar(c, c.dono.token, c.daCasa.id)).json();
    const segunda = await assinar(c, c.dono.token, c.daCasa.id);
    expect(segunda.statusCode).toBe(422);
    expect(segunda.json().erro).toBe("ja_assina");
    await cancelar(c, c.dono.token, primeira.id);
    expect((await assinar(c, c.dono.token, c.daCasa.id)).statusCode).toBe(201);
    await c.app.close();
  });

  it("a recepção assina em qualquer plano; o profissional só nos dele", async () => {
    const c = await cenario();
    expect((await assinar(c, c.recepcao.token, c.doLucas.id)).statusCode).toBe(201);
    const outro = await novoCliente(c.app, c.dono.token, "11999990002");
    expect((await assinar(c, c.pedro.token, c.daCasa.id, outro.id)).statusCode).toBe(404);
    expect((await assinar(c, c.pedro.token, c.doLucas.id, outro.id)).statusCode).toBe(404);
    expect((await assinar(c, c.lucas.token, c.doLucas.id, outro.id)).statusCode).toBe(201);
    await c.app.close();
  });

  it("cliente de outra barbearia é 404", async () => {
    const c = await cenario();
    const outra = await criarBarbeariaComToken(c.app, "outra");
    const deFora = await novoCliente(c.app, outra.token, "11999990003");
    expect((await assinar(c, c.dono.token, c.daCasa.id, deFora.id)).statusCode).toBe(404);
    await c.app.close();
  });
});

describe("a lista de assinantes", () => {
  it("filtra por situação e por cliente; o profissional vê só as dos planos dele", async () => {
    const c = await cenario();
    const outro = await novoCliente(c.app, c.dono.token, "11999990002");
    const daCasa = (await assinar(c, c.dono.token, c.daCasa.id)).json();
    const doLucas = (await assinar(c, c.dono.token, c.doLucas.id, outro.id)).json();

    const todos = (await listar(c, c.dono.token)).json().assinantes.map((a: { id: string }) => a.id);
    expect(todos.sort()).toEqual([daCasa.id, doLucas.id].sort());
    const emTeste = (await listar(c, c.recepcao.token, "?situacao=teste")).json().assinantes;
    expect(emTeste.map((a: { id: string }) => a.id)).toEqual([doLucas.id]);
    const daAna = (await listar(c, c.dono.token, `?clienteId=${c.cliente.id}`)).json().assinantes;
    expect(daAna.map((a: { id: string }) => a.id)).toEqual([daCasa.id]);

    const doProfissional = (await listar(c, c.lucas.token)).json().assinantes;
    expect(doProfissional.map((a: { id: string }) => a.id)).toEqual([doLucas.id]);
    expect((await listar(c, c.pedro.token)).json().assinantes).toEqual([]);
    await c.app.close();
  });

  it("ciclo do balcão vencido ontem vira em atraso; o que renova hoje segue ativo; online nunca", async () => {
    const c = await cenario();
    const ontem = await assinaturaPronta(c, c.daCasa.id, { comeca: somarDias(HOJE, -31), termina: somarDias(HOJE, -1) });
    const outro = await novoCliente(c.app, c.dono.token, "11999990002");
    const hoje = await prisma.assinaturaDoCliente.create({
      data: {
        barbeariaId: c.dono.barbeariaId,
        planoId: c.doLucas.id,
        clienteId: outro.id,
        situacao: "teste",
        forma: "no_balcao",
        precoCentavos: 9999,
        ciclo: "mensal",
        cicloComecaEm: dataParaDate(somarDias(HOJE, -7)),
        cicloTerminaEm: dataParaDate(HOJE),
      },
    });
    const conexao = await prisma.conexaoDePagamento.create({
      data: {
        barbeariaId: c.dono.barbeariaId,
        barbeiroId: c.lucas.barbeiroId,
        provedor: "asaas",
        modo: "teste",
        chaveCifrada: Buffer.from("x"),
        chaveFinal: "9F3A",
        webhookTokenHash: "h",
      },
    });
    const terceiro = await novoCliente(c.app, c.dono.token, "11999990003");
    const online = await prisma.assinaturaDoCliente.create({
      data: {
        barbeariaId: c.dono.barbeariaId,
        planoId: c.doLucas.id,
        clienteId: terceiro.id,
        situacao: "ativa",
        forma: "online",
        conexaoId: conexao.id,
        precoCentavos: 9999,
        ciclo: "mensal",
        cicloComecaEm: dataParaDate(somarDias(HOJE, -31)),
        cicloTerminaEm: dataParaDate(somarDias(HOJE, -1)),
      },
    });

    const { assinantes } = (await listar(c, c.dono.token)).json();
    const situacao = (id: string) => assinantes.find((a: { id: string }) => a.id === id).situacao;
    expect(situacao(ontem.id)).toBe("em_atraso");
    expect(situacao(hoje.id)).toBe("teste");
    expect(situacao(online.id)).toBe("ativa");
    expect((await prisma.assinaturaDoCliente.findUniqueOrThrow({ where: { id: ontem.id } })).situacao).toBe("em_atraso");
    await c.app.close();
  });
});

describe("recebi", () => {
  it("pendente: abre o ciclo de hoje, fica ativa, e o recebimento é todo da casa no plano da casa", async () => {
    const c = await cenario();
    const assinatura = (await assinar(c, c.dono.token, c.daCasa.id)).json();
    const resposta = await receber(c, c.recepcao.token, assinatura.id, "dinheiro");
    expect(resposta.statusCode).toBe(201);
    expect(resposta.json()).toMatchObject({
      assinatura: { situacao: "ativa", cicloComecaEm: HOJE, cicloTerminaEm: fimDoCiclo(HOJE, "mensal") },
      recebimento: { data: HOJE, valorCentavos: 12000, casaCentavos: 12000, forma: "dinheiro" },
    });
    const gravado = await prisma.recebimentoDoPlano.findFirstOrThrow({ where: { assinaturaId: assinatura.id } });
    expect(gravado.recebidoPorId).toBe(c.recepcao.barbeiroId);
    expect(gravado.idExterno).toBeNull();
    await c.app.close();
  });

  it("no plano de barbeiro, a parte da casa é a dele, arredondada pra baixo; com 0, nada", async () => {
    const c = await cenario();
    await prisma.barbeiro.update({ where: { id: c.lucas.barbeiroId }, data: { parteDaCasa: 20 } });
    const vencida = await assinaturaPronta(c, c.doLucas.id, {
      situacao: "em_atraso",
      comeca: somarDias(HOJE, -40),
      termina: somarDias(HOJE, -10),
    });
    await prisma.assinaturaDoCliente.update({ where: { id: vencida.id }, data: { precoCentavos: 9999 } });
    const com20 = await receber(c, c.lucas.token, vencida.id);
    expect(com20.json().recebimento).toMatchObject({ valorCentavos: 9999, casaCentavos: 1999 });
    expect(com20.json().assinatura).toMatchObject({ situacao: "ativa", cicloComecaEm: HOJE });

    await prisma.barbeiro.update({ where: { id: c.lucas.barbeiroId }, data: { parteDaCasa: 0 } });
    await prisma.assinaturaDoCliente.update({
      where: { id: vencida.id },
      data: { situacao: "em_atraso", cicloComecaEm: dataParaDate(somarDias(HOJE, -40)), cicloTerminaEm: dataParaDate(somarDias(HOJE, -10)) },
    });
    const com0 = await receber(c, c.lucas.token, vencida.id);
    expect(com0.json().recebimento.casaCentavos).toBe(0);
    await c.app.close();
  });

  it("antes do dia da renovação o ciclo está em dia (422); no dia, abre o próximo", async () => {
    const c = await cenario();
    const emDia = await assinaturaPronta(c, c.daCasa.id, { comeca: somarDias(HOJE, -10), termina: somarDias(HOJE, 20) });
    const cedo = await receber(c, c.dono.token, emDia.id);
    expect(cedo.statusCode).toBe(422);
    expect(cedo.json().erro).toBe("ciclo_em_dia");

    await prisma.assinaturaDoCliente.update({
      where: { id: emDia.id },
      data: { cicloComecaEm: dataParaDate(somarDias(HOJE, -30)), cicloTerminaEm: dataParaDate(HOJE) },
    });
    const noDia = await receber(c, c.dono.token, emDia.id);
    expect(noDia.statusCode).toBe(201);
    expect(noDia.json().assinatura).toMatchObject({ cicloComecaEm: HOJE, cicloTerminaEm: fimDoCiclo(HOJE, "mensal") });
    await c.app.close();
  });

  it("em teste, só depois do fim do teste", async () => {
    const c = await cenario();
    const emTeste = (await assinar(c, c.dono.token, c.doLucas.id)).json();
    expect((await receber(c, c.dono.token, emTeste.id)).json().erro).toBe("ciclo_em_dia");
    await c.app.close();
  });

  it("cancelada ou online: 422", async () => {
    const c = await cenario();
    const cancelada = await assinaturaPronta(c, c.daCasa.id, { situacao: "cancelada" });
    expect((await receber(c, c.dono.token, cancelada.id)).json().erro).toBe("assinatura_cancelada");

    const conexao = await prisma.conexaoDePagamento.create({
      data: {
        barbeariaId: c.dono.barbeariaId,
        barbeiroId: c.dono.barbeiroId,
        daCasa: true,
        provedor: "asaas",
        modo: "teste",
        chaveCifrada: Buffer.from("x"),
        chaveFinal: "9F3A",
        webhookTokenHash: "h",
      },
    });
    const online = await assinaturaPronta(c, c.daCasa.id, { situacao: "pendente", forma: "online", conexaoId: conexao.id });
    expect((await receber(c, c.dono.token, online.id)).json().erro).toBe("assinatura_online");
    await c.app.close();
  });

  it("com o caixa de hoje fechado, o recebimento entra no próximo dia aberto", async () => {
    const c = await cenario();
    const assinatura = (await assinar(c, c.dono.token, c.daCasa.id)).json();
    for (const dia of [HOJE, somarDias(HOJE, 1)]) {
      await prisma.fechamentoDoDia.create({
        data: { barbeariaId: c.dono.barbeariaId, data: dataParaDate(dia), fechadoPorId: c.dono.barbeiroId, acerto: {} },
      });
    }
    const resposta = await receber(c, c.dono.token, assinatura.id);
    expect(resposta.json().recebimento.data).toBe(somarDias(HOJE, 2));
    // O ciclo segue o dia do pagamento, não o do caixa.
    expect(resposta.json().assinatura.cicloComecaEm).toBe(HOJE);
    await c.app.close();
  });

  it("forma fora da lista é 400; a do colega é 404", async () => {
    const c = await cenario();
    const assinatura = (await assinar(c, c.dono.token, c.doLucas.id)).json();
    expect((await receber(c, c.dono.token, assinatura.id, "plano")).statusCode).toBe(400);
    expect((await receber(c, c.pedro.token, assinatura.id)).statusCode).toBe(404);
    await c.app.close();
  });
});

describe("cancelar", () => {
  it("cancela; de novo é 204; a do colega é 404", async () => {
    const c = await cenario();
    const assinatura = (await assinar(c, c.dono.token, c.doLucas.id)).json();
    expect((await cancelar(c, c.pedro.token, assinatura.id)).statusCode).toBe(404);
    expect((await cancelar(c, c.lucas.token, assinatura.id)).statusCode).toBe(204);
    const depois = await prisma.assinaturaDoCliente.findUniqueOrThrow({ where: { id: assinatura.id } });
    expect(depois.situacao).toBe("cancelada");
    expect(depois.canceladaEm).not.toBeNull();
    expect((await cancelar(c, c.dono.token, assinatura.id)).statusCode).toBe(204);
    const deNovo = await prisma.assinaturaDoCliente.findUniqueOrThrow({ where: { id: assinatura.id } });
    expect(deNovo.canceladaEm).toEqual(depois.canceladaEm);
    await c.app.close();
  });
});

describe("fora do Completo", () => {
  it("assinar é 403; a lista, o recebi e o cancelar seguem", async () => {
    const c = await cenario();
    const assinatura = (await assinar(c, c.dono.token, c.daCasa.id)).json();
    await irParaOEssencial(c);
    const nova = await assinar(c, c.dono.token, c.doLucas.id);
    expect(nova.statusCode).toBe(403);
    expect(nova.json().erro).toBe("recurso_do_plano");
    expect((await listar(c, c.dono.token)).statusCode).toBe(200);
    expect((await receber(c, c.dono.token, assinatura.id)).statusCode).toBe(201);
    expect((await cancelar(c, c.dono.token, assinatura.id)).statusCode).toBe(204);
    await c.app.close();
  });
});
