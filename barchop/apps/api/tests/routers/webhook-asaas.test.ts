import { describe, expect, it } from "vitest";
import { prisma } from "@barchop/database";
import { fimDoCiclo } from "@barchop/formato";
import { buildApp } from "../../src/app";
import { agoraNaBarbearia, dataParaDate, dateParaData, somarDias } from "../../src/lib/horas";
import { provedoresDeMemoria, type CobrancaNoProvedor } from "../../src/lib/provedores";
import { auth, criarBarbeariaComToken, criarMembroComToken } from "../helpers/barbearia";

// O webhook do Asaas (Onda 2, marco 3, PR 10a do plano
// planos-de-assinatura). Sem login: quem prova a origem é o token que o
// BarChop gerou ao conectar a conta, no cabeçalho `asaas-access-token`.
// Como o da Stripe: o estado vem relido no provedor, o evento é gravado
// na mesma transação da mudança, e dado estranho vai pro log com 200.
//
// A mensalidade paga entra no caixa do dia com a forma `online`: caiu na
// conta de quem vende, e não na mão de alguém. No acerto, quem "recebeu"
// é o dono da conta: a casa (null) no plano da casa, o vendedor no dele.

const CHAVE_DA_CASA = "$aact_hmlg_chave-da-casa-1234";
const CHAVE_DO_LUCAS = "$aact_hmlg_chave-do-lucas-5678";

async function cenario() {
  const provedores = provedoresDeMemoria();
  const app = buildApp({ provedores });
  const dono = await criarBarbeariaComToken(app);
  const lucas = await criarMembroComToken(app, dono.barbeariaId, "profissional", "lucas");
  await prisma.barbeiro.update({ where: { id: lucas.barbeiroId }, data: { podeVenderPlanos: true, parteDaCasa: 20 } });

  const conectar = async (token: string, chave: string, daCasa: boolean) => {
    const resposta = await app.inject({
      method: "PUT",
      url: `/barbearias/me/pagamentos-online${daCasa ? "?daCasa=true" : ""}`,
      headers: auth(token),
      payload: { provedor: "asaas", chave },
    });
    expect(resposta.statusCode).toBe(200);
    const conexao = await prisma.conexaoDePagamento.findFirstOrThrow({
      where: daCasa ? { barbeariaId: dono.barbeariaId, daCasa: true } : { barbeiroId: lucas.barbeiroId, daCasa: false },
    });
    return { id: conexao.id, token: provedores.webhooks.at(-1)!.token };
  };
  const casa = await conectar(dono.token, CHAVE_DA_CASA, true);
  const doLucas = await conectar(lucas.token, CHAVE_DO_LUCAS, false);

  const cliente = await prisma.cliente.create({
    data: { barbeariaId: dono.barbeariaId, nome: "Caio Rocha", telefone: "+5511999990001", cpf: "52998224725" },
  });
  const planoDaCasa = await prisma.planoDeAssinatura.create({
    data: {
      barbeariaId: dono.barbeariaId,
      nome: "Corte ilimitado",
      ciclo: "mensal",
      precoCentavos: 12000,
      fixoPorAtendimentoCentavos: 2500,
    },
  });
  const planoDoLucas = await prisma.planoDeAssinatura.create({
    data: { barbeariaId: dono.barbeariaId, vendedorId: lucas.barbeiroId, nome: "Barba do Lucas", ciclo: "mensal", precoCentavos: 8000 },
  });
  return { app, provedores, dono, lucas, casa, doLucas, cliente, planoDaCasa, planoDoLucas };
}

type Cenario = Awaited<ReturnType<typeof cenario>>;

const hoje = () => agoraNaBarbearia().data;

// Uma assinatura online, como o "assinar" (PR 10c) vai deixar: no banco
// e no "provedor".
async function assinaturaOnline(
  c: Cenario,
  opcoes: { daCasa?: boolean; situacao?: string; comeca?: string; termina?: string; pagoAte?: string } = {}
) {
  const daCasa = opcoes.daCasa ?? true;
  const plano = daCasa ? c.planoDaCasa : c.planoDoLucas;
  const idExterno = `sub_${Math.random().toString(36).slice(2)}`;
  c.provedores.assinaturas.set(idExterno, {
    id: idExterno,
    situacao: "ativa",
    removida: false,
    valorCentavos: plano.precoCentavos,
    proximoVencimento: fimDoCiclo(hoje(), "mensal"),
  });
  return prisma.assinaturaDoCliente.create({
    data: {
      barbeariaId: c.dono.barbeariaId,
      planoId: plano.id,
      clienteId: c.cliente.id,
      situacao: opcoes.situacao ?? "pendente",
      forma: "online",
      conexaoId: daCasa ? c.casa.id : c.doLucas.id,
      idExterno,
      precoCentavos: plano.precoCentavos,
      ciclo: "mensal",
      cicloComecaEm: opcoes.comeca ? dataParaDate(opcoes.comeca) : null,
      cicloTerminaEm: opcoes.termina ? dataParaDate(opcoes.termina) : null,
      pagoAte: opcoes.pagoAte ? dataParaDate(opcoes.pagoAte) : null,
    },
  });
}

let numero = 0;

// A cobrança como o provedor a relê.
function cobranca(
  c: Cenario,
  assinatura: { idExterno: string | null; precoCentavos: number },
  extra: Partial<CobrancaNoProvedor> = {}
): CobrancaNoProvedor {
  const paga = extra.situacao === undefined || extra.situacao === "paga";
  const dados: CobrancaNoProvedor = {
    id: `pay_${++numero}`,
    assinaturaId: assinatura.idExterno,
    situacao: "paga",
    removida: false,
    valorCentavos: assinatura.precoCentavos,
    vencimento: hoje(),
    pagaEm: paga ? hoje() : null,
    forma: paga ? "cartao" : null,
    linkDaFatura: null,
    ...extra,
  };
  c.provedores.cobrancas.set(dados.id, dados);
  return dados;
}

function evento(
  c: Cenario,
  conexao: { id: string; token: string | null },
  corpo: { tipo: string; cobrancaId?: string; assinaturaId?: string | null; id?: string }
) {
  return c.app.inject({
    method: "POST",
    url: `/webhooks/asaas/${conexao.id}`,
    headers: conexao.token === null ? {} : { "asaas-access-token": conexao.token },
    payload: {
      id: corpo.id ?? `evt_${++numero}`,
      event: corpo.tipo,
      cobrancaId: corpo.cobrancaId,
      assinaturaId: corpo.assinaturaId,
    },
  });
}

function pagar(c: Cenario, conexao: { id: string; token: string }, pagamento: CobrancaNoProvedor, tipo = "PAYMENT_CONFIRMED") {
  return evento(c, conexao, { tipo, cobrancaId: pagamento.id, assinaturaId: pagamento.assinaturaId });
}

// Só os avisos de pagamento: o cadastro pode deixar outros no sino.
async function notificacoesDe(barbeiroId: string) {
  return prisma.notificacao.findMany({ where: { barbeiroId, tipo: "pagamento" }, orderBy: { criadaEm: "asc" } });
}

describe("quem pode mandar eventos", () => {
  it("token errado ou ausente é 401, e nada é gravado", async () => {
    const c = await cenario();
    const assinatura = await assinaturaOnline(c);
    const paga = cobranca(c, assinatura);

    for (const token of ["token-errado", null]) {
      const resposta = await evento(c, { id: c.casa.id, token }, { tipo: "PAYMENT_CONFIRMED", cobrancaId: paga.id });
      expect(resposta.statusCode).toBe(401);
    }
    // O token de uma conexão não vale na outra.
    expect((await pagar(c, { id: c.casa.id, token: c.doLucas.token }, paga)).statusCode).toBe(401);

    expect(await prisma.eventoDoProvedor.count()).toBe(0);
    expect(await prisma.recebimentoDoPlano.count()).toBe(0);
    await c.app.close();
  });

  it("conexão desconhecida, desligada ou de outro modo responde 200 sem mexer em nada", async () => {
    const c = await cenario();
    const assinatura = await assinaturaOnline(c);
    const paga = cobranca(c, assinatura);

    const desconhecida = { id: "00000000-0000-4000-8000-000000000000", token: c.casa.token };
    expect((await pagar(c, desconhecida, paga)).statusCode).toBe(200);

    await prisma.conexaoDePagamento.update({ where: { id: c.casa.id }, data: { modo: "real" } });
    expect((await pagar(c, c.casa, paga)).statusCode).toBe(200);

    await prisma.conexaoDePagamento.update({
      where: { id: c.casa.id },
      data: { modo: "teste", desconectadaEm: new Date(), chaveCifrada: Buffer.alloc(0) },
    });
    expect((await pagar(c, c.casa, paga)).statusCode).toBe(200);

    expect(await prisma.eventoDoProvedor.count()).toBe(0);
    expect(await prisma.recebimentoDoPlano.count()).toBe(0);
    await c.app.close();
  });

  it("corpo que não é evento é 400", async () => {
    const c = await cenario();
    const resposta = await c.app.inject({
      method: "POST",
      url: `/webhooks/asaas/${c.casa.id}`,
      headers: { "asaas-access-token": c.casa.token },
      payload: { qualquer: "coisa" },
    });
    expect(resposta.statusCode).toBe(400);
    await c.app.close();
  });
});

describe("mensalidade paga", () => {
  it("no plano da casa: a assinatura fica ativa, a mensalidade entra no caixa como online e a casa recebe", async () => {
    const c = await cenario();
    const assinatura = await assinaturaOnline(c);
    const paga = cobranca(c, assinatura);

    const resposta = await pagar(c, c.casa, paga);

    expect(resposta.statusCode).toBe(200);
    const depois = await prisma.assinaturaDoCliente.findUniqueOrThrow({ where: { id: assinatura.id } });
    expect(depois.situacao).toBe("ativa");
    expect(dateParaData(depois.cicloComecaEm!)).toBe(hoje());
    expect(dateParaData(depois.cicloTerminaEm!)).toBe(fimDoCiclo(hoje(), "mensal"));

    const recebimentos = await prisma.recebimentoDoPlano.findMany();
    expect(recebimentos).toEqual([
      expect.objectContaining({
        assinaturaId: assinatura.id,
        idExterno: paga.id,
        recebidoPorId: null,
        valorCentavos: 12000,
        casaCentavos: 12000,
        forma: "online",
        meio: "cartao",
      }),
    ]);
    expect(dateParaData(recebimentos[0]!.data)).toBe(hoje());

    const caixa = (
      await c.app.inject({ method: "GET", url: `/barbearias/me/caixa?data=${hoje()}`, headers: auth(c.dono.token) })
    ).json();
    expect(caixa.mensalidades).toEqual([
      expect.objectContaining({ forma: "online", meio: "cartao", recebidoPor: null, valorCentavos: 12000 }),
    ]);
    expect(caixa.totais.porForma.map((f: { forma: string }) => f.forma)).toEqual([
      "pix",
      "dinheiro",
      "debito",
      "credito",
      "online",
    ]);
    expect(caixa.totais.porForma.at(-1)).toEqual({ forma: "online", quantidade: 1, valorCentavos: 12000 });
    expect(caixa.totais.totalCentavos).toBe(12000);
    // Tudo da casa, e a casa já tem: ninguém deve nada a ninguém.
    expect(caixa.acerto.repasses).toEqual([]);
    await c.app.close();
  });

  it("no plano de barbeiro: o vendedor recebeu e deve a parte da casa no acerto", async () => {
    const c = await cenario();
    const assinatura = await assinaturaOnline(c, { daCasa: false });
    const paga = cobranca(c, assinatura, { forma: "pix" });

    expect((await pagar(c, c.doLucas, paga, "PAYMENT_RECEIVED")).statusCode).toBe(200);

    const recebimento = await prisma.recebimentoDoPlano.findFirstOrThrow();
    expect(recebimento).toMatchObject({ recebidoPorId: c.lucas.barbeiroId, casaCentavos: 1600, meio: "pix" });
    const caixa = (
      await c.app.inject({ method: "GET", url: `/barbearias/me/caixa?data=${hoje()}`, headers: auth(c.dono.token) })
    ).json();
    expect(caixa.acerto.repasses).toEqual([
      expect.objectContaining({ de: expect.objectContaining({ id: c.lucas.barbeiroId }), para: null, valorCentavos: 1600 }),
    ]);
    await c.app.close();
  });

  it("o mesmo evento duas vezes, ou o CONFIRMED e depois o RECEIVED da mesma cobrança, valem uma vez", async () => {
    const c = await cenario();
    const assinatura = await assinaturaOnline(c);
    const paga = cobranca(c, assinatura);

    const corpo = { id: "evt_repetido", tipo: "PAYMENT_CONFIRMED", cobrancaId: paga.id, assinaturaId: paga.assinaturaId };
    expect((await evento(c, c.casa, corpo)).statusCode).toBe(200);
    expect((await evento(c, c.casa, corpo)).statusCode).toBe(200);
    expect((await pagar(c, c.casa, paga, "PAYMENT_RECEIVED")).statusCode).toBe(200);

    expect(await prisma.recebimentoDoPlano.count()).toBe(1);
    expect(await prisma.eventoDoProvedor.count()).toBe(2);
    expect(await notificacoesDe(c.dono.barbeiroId)).toHaveLength(1);
    await c.app.close();
  });

  it("o provedor fora do ar na releitura é 500 sem gravar o evento; a nova entrega vale", async () => {
    const c = await cenario();
    const assinatura = await assinaturaOnline(c);
    const paga = cobranca(c, assinatura);
    const corpo = { id: "evt_1", tipo: "PAYMENT_CONFIRMED", cobrancaId: paga.id, assinaturaId: paga.assinaturaId };

    c.provedores.indisponivel = true;
    expect((await evento(c, c.casa, corpo)).statusCode).toBe(500);
    expect(await prisma.eventoDoProvedor.count()).toBe(0);

    c.provedores.indisponivel = false;
    expect((await evento(c, c.casa, corpo)).statusCode).toBe(200);
    expect(await prisma.recebimentoDoPlano.count()).toBe(1);
    await c.app.close();
  });

  it("paga antes da renovação: o ciclo de agora segue, e o seguinte entra quando ele acaba", async () => {
    const c = await cenario();
    const comeca = somarDias(hoje(), -20);
    const termina = somarDias(hoje(), 3);
    const assinatura = await assinaturaOnline(c, { situacao: "ativa", comeca, termina });
    const paga = cobranca(c, assinatura, { vencimento: termina });

    expect((await pagar(c, c.casa, paga)).statusCode).toBe(200);

    const depois = await prisma.assinaturaDoCliente.findUniqueOrThrow({ where: { id: assinatura.id } });
    expect(dateParaData(depois.cicloComecaEm!)).toBe(comeca);
    expect(dateParaData(depois.cicloTerminaEm!)).toBe(termina);
    expect(dateParaData(depois.pagoAte!)).toBe(fimDoCiclo(termina, "mensal"));
    await c.app.close();
  });

  it("o ciclo já pago entra na leitura, quando o de agora acabou", async () => {
    const c = await cenario();
    const termina = somarDias(hoje(), -1);
    const pagoAte = fimDoCiclo(termina, "mensal");
    const assinatura = await assinaturaOnline(c, {
      situacao: "ativa",
      comeca: somarDias(termina, -30),
      termina,
      pagoAte,
    });

    const lista = await c.app.inject({ method: "GET", url: "/barbearias/me/assinantes", headers: auth(c.dono.token) });

    expect(lista.json().assinantes[0]).toMatchObject({
      id: assinatura.id,
      situacao: "ativa",
      cicloComecaEm: termina,
      cicloTerminaEm: pagoAte,
    });
    const depois = await prisma.assinaturaDoCliente.findUniqueOrThrow({ where: { id: assinatura.id } });
    expect(depois.pagoAte).toBeNull();
    await c.app.close();
  });

  it("paga numa assinatura cancelada não reativa nem entra no caixa", async () => {
    const c = await cenario();
    const assinatura = await assinaturaOnline(c, { situacao: "cancelada" });
    const paga = cobranca(c, assinatura);

    expect((await pagar(c, c.casa, paga)).statusCode).toBe(200);

    expect((await prisma.assinaturaDoCliente.findUniqueOrThrow({ where: { id: assinatura.id } })).situacao).toBe(
      "cancelada"
    );
    expect(await prisma.recebimentoDoPlano.count()).toBe(0);
    await c.app.close();
  });

  it("cobrança de assinatura que o BarChop não conhece: 200, evento gravado, nada mais", async () => {
    const c = await cenario();
    const paga = cobranca(c, { idExterno: "sub_de_fora", precoCentavos: 5000 });

    expect((await pagar(c, c.casa, paga)).statusCode).toBe(200);

    expect(await prisma.eventoDoProvedor.count()).toBe(1);
    expect(await prisma.recebimentoDoPlano.count()).toBe(0);
    await c.app.close();
  });

  it("a assinatura de outra conexão não é mexida pela cobrança que chega nesta", async () => {
    const c = await cenario();
    const doLucas = await assinaturaOnline(c, { daCasa: false });
    const paga = cobranca(c, doLucas);

    expect((await pagar(c, c.casa, paga)).statusCode).toBe(200);

    expect(await prisma.recebimentoDoPlano.count()).toBe(0);
    await c.app.close();
  });
});

describe("o sino de quem vende", () => {
  it("\"Nova assinatura\" só no primeiro pagamento: aos donos no plano da casa, ao vendedor no dele", async () => {
    const c = await cenario();
    const daCasa = await assinaturaOnline(c);
    const doLucas = await assinaturaOnline(c, { daCasa: false });

    await pagar(c, c.casa, cobranca(c, daCasa));
    await pagar(c, c.doLucas, cobranca(c, doLucas));
    // A renovação não avisa de novo.
    await pagar(c, c.casa, cobranca(c, daCasa, { vencimento: fimDoCiclo(hoje(), "mensal") }));

    expect(await notificacoesDe(c.dono.barbeiroId)).toEqual([
      expect.objectContaining({
        tipo: "pagamento",
        titulo: "Nova assinatura",
        texto: "Caio Rocha assinou o plano Corte ilimitado e pagou a primeira mensalidade.",
        link: `/painel/clientes/${c.cliente.id}`,
      }),
    ]);
    expect(await notificacoesDe(c.lucas.barbeiroId)).toEqual([
      expect.objectContaining({ titulo: "Nova assinatura", texto: expect.stringContaining("Barba do Lucas") }),
    ]);
    await c.app.close();
  });

  it("\"Pagamento em atraso\": a cobrança da renovação venceu; a assinatura fica em atraso", async () => {
    const c = await cenario();
    const termina = somarDias(hoje(), -1);
    const assinatura = await assinaturaOnline(c, { daCasa: false, situacao: "ativa", comeca: somarDias(termina, -30), termina });
    const vencida = cobranca(c, assinatura, { situacao: "vencida", vencimento: termina });

    expect((await pagar(c, c.doLucas, vencida, "PAYMENT_OVERDUE")).statusCode).toBe(200);

    expect((await prisma.assinaturaDoCliente.findUniqueOrThrow({ where: { id: assinatura.id } })).situacao).toBe(
      "em_atraso"
    );
    expect(await notificacoesDe(c.lucas.barbeiroId)).toEqual([
      expect.objectContaining({
        titulo: "Pagamento em atraso",
        texto: "A mensalidade de Caio Rocha no plano Barba do Lucas venceu e não foi paga.",
      }),
    ]);
    expect(await notificacoesDe(c.dono.barbeiroId)).toEqual([]);
    await c.app.close();
  });

  it("o atraso de uma cobrança velha, ou já paga, não derruba o ciclo pago", async () => {
    const c = await cenario();
    const comeca = somarDias(hoje(), -5);
    const assinatura = await assinaturaOnline(c, { situacao: "ativa", comeca, termina: fimDoCiclo(comeca, "mensal") });
    const velha = cobranca(c, assinatura, { situacao: "vencida", vencimento: somarDias(comeca, -30) });

    expect((await pagar(c, c.casa, velha, "PAYMENT_OVERDUE")).statusCode).toBe(200);

    expect((await prisma.assinaturaDoCliente.findUniqueOrThrow({ where: { id: assinatura.id } })).situacao).toBe("ativa");
    expect(await notificacoesDe(c.dono.barbeiroId)).toEqual([]);
    await c.app.close();
  });

  it("estorno avisa quem vende e não mexe no caixa", async () => {
    const c = await cenario();
    const assinatura = await assinaturaOnline(c);
    const paga = cobranca(c, assinatura);
    await pagar(c, c.casa, paga);

    c.provedores.cobrancas.set(paga.id, { ...paga, situacao: "estornada" });
    expect((await pagar(c, c.casa, paga, "PAYMENT_REFUNDED")).statusCode).toBe(200);

    expect(await prisma.recebimentoDoPlano.count()).toBe(1);
    expect((await notificacoesDe(c.dono.barbeiroId)).at(-1)).toMatchObject({
      titulo: "Pagamento estornado",
      texto: "O Asaas estornou a mensalidade de Caio Rocha no plano Corte ilimitado. O caixa não mudou: acerte à mão se precisar.",
    });
    await c.app.close();
  });
});

describe("a assinatura no provedor", () => {
  it("removida ou parada no provedor fica cancelada aqui", async () => {
    const c = await cenario();
    const assinatura = await assinaturaOnline(c, { situacao: "ativa", comeca: hoje(), termina: fimDoCiclo(hoje(), "mensal") });
    const noProvedor = c.provedores.assinaturas.get(assinatura.idExterno!)!;
    c.provedores.assinaturas.set(noProvedor.id, { ...noProvedor, removida: true });

    const resposta = await evento(c, c.casa, { tipo: "SUBSCRIPTION_DELETED", assinaturaId: noProvedor.id });

    expect(resposta.statusCode).toBe(200);
    const depois = await prisma.assinaturaDoCliente.findUniqueOrThrow({ where: { id: assinatura.id } });
    expect(depois.situacao).toBe("cancelada");
    expect(depois.canceladaEm).not.toBeNull();
    await c.app.close();
  });

  it("a que o provedor não acha mais também fica cancelada", async () => {
    const c = await cenario();
    const assinatura = await assinaturaOnline(c, { situacao: "ativa", comeca: hoje(), termina: fimDoCiclo(hoje(), "mensal") });
    c.provedores.assinaturas.delete(assinatura.idExterno!);

    const resposta = await evento(c, c.casa, { tipo: "SUBSCRIPTION_DELETED", assinaturaId: assinatura.idExterno });

    expect(resposta.statusCode).toBe(200);
    expect((await prisma.assinaturaDoCliente.findUniqueOrThrow({ where: { id: assinatura.id } })).situacao).toBe(
      "cancelada"
    );
    await c.app.close();
  });
});

describe("fechar o dia", () => {
  it("com a mensalidade online da casa, que ninguém da equipe recebeu", async () => {
    const c = await cenario();
    const assinatura = await assinaturaOnline(c);
    await pagar(c, c.casa, cobranca(c, assinatura));

    const fechado = await c.app.inject({
      method: "POST",
      url: `/barbearias/me/caixa/${hoje()}/fechamento`,
      headers: auth(c.dono.token),
    });

    expect(fechado.statusCode).toBe(201);
    const dia = (
      await c.app.inject({ method: "GET", url: `/barbearias/me/caixa?data=${hoje()}`, headers: auth(c.dono.token) })
    ).json();
    expect(dia.fechamento).not.toBeNull();
    expect(dia.mensalidades).toEqual([expect.objectContaining({ forma: "online", recebidoPor: null })]);
    expect(dia.acerto.repasses).toEqual([]);
    await c.app.close();
  });
});
