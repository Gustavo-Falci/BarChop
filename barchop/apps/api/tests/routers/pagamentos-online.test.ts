import { describe, expect, it } from "vitest";
import { prisma } from "@barchop/database";
import { buildApp } from "../../src/app";
import { tokenConfere } from "../../src/lib/cifra";
import { provedoresDeMemoria } from "../../src/lib/provedores";
import { auth, criarBarbeariaComToken, criarMembroComToken } from "../helpers/barbearia";

// Conectar a conta de quem vende no provedor (Onda 2, marco 3, PR 9 do
// plano planos-de-assinatura). Quem pode:
// - dono: a conta dele e a da casa (`?daCasa=true`);
// - profissional: conecta a dele só com o "pode vender"; vê e desconecta
//   a dele mesmo sem, porque as assinaturas que existem seguem;
// - recepção: nada.
// A chave nunca volta: a tela vê só os 4 últimos caracteres.

const CHAVE = "$aact_hmlg_chave-do-dono-1234";

async function cenario(opcoes: Parameters<typeof provedoresDeMemoria>[0] = {}) {
  const provedores = provedoresDeMemoria(opcoes);
  const app = buildApp({ provedores });
  const dono = await criarBarbeariaComToken(app);
  const lucas = await criarMembroComToken(app, dono.barbeariaId, "profissional", "lucas");
  const recepcao = await criarMembroComToken(app, dono.barbeariaId, "recepcao", "rec");
  return { app, provedores, dono, lucas, recepcao };
}

type Cenario = Awaited<ReturnType<typeof cenario>>;

const url = (daCasa = false) => `/barbearias/me/pagamentos-online${daCasa ? "?daCasa=true" : ""}`;

function ver(c: Cenario, token: string, daCasa = false) {
  return c.app.inject({ method: "GET", url: url(daCasa), headers: auth(token) });
}

function conectar(c: Cenario, token: string, chave = CHAVE, daCasa = false) {
  return c.app.inject({ method: "PUT", url: url(daCasa), headers: auth(token), payload: { provedor: "asaas", chave } });
}

function desconectar(c: Cenario, token: string, daCasa = false) {
  return c.app.inject({ method: "DELETE", url: url(daCasa), headers: auth(token) });
}

function liberarVenda(c: Cenario, barbeiroId: string, podeVenderPlanos = true) {
  return prisma.barbeiro.update({ where: { id: barbeiroId }, data: { podeVenderPlanos } });
}

// Uma assinatura online na conexão, direto no banco.
async function assinaturaOnline(c: Cenario, conexaoId: string, situacao = "ativa") {
  const plano = await prisma.planoDeAssinatura.create({
    data: { barbeariaId: c.dono.barbeariaId, vendedorId: c.dono.barbeiroId, nome: "Corte", ciclo: "mensal", precoCentavos: 9000 },
  });
  const cliente = await prisma.cliente.create({
    data: { barbeariaId: c.dono.barbeariaId, nome: "Ana", telefone: `+55119${Math.floor(Math.random() * 1e8)}` },
  });
  return prisma.assinaturaDoCliente.create({
    data: {
      barbeariaId: c.dono.barbeariaId,
      planoId: plano.id,
      clienteId: cliente.id,
      situacao,
      forma: "online",
      conexaoId,
      idExterno: `sub_${Math.random()}`,
      precoCentavos: 9000,
      ciclo: "mensal",
    },
  });
}

describe("conectar a conta", () => {
  it("confere a chave, registra o webhook com token próprio e guarda a chave cifrada", async () => {
    const c = await cenario();

    const resposta = await conectar(c, c.dono.token, `  ${CHAVE}\n`);

    expect(resposta.statusCode).toBe(200);
    expect(resposta.body).not.toContain(CHAVE);
    expect(resposta.json()).toMatchObject({
      daCasa: false,
      modoAceito: "teste",
      conta: { provedor: "asaas", modo: "teste", chaveFinal: "1234" },
    });
    const conexao = await prisma.conexaoDePagamento.findFirstOrThrow({ where: { barbeariaId: c.dono.barbeariaId } });
    expect(conexao).toMatchObject({ barbeiroId: c.dono.barbeiroId, daCasa: false, provedor: "asaas", modo: "teste" });
    // A de memória "cifra" com o próprio texto: aqui se vê que a chave
    // gravada é a colada, sem os espaços.
    expect(Buffer.from(conexao.chaveCifrada).toString("utf8")).toBe(CHAVE);
    expect(c.provedores.webhooks).toHaveLength(1);
    const [webhook] = c.provedores.webhooks;
    expect(webhook.id).toBe(conexao.idExternoWebhook);
    expect(webhook.url).toBe(c.provedores.urlDoWebhook(conexao.id));
    expect(webhook.email).toBe("um@exemplo.com");
    expect(tokenConfere(webhook.token, conexao.webhookTokenHash)).toBe(true);
    expect(conexao.webhookTokenHash).not.toContain(webhook.token);
  });

  it("o GET mostra a conta sem a chave; sem conta, `conta: null`", async () => {
    const c = await cenario();
    expect((await ver(c, c.dono.token)).json()).toEqual({ daCasa: false, modoAceito: "teste", conta: null });

    await conectar(c, c.dono.token);
    const resposta = await ver(c, c.dono.token);

    expect(resposta.body).not.toContain(CHAVE);
    expect(resposta.json().conta).toEqual({
      provedor: "asaas",
      modo: "teste",
      chaveFinal: "1234",
      conectadaEm: expect.any(String),
    });
  });

  it("chave fora do formato do Asaas é 422 chave_invalida; a do outro modo, 422 modo_errado", async () => {
    const c = await cenario({ modoAceito: "real" });

    const torta = await conectar(c, c.dono.token, "sk_live_qualquer-coisa");
    const doSandbox = await conectar(c, c.dono.token, CHAVE);

    expect(torta.statusCode).toBe(422);
    expect(torta.json().erro).toBe("chave_invalida");
    expect(doSandbox.statusCode).toBe(422);
    expect(doSandbox.json().erro).toBe("modo_errado");
    expect(doSandbox.body).not.toContain(CHAVE);
    expect(await prisma.conexaoDePagamento.count()).toBe(0);
    expect(c.provedores.webhooks).toEqual([]);
  });

  it("chave que o Asaas não aceita é 422 chave_recusada, sem gravar nem registrar nada", async () => {
    const c = await cenario();
    c.provedores.chavesInvalidas.add(CHAVE);

    const resposta = await conectar(c, c.dono.token);

    expect(resposta.statusCode).toBe(422);
    expect(resposta.json().erro).toBe("chave_recusada");
    expect(resposta.body).not.toContain(CHAVE);
    expect(await prisma.conexaoDePagamento.count()).toBe(0);
    expect(c.provedores.webhooks).toEqual([]);
  });

  it("Asaas fora do ar é 502 provedor_indisponivel", async () => {
    const c = await cenario();
    c.provedores.indisponivel = true;

    const resposta = await conectar(c, c.dono.token);

    expect(resposta.statusCode).toBe(502);
    expect(resposta.json().erro).toBe("provedor_indisponivel");
    expect(await prisma.conexaoDePagamento.count()).toBe(0);
  });

  it("sem a URL_DA_API não há para onde o webhook mandar: 503", async () => {
    const c = await cenario({ urlDaApi: null });

    const resposta = await conectar(c, c.dono.token);

    expect(resposta.statusCode).toBe(503);
    expect(resposta.json().erro).toBe("pagamentos_online_sem_endereco");
    expect(await prisma.conexaoDePagamento.count()).toBe(0);
    expect(c.provedores.webhooks).toEqual([]);
  });

  it("a conta da casa e a do dono são separadas", async () => {
    const c = await cenario();

    await conectar(c, c.dono.token, "$aact_hmlg_da-casa-aaaa", true);
    await conectar(c, c.dono.token, "$aact_hmlg_do-dono-bbbb");

    expect((await ver(c, c.dono.token, true)).json()).toMatchObject({ daCasa: true, conta: { chaveFinal: "aaaa" } });
    expect((await ver(c, c.dono.token)).json()).toMatchObject({ daCasa: false, conta: { chaveFinal: "bbbb" } });
    expect(await prisma.conexaoDePagamento.count({ where: { daCasa: true } })).toBe(1);
    expect(c.provedores.webhooks).toHaveLength(2);
  });
});

describe("trocar a chave", () => {
  it("da mesma conta: troca a chave e mantém o webhook e o token", async () => {
    const c = await cenario();
    await conectar(c, c.dono.token);
    const antes = await prisma.conexaoDePagamento.findFirstOrThrow();
    const nova = "$aact_hmlg_chave-nova-9999";
    c.provedores.contas.set(nova, CHAVE);

    const resposta = await conectar(c, c.dono.token, nova);

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json().conta.chaveFinal).toBe("9999");
    const depois = await prisma.conexaoDePagamento.findFirstOrThrow();
    expect(depois.id).toBe(antes.id);
    expect(Buffer.from(depois.chaveCifrada).toString("utf8")).toBe(nova);
    expect(depois.idExternoWebhook).toBe(antes.idExternoWebhook);
    expect(depois.webhookTokenHash).toBe(antes.webhookTokenHash);
    expect(c.provedores.webhooks).toHaveLength(1);
  });

  it("de outra conta: 422 outra_conta, e a conexão fica como estava", async () => {
    const c = await cenario();
    await conectar(c, c.dono.token);

    const resposta = await conectar(c, c.dono.token, "$aact_hmlg_de-outra-conta-0000");

    expect(resposta.statusCode).toBe(422);
    expect(resposta.json().erro).toBe("outra_conta");
    const conexao = await prisma.conexaoDePagamento.findFirstOrThrow();
    expect(conexao.chaveFinal).toBe("1234");
    expect(c.provedores.webhooks).toHaveLength(1);
  });
});

describe("desconectar", () => {
  it("apaga o webhook no Asaas e desliga a conexão", async () => {
    const c = await cenario();
    await conectar(c, c.dono.token);

    const resposta = await desconectar(c, c.dono.token);

    expect(resposta.statusCode).toBe(204);
    expect(await prisma.conexaoDePagamento.count({ where: { desconectadaEm: null } })).toBe(0);
    expect(c.provedores.webhooks).toEqual([]);
    expect((await ver(c, c.dono.token)).json().conta).toBeNull();
  });

  // A assinatura online cancelada segue apontando pra conexão (é a conta
  // em que ela foi cobrada): a linha fica, desligada e sem a chave.
  it("com só assinaturas canceladas: desconecta, guarda a conexão sem a chave, e deixa conectar de novo", async () => {
    const c = await cenario();
    await conectar(c, c.dono.token);
    const antiga = await prisma.conexaoDePagamento.findFirstOrThrow();
    await assinaturaOnline(c, antiga.id, "cancelada");

    expect((await desconectar(c, c.dono.token)).statusCode).toBe(204);

    const desligada = await prisma.conexaoDePagamento.findUniqueOrThrow({ where: { id: antiga.id } });
    expect(desligada.desconectadaEm).not.toBeNull();
    expect(desligada.chaveCifrada).toHaveLength(0);
    expect((await ver(c, c.dono.token)).json().conta).toBeNull();
    expect((await desconectar(c, c.dono.token)).statusCode).toBe(404);

    const deNovo = await conectar(c, c.dono.token, "$aact_hmlg_outra-conta-7777");
    expect(deNovo.statusCode).toBe(200);
    expect(deNovo.json().conta.chaveFinal).toBe("7777");
    expect(await prisma.conexaoDePagamento.count()).toBe(2);
  });

  it("com assinatura online viva: 422 assinaturas_ativas; a cancelada não conta", async () => {
    const c = await cenario();
    await conectar(c, c.dono.token);
    const conexao = await prisma.conexaoDePagamento.findFirstOrThrow();
    await assinaturaOnline(c, conexao.id);
    await assinaturaOnline(c, conexao.id, "em_atraso");
    await assinaturaOnline(c, conexao.id, "cancelada");

    const resposta = await desconectar(c, c.dono.token);

    expect(resposta.statusCode).toBe(422);
    expect(resposta.json()).toMatchObject({ erro: "assinaturas_ativas" });
    expect(resposta.json().mensagem).toContain("2 assinaturas");
    expect(resposta.json().mensagem).not.toMatch(/\bdel[ea]\b/);
    expect(await prisma.conexaoDePagamento.count()).toBe(1);
    expect(c.provedores.webhooks).toHaveLength(1);
  });

  it("sem conta conectada: 404", async () => {
    const c = await cenario();

    expect((await desconectar(c, c.dono.token)).statusCode).toBe(404);
  });

  it("Asaas fora do ar: 502, e a conexão fica pra tentar de novo", async () => {
    const c = await cenario();
    await conectar(c, c.dono.token);
    c.provedores.indisponivel = true;

    const resposta = await desconectar(c, c.dono.token);

    expect(resposta.statusCode).toBe(502);
    expect(await prisma.conexaoDePagamento.count()).toBe(1);
  });

  it("chave já revogada no Asaas: desconecta mesmo assim", async () => {
    const c = await cenario();
    await conectar(c, c.dono.token);
    c.provedores.chavesInvalidas.add(CHAVE);

    const resposta = await desconectar(c, c.dono.token);

    expect(resposta.statusCode).toBe(204);
    expect(await prisma.conexaoDePagamento.count({ where: { desconectadaEm: null } })).toBe(0);
  });
});

describe("quem pode", () => {
  it("recepção: 403 nos três", async () => {
    const c = await cenario();

    for (const resposta of [
      await ver(c, c.recepcao.token),
      await conectar(c, c.recepcao.token),
      await desconectar(c, c.recepcao.token),
    ]) {
      expect(resposta.statusCode).toBe(403);
      expect(resposta.json().erro).toBe("sem_permissao");
    }
  });

  it("profissional: conecta a dele só com o \"pode vender\"; a da casa nunca", async () => {
    const c = await cenario();

    expect((await conectar(c, c.lucas.token)).statusCode).toBe(403);
    expect((await ver(c, c.lucas.token)).json().conta).toBeNull();

    await liberarVenda(c, c.lucas.barbeiroId);
    expect((await conectar(c, c.lucas.token, "$aact_hmlg_do-lucas-5555")).statusCode).toBe(200);
    expect((await conectar(c, c.lucas.token, CHAVE, true)).statusCode).toBe(403);
    expect((await ver(c, c.lucas.token, true)).statusCode).toBe(403);
    expect(await prisma.conexaoDePagamento.findFirstOrThrow()).toMatchObject({ barbeiroId: c.lucas.barbeiroId, daCasa: false });
  });

  it("profissional que perdeu o \"pode vender\" ainda vê e desconecta a dele", async () => {
    const c = await cenario();
    await liberarVenda(c, c.lucas.barbeiroId);
    await conectar(c, c.lucas.token, "$aact_hmlg_do-lucas-5555");
    await liberarVenda(c, c.lucas.barbeiroId, false);

    expect((await ver(c, c.lucas.token)).json().conta).toMatchObject({ chaveFinal: "5555" });
    expect((await desconectar(c, c.lucas.token)).statusCode).toBe(204);
  });

  it("a conta de um membro não aparece pro outro", async () => {
    const c = await cenario();
    await liberarVenda(c, c.lucas.barbeiroId);
    await conectar(c, c.lucas.token, "$aact_hmlg_do-lucas-5555");

    expect((await ver(c, c.dono.token)).json().conta).toBeNull();
    expect((await desconectar(c, c.dono.token)).statusCode).toBe(404);
  });
});

describe("fora do Completo", () => {
  it("conectar é 403 recurso_do_plano; ver e desconectar seguem (as assinaturas continuam no Grátis)", async () => {
    const c = await cenario();
    await conectar(c, c.dono.token);
    await prisma.assinatura.update({
      where: { barbeariaId: c.dono.barbeariaId },
      data: { situacao: "ativa", plano: "essencial", testeTerminaEm: null },
    });

    const conectarDeNovo = await conectar(c, c.dono.token, CHAVE, true);
    expect(conectarDeNovo.statusCode).toBe(403);
    expect(conectarDeNovo.json().erro).toBe("recurso_do_plano");
    expect((await ver(c, c.dono.token)).json().conta).toMatchObject({ chaveFinal: "1234" });
    expect((await desconectar(c, c.dono.token)).statusCode).toBe(204);
  });
});
