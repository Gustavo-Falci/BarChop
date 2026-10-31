import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { prisma } from "@barchop/database";
import { canalDeMemoria } from "../../src/lib/canal";
import { varrerCiclosPorLink } from "../../src/lib/ciclos-por-link";
import { agoraNaBarbearia, dataParaDate, somarDias } from "../../src/lib/horas";
import { auth } from "../helpers/barbearia";
import { assinar, avisosDoSino, cenarioDaInfinitePay, conferir, pagar, type CenarioDaInfinitePay } from "../helpers/infinitepay";

// Os dados das telas e o "Recebi" da InfinitePay (plano
// pagamentos-online-infinitepay, PR 6). A conta do cliente mostra o link
// a pagar; o painel, o link do ciclo; a vitrine diz o provedor. E o
// "Recebi" (decisão 10) vale na assinatura da InfinitePay: quem vende
// confere no app e marca, e o link aberto fica fechado.

const hoje = () => agoraNaBarbearia().data;
const log = { info: () => {}, warn: () => {} };

async function assinada(c: CenarioDaInfinitePay) {
  const resposta = await assinar(c, c.daCasa.id);
  expect(resposta.statusCode).toBe(201);
  const { assinatura, linkDaFatura } = resposta.json();
  expect(assinatura.linkParaPagar).toBe(linkDaFatura);
  const link = await prisma.linkDoCiclo.findFirstOrThrow({ where: { assinaturaId: assinatura.id } });
  return { id: assinatura.id as string, url: linkDaFatura as string, link };
}

function receber(c: CenarioDaInfinitePay, assinaturaId: string, forma = "pix") {
  return c.app.inject({
    method: "POST",
    url: `/assinaturas/${assinaturaId}/recebimentos`,
    headers: auth(c.dono.token),
    payload: { forma },
  });
}

async function naConta(c: CenarioDaInfinitePay) {
  const resposta = await c.app.inject({ method: "GET", url: "/clientes/me/assinaturas", headers: auth(c.cliente.token) });
  return resposta.json().assinaturas;
}

async function noPainel(c: CenarioDaInfinitePay) {
  const resposta = await c.app.inject({ method: "GET", url: "/barbearias/me/assinantes", headers: auth(c.dono.token) });
  return resposta.json().assinantes;
}

describe("a vitrine", () => {
  it("o plano da InfinitePay diz o provedor e não pede o CPF", async () => {
    const c = await cenarioDaInfinitePay();
    const { planos } = (await c.app.inject({ method: "GET", url: `/barbearias/${c.dono.slug}/planos` })).json();
    expect(planos[0].pagamento).toEqual({ provedor: "infinitepay", pedeCpf: false });
  });
});

describe("o link nas telas", () => {
  it("a conta do cliente mostra o link a pagar; pago, some", async () => {
    const c = await cenarioDaInfinitePay();
    const { url, link } = await assinada(c);

    expect((await naConta(c))[0].linkParaPagar).toBe(url);

    pagar(c, { orderNsu: link.orderNsu, transactionNsu: "transacao-1", slug: "fatura-1" });
    expect((await conferir(c, { orderNsu: link.orderNsu, transactionNsu: "transacao-1", slug: "fatura-1" })).statusCode).toBe(200);

    expect((await naConta(c))[0].linkParaPagar).toBeNull();
  });

  it("o painel mostra o link do ciclo com o vencimento; a do balcão, nulo", async () => {
    const c = await cenarioDaInfinitePay();
    const { id, url, link } = await assinada(c);
    const balcao = await c.plano({ nome: "Balcão", aceitaOnline: false, aceitaNoBalcao: true });
    const noBalcao = await c.app.inject({
      method: "POST",
      url: `/clientes/${c.cliente.clienteId}/assinaturas`,
      headers: auth(c.dono.token),
      payload: { planoId: balcao.id },
    });
    expect(noBalcao.statusCode).toBe(201);

    const assinantes = await noPainel(c);
    const daInfinitePay = assinantes.find((a: { id: string }) => a.id === id);
    expect(daInfinitePay.linkDoCiclo).toEqual({ url, vencimento: link.vencimento.toISOString().slice(0, 10) });
    expect(assinantes.find((a: { id: string }) => a.id === noBalcao.json().id).linkDoCiclo).toBeNull();
  });

  it("com dois links abertos, o que vence antes", async () => {
    const c = await cenarioDaInfinitePay();
    const { id, link } = await assinada(c);
    await prisma.linkDoCiclo.create({
      data: {
        barbeariaId: c.dono.barbeariaId,
        assinaturaId: id,
        vencimento: dataParaDate(somarDias(hoje(), 30)),
        valorCentavos: 12000,
        orderNsu: `pedido-${randomUUID()}`,
        url: "https://checkout.exemplo/depois",
        validoAte: dataParaDate(somarDias(hoje(), 40)),
      },
    });

    expect((await naConta(c))[0].linkParaPagar).toBe(link.url);
    expect((await noPainel(c))[0].linkDoCiclo.url).toBe(link.url);
  });
});

describe("o Recebi na assinatura da InfinitePay", () => {
  it("a pendente do primeiro link vira ativa, entra no Caixa e o link fica fechado", async () => {
    const c = await cenarioDaInfinitePay();
    const { id, link } = await assinada(c);

    const resposta = await receber(c, id);

    expect(resposta.statusCode).toBe(201);
    expect(resposta.json().assinatura).toMatchObject({ situacao: "ativa", linkDoCiclo: null });
    expect((await prisma.linkDoCiclo.findUniqueOrThrow({ where: { id: link.id } })).situacao).toBe("fechado");
    expect(await prisma.recebimentoDoPlano.count({ where: { assinaturaId: id } })).toBe(1);
    expect((await naConta(c))[0].linkParaPagar).toBeNull();
  });

  it("depois do Recebi, a varredura além da validade do link não cancela", async () => {
    const c = await cenarioDaInfinitePay();
    const { id, link } = await assinada(c);
    expect((await receber(c, id)).statusCode).toBe(201);
    await prisma.linkDoCiclo.update({
      where: { id: link.id },
      data: { vencimento: dataParaDate(somarDias(hoje(), -11)), validoAte: dataParaDate(somarDias(hoje(), -1)) },
    });

    await varrerCiclosPorLink({ fabrica: c.provedores, canal: canalDeMemoria(), log });

    expect((await prisma.assinaturaDoCliente.findUniqueOrThrow({ where: { id } })).situacao).toBe("ativa");
  });

  it("o link fechado pelo Recebi e pago depois: não entra de novo no Caixa, e o sino pede o estorno", async () => {
    const c = await cenarioDaInfinitePay();
    const { id, link } = await assinada(c);
    expect((await receber(c, id)).statusCode).toBe(201);

    pagar(c, { orderNsu: link.orderNsu, transactionNsu: "transacao-1", slug: "fatura-1" });
    const conferido = await conferir(c, { orderNsu: link.orderNsu, transactionNsu: "transacao-1", slug: "fatura-1" });

    expect(conferido.json().pago).toBe(false);
    expect(await prisma.recebimentoDoPlano.count({ where: { assinaturaId: id } })).toBe(1);
    const sino = await avisosDoSino(c.dono.barbeiroId);
    expect(sino.some((aviso) => aviso.texto.includes("estorne"))).toBe(true);
  });

  it("dentro do ciclo pago segue recusado, como no balcão", async () => {
    const c = await cenarioDaInfinitePay();
    const { id } = await assinada(c);
    expect((await receber(c, id)).statusCode).toBe(201);

    const deNovo = await receber(c, id);

    expect(deNovo.statusCode).toBe(422);
    expect(deNovo.json().erro).toBe("ciclo_em_dia");
  });
});
