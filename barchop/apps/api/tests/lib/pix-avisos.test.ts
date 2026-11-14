import { describe, expect, it } from "vitest";
import { prisma } from "@barchop/database";
import { buildApp } from "../../src/app";
import { canalDeMemoria, type CanalDeMensagem } from "../../src/lib/canal";
import { filaDeMemoria } from "../../src/lib/fila";
import { registrarPixDoBarChop, TRABALHO_PIX_DO_BARCHOP, varrerPixDoBarChop } from "../../src/lib/pix-avisos";
import { criarBarbeariaComToken } from "../helpers/barbearia";

// Avisos e vencimento do Pix do BarChop (plano pix-do-barchop, PR 4).
// O Pix não renova sozinho: todo dia, às 8h de São Paulo, o BarChop
// avisa o dono (sino e e-mail) no dia que Faturas promete — 5 dias antes
// do fim do período, contados em dias de São Paulo — e, passado o fim
// sem o próximo pago, a assinatura cai no Grátis (sem apagar nada) com
// outro aviso. Rodar duas vezes no mesmo dia não repete nada.

// O período pago no teste começa no fim do teste: termina no meio da
// tarde, não à meia-noite (o caso da primeira barbearia real).
const FIM = "2026-12-15T14:43:00.000Z";
// 8h de São Paulo nos dias que importam.
const AS_8H = (dia: string) => new Date(`${dia}T11:00:00.000Z`);

const log = { info: () => {}, warn: () => {} };

function varrer(agora: Date, canal: CanalDeMensagem = canalDeMemoria(), urlDoPainel?: string) {
  return varrerPixDoBarChop({ canal, log, urlDoPainel, agora });
}

// Uma barbearia pagando por Pix, com o pagamento do período, gravados
// direto: o que importa aqui são as datas.
async function noPix(sufixo = "um", fim = FIM, situacaoDoPagamento = "confirmado") {
  const app = buildApp({ canal: canalDeMemoria() });
  const barbearia = await criarBarbeariaComToken(app, sufixo);
  await app.close();
  await prisma.assinatura.update({
    where: { barbeariaId: barbearia.barbeariaId },
    data: {
      situacao: "ativa",
      forma: "pix",
      plano: "essencial",
      ciclo: "mensal",
      profissionaisContratados: 1,
      periodoTerminaEm: new Date(fim),
    },
  });
  const pagamento = await prisma.pagamentoPix.create({
    data: {
      barbeariaId: barbearia.barbeariaId,
      identificador: `ID${sufixo.toUpperCase()}`.slice(0, 6).padEnd(6, "X"),
      plano: "essencial",
      ciclo: "mensal",
      profissionais: 1,
      valorCentavos: 4490,
      periodoComecaEm: new Date(Date.parse(fim) - 30 * 24 * 60 * 60 * 1000),
      periodoTerminaEm: new Date(fim),
      situacao: situacaoDoPagamento,
      decididoEm: situacaoDoPagamento === "confirmado" ? new Date() : null,
      antesSituacao: "teste",
      antesPlano: "gratis",
      antesCiclo: "mensal",
      antesForma: "cartao",
    },
  });
  return { ...barbearia, pagamento };
}

async function sino(barbeiroId: string) {
  return prisma.notificacao.findMany({ where: { barbeiroId }, orderBy: { criadoEm: "asc" } });
}

describe("o trabalho diário do Pix do BarChop", () => {
  it("registra a varredura às 8h de São Paulo", async () => {
    const fila = filaDeMemoria();

    await registrarPixDoBarChop(fila, { canal: canalDeMemoria(), log });

    expect(fila.repeticoes).toEqual([{ trabalho: TRABALHO_PIX_DO_BARCHOP, cron: "0 8 * * *" }]);
  });
});

describe("o aviso 5 dias antes", () => {
  it("6 dias antes não avisa; no dia que Faturas promete, avisa no sino e por e-mail, uma vez só", async () => {
    const { barbeiroId, pagamento } = await noPix();
    const canal = canalDeMemoria();

    await varrer(AS_8H("2026-12-09"), canal);
    expect(await sino(barbeiroId)).toEqual([]);
    expect(canal.enviadas).toEqual([]);

    // FIM − 5 dias = 10/12, 11:43 em São Paulo: o dia é 10/12.
    await varrer(AS_8H("2026-12-10"), canal, "https://painel.exemplo.br/");
    await varrer(AS_8H("2026-12-10"), canal, "https://painel.exemplo.br/");
    await varrer(AS_8H("2026-12-11"), canal, "https://painel.exemplo.br/");

    const avisos = await sino(barbeiroId);
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toMatchObject({ tipo: "pagamento", link: "/painel/faturas" });
    expect(avisos[0].titulo).toMatch(/15\/12/);
    expect(canal.enviadas).toHaveLength(1);
    expect(canal.enviadas[0]).toMatchObject({ para: "um@exemplo.com" });
    expect(canal.enviadas[0].assunto).toMatch(/15\/12/);
    expect(canal.enviadas[0].texto).toContain("https://painel.exemplo.br/painel/faturas");
    expect((await prisma.pagamentoPix.findUniqueOrThrow({ where: { id: pagamento.id } })).avisadoEm).not.toBeNull();
  });

  it("sem URL_DO_PAINEL, o e-mail sai sem link (nunca um localhost)", async () => {
    await noPix();
    const canal = canalDeMemoria();

    await varrer(AS_8H("2026-12-10"), canal);

    expect(canal.enviadas).toHaveLength(1);
    expect(canal.enviadas[0].texto).not.toMatch(/https?:\/\//);
    expect(canal.enviadas[0].texto).toMatch(/Faturas/);
  });

  it("o próximo período já pago (\"Já paguei\" da renovação) não avisa", async () => {
    const { barbeariaId, barbeiroId } = await noPix();
    // O "Já paguei" da renovação move o fim da assinatura pro período seguinte.
    await prisma.assinatura.update({ where: { barbeariaId }, data: { periodoTerminaEm: new Date("2027-01-15T14:43:00.000Z") } });
    const canal = canalDeMemoria();

    await varrer(AS_8H("2026-12-10"), canal);

    expect(await sino(barbeiroId)).toEqual([]);
    expect(canal.enviadas).toEqual([]);
  });

  it("o e-mail que não sai vai pro log; o sino fica, e não repete no dia seguinte", async () => {
    const { barbeiroId } = await noPix();
    const quebrado: CanalDeMensagem = {
      nome: "quebrado",
      destinos: ["email"],
      async enviar() {
        throw new Error("fora do ar");
      },
    };

    await varrer(AS_8H("2026-12-10"), quebrado);
    await varrer(AS_8H("2026-12-11"), canalDeMemoria());

    expect(await sino(barbeiroId)).toHaveLength(1);
  });
});

describe("o vencimento", () => {
  it("passado o fim sem o próximo pago, cai no Grátis sem apagar a forma nem o fim; avisa uma vez", async () => {
    const { barbeariaId, barbeiroId } = await noPix();
    const canal = canalDeMemoria();

    // No dia do fim, às 8h, ainda vale (acaba às 11:43).
    await varrer(AS_8H("2026-12-15"), canal);
    expect((await prisma.assinatura.findUniqueOrThrow({ where: { barbeariaId } })).situacao).toBe("ativa");

    await varrer(AS_8H("2026-12-16"), canal);
    await varrer(AS_8H("2026-12-17"), canal);

    expect(await prisma.assinatura.findUniqueOrThrow({ where: { barbeariaId } })).toMatchObject({
      situacao: "gratis",
      forma: "pix",
      plano: "essencial",
      periodoTerminaEm: new Date(FIM),
    });
    // O aviso dos 5 dias (perdido, a varredura não rodou) não sai junto: só o do vencimento.
    const avisos = await sino(barbeiroId);
    expect(avisos).toHaveLength(1);
    expect(avisos[0].titulo).toMatch(/Grátis/);
    expect(canal.enviadas).toHaveLength(1);
    expect(canal.enviadas[0].assunto).toMatch(/Grátis/);
  });

  it("cartão não é com ele: a Stripe é quem diz", async () => {
    const { barbeariaId, barbeiroId } = await noPix();
    await prisma.assinatura.update({ where: { barbeariaId }, data: { forma: "cartao" } });

    await varrer(AS_8H("2026-12-16"));

    expect((await prisma.assinatura.findUniqueOrThrow({ where: { barbeariaId } })).situacao).toBe("ativa");
    expect(await sino(barbeiroId)).toEqual([]);
  });

  it("uma barbearia que falha não para as outras", async () => {
    const um = await noPix("um");
    const dois = await noPix("dois");
    // O dono de "um" sem e-mail e inativo: nada a avisar, e nada quebra.
    await prisma.barbeiro.update({ where: { id: um.barbeiroId }, data: { ativo: false } });

    await varrer(AS_8H("2026-12-16"));

    expect((await prisma.assinatura.findUniqueOrThrow({ where: { barbeariaId: um.barbeariaId } })).situacao).toBe("gratis");
    expect((await prisma.assinatura.findUniqueOrThrow({ where: { barbeariaId: dois.barbeariaId } })).situacao).toBe("gratis");
    expect(await sino(dois.barbeiroId)).toHaveLength(1);
  });
});
