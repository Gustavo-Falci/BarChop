import { describe, expect, it } from "vitest";
import { prisma } from "@barchop/database";
import { fimDoCiclo } from "@barchop/formato";
import { agoraNaBarbearia, dataParaDate, dateParaData, somarDias } from "../../src/lib/horas";
import { auth } from "../helpers/barbearia";
import { criarClienteComToken } from "../helpers/cliente";
import {
  assinar,
  avisosDoSino,
  cenarioDaInfinitePay,
  conferir,
  pagar,
  TAG,
} from "../helpers/infinitepay";

// Assinar pela InfinitePay (plano pagamentos-online-infinitepay, PR 4).
// Ela não renova sozinha: sem assinatura nem cliente no provedor, o
// BarChop gera um link de pagamento por ciclo. O primeiro sai no
// assinar, vale os dias para cancelar da conta, e a assinatura nasce
// pendente. O comprador volta pela página da barbearia, que pede à API
// para conferir o pagamento na InfinitePay (`payment_check`).

const hoje = () => agoraNaBarbearia().data;

describe("assinar pela InfinitePay", () => {
  it("sem dias grátis: nasce pendente, com o link do primeiro ciclo, e devolve a URL dele", async () => {
    const c = await cenarioDaInfinitePay();

    const resposta = await assinar(c, c.daCasa.id);

    expect(resposta.statusCode).toBe(201);
    const corpo = resposta.json();
    expect(c.provedores.links).toHaveLength(1);
    const pedido = c.provedores.links[0]!;
    expect(corpo.linkDaFatura).toBe(pedido.url);
    expect(corpo.assinatura).toMatchObject({ situacao: "pendente", forma: "online", cicloComecaEm: null });
    expect(pedido).toMatchObject({
      tag: TAG,
      valorCentavos: 12000,
      descricao: "Corte ilimitado",
      cliente: { nome: expect.any(String), email: "caio@exemplo.com", telefone: expect.any(String) },
      // Sem query: a InfinitePay junta a dela (order_nsu, slug...).
      redirectUrl: `http://localhost:3000/${c.dono.slug}/minha-conta`,
      webhookUrl: `https://api.barchop.test/webhooks/infinitepay/${c.casa.id}`,
      validoAte: somarDias(hoje(), 10),
    });
    // Sem assinatura nem cliente no provedor.
    expect(c.provedores.clientes).toEqual([]);
    expect(c.provedores.pedidosDeAssinatura).toEqual([]);

    const gravada = await prisma.assinaturaDoCliente.findUniqueOrThrow({ where: { id: corpo.assinatura.id } });
    expect(gravada).toMatchObject({ conexaoId: c.casa.id, idExterno: null, situacao: "pendente" });
    const link = await prisma.linkDoCiclo.findFirstOrThrow({ where: { assinaturaId: gravada.id } });
    expect(link).toMatchObject({
      barbeariaId: c.dono.barbeariaId,
      valorCentavos: 12000,
      orderNsu: pedido.orderNsu,
      url: pedido.url,
      situacao: "aberto",
      transactionNsu: null,
    });
    expect(dateParaData(link.vencimento)).toBe(hoje());
    expect(dateParaData(link.validoAte)).toBe(somarDias(hoje(), 10));
    // Assinar e nunca pagar não avisa ninguém.
    expect(await avisosDoSino(c.dono.barbeiroId)).toEqual([]);
  });

  it("o link vale os dias para cancelar que quem vende escolheu", async () => {
    const c = await cenarioDaInfinitePay();
    const mudou = await c.app.inject({
      method: "PATCH",
      url: "/barbearias/me/pagamentos-online?daCasa=true",
      headers: auth(c.dono.token),
      payload: { diasParaCancelar: 20 },
    });
    expect(mudou.statusCode).toBe(200);

    expect((await assinar(c, c.daCasa.id)).statusCode).toBe(201);

    expect(c.provedores.links[0]!.validoAte).toBe(somarDias(hoje(), 20));
  });

  it("com dias grátis: nasce em teste, sem link", async () => {
    const c = await cenarioDaInfinitePay();
    const comTeste = await c.plano({ nome: "Com teste", diasDeTeste: 7 });

    const resposta = await assinar(c, comTeste.id);

    expect(resposta.statusCode).toBe(201);
    expect(resposta.json()).toMatchObject({
      linkDaFatura: null,
      assinatura: { situacao: "teste", cicloComecaEm: hoje(), cicloTerminaEm: somarDias(hoje(), 7) },
    });
    expect(c.provedores.links).toEqual([]);
    expect(await prisma.linkDoCiclo.count()).toBe(0);
  });

  it("plano abaixo de R$ 1,00 não se vende pela InfinitePay", async () => {
    const c = await cenarioDaInfinitePay();
    const barato = await c.plano({ nome: "Barato", precoCentavos: 99 });

    const resposta = await assinar(c, barato.id);

    expect(resposta.statusCode).toBe(422);
    expect(resposta.json().erro).toBe("plano_indisponivel");
    expect(c.provedores.links).toEqual([]);
    expect(await prisma.assinaturaDoCliente.count()).toBe(0);
  });

  it("voltar a assinar com a pendente devolve o mesmo link, sem pedir outro à InfinitePay", async () => {
    const c = await cenarioDaInfinitePay();
    const primeira = (await assinar(c, c.daCasa.id)).json();

    const segunda = await assinar(c, c.daCasa.id);

    expect(segunda.statusCode).toBe(200);
    expect(segunda.json().linkDaFatura).toBe(primeira.linkDaFatura);
    expect(segunda.json().assinatura.id).toBe(primeira.assinatura.id);
    expect(c.provedores.links).toHaveLength(1);
  });

  it("a InfinitePay fora do ar: 502, e nada gravado", async () => {
    const c = await cenarioDaInfinitePay();
    c.provedores.indisponivel = true;

    const resposta = await assinar(c, c.daCasa.id);

    expect(resposta.statusCode).toBe(502);
    expect(resposta.json().erro).toBe("provedor_indisponivel");
    expect(await prisma.assinaturaDoCliente.count()).toBe(0);
    expect(await prisma.linkDoCiclo.count()).toBe(0);
  });

  it("a chave de quem vende recusada: para o cliente, o plano não está à venda agora", async () => {
    const c = await cenarioDaInfinitePay();
    c.provedores.chavesInvalidas.add("inchk_chave-da-casa-1234");

    const resposta = await assinar(c, c.daCasa.id);

    expect(resposta.statusCode).toBe(422);
    expect(resposta.json().erro).toBe("plano_indisponivel");
    expect(await prisma.assinaturaDoCliente.count()).toBe(0);
  });
});

describe("conferir o pagamento na volta da página", () => {
  async function comPendente() {
    const c = await cenarioDaInfinitePay();
    const criada = (await assinar(c, c.daCasa.id)).json();
    const { orderNsu } = c.provedores.links[0]!;
    return { c, assinaturaId: criada.assinatura.id as string, orderNsu };
  }

  it("pago: a assinatura fica ativa com o ciclo começando hoje, e a mensalidade entra uma vez no Caixa", async () => {
    const { c, assinaturaId, orderNsu } = await comPendente();
    const transacao = { orderNsu, transactionNsu: "transacao-1", slug: "fatura-1" };
    pagar(c, transacao);

    const resposta = await conferir(c, transacao);
    const deNovo = await conferir(c, transacao);

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toMatchObject({
      pago: true,
      assinatura: {
        id: assinaturaId,
        situacao: "ativa",
        cicloComecaEm: hoje(),
        cicloTerminaEm: fimDoCiclo(hoje(), "mensal"),
      },
    });
    expect(deNovo.json().pago).toBe(true);
    const recebimentos = await prisma.recebimentoDoPlano.findMany({ where: { assinaturaId } });
    expect(recebimentos).toHaveLength(1);
    expect(recebimentos[0]).toMatchObject({ valorCentavos: 12000, forma: "online", meio: "pix", idExterno: "transacao-1" });
    const link = await prisma.linkDoCiclo.findFirstOrThrow({ where: { orderNsu } });
    expect(link).toMatchObject({ situacao: "pago", transactionNsu: "transacao-1", slug: "fatura-1" });
    expect(link.pagoEm).not.toBeNull();
    const sino = await avisosDoSino(c.dono.barbeiroId);
    expect(sino.map((aviso) => aviso.titulo)).toEqual(["Nova assinatura"]);
  });

  it("ainda não pago: nada muda, e a transação fica guardada no link (uma vez) para a varredura", async () => {
    const { c, assinaturaId, orderNsu } = await comPendente();

    const resposta = await conferir(c, { orderNsu, transactionNsu: "transacao-1", slug: "fatura-1" });
    await conferir(c, { orderNsu, transactionNsu: "transacao-2", slug: "fatura-2" });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toMatchObject({ pago: false, assinatura: { situacao: "pendente" } });
    expect(await prisma.recebimentoDoPlano.count({ where: { assinaturaId } })).toBe(0);
    expect(await prisma.linkDoCiclo.findFirstOrThrow({ where: { orderNsu } })).toMatchObject({
      situacao: "aberto",
      transactionNsu: "transacao-1",
      slug: "fatura-1",
    });
  });

  it("o valor pago diferente do link não entra no Caixa: o sino avisa quem vende", async () => {
    const { c, assinaturaId, orderNsu } = await comPendente();
    const transacao = { orderNsu, transactionNsu: "transacao-1", slug: "fatura-1" };
    pagar(c, { ...transacao, valorCentavos: 5000 });

    const resposta = await conferir(c, transacao);

    expect(resposta.json()).toMatchObject({ pago: false, assinatura: { situacao: "pendente" } });
    expect(await prisma.recebimentoDoPlano.count({ where: { assinaturaId } })).toBe(0);
    const sino = await avisosDoSino(c.dono.barbeiroId);
    expect(sino.map((aviso) => aviso.titulo)).toEqual(["Pagamento com valor diferente"]);
  });

  it("o link de outro cliente (ou que não é do BarChop) é 404", async () => {
    const { c, orderNsu } = await comPendente();
    const outro = await criarClienteComToken(c.app, c.dono.slug, "11988887777");
    pagar(c, { orderNsu, transactionNsu: "transacao-1", slug: "fatura-1" });

    const deOutro = await conferir(c, { orderNsu, transactionNsu: "transacao-1", slug: "fatura-1" }, outro.token);
    const inventado = await conferir(c, { orderNsu: "pedido-inventado", transactionNsu: "transacao-1", slug: "fatura-1" });

    expect(deOutro.statusCode).toBe(404);
    expect(inventado.statusCode).toBe(404);
    expect(await prisma.recebimentoDoPlano.count()).toBe(0);
  });

  it("a InfinitePay fora do ar: 502, e nada muda", async () => {
    const { c, orderNsu } = await comPendente();
    pagar(c, { orderNsu, transactionNsu: "transacao-1", slug: "fatura-1" });
    c.provedores.indisponivel = true;

    const resposta = await conferir(c, { orderNsu, transactionNsu: "transacao-1", slug: "fatura-1" });

    expect(resposta.statusCode).toBe(502);
    expect(await prisma.recebimentoDoPlano.count()).toBe(0);
  });

  it("pago depois de desligada a conta: sem a chave, não há como conferir", async () => {
    const { c, orderNsu } = await comPendente();
    pagar(c, { orderNsu, transactionNsu: "transacao-1", slug: "fatura-1" });
    await prisma.conexaoDePagamento.update({
      where: { id: c.casa.id },
      data: { desconectadaEm: new Date(), chaveCifrada: Buffer.alloc(0) },
    });

    const resposta = await conferir(c, { orderNsu, transactionNsu: "transacao-1", slug: "fatura-1" });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json().pago).toBe(false);
    expect(await prisma.recebimentoDoPlano.count()).toBe(0);
  });

  it("a assinatura gravada tem o ciclo que a data diz", async () => {
    // Guarda contra fuso: o ciclo é gravado como data (AAAA-MM-DD).
    const { c, assinaturaId, orderNsu } = await comPendente();
    pagar(c, { orderNsu, transactionNsu: "transacao-1", slug: "fatura-1" });

    await conferir(c, { orderNsu, transactionNsu: "transacao-1", slug: "fatura-1" });

    const gravada = await prisma.assinaturaDoCliente.findUniqueOrThrow({ where: { id: assinaturaId } });
    expect(gravada.cicloComecaEm).toEqual(dataParaDate(hoje()));
    expect(gravada.pagoAte).toBeNull();
  });
});
