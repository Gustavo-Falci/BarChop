import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { prisma } from "@barchop/database";
import { canalDeMemoria, type CanalDeMensagem } from "../../src/lib/canal";
import {
  registrarCiclosPorLink,
  TRABALHO_CICLOS_POR_LINK,
  varrerCiclosPorLink,
} from "../../src/lib/ciclos-por-link";
import { filaDeMemoria } from "../../src/lib/fila";
import { agoraNaBarbearia, dataParaDate, dateParaData, somarDias } from "../../src/lib/horas";
import { avisosDoSino, cenarioDaInfinitePay, pagar, type CenarioDaInfinitePay } from "../helpers/infinitepay";

// A varredura diária dos ciclos por link (plano
// pagamentos-online-infinitepay, PR 5). A InfinitePay não renova
// sozinha: todo dia, às 8h de São Paulo, o BarChop gera o link do
// próximo ciclo 3 dias antes do vencimento e manda por e-mail; no dia
// seguinte ao vencimento sem pagar, a assinatura fica em atraso e o link
// é reenviado; passada a validade do link (os dias para cancelar), ela é
// cancelada. Rodar duas vezes no mesmo dia não repete nada.

const hoje = () => agoraNaBarbearia().data;
const log = { info: () => {}, warn: () => {} };

function varrer(c: CenarioDaInfinitePay, canal: CanalDeMensagem) {
  return varrerCiclosPorLink({ fabrica: c.provedores, canal, log });
}

// Uma assinatura da InfinitePay já com ciclo (a que assinou e pagou),
// gravada direto: o que importa aqui são as datas.
async function comCiclo(
  c: CenarioDaInfinitePay,
  dados: { terminaEm: string; situacao?: string; pagoAte?: string; clienteId?: string; conexaoId?: string }
) {
  return prisma.assinaturaDoCliente.create({
    data: {
      barbeariaId: c.dono.barbeariaId,
      planoId: c.daCasa.id,
      clienteId: dados.clienteId ?? c.cliente.clienteId,
      situacao: dados.situacao ?? "ativa",
      forma: "online",
      conexaoId: dados.conexaoId ?? c.casa.id,
      precoCentavos: 12000,
      ciclo: "mensal",
      cicloComecaEm: dataParaDate(somarDias(dados.terminaEm, -30)),
      cicloTerminaEm: dataParaDate(dados.terminaEm),
      pagoAte: dados.pagoAte ? dataParaDate(dados.pagoAte) : null,
    },
  });
}

async function linkGravado(
  c: CenarioDaInfinitePay,
  assinaturaId: string,
  dados: { vencimento: string; validoAte: string; enviado?: boolean; situacao?: string }
) {
  return prisma.linkDoCiclo.create({
    data: {
      barbeariaId: c.dono.barbeariaId,
      assinaturaId,
      vencimento: dataParaDate(dados.vencimento),
      valorCentavos: 12000,
      orderNsu: `pedido-${randomUUID()}`,
      url: `https://checkout.exemplo/${randomUUID()}`,
      validoAte: dataParaDate(dados.validoAte),
      situacao: dados.situacao ?? "aberto",
      enviadoEm: dados.enviado === false ? null : new Date(),
      ...(dados.situacao === "pago" ? { transactionNsu: `transacao-${randomUUID()}`, pagoEm: new Date() } : {}),
    },
  });
}

describe("o link do próximo ciclo", () => {
  it("sai 3 dias antes do fim do ciclo, uma vez só, e vai por e-mail com a URL", async () => {
    const c = await cenarioDaInfinitePay();
    const canal = canalDeMemoria();
    const longe = await comCiclo(c, { terminaEm: somarDias(hoje(), 4) });

    await varrer(c, canal);
    expect(await prisma.linkDoCiclo.count({ where: { assinaturaId: longe.id } })).toBe(0);

    await prisma.assinaturaDoCliente.update({
      where: { id: longe.id },
      data: { cicloTerminaEm: dataParaDate(somarDias(hoje(), 3)) },
    });
    await varrer(c, canal);
    await varrer(c, canal);

    const links = await prisma.linkDoCiclo.findMany({ where: { assinaturaId: longe.id } });
    expect(links).toHaveLength(1);
    expect(dateParaData(links[0]!.vencimento)).toBe(somarDias(hoje(), 3));
    expect(dateParaData(links[0]!.validoAte)).toBe(somarDias(hoje(), 13));
    expect(links[0]!.enviadoEm).not.toBeNull();
    expect(c.provedores.links).toHaveLength(1);
    expect(canal.enviadas).toHaveLength(1);
    expect(canal.enviadas[0]).toMatchObject({ para: "caio@exemplo.com" });
    expect(canal.enviadas[0]!.assunto).toContain("Corte ilimitado");
    expect(canal.enviadas[0]!.texto).toContain(links[0]!.url);
    expect(await avisosDoSino(c.dono.barbeiroId)).toEqual([]);
  });

  it("em teste, o link do primeiro pagamento sai 3 dias antes do fim do teste", async () => {
    const c = await cenarioDaInfinitePay();
    const emTeste = await comCiclo(c, { terminaEm: somarDias(hoje(), 2), situacao: "teste" });

    await varrer(c, canalDeMemoria());

    const link = await prisma.linkDoCiclo.findFirstOrThrow({ where: { assinaturaId: emTeste.id } });
    expect(dateParaData(link.vencimento)).toBe(somarDias(hoje(), 2));
  });

  it("com o ciclo seguinte já pago (pagoAte), o próximo link é o do fim do pago", async () => {
    const c = await cenarioDaInfinitePay();
    const adiantada = await comCiclo(c, { terminaEm: somarDias(hoje(), 1), pagoAte: somarDias(hoje(), 31) });

    await varrer(c, canalDeMemoria());

    expect(await prisma.linkDoCiclo.count({ where: { assinaturaId: adiantada.id } })).toBe(0);
  });

  it("os dias para cancelar de agora dão a validade do link novo", async () => {
    const c = await cenarioDaInfinitePay();
    await prisma.conexaoDePagamento.update({ where: { id: c.casa.id }, data: { diasParaCancelar: 5 } });
    const assinatura = await comCiclo(c, { terminaEm: somarDias(hoje(), 3) });

    await varrer(c, canalDeMemoria());

    const link = await prisma.linkDoCiclo.findFirstOrThrow({ where: { assinaturaId: assinatura.id } });
    expect(dateParaData(link.validoAte)).toBe(somarDias(hoje(), 8));
  });

  it("cliente sem e-mail: o sino pede para mandar pelo WhatsApp, uma vez", async () => {
    const c = await cenarioDaInfinitePay();
    await prisma.cliente.update({ where: { id: c.cliente.clienteId }, data: { email: null } });
    const canal = canalDeMemoria();
    await comCiclo(c, { terminaEm: somarDias(hoje(), 3) });

    await varrer(c, canal);
    await varrer(c, canal);

    expect(canal.enviadas).toEqual([]);
    const sino = await avisosDoSino(c.dono.barbeiroId);
    expect(sino.map((aviso) => aviso.titulo)).toEqual(["Link do ciclo pronto: mande pelo WhatsApp"]);
  });

  it("o e-mail que falhou fica para a próxima varredura, sem gerar outro link", async () => {
    const c = await cenarioDaInfinitePay();
    const assinatura = await comCiclo(c, { terminaEm: somarDias(hoje(), 3) });
    const quebrado: CanalDeMensagem = {
      nome: "quebrado",
      destinos: ["email"],
      async enviar() {
        throw new Error("o e-mail não saiu");
      },
    };

    await varrer(c, quebrado);
    const link = await prisma.linkDoCiclo.findFirstOrThrow({ where: { assinaturaId: assinatura.id } });
    expect(link.enviadoEm).toBeNull();

    const canal = canalDeMemoria();
    await varrer(c, canal);

    expect(canal.enviadas).toHaveLength(1);
    expect(c.provedores.links).toHaveLength(1);
    expect((await prisma.linkDoCiclo.findFirstOrThrow({ where: { id: link.id } })).enviadoEm).not.toBeNull();
  });
});

describe("o atraso e o cancelamento", () => {
  it("no dia do vencimento ainda não; no seguinte, em atraso, com o sino e o link reenviado uma vez", async () => {
    const c = await cenarioDaInfinitePay();
    const canal = canalDeMemoria();
    const assinatura = await comCiclo(c, { terminaEm: hoje() });
    const link = await linkGravado(c, assinatura.id, { vencimento: hoje(), validoAte: somarDias(hoje(), 10) });

    await varrer(c, canal);
    expect((await prisma.assinaturaDoCliente.findUniqueOrThrow({ where: { id: assinatura.id } })).situacao).toBe("ativa");

    const ontem = somarDias(hoje(), -1);
    await prisma.assinaturaDoCliente.update({ where: { id: assinatura.id }, data: { cicloTerminaEm: dataParaDate(ontem) } });
    await prisma.linkDoCiclo.update({
      where: { id: link.id },
      data: { vencimento: dataParaDate(ontem), validoAte: dataParaDate(somarDias(ontem, 10)) },
    });
    await varrer(c, canal);
    await varrer(c, canal);

    expect((await prisma.assinaturaDoCliente.findUniqueOrThrow({ where: { id: assinatura.id } })).situacao).toBe("em_atraso");
    const sino = await avisosDoSino(c.dono.barbeiroId);
    expect(sino.map((aviso) => aviso.titulo)).toEqual(["Pagamento em atraso"]);
    expect(canal.enviadas).toHaveLength(1);
    expect(canal.enviadas[0]!.texto).toContain(link.url);
    expect((await prisma.linkDoCiclo.findUniqueOrThrow({ where: { id: link.id } })).reenviadoEm).not.toBeNull();
  });

  it("passada a validade do link sem pagar, cancela: o sino avisa quem vende e o e-mail, o cliente", async () => {
    const c = await cenarioDaInfinitePay();
    const canal = canalDeMemoria();
    const vencimento = somarDias(hoje(), -10);
    const assinatura = await comCiclo(c, { terminaEm: vencimento, situacao: "em_atraso" });
    const link = await linkGravado(c, assinatura.id, { vencimento, validoAte: hoje() });

    // No último dia da validade o link ainda paga.
    await varrer(c, canal);
    expect((await prisma.assinaturaDoCliente.findUniqueOrThrow({ where: { id: assinatura.id } })).situacao).toBe("em_atraso");

    await prisma.linkDoCiclo.update({ where: { id: link.id }, data: { validoAte: dataParaDate(somarDias(hoje(), -1)) } });
    await varrer(c, canal);
    await varrer(c, canal);

    const cancelada = await prisma.assinaturaDoCliente.findUniqueOrThrow({ where: { id: assinatura.id } });
    expect(cancelada.situacao).toBe("cancelada");
    expect(cancelada.canceladaEm).not.toBeNull();
    expect((await prisma.linkDoCiclo.findUniqueOrThrow({ where: { id: link.id } })).situacao).toBe("fechado");
    const sino = await avisosDoSino(c.dono.barbeiroId);
    expect(sino.map((aviso) => aviso.titulo)).toEqual(["Assinatura cancelada por falta de pagamento"]);
    const cancelamento = canal.enviadas.filter((mensagem) => mensagem.assunto?.includes("cancelada"));
    expect(cancelamento).toHaveLength(1);
    expect(cancelamento[0]).toMatchObject({ para: "caio@exemplo.com" });
  });

  it("a pendente do primeiro link que nunca pagou: cancelada depois da validade, e os dois são avisados", async () => {
    const c = await cenarioDaInfinitePay();
    const canal = canalDeMemoria();
    const criada = (
      await c.app.inject({
        method: "POST",
        url: "/clientes/me/assinaturas",
        headers: { authorization: `Bearer ${c.cliente.token}` },
        payload: { planoId: c.daCasa.id },
      })
    ).json();
    await prisma.linkDoCiclo.updateMany({
      where: { assinaturaId: criada.assinatura.id },
      data: { vencimento: dataParaDate(somarDias(hoje(), -11)), validoAte: dataParaDate(somarDias(hoje(), -1)) },
    });

    await varrer(c, canal);

    const cancelada = await prisma.assinaturaDoCliente.findUniqueOrThrow({ where: { id: criada.assinatura.id } });
    expect(cancelada.situacao).toBe("cancelada");
    const sino = await avisosDoSino(c.dono.barbeiroId);
    expect(sino.map((aviso) => aviso.titulo)).toEqual(["Assinatura cancelada por falta de pagamento"]);
    expect(sino[0]!.texto).toContain("primeira mensalidade");
    expect(canal.enviadas.filter((mensagem) => mensagem.assunto?.includes("cancelada"))).toHaveLength(1);
  });

  it("a pendente dentro da validade fica como está, e o link dela não vai de novo por e-mail", async () => {
    const c = await cenarioDaInfinitePay();
    const canal = canalDeMemoria();
    const criada = (
      await c.app.inject({
        method: "POST",
        url: "/clientes/me/assinaturas",
        headers: { authorization: `Bearer ${c.cliente.token}` },
        payload: { planoId: c.daCasa.id },
      })
    ).json();

    await varrer(c, canal);

    expect((await prisma.assinaturaDoCliente.findUniqueOrThrow({ where: { id: criada.assinatura.id } })).situacao).toBe(
      "pendente"
    );
    // O cliente recebeu o link na tela, ao assinar.
    expect(canal.enviadas).toEqual([]);
  });
});

describe("a conferência de novo", () => {
  it("o link aberto com a transação conhecida é conferido de novo: pago, entra no Caixa e não cancela", async () => {
    const c = await cenarioDaInfinitePay();
    const criada = (
      await c.app.inject({
        method: "POST",
        url: "/clientes/me/assinaturas",
        headers: { authorization: `Bearer ${c.cliente.token}` },
        payload: { planoId: c.daCasa.id },
      })
    ).json();
    const { orderNsu } = c.provedores.links[0]!;
    // A página voltou, mas a conferência não fechou (o Pix não tinha
    // caído); depois caiu.
    await prisma.linkDoCiclo.updateMany({
      where: { orderNsu },
      data: { transactionNsu: "transacao-1", slug: "fatura-1", validoAte: dataParaDate(somarDias(hoje(), -1)), vencimento: dataParaDate(somarDias(hoje(), -11)) },
    });
    pagar(c, { orderNsu, transactionNsu: "transacao-1", slug: "fatura-1" });

    await varrer(c, canalDeMemoria());

    const gravada = await prisma.assinaturaDoCliente.findUniqueOrThrow({ where: { id: criada.assinatura.id } });
    expect(gravada.situacao).toBe("ativa");
    expect(await prisma.recebimentoDoPlano.count({ where: { assinaturaId: gravada.id } })).toBe(1);
  });

  it("a InfinitePay fora do ar não para a varredura das outras", async () => {
    const c = await cenarioDaInfinitePay();
    const outroCliente = await prisma.cliente.create({
      data: { barbeariaId: c.dono.barbeariaId, nome: "Bia Souza", telefone: "+5511999990002", email: "bia@exemplo.com" },
    });
    const vencida = await comCiclo(c, { terminaEm: somarDias(hoje(), -1) });
    await linkGravado(c, vencida.id, { vencimento: somarDias(hoje(), -1), validoAte: somarDias(hoje(), 9) });
    await comCiclo(c, { terminaEm: somarDias(hoje(), 3), clienteId: outroCliente.id });
    c.provedores.indisponivel = true;

    await varrer(c, canalDeMemoria());

    // O link novo não saiu (rede), mas o atraso, que não precisa dela, sim.
    expect((await prisma.assinaturaDoCliente.findUniqueOrThrow({ where: { id: vencida.id } })).situacao).toBe("em_atraso");
  });
});

describe("o que a varredura não toca", () => {
  it("a do balcão, a do Asaas e a da Stripe ficam como estão", async () => {
    const c = await cenarioDaInfinitePay();
    const canal = canalDeMemoria();
    const asaas = await prisma.conexaoDePagamento.create({
      data: {
        barbeariaId: c.dono.barbeariaId,
        barbeiroId: c.dono.barbeiroId,
        daCasa: false,
        provedor: "asaas",
        modo: "real",
        chaveCifrada: Buffer.from("$aact_prod_chave-do-dono-1234"),
        chaveFinal: "1234",
        webhookTokenHash: "hash-de-teste",
      },
    });
    const doDono = await c.plano({ nome: "Do dono", vendedorId: c.dono.barbeiroId });
    const pelaAsaas = await prisma.assinaturaDoCliente.create({
      data: {
        barbeariaId: c.dono.barbeariaId,
        planoId: doDono.id,
        clienteId: c.cliente.clienteId,
        situacao: "ativa",
        forma: "online",
        conexaoId: asaas.id,
        idExterno: "sub_asaas_1",
        precoCentavos: 12000,
        ciclo: "mensal",
        cicloComecaEm: dataParaDate(somarDias(hoje(), -31)),
        cicloTerminaEm: dataParaDate(somarDias(hoje(), -1)),
      },
    });
    const balcao = await c.plano({ nome: "Balcão", aceitaOnline: false, aceitaNoBalcao: true });
    const noBalcao = await prisma.assinaturaDoCliente.create({
      data: {
        barbeariaId: c.dono.barbeariaId,
        planoId: balcao.id,
        clienteId: c.cliente.clienteId,
        situacao: "ativa",
        forma: "no_balcao",
        precoCentavos: 12000,
        ciclo: "mensal",
        cicloComecaEm: dataParaDate(somarDias(hoje(), -31)),
        cicloTerminaEm: dataParaDate(somarDias(hoje(), -1)),
      },
    });

    await varrer(c, canal);

    expect((await prisma.assinaturaDoCliente.findUniqueOrThrow({ where: { id: pelaAsaas.id } })).situacao).toBe("ativa");
    expect((await prisma.assinaturaDoCliente.findUniqueOrThrow({ where: { id: noBalcao.id } })).situacao).toBe("ativa");
    expect(await prisma.linkDoCiclo.count()).toBe(0);
    expect(canal.enviadas).toEqual([]);
  });
});

describe("o trabalho", () => {
  it("fica registrado às 8h de São Paulo e roda a varredura quando o cron bate", async () => {
    const c = await cenarioDaInfinitePay();
    const fila = filaDeMemoria();
    const canal = canalDeMemoria();
    await comCiclo(c, { terminaEm: somarDias(hoje(), 3) });

    await registrarCiclosPorLink(fila, { fabrica: c.provedores, canal, log });
    await fila.rodarRepeticao(TRABALHO_CICLOS_POR_LINK);

    expect(fila.repeticoes).toEqual([{ trabalho: TRABALHO_CICLOS_POR_LINK, cron: "0 8 * * *" }]);
    expect(await prisma.linkDoCiclo.count()).toBe(1);
    expect(canal.enviadas).toHaveLength(1);
  });
});
