import { describe, expect, it } from "vitest";
import { prisma } from "@barchop/database";
import { buildApp } from "../../src/app";
import { agoraNaBarbearia, dataParaDate, somarDias } from "../../src/lib/horas";
import { prepararAgenda } from "../helpers/agenda";
import { auth, criarBarbeariaComToken, criarMembroComToken } from "../helpers/barbearia";
import { QUINTA } from "../helpers/datas";

// O atendimento "pelo plano" no pagamento (Onda 2, marco 3, PR 6a do
// plano planos-de-assinatura). A tela manda a assinatura; a API decide
// quais serviços do atendimento o plano cobre (até os usos do ciclo) e
// grava um uso por serviço coberto. O que o plano não cobre é cobrado
// avulso, na forma do dinheiro; sem nada cobrado, a forma é `plano`. No
// plano da casa, quem atendeu ganha o fixo, pago pela casa (parte
// `plano`); no plano de barbeiro, nada além do avulso: ele já recebeu a
// mensalidade. O assinante segue usando o plano fora do Completo
// (decisão 6): o pagamento só pede o `caixa`.

const HOJE = agoraNaBarbearia().data;

async function cenario() {
  const app = buildApp();
  const agenda = await prepararAgenda(app);
  const novoServico = async (nome: string, preco: string) =>
    (
      await app.inject({
        method: "POST",
        url: "/servicos",
        headers: auth(agenda.token),
        payload: { nome, duracaoMinutos: 30, preco },
      })
    ).json() as { id: string };
  const corte = agenda.servico as { id: string };
  const barba = await novoServico("Barba", "30.00");
  const sobrancelha = await novoServico("Sobrancelha", "20.00");
  const lucas = await criarMembroComToken(app, agenda.barbeariaId, "profissional", "lucas");
  await prisma.barbeiro.update({ where: { id: lucas.barbeiroId }, data: { parteDaCasa: 0 } });

  const daCasa = await prisma.planoDeAssinatura.create({
    data: {
      barbeariaId: agenda.barbeariaId,
      nome: "Corte ilimitado",
      ciclo: "mensal",
      precoCentavos: 12000,
      fixoPorAtendimentoCentavos: 2500,
      aceitaNoBalcao: true,
      servicos: {
        create: [
          { servicoId: corte.id, usosPorCiclo: null },
          { servicoId: barba.id, usosPorCiclo: 1 },
        ],
      },
    },
  });
  const doGustavo = await prisma.planoDeAssinatura.create({
    data: {
      barbeariaId: agenda.barbeariaId,
      vendedorId: agenda.barbeiroId,
      nome: "2 cortes",
      ciclo: "mensal",
      precoCentavos: 9000,
      aceitaNoBalcao: true,
      servicos: { create: [{ servicoId: corte.id, usosPorCiclo: 2 }] },
    },
  });
  return { app, agenda, corte, barba, sobrancelha, lucas, daCasa, doGustavo };
}

type Cenario = Awaited<ReturnType<typeof cenario>>;

// O ciclo em volta da QUINTA dos testes, que é sempre no futuro.
function assinatura(
  c: Cenario,
  planoId: string,
  extra: { situacao?: string; comeca?: string; termina?: string; clienteId?: string } = {}
) {
  const { situacao = "ativa", comeca = somarDias(QUINTA, -10), termina = somarDias(QUINTA, 20) } = extra;
  return prisma.assinaturaDoCliente.create({
    data: {
      barbeariaId: c.agenda.barbeariaId,
      planoId,
      clienteId: extra.clienteId ?? c.agenda.cliente.id,
      situacao,
      forma: "no_balcao",
      precoCentavos: 12000,
      ciclo: "mensal",
      cicloComecaEm: situacao === "pendente" ? null : dataParaDate(comeca),
      cicloTerminaEm: situacao === "pendente" ? null : dataParaDate(termina),
    },
  });
}

// Direto no banco: o painel exigiria jornada de cada um, e o que importa
// aqui é o pagamento. Uma hora pra cada, pra não esbarrar na trava de
// horário do barbeiro.
let vez = 0;
async function atendimento(
  c: Cenario,
  servicos: { id: string; preco: string }[],
  { barbeiroId = c.agenda.barbeiroId, data = QUINTA }: { barbeiroId?: string; data?: string } = {}
) {
  vez += 1;
  const hora = `1970-01-01T${String(6 + (vez % 16)).padStart(2, "0")}:00:00Z`;
  return prisma.agendamento.create({
    data: {
      barbeariaId: c.agenda.barbeariaId,
      barbeiroId,
      clienteId: c.agenda.cliente.id,
      data: dataParaDate(data),
      horaInicio: new Date(hora),
      horaFim: new Date(new Date(hora).getTime() + 60_000 * 30),
      status: "confirmado",
      origem: "barbeiro",
      servicos: {
        create: servicos.map((s) => ({ servicoId: s.id, precoNoMomento: s.preco, duracaoNoMomento: 30 })),
      },
    },
  });
}

function registrar(c: Cenario, agendamentoId: string, corpo: Record<string, unknown>, token = c.agenda.token) {
  return c.app.inject({
    method: "PUT",
    url: `/agendamentos/${agendamentoId}/pagamento`,
    headers: auth(token),
    payload: corpo,
  });
}

function ler(c: Cenario, agendamentoId: string, token = c.agenda.token) {
  return c.app.inject({ method: "GET", url: `/agendamentos/${agendamentoId}/pagamento`, headers: auth(token) });
}

const corteDe45 = (c: Cenario) => ({ id: c.corte.id, preco: "45.00" });
const barbaDe30 = (c: Cenario) => ({ id: c.barba.id, preco: "30.00" });
const sobrancelhaDe20 = (c: Cenario) => ({ id: c.sobrancelha.id, preco: "20.00" });

describe("pelo plano da casa", () => {
  it("tudo coberto: forma plano, sem dinheiro, e o fixo de quem atendeu pago pela casa", async () => {
    const c = await cenario();
    const viva = await assinatura(c, c.daCasa.id);
    const ag = await atendimento(c, [corteDe45(c)], { barbeiroId: c.lucas.barbeiroId });

    const resposta = await registrar(c, ag.id, { forma: "plano", assinaturaId: viva.id });
    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toMatchObject({
      forma: "plano",
      servicosCentavos: 0,
      totalCentavos: 0,
      assinatura: { id: viva.id, plano: { id: c.daCasa.id, nome: "Corte ilimitado" } },
      servicosPeloPlano: [{ id: c.corte.id, nome: "Corte" }],
      partes: [{ beneficiario: { id: c.lucas.barbeiroId }, motivo: "plano", valorCentavos: 2500 }],
    });
    const usos = await prisma.usoDoPlano.findMany({ where: { assinaturaId: viva.id } });
    expect(usos).toHaveLength(1);
    expect(usos[0]).toMatchObject({ servicoId: c.corte.id, data: dataParaDate(QUINTA) });

    // No acerto, o fixo é a casa pagando quem atendeu: ninguém "recebeu".
    const caixa = (
      await c.app.inject({ method: "GET", url: `/barbearias/me/caixa?data=${QUINTA}`, headers: auth(c.agenda.token) })
    ).json();
    expect(caixa.acerto.repasses).toEqual([
      { de: null, para: { id: c.lucas.barbeiroId, nome: expect.any(String) }, valorCentavos: 2500 },
    ]);
    const linhaDoLucas = caixa.acerto.pessoas.find((l: { pessoa: { id: string } | null }) => l.pessoa?.id === c.lucas.barbeiroId);
    expect(linhaDoLucas).toMatchObject({ recebeuCentavos: 0, cabeCentavos: 2500 });
    await c.app.close();
  });

  it("o que o plano não cobre é avulso, na forma do dinheiro; a parte do plano vem por último", async () => {
    const c = await cenario();
    const viva = await assinatura(c, c.daCasa.id);
    const ag = await atendimento(c, [corteDe45(c), sobrancelhaDe20(c)], { barbeiroId: c.lucas.barbeiroId });

    const resposta = await registrar(c, ag.id, { forma: "pix", assinaturaId: viva.id, gorjetaCentavos: 500 });
    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toMatchObject({
      forma: "pix",
      servicosCentavos: 2000,
      totalCentavos: 2500,
      servicosPeloPlano: [{ id: c.corte.id }],
    });
    expect(resposta.json().partes.map((p: { motivo: string; valorCentavos: number }) => [p.motivo, p.valorCentavos])).toEqual([
      ["atendimento", 2000],
      ["gorjeta", 500],
      ["plano", 2500],
    ]);
    await c.app.close();
  });

  it("a barba tem 1 uso no ciclo: o 2º atendimento é 422; refazer o 1º não conta ele mesmo", async () => {
    const c = await cenario();
    const viva = await assinatura(c, c.daCasa.id);
    const primeiro = await atendimento(c, [barbaDe30(c)]);
    expect((await registrar(c, primeiro.id, { forma: "plano", assinaturaId: viva.id })).statusCode).toBe(200);

    const segundo = await atendimento(c, [barbaDe30(c)], { data: somarDias(QUINTA, 1) });
    const esgotado = await registrar(c, segundo.id, { forma: "plano", assinaturaId: viva.id });
    expect(esgotado.statusCode).toBe(422);
    expect(esgotado.json().erro).toBe("usos_esgotados");

    // Barba + corte: o corte (ilimitado) vai pelo plano, a barba avulsa.
    const misto = await atendimento(c, [barbaDe30(c), corteDe45(c)], { data: somarDias(QUINTA, 2) });
    const parcial = await registrar(c, misto.id, { forma: "dinheiro", assinaturaId: viva.id });
    expect(parcial.json()).toMatchObject({ servicosCentavos: 3000, servicosPeloPlano: [{ id: c.corte.id }] });

    expect((await registrar(c, primeiro.id, { forma: "plano", assinaturaId: viva.id })).statusCode).toBe(200);
    expect(await prisma.usoDoPlano.count({ where: { assinaturaId: viva.id } })).toBe(2);
    await c.app.close();
  });

  it("serviço que o plano não tem: 422", async () => {
    const c = await cenario();
    const viva = await assinatura(c, c.daCasa.id);
    const ag = await atendimento(c, [sobrancelhaDe20(c)]);
    const resposta = await registrar(c, ag.id, { forma: "pix", assinaturaId: viva.id });
    expect(resposta.statusCode).toBe(422);
    expect(resposta.json().erro).toBe("servico_fora_do_plano");
    await c.app.close();
  });
});

describe("pelo plano de barbeiro", () => {
  it("com quem vende: sem fixo, nenhuma parte", async () => {
    const c = await cenario();
    const viva = await assinatura(c, c.doGustavo.id);
    const ag = await atendimento(c, [corteDe45(c)]);
    const resposta = await registrar(c, ag.id, { forma: "plano", assinaturaId: viva.id });
    expect(resposta.statusCode).toBe(200);
    expect(resposta.json().partes).toEqual([]);
    await c.app.close();
  });

  it("com o parceiro: 422; sem a assinatura, é avulso como sempre", async () => {
    const c = await cenario();
    const viva = await assinatura(c, c.doGustavo.id);
    const ag = await atendimento(c, [corteDe45(c)], { barbeiroId: c.lucas.barbeiroId });
    const recusado = await registrar(c, ag.id, { forma: "plano", assinaturaId: viva.id });
    expect(recusado.statusCode).toBe(422);
    expect(recusado.json().erro).toBe("plano_de_outro_barbeiro");

    const avulso = await registrar(c, ag.id, { forma: "pix" });
    expect(avulso.json()).toMatchObject({ forma: "pix", servicosCentavos: 4500, assinatura: null, servicosPeloPlano: [] });
    await c.app.close();
  });
});

describe("a assinatura precisa valer no dia", () => {
  it("pendente, em atraso ou cancelada: 422", async () => {
    const c = await cenario();
    for (const situacao of ["pendente", "em_atraso", "cancelada"]) {
      await prisma.assinaturaDoCliente.deleteMany({ where: { planoId: c.daCasa.id } });
      const morta = await assinatura(c, c.daCasa.id, { situacao });
      const ag = await atendimento(c, [corteDe45(c)]);
      const resposta = await registrar(c, ag.id, { forma: "plano", assinaturaId: morta.id });
      expect(resposta.json().erro).toBe("assinatura_inativa");
    }
    await c.app.close();
  });

  it("o ciclo do balcão que venceu antes de hoje vira em atraso antes da conferência", async () => {
    const c = await cenario();
    const vencida = await assinatura(c, c.daCasa.id, { comeca: somarDias(HOJE, -31), termina: somarDias(HOJE, -1) });
    const ag = await atendimento(c, [corteDe45(c)]);
    expect((await registrar(c, ag.id, { forma: "plano", assinaturaId: vencida.id })).json().erro).toBe("assinatura_inativa");
    // O 422 desfaz a transação, e a marca junto: a próxima leitura refaz.
    const { assinaturas } = (await ler(c, ag.id)).json();
    expect(assinaturas[0].situacao).toBe("em_atraso");
    await c.app.close();
  });

  it("atendimento fora do ciclo (o dia da renovação já é do próximo): 422", async () => {
    const c = await cenario();
    const viva = await assinatura(c, c.daCasa.id, { comeca: somarDias(QUINTA, -30), termina: QUINTA });
    const ag = await atendimento(c, [corteDe45(c)]);
    const resposta = await registrar(c, ag.id, { forma: "plano", assinaturaId: viva.id });
    expect(resposta.json().erro).toBe("fora_do_ciclo");
    await c.app.close();
  });

  it("de outro cliente é 422; de outra barbearia, 404", async () => {
    const c = await cenario();
    const outro = (
      await c.app.inject({
        method: "POST",
        url: "/clientes",
        headers: auth(c.agenda.token),
        payload: { nome: "Outro Cliente", telefone: "11988887777" },
      })
    ).json();
    const doOutro = await assinatura(c, c.daCasa.id, { clienteId: outro.id });
    const ag = await atendimento(c, [corteDe45(c)]);
    expect((await registrar(c, ag.id, { forma: "plano", assinaturaId: doOutro.id })).json().erro).toBe(
      "assinatura_de_outro_cliente"
    );

    const outra = await criarBarbeariaComToken(c.app, "outra");
    const planoDeFora = await prisma.planoDeAssinatura.create({
      data: {
        barbeariaId: outra.barbeariaId,
        nome: "De fora",
        ciclo: "mensal",
        precoCentavos: 1000,
        fixoPorAtendimentoCentavos: 0,
        aceitaNoBalcao: true,
      },
    });
    const clienteDeFora = (
      await c.app.inject({
        method: "POST",
        url: "/clientes",
        headers: auth(outra.token),
        payload: { nome: "De Fora", telefone: "11977776666" },
      })
    ).json();
    const deFora = await prisma.assinaturaDoCliente.create({
      data: {
        barbeariaId: outra.barbeariaId,
        planoId: planoDeFora.id,
        clienteId: clienteDeFora.id,
        situacao: "ativa",
        forma: "no_balcao",
        precoCentavos: 1000,
        ciclo: "mensal",
        cicloComecaEm: dataParaDate(somarDias(QUINTA, -10)),
        cicloTerminaEm: dataParaDate(somarDias(QUINTA, 20)),
      },
    });
    expect((await registrar(c, ag.id, { forma: "plano", assinaturaId: deFora.id })).statusCode).toBe(404);
    await c.app.close();
  });
});

describe("a forma", () => {
  it("plano sem assinatura, plano com dinheiro, ou dinheiro sem nada a cobrar: 422", async () => {
    const c = await cenario();
    const viva = await assinatura(c, c.daCasa.id);
    const soCorte = await atendimento(c, [corteDe45(c)]);
    expect((await registrar(c, soCorte.id, { forma: "plano" })).json().erro).toBe("forma_invalida");
    expect((await registrar(c, soCorte.id, { forma: "pix", assinaturaId: viva.id })).json().erro).toBe("forma_invalida");
    expect(
      (await registrar(c, soCorte.id, { forma: "plano", assinaturaId: viva.id, gorjetaCentavos: 500 })).json().erro
    ).toBe("forma_invalida");

    const comAvulso = await atendimento(c, [corteDe45(c), sobrancelhaDe20(c)]);
    expect((await registrar(c, comAvulso.id, { forma: "plano", assinaturaId: viva.id })).json().erro).toBe(
      "forma_invalida"
    );
    // Gorjeta no atendimento todo coberto: a forma é a do dinheiro.
    const comGorjeta = await registrar(c, soCorte.id, { forma: "pix", assinaturaId: viva.id, gorjetaCentavos: 500 });
    expect(comGorjeta.statusCode).toBe(200);
    expect(comGorjeta.json()).toMatchObject({ forma: "pix", servicosCentavos: 0, totalCentavos: 500 });
    await c.app.close();
  });
});

describe("refazer e remover", () => {
  it("refazer com a mesma assinatura não confere de novo: o ciclo renovado ou o cancelar não travam", async () => {
    const c = await cenario();
    const viva = await assinatura(c, c.daCasa.id);
    const ag = await atendimento(c, [corteDe45(c)], { barbeiroId: c.lucas.barbeiroId });
    expect((await registrar(c, ag.id, { forma: "plano", assinaturaId: viva.id })).statusCode).toBe(200);

    await prisma.assinaturaDoCliente.update({
      where: { id: viva.id },
      data: { situacao: "cancelada", canceladaEm: new Date() },
    });
    await prisma.planoDeAssinatura.update({ where: { id: c.daCasa.id }, data: { fixoPorAtendimentoCentavos: 3000 } });
    const refeito = await registrar(c, ag.id, { forma: "plano", assinaturaId: viva.id, recebidoPorId: c.agenda.barbeiroId });
    expect(refeito.statusCode).toBe(200);
    // As regras de agora: o fixo novo.
    expect(refeito.json().partes).toEqual([
      expect.objectContaining({ motivo: "plano", valorCentavos: 3000 }),
    ]);
    expect(await prisma.usoDoPlano.count({ where: { assinaturaId: viva.id } })).toBe(1);

    // Tirar a assinatura tira os usos.
    const avulso = await registrar(c, ag.id, { forma: "pix" });
    expect(avulso.json()).toMatchObject({ assinatura: null, servicosCentavos: 4500 });
    expect(await prisma.usoDoPlano.count({ where: { assinaturaId: viva.id } })).toBe(0);
    await c.app.close();
  });

  it("remover o pagamento devolve o uso", async () => {
    const c = await cenario();
    const viva = await assinatura(c, c.daCasa.id);
    const ag = await atendimento(c, [corteDe45(c)]);
    await registrar(c, ag.id, { forma: "plano", assinaturaId: viva.id });
    await c.app.inject({ method: "DELETE", url: `/agendamentos/${ag.id}/pagamento`, headers: auth(c.agenda.token) });
    expect(await prisma.usoDoPlano.count({ where: { assinaturaId: viva.id } })).toBe(0);
    await c.app.close();
  });
});

describe("GET /agendamentos/:id/pagamento", () => {
  it("as assinaturas do cliente, com os usos que sobram no dia e se valem com quem atende", async () => {
    const c = await cenario();
    const daCasa = await assinatura(c, c.daCasa.id);
    const doGustavo = await assinatura(c, c.doGustavo.id);
    const antes = await atendimento(c, [barbaDe30(c)]);
    await registrar(c, antes.id, { forma: "plano", assinaturaId: daCasa.id });
    const ag = await atendimento(c, [corteDe45(c)], { barbeiroId: c.lucas.barbeiroId });

    const { assinaturas } = (await ler(c, ag.id)).json();
    const daLista = (id: string) => assinaturas.find((a: { id: string }) => a.id === id);
    expect(daLista(daCasa.id)).toMatchObject({
      situacao: "ativa",
      noCiclo: true,
      valeComOAtendente: true,
      plano: { id: c.daCasa.id, nome: "Corte ilimitado", daCasa: true, vendedor: null },
    });
    expect(daLista(daCasa.id).servicos).toEqual(
      expect.arrayContaining([
        { servicoId: c.corte.id, nome: "Corte", usosPorCiclo: null, usosRestantes: null },
        { servicoId: c.barba.id, nome: "Barba", usosPorCiclo: 1, usosRestantes: 0 },
      ])
    );
    expect(daLista(doGustavo.id)).toMatchObject({
      valeComOAtendente: false,
      plano: { daCasa: false, vendedor: { id: c.agenda.barbeiroId } },
    });

    // O profissional vê os planos da casa e os dele.
    const doLucas = (await ler(c, ag.id, c.lucas.token)).json().assinaturas;
    expect(doLucas.map((a: { id: string }) => a.id)).toEqual([daCasa.id]);

    // O próprio pagamento não conta contra ele.
    const { assinaturas: doAntes } = (await ler(c, antes.id)).json();
    const barba = doAntes
      .find((a: { id: string }) => a.id === daCasa.id)
      .servicos.find((s: { servicoId: string }) => s.servicoId === c.barba.id);
    expect(barba.usosRestantes).toBe(1);
    await c.app.close();
  });
});

describe("fora do Completo", () => {
  it("o assinante segue usando o plano: o pagamento só pede o caixa", async () => {
    const c = await cenario();
    const viva = await assinatura(c, c.daCasa.id);
    await prisma.assinatura.update({
      where: { barbeariaId: c.agenda.barbeariaId },
      data: { situacao: "ativa", plano: "essencial", testeTerminaEm: null },
    });
    const ag = await atendimento(c, [corteDe45(c)]);
    expect((await registrar(c, ag.id, { forma: "plano", assinaturaId: viva.id })).statusCode).toBe(200);
    expect((await ler(c, ag.id)).json().assinaturas).toHaveLength(1);
    await c.app.close();
  });
});
