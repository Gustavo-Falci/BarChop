import { describe, expect, it } from "vitest";
import { prisma } from "@barchop/database";
import { inicioDoDiaEmSaoPaulo, valorDaDiferenca } from "@barchop/formato";
import { buildApp } from "../../src/app";
import { canalDeMemoria, type CanalDeMemoria } from "../../src/lib/canal";
import type { ConfigDoPix } from "../../src/lib/pix";
import { criarOperadorDeSuporte } from "../../src/lib/suporte";
import type { App } from "../../src/tipos";
import { auth, criarBarbeariaComToken, criarMembroComToken } from "../helpers/barbearia";

// Profissional novo com o plano pago no Pix (plano
// profissional-novo-pago, PR 3): passar das vagas pagas no período deixa
// o membro aguardando pagamento (inativo, sem convite) até o "Já paguei"
// do Pix da diferença: o extra pelos dias que faltam. A recusa do
// Suporte, ou o "Ainda não paguei", volta quem entrou a aguardar.

const DIA = 24 * 60 * 60 * 1000;

// Dados de mentira: nunca a chave de verdade em teste.
const PIX: ConfigDoPix = {
  chave: "pix@exemplo.com",
  nomeDoRecebedor: "BarChop Exemplo",
  cidadeDoRecebedor: "Sao Paulo",
  segredo: "segredo-do-identificador-de-teste",
};

function montar(): App {
  return buildApp({ pix: PIX, canal: canalDeMemoria() });
}

// Completo mensal no Pix, 1 vaga paga, 15 dias pela frente.
async function noPix(app: App, contratados = 1) {
  const dono = await criarBarbeariaComToken(app);
  const fim = new Date(Date.now() + 15 * DIA);
  await prisma.assinatura.update({
    where: { barbeariaId: dono.barbeariaId },
    data: { situacao: "ativa", forma: "pix", plano: "completo", ciclo: "mensal", profissionaisContratados: contratados, periodoTerminaEm: fim },
  });
  return { ...dono, fim };
}

function incluir(app: App, token: string, nome = "Ana") {
  return app.inject({
    method: "POST",
    url: "/equipe",
    headers: auth(token),
    payload: { nome, email: `${nome.toLowerCase()}@exemplo.com`, papel: "profissional" },
  });
}

function cotarDiferenca(app: App, token: string) {
  return app.inject({ method: "GET", url: "/barbearias/me/assinatura/pix/diferenca", headers: auth(token) });
}

function pagarDiferenca(app: App, token: string) {
  return app.inject({ method: "POST", url: "/barbearias/me/assinatura/pix/diferenca", headers: auth(token) });
}

function convitesPara(app: App, email: string) {
  return (app.canal as CanalDeMemoria).enviadas.filter((m) => m.para === email);
}

function membro(id: string) {
  return prisma.barbeiro.findUniqueOrThrow({ where: { id } });
}

function lerLinha(barbeariaId: string) {
  return prisma.assinatura.findUniqueOrThrow({ where: { barbeariaId } });
}

let emails = 0;
async function tokenDoSuporte(app: App): Promise<string> {
  emails += 1;
  const email = `suporte-diferenca-${emails}@barchop.com.br`;
  await criarOperadorDeSuporte({ nome: "Suporte", email, senha: "senha-do-suporte-123" });
  const resposta = await app.inject({ method: "POST", url: "/suporte/login", payload: { email, senha: "senha-do-suporte-123" } });
  return resposta.json().token;
}

describe("incluir com o Pix vigente", () => {
  it("acima das vagas pagas: o membro aguarda pagamento, sem convite", async () => {
    const app = montar();
    const dono = await noPix(app);

    const resposta = await incluir(app, dono.token);

    expect(resposta.statusCode).toBe(201);
    expect(resposta.json()).toMatchObject({ ativo: false, aguardaPagamento: true });
    expect(convitesPara(app, "ana@exemplo.com")).toHaveLength(0);
    await app.close();
  });

  it("dentro das vagas pagas: entra na hora, com convite", async () => {
    const app = montar();
    const dono = await noPix(app, 2);

    const resposta = await incluir(app, dono.token);

    expect(resposta.json()).toMatchObject({ ativo: true, aguardaPagamento: false });
    expect(convitesPara(app, "ana@exemplo.com")).toHaveLength(1);
    await app.close();
  });

  it("reativar acima das vagas pagas também aguarda", async () => {
    const app = montar();
    const dono = await noPix(app);
    const saiu = await criarMembroComToken(app, dono.barbeariaId, "profissional", "p");
    await prisma.barbeiro.update({ where: { id: saiu.barbeiroId }, data: { ativo: false } });

    const resposta = await app.inject({
      method: "PATCH",
      url: `/equipe/${saiu.barbeiroId}`,
      headers: auth(dono.token),
      payload: { ativo: true },
    });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toMatchObject({ ativo: false, aguardaPagamento: true });
    await app.close();
  });
});

describe("GET /barbearias/me/assinatura/pix/diferenca", () => {
  it("o extra pelos dias que faltam, até o fim do período pago, com o QR", async () => {
    const app = montar();
    const dono = await noPix(app);
    await incluir(app, dono.token);

    const resposta = await cotarDiferenca(app, dono.token);

    expect(resposta.statusCode).toBe(200);
    const cotacao = resposta.json();
    expect(cotacao.valorCentavos).toBe(
      valorDaDiferenca({ plano: "completo", ciclo: "mensal", extras: 1, agora: new Date(), fim: dono.fim })
    );
    expect(cotacao.periodoComecaEm).toBe(inicioDoDiaEmSaoPaulo(new Date()).toISOString());
    expect(cotacao.periodoTerminaEm).toBe(dono.fim.toISOString());
    expect(cotacao.copiaECola).toMatch(/^000201/);
    expect((await cotarDiferenca(app, dono.token)).json().identificador).toBe(cotacao.identificador);
    await app.close();
  });

  it("ninguém aguardando: 409 nada_a_pagar", async () => {
    const app = montar();
    const dono = await noPix(app);

    const resposta = await cotarDiferenca(app, dono.token);

    expect(resposta.statusCode).toBe(409);
    expect(resposta.json().erro).toBe("nada_a_pagar");
    await app.close();
  });

  it("sem Pix vigente: 409 sem_pix_vigente", async () => {
    const app = montar();
    const dono = await criarBarbeariaComToken(app);

    const resposta = await cotarDiferenca(app, dono.token);

    expect(resposta.statusCode).toBe(409);
    expect(resposta.json().erro).toBe("sem_pix_vigente");
    await app.close();
  });
});

describe("POST /barbearias/me/assinatura/pix/diferenca (Já paguei)", () => {
  it("o membro entra na hora, com convite; as vagas pagas sobem; o Pix aguarda o Suporte", async () => {
    const app = montar();
    const dono = await noPix(app);
    const ana = (await incluir(app, dono.token)).json();

    const resposta = await pagarDiferenca(app, dono.token);

    expect(resposta.statusCode).toBe(201);
    expect(resposta.json()).toMatchObject({
      tipo: "diferenca",
      situacao: "aguardando",
      plano: "completo",
      profissionais: 2,
      periodoTerminaEm: dono.fim.toISOString(),
    });
    expect(await membro(ana.id)).toMatchObject({ ativo: true, aguardaPagamento: false });
    expect(convitesPara(app, "ana@exemplo.com")).toHaveLength(1);
    expect(await lerLinha(dono.barbeariaId)).toMatchObject({
      profissionaisContratados: 2,
      periodoTerminaEm: dono.fim,
      plano: "completo",
    });
    await app.close();
  });

  it("um Pix em conferência por vez: 409 pix_em_conferencia", async () => {
    const app = montar();
    const dono = await noPix(app);
    await incluir(app, dono.token);
    await pagarDiferenca(app, dono.token);
    await incluir(app, dono.token, "Bia");

    const resposta = await pagarDiferenca(app, dono.token);

    expect(resposta.statusCode).toBe(409);
    expect(resposta.json().erro).toBe("pix_em_conferencia");
    await app.close();
  });

  it("recusado pelo Suporte: quem entrou volta a aguardar, e as vagas pagas voltam", async () => {
    const app = montar();
    const dono = await noPix(app);
    const ana = (await incluir(app, dono.token)).json();
    const pix = (await pagarDiferenca(app, dono.token)).json();
    const suporte = await tokenDoSuporte(app);

    const resposta = await app.inject({
      method: "POST",
      url: `/suporte/pix/${pix.id}/recusar`,
      headers: auth(suporte),
      payload: { resposta: "Não achei o Pix no extrato." },
    });

    expect(resposta.statusCode).toBe(200);
    expect(await membro(ana.id)).toMatchObject({ ativo: false, aguardaPagamento: true });
    expect(await lerLinha(dono.barbeariaId)).toMatchObject({
      profissionaisContratados: 1,
      situacao: "ativa",
      forma: "pix",
      periodoTerminaEm: dono.fim,
    });
    await app.close();
  });

  it("\"Ainda não paguei\": o mesmo, e dá pra pagar de novo", async () => {
    const app = montar();
    const dono = await noPix(app);
    const ana = (await incluir(app, dono.token)).json();
    const pix = (await pagarDiferenca(app, dono.token)).json();

    const desfeito = await app.inject({
      method: "POST",
      url: `/barbearias/me/assinatura/pix/${pix.id}/desfazer`,
      headers: auth(dono.token),
    });

    expect(desfeito.statusCode).toBe(200);
    expect(await membro(ana.id)).toMatchObject({ ativo: false, aguardaPagamento: true });
    expect((await pagarDiferenca(app, dono.token)).statusCode).toBe(201);
    await app.close();
  });

  it("quem saiu depois de liberado não volta a aguardar na recusa", async () => {
    const app = montar();
    const dono = await noPix(app);
    const ana = (await incluir(app, dono.token)).json();
    const pix = (await pagarDiferenca(app, dono.token)).json();
    await app.inject({ method: "PATCH", url: `/equipe/${ana.id}`, headers: auth(dono.token), payload: { ativo: false } });

    await app.inject({
      method: "POST",
      url: `/barbearias/me/assinatura/pix/${pix.id}/desfazer`,
      headers: auth(dono.token),
    });

    expect(await membro(ana.id)).toMatchObject({ ativo: false, aguardaPagamento: false });
    await app.close();
  });

  // Auditoria de segurança de 15/11, SEC-005: o teto de recusas vale
  // também aqui. Sem ele, o dono declarava a diferença, era recusado e
  // declarava de novo, com o profissional novo trabalhando sem pagar.
  it("depois de duas recusas em 30 dias: 409 pix_recusado_demais, e ninguém entra", async () => {
    const app = montar();
    const dono = await noPix(app);
    const ana = (await incluir(app, dono.token)).json();
    const suporte = await tokenDoSuporte(app);
    for (let vez = 0; vez < 2; vez += 1) {
      const pix = await pagarDiferenca(app, dono.token);
      expect(pix.statusCode).toBe(201);
      const recusa = await app.inject({
        method: "POST",
        url: `/suporte/pix/${pix.json().id}/recusar`,
        headers: auth(suporte),
        payload: { resposta: "Não achei o Pix no extrato." },
      });
      expect(recusa.statusCode).toBe(200);
    }
    const convitesAntes = convitesPara(app, "ana@exemplo.com").length;

    const terceiro = await pagarDiferenca(app, dono.token);

    expect(terceiro.statusCode).toBe(409);
    expect(terceiro.json().erro).toBe("pix_recusado_demais");
    expect(await membro(ana.id)).toMatchObject({ ativo: false, aguardaPagamento: true });
    expect(await lerLinha(dono.barbeariaId)).toMatchObject({ profissionaisContratados: 1 });
    expect(await prisma.pagamentoPix.count({ where: { barbeariaId: dono.barbeariaId, situacao: "aguardando" } })).toBe(0);
    expect(convitesPara(app, "ana@exemplo.com")).toHaveLength(convitesAntes);
    await app.close();
  });

  it("recusa do Pix do período também conta pro teto da diferença", async () => {
    const app = montar();
    const dono = await noPix(app);
    await incluir(app, dono.token);
    const agora = new Date();
    for (let vez = 0; vez < 2; vez += 1) {
      await prisma.pagamentoPix.create({
        data: {
          barbeariaId: dono.barbeariaId,
          identificador: `RECUSADO${vez}`,
          plano: "completo",
          ciclo: "mensal",
          profissionais: 1,
          valorCentavos: 100,
          periodoComecaEm: agora,
          periodoTerminaEm: dono.fim,
          situacao: "recusado",
          decididoEm: agora,
          antesSituacao: "ativa",
          antesPlano: "completo",
          antesCiclo: "mensal",
          antesForma: "pix",
        },
      });
    }

    const resposta = await pagarDiferenca(app, dono.token);

    expect(resposta.statusCode).toBe(409);
    expect(resposta.json().erro).toBe("pix_recusado_demais");
    await app.close();
  });
});

// Faturas e Suporte (PR 4b): o Pix diz quantos profissionais liberou, e
// a fila mostra as vagas pagas de antes, pra onde a recusa volta.
describe("quantos o Pix da diferença libera", () => {
  it("em Pagamentos e na fila do Suporte, com as vagas de antes", async () => {
    const app = montar();
    const dono = await noPix(app);
    await incluir(app, dono.token, "Ana");
    await incluir(app, dono.token, "Bia");

    const pix = (await pagarDiferenca(app, dono.token)).json();
    expect(pix).toMatchObject({ tipo: "diferenca", profissionais: 3, liberados: 2 });

    const pagamentos = await app.inject({
      method: "GET",
      url: "/barbearias/me/assinatura/pix/pagamentos",
      headers: auth(dono.token),
    });
    expect(pagamentos.json()[0]).toMatchObject({ id: pix.id, liberados: 2 });

    const suporte = await tokenDoSuporte(app);
    const fila = await app.inject({ method: "GET", url: "/suporte/pix", headers: auth(suporte) });
    const naFila = fila.json().pagamentos.find((p: { id: string }) => p.id === pix.id);
    expect(naFila).toMatchObject({
      tipo: "diferenca",
      liberados: 2,
      antes: { profissionais: 1, periodoTerminaEm: dono.fim.toISOString() },
    });
    await app.close();
  });
});

describe("o Pix do período e quem aguarda", () => {
  function jaPaguei(app: App, token: string, profissionais: number) {
    return app.inject({
      method: "POST",
      url: "/barbearias/me/assinatura/pix",
      headers: auth(token),
      payload: { plano: "completo", ciclo: "mensal", profissionais },
    });
  }

  it("um período que começa hoje (Pix vencido) libera quem aguarda", async () => {
    const app = montar();
    const dono = await noPix(app);
    const ana = (await incluir(app, dono.token)).json();
    await prisma.assinatura.update({
      where: { barbeariaId: dono.barbeariaId },
      data: { periodoTerminaEm: new Date(Date.now() - DIA) },
    });

    const resposta = await jaPaguei(app, dono.token, 2);

    expect(resposta.statusCode).toBe(201);
    expect(await membro(ana.id)).toMatchObject({ ativo: true, aguardaPagamento: false });
    expect(convitesPara(app, "ana@exemplo.com")).toHaveLength(1);
    await app.close();
  });

  it("com alguém aguardando, a renovação adiantada pede a diferença antes", async () => {
    const app = montar();
    const dono = await noPix(app);
    const ana = (await incluir(app, dono.token)).json();

    const resposta = await jaPaguei(app, dono.token, 2);

    expect(resposta.statusCode).toBe(409);
    expect(resposta.json().erro).toBe("diferenca_pendente");
    expect(await membro(ana.id)).toMatchObject({ ativo: false, aguardaPagamento: true });
    expect((await lerLinha(dono.barbeariaId)).profissionaisContratados).toBe(1);
    await app.close();
  });

  it("a prévia da inclusão no Pix é o Pix da diferença", async () => {
    const app = montar();
    const dono = await noPix(app);

    const resposta = await app.inject({ method: "GET", url: "/equipe/previa-da-inclusao", headers: auth(dono.token) });

    expect(resposta.json()).toEqual({
      cobra: true,
      forma: "pix",
      valorCentavos: valorDaDiferenca({ plano: "completo", ciclo: "mensal", extras: 1, agora: new Date(), fim: dono.fim }),
      cartaoFinal: null,
      ate: dono.fim.toISOString(),
    });
    await app.close();
  });
});

describe("DELETE /equipe/:id/aguardando (Desistir)", () => {
  it("o novo que nunca entrou some da equipe", async () => {
    const app = montar();
    const dono = await noPix(app);
    const ana = (await incluir(app, dono.token)).json();

    const resposta = await app.inject({ method: "DELETE", url: `/equipe/${ana.id}/aguardando`, headers: auth(dono.token) });

    expect(resposta.statusCode).toBe(204);
    expect(await prisma.barbeiro.findUnique({ where: { id: ana.id } })).toBeNull();
    await app.close();
  });

  it("quem tem histórico (estava sendo reativado) só deixa de aguardar e segue inativo", async () => {
    const app = montar();
    const dono = await noPix(app);
    const saiu = await criarMembroComToken(app, dono.barbeariaId, "profissional", "p");
    await prisma.barbeiro.update({ where: { id: saiu.barbeiroId }, data: { ativo: false, aguardaPagamento: true } });

    const resposta = await app.inject({
      method: "DELETE",
      url: `/equipe/${saiu.barbeiroId}/aguardando`,
      headers: auth(dono.token),
    });

    expect(resposta.statusCode).toBe(204);
    expect(await membro(saiu.barbeiroId)).toMatchObject({ ativo: false, aguardaPagamento: false });
    await app.close();
  });

  it("quem não aguarda pagamento: 404", async () => {
    const app = montar();
    const dono = await noPix(app);

    const resposta = await app.inject({
      method: "DELETE",
      url: `/equipe/${dono.barbeiroId}/aguardando`,
      headers: auth(dono.token),
    });

    expect(resposta.statusCode).toBe(404);
    await app.close();
  });
});
