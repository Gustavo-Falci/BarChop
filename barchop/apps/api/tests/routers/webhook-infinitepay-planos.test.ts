import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { prisma } from "@barchop/database";
import { fimDoCiclo } from "@barchop/formato";
import { agoraNaBarbearia, dataParaDate, dateParaData, somarDias } from "../../src/lib/horas";
import {
  assinar,
  avisar,
  avisoDePagamento,
  avisosDoSino,
  cenarioDaInfinitePay,
  conferir,
  pagar,
  type CenarioDaInfinitePay,
} from "../helpers/infinitepay";

// O aviso de pagamento da InfinitePay nos planos (plano
// pagamentos-online-infinitepay, PR 4). Ele vem sem assinatura e sem
// tipo de evento, por link: nada nele prova a origem. Por isso o BarChop
// só acredita no `payment_check` (o mesmo `confirmarPagamentoDoLink` da
// volta da página). A transação (`transaction_nsu`) entra uma vez só.
// Erro de rede responde 400, e a InfinitePay repete o aviso.

const hoje = () => agoraNaBarbearia().data;

async function comPendente() {
  const c = await cenarioDaInfinitePay();
  const criada = (await assinar(c, c.daCasa.id)).json();
  const { orderNsu } = c.provedores.links[0]!;
  return { c, assinaturaId: criada.assinatura.id as string, orderNsu };
}

// Um link de outro ciclo, gravado direto (a varredura que os gera é o
// PR 5).
async function linkDoCiclo(c: CenarioDaInfinitePay, assinaturaId: string, vencimento: string) {
  return prisma.linkDoCiclo.create({
    data: {
      barbeariaId: c.dono.barbeariaId,
      assinaturaId,
      vencimento: dataParaDate(vencimento),
      valorCentavos: 12000,
      orderNsu: `pedido-${randomUUID()}`,
      url: "https://checkout.exemplo/link",
      validoAte: dataParaDate(somarDias(vencimento, 10)),
    },
  });
}

describe("o aviso de pagamento", () => {
  it("pago: ativa a assinatura e entra uma vez no Caixa, com o aviso repetido e a volta da página", async () => {
    const { c, assinaturaId, orderNsu } = await comPendente();
    const transacao = { orderNsu, transactionNsu: "transacao-1", slug: "fatura-1" };
    pagar(c, transacao);

    const primeiro = await avisar(c, c.casa.id, avisoDePagamento(transacao));
    const repetido = await avisar(c, c.casa.id, avisoDePagamento(transacao));
    const naVolta = await conferir(c, transacao);

    expect(primeiro.statusCode).toBe(200);
    expect(repetido.statusCode).toBe(200);
    expect(naVolta.json().pago).toBe(true);
    expect(await prisma.recebimentoDoPlano.count({ where: { assinaturaId } })).toBe(1);
    expect(await prisma.assinaturaDoCliente.findUniqueOrThrow({ where: { id: assinaturaId } })).toMatchObject({
      situacao: "ativa",
      cicloComecaEm: dataParaDate(hoje()),
    });
    expect(await prisma.eventoDoProvedor.findMany()).toEqual([
      expect.objectContaining({ provedor: "infinitepay", id: "transacao-1" }),
    ]);
    const sino = await avisosDoSino(c.dono.barbeiroId);
    expect(sino.map((aviso) => aviso.titulo)).toEqual(["Nova assinatura"]);
  });

  it("não pago no payment_check: nada muda, e o evento não fica gravado (a repetição confere de novo)", async () => {
    const { c, assinaturaId, orderNsu } = await comPendente();
    const transacao = { orderNsu, transactionNsu: "transacao-1", slug: "fatura-1" };
    pagar(c, { ...transacao, pago: false });

    const resposta = await avisar(c, c.casa.id, avisoDePagamento(transacao));

    expect(resposta.statusCode).toBe(200);
    expect(await prisma.eventoDoProvedor.count()).toBe(0);
    expect(await prisma.assinaturaDoCliente.findUniqueOrThrow({ where: { id: assinaturaId } })).toMatchObject({
      situacao: "pendente",
    });

    pagar(c, transacao);
    await avisar(c, c.casa.id, avisoDePagamento(transacao));
    expect(await prisma.recebimentoDoPlano.count({ where: { assinaturaId } })).toBe(1);
  });

  it("aviso de link que não é do BarChop, ou de outra conexão: 200 e nada", async () => {
    const { c, orderNsu } = await comPendente();
    pagar(c, { orderNsu, transactionNsu: "transacao-1", slug: "fatura-1" });

    const deFora = await avisar(
      c,
      c.casa.id,
      avisoDePagamento({ orderNsu: "pedido-de-fora", transactionNsu: "transacao-9", slug: "fatura-9" })
    );
    const outraConexao = await avisar(
      c,
      randomUUID(),
      avisoDePagamento({ orderNsu, transactionNsu: "transacao-1", slug: "fatura-1" })
    );

    expect(deFora.statusCode).toBe(200);
    expect(outraConexao.statusCode).toBe(200);
    expect(await prisma.recebimentoDoPlano.count()).toBe(0);
    expect(await prisma.eventoDoProvedor.count()).toBe(0);
  });

  it("o link de uma conexão chegando pelo endereço de outra: 200 e nada", async () => {
    const { c, orderNsu } = await comPendente();
    pagar(c, { orderNsu, transactionNsu: "transacao-1", slug: "fatura-1" });
    // Outra conexão ligada da InfinitePay na mesma barbearia (a do dono,
    // fora a da casa).
    const outra = await prisma.conexaoDePagamento.create({
      data: {
        barbeariaId: c.dono.barbeariaId,
        barbeiroId: c.dono.barbeiroId,
        daCasa: false,
        provedor: "infinitepay",
        modo: "real",
        chaveCifrada: Buffer.from("inchk_outra-conta-0000"),
        chaveFinal: "0000",
        webhookTokenHash: "hash-que-ninguem-usa",
        infiniteTag: "outra-tag",
        diasParaCancelar: 10,
      },
    });

    const resposta = await avisar(c, outra.id, avisoDePagamento({ orderNsu, transactionNsu: "transacao-1", slug: "fatura-1" }));

    expect(resposta.statusCode).toBe(200);
    expect(await prisma.recebimentoDoPlano.count()).toBe(0);
  });

  it("corpo que não é um aviso é 400", async () => {
    const c = await cenarioDaInfinitePay();

    const resposta = await avisar(c, c.casa.id, { qualquer: "coisa" });

    expect(resposta.statusCode).toBe(400);
  });

  it("a InfinitePay fora do ar ao conferir: 400 sem gravar o evento, e a repetição entra", async () => {
    const { c, assinaturaId, orderNsu } = await comPendente();
    const transacao = { orderNsu, transactionNsu: "transacao-1", slug: "fatura-1" };
    pagar(c, transacao);
    c.provedores.indisponivel = true;

    const fora = await avisar(c, c.casa.id, avisoDePagamento(transacao));
    c.provedores.indisponivel = false;
    const repetido = await avisar(c, c.casa.id, avisoDePagamento(transacao));

    expect(fora.statusCode).toBe(400);
    expect(repetido.statusCode).toBe(200);
    expect(await prisma.recebimentoDoPlano.count({ where: { assinaturaId } })).toBe(1);
  });

  it("pago numa assinatura já cancelada: não entra no Caixa, e o sino pede o estorno no app (uma vez)", async () => {
    const { c, assinaturaId, orderNsu } = await comPendente();
    await prisma.assinaturaDoCliente.update({
      where: { id: assinaturaId },
      data: { situacao: "cancelada", canceladaEm: new Date() },
    });
    const transacao = { orderNsu, transactionNsu: "transacao-1", slug: "fatura-1" };
    pagar(c, transacao);

    await avisar(c, c.casa.id, avisoDePagamento(transacao));
    await conferir(c, transacao);

    expect(await prisma.recebimentoDoPlano.count({ where: { assinaturaId } })).toBe(0);
    expect(await prisma.linkDoCiclo.findFirstOrThrow({ where: { orderNsu } })).toMatchObject({
      situacao: "fechado",
      transactionNsu: "transacao-1",
    });
    const sino = await avisosDoSino(c.dono.barbeiroId);
    expect(sino.map((aviso) => aviso.titulo)).toEqual(["Estorne o pagamento"]);
    expect(sino[0]!.texto).toContain("app da InfinitePay");
  });

  it("pago num link que o BarChop já fechou (o recebi do balcão): também pede o estorno", async () => {
    const { c, assinaturaId, orderNsu } = await comPendente();
    await prisma.linkDoCiclo.updateMany({ where: { orderNsu }, data: { situacao: "fechado" } });
    const transacao = { orderNsu, transactionNsu: "transacao-1", slug: "fatura-1" };
    pagar(c, transacao);

    await avisar(c, c.casa.id, avisoDePagamento(transacao));

    expect(await prisma.recebimentoDoPlano.count({ where: { assinaturaId } })).toBe(0);
    const sino = await avisosDoSino(c.dono.barbeiroId);
    expect(sino.map((aviso) => aviso.titulo)).toEqual(["Estorne o pagamento"]);
  });
});

describe("o ciclo depois do pagamento", () => {
  it("em teste, pago antes do fim: o teste segue, e o ciclo pago fica para depois (pagoAte)", async () => {
    const c = await cenarioDaInfinitePay();
    const comTeste = await c.plano({ nome: "Com teste", diasDeTeste: 7 });
    const criada = (await assinar(c, comTeste.id)).json();
    const fimDoTeste = somarDias(hoje(), 7);
    const link = await linkDoCiclo(c, criada.assinatura.id, fimDoTeste);
    const transacao = { orderNsu: link.orderNsu, transactionNsu: "transacao-1", slug: "fatura-1" };
    pagar(c, transacao);

    await avisar(c, c.casa.id, avisoDePagamento(transacao));

    const gravada = await prisma.assinaturaDoCliente.findUniqueOrThrow({ where: { id: criada.assinatura.id } });
    expect(dateParaData(gravada.cicloComecaEm!)).toBe(hoje());
    expect(dateParaData(gravada.cicloTerminaEm!)).toBe(fimDoTeste);
    expect(dateParaData(gravada.pagoAte!)).toBe(fimDoCiclo(fimDoTeste, "mensal"));
  });

  it("em atraso, pago depois do vencimento: o ciclo recomeça no dia pago", async () => {
    const { c, assinaturaId } = await comPendente();
    const vencimento = somarDias(hoje(), -5);
    await prisma.assinaturaDoCliente.update({
      where: { id: assinaturaId },
      data: {
        situacao: "em_atraso",
        cicloComecaEm: dataParaDate(somarDias(vencimento, -30)),
        cicloTerminaEm: dataParaDate(vencimento),
      },
    });
    const link = await linkDoCiclo(c, assinaturaId, vencimento);
    const transacao = { orderNsu: link.orderNsu, transactionNsu: "transacao-1", slug: "fatura-1" };
    pagar(c, transacao);

    await avisar(c, c.casa.id, avisoDePagamento(transacao));

    const gravada = await prisma.assinaturaDoCliente.findUniqueOrThrow({ where: { id: assinaturaId } });
    expect(gravada.situacao).toBe("ativa");
    expect(dateParaData(gravada.cicloComecaEm!)).toBe(hoje());
    expect(dateParaData(gravada.cicloTerminaEm!)).toBe(fimDoCiclo(hoje(), "mensal"));
    expect(gravada.pagoAte).toBeNull();
  });
});
