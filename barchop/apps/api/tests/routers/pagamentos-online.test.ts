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

const CHAVE_DA_STRIPE = "sk_test_chave-do-dono-5678";

function conectarStripe(c: Cenario, token: string, chave = CHAVE_DA_STRIPE, daCasa = false) {
  return c.app.inject({ method: "PUT", url: url(daCasa), headers: auth(token), payload: { provedor: "stripe", chave } });
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
    expect(webhook.url).toBe(c.provedores.urlDoWebhook("asaas", conexao.id));
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
      infiniteTag: null,
      diasParaCancelar: null,
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

// A Stripe (plano pagamentos-online-stripe, PR 3): a chave colada como a
// do Asaas, o webhook criado pela API, e o segredo que assina os eventos
// guardado cifrado (a Stripe só mostra na criação).
describe("a Stripe", () => {
  it("conecta: o webhook no endereço da Stripe e o segredo dele cifrado", async () => {
    const c = await cenario();

    const resposta = await conectarStripe(c, c.dono.token);

    expect(resposta.statusCode).toBe(200);
    expect(resposta.body).not.toContain(CHAVE_DA_STRIPE);
    expect(resposta.json().conta).toMatchObject({ provedor: "stripe", modo: "teste", chaveFinal: "5678" });
    const conexao = await prisma.conexaoDePagamento.findFirstOrThrow();
    expect(conexao).toMatchObject({ provedor: "stripe", modo: "teste" });
    expect(Buffer.from(conexao.chaveCifrada).toString("utf8")).toBe(CHAVE_DA_STRIPE);
    const [webhook] = c.provedores.webhooks;
    expect(webhook.url).toBe(c.provedores.urlDoWebhook("stripe", conexao.id));
    expect(webhook.url).toMatch(/\/webhooks\/stripe\//);
    expect(webhook.segredo).toMatch(/^whsec_/);
    expect(Buffer.from(conexao.segredoDoWebhookCifrado!).toString("utf8")).toBe(webhook.segredo);
    expect(resposta.body).not.toContain(webhook.segredo!);
  });

  it("chave fora do formato da Stripe e a do outro modo: as frases da Stripe", async () => {
    const c = await cenario({ modoAceito: "real" });

    const torta = await conectarStripe(c, c.dono.token, "$aact_prod_qualquer-coisa");
    const deTeste = await conectarStripe(c, c.dono.token);

    expect(torta.statusCode).toBe(422);
    expect(torta.json()).toMatchObject({
      erro: "chave_invalida",
      mensagem: "isso não é uma chave de API da Stripe: ela começa com sk_ ou rk_",
    });
    expect(deTeste.statusCode).toBe(422);
    expect(deTeste.json()).toMatchObject({
      erro: "modo_errado",
      mensagem: "esta é uma chave de teste da Stripe, que não move dinheiro: use a chave de produção",
    });
    expect(await prisma.conexaoDePagamento.count()).toBe(0);
  });

  it("trocar a chave da mesma conta mantém o webhook e o segredo", async () => {
    const c = await cenario();
    await conectarStripe(c, c.dono.token);
    const antes = await prisma.conexaoDePagamento.findFirstOrThrow();
    const nova = "rk_test_chave-restrita-4321";
    c.provedores.contas.set(nova, CHAVE_DA_STRIPE);

    const resposta = await conectarStripe(c, c.dono.token, nova);

    expect(resposta.statusCode).toBe(200);
    const depois = await prisma.conexaoDePagamento.findFirstOrThrow();
    expect(depois.id).toBe(antes.id);
    expect(depois.chaveFinal).toBe("4321");
    expect(depois.idExternoWebhook).toBe(antes.idExternoWebhook);
    expect(Buffer.from(depois.segredoDoWebhookCifrado!)).toEqual(Buffer.from(antes.segredoDoWebhookCifrado!));
    expect(c.provedores.webhooks).toHaveLength(1);
  });

  it("com o Asaas conectado, a Stripe é 422 outra_conta (e o contrário), sem registrar nada", async () => {
    const c = await cenario();
    await conectar(c, c.dono.token);
    await liberarVenda(c, c.lucas.barbeiroId);
    await conectarStripe(c, c.lucas.token);

    const paraStripe = await conectarStripe(c, c.dono.token);
    const paraAsaas = await conectar(c, c.lucas.token);

    expect(paraStripe.statusCode).toBe(422);
    expect(paraStripe.json()).toMatchObject({
      erro: "outra_conta",
      mensagem: "a conta conectada é do Asaas: desconecte antes de conectar a da Stripe",
    });
    expect(paraAsaas.statusCode).toBe(422);
    expect(paraAsaas.json()).toMatchObject({
      erro: "outra_conta",
      mensagem: "a conta conectada é da Stripe: desconecte antes de conectar a do Asaas",
    });
    expect(c.provedores.webhooks).toHaveLength(2);
    expect(await prisma.conexaoDePagamento.findMany({ select: { provedor: true }, orderBy: { provedor: "asc" } })).toEqual([
      { provedor: "asaas" },
      { provedor: "stripe" },
    ]);
  });

  it("desconectar apaga o webhook e tira a chave e o segredo do banco", async () => {
    const c = await cenario();
    await conectarStripe(c, c.dono.token);

    const resposta = await desconectar(c, c.dono.token);

    expect(resposta.statusCode).toBe(204);
    const conexao = await prisma.conexaoDePagamento.findFirstOrThrow();
    expect(conexao.desconectadaEm).not.toBeNull();
    expect(Buffer.from(conexao.chaveCifrada)).toHaveLength(0);
    expect(conexao.segredoDoWebhookCifrado).toBeNull();
    expect(c.provedores.webhooks).toEqual([]);
  });

  it("depois de desconectar a Stripe, conecta o Asaas", async () => {
    const c = await cenario();
    await conectarStripe(c, c.dono.token);
    await desconectar(c, c.dono.token);

    const resposta = await conectar(c, c.dono.token);

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json().conta.provedor).toBe("asaas");
  });
});

// A InfinitePay (plano pagamentos-online-infinitepay, PR 3): sem sandbox
// (toda `inchk_` é de produção), sem webhook da conta (o aviso vai em cada
// link) e com a InfiniteTag, que o `payment_check` pede. Quem vende
// escolhe em quantos dias de atraso a assinatura cancela.
const CHAVE_DA_INFINITEPAY = "inchk_chave-do-dono-2468";
const TAG = "barbearia-exemplo";

function conectarInfinitePay(c: Cenario, token: string, corpo: { chave?: string; tag?: string } = {}, daCasa = false) {
  return c.app.inject({
    method: "PUT",
    url: url(daCasa),
    headers: auth(token),
    payload: { provedor: "infinitepay", chave: CHAVE_DA_INFINITEPAY, tag: TAG, ...corpo },
  });
}

function mudarDias(c: Cenario, token: string, diasParaCancelar: unknown, daCasa = false) {
  return c.app.inject({ method: "PATCH", url: url(daCasa), headers: auth(token), payload: { diasParaCancelar } });
}

describe("a InfinitePay", () => {
  it("conecta com a chave e a tag (sem o $), sem webhook, e os dias para cancelar no padrão", async () => {
    const c = await cenario({ modoAceito: "real" });

    const resposta = await conectarInfinitePay(c, c.dono.token, { tag: "  $barbearia-exemplo " });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.body).not.toContain(CHAVE_DA_INFINITEPAY);
    expect(resposta.json().conta).toMatchObject({
      provedor: "infinitepay",
      modo: "real",
      chaveFinal: "2468",
      infiniteTag: TAG,
      diasParaCancelar: 10,
    });
    const conexao = await prisma.conexaoDePagamento.findFirstOrThrow();
    expect(conexao).toMatchObject({
      provedor: "infinitepay",
      infiniteTag: TAG,
      diasParaCancelar: 10,
      idExternoWebhook: null,
      segredoDoWebhookCifrado: null,
    });
    expect(Buffer.from(conexao.chaveCifrada).toString("utf8")).toBe(CHAVE_DA_INFINITEPAY);
    expect(c.provedores.webhooks).toEqual([]);
    expect((await ver(c, c.dono.token)).json().conta).toMatchObject({ infiniteTag: TAG, diasParaCancelar: 10 });
  });

  it("as outras contas não têm tag nem dias para cancelar", async () => {
    const c = await cenario();
    await conectar(c, c.dono.token);
    expect((await ver(c, c.dono.token)).json().conta).toMatchObject({ infiniteTag: null, diasParaCancelar: null });
  });

  it("sem a tag é 422 tag_obrigatoria; tag torta é 422 tag_invalida; nada gravado", async () => {
    const c = await cenario({ modoAceito: "real" });

    const semTag = await c.app.inject({
      method: "PUT",
      url: url(),
      headers: auth(c.dono.token),
      payload: { provedor: "infinitepay", chave: CHAVE_DA_INFINITEPAY },
    });
    const torta = await conectarInfinitePay(c, c.dono.token, { tag: "barbearia exemplo" });

    expect(semTag.statusCode).toBe(422);
    expect(semTag.json()).toMatchObject({ erro: "tag_obrigatoria", mensagem: "a InfinitePay pede a InfiniteTag da conta" });
    expect(torta.statusCode).toBe(422);
    expect(torta.json().erro).toBe("tag_invalida");
    expect(await prisma.conexaoDePagamento.count()).toBe(0);
  });

  it("chave fora do formato: a frase da InfinitePay", async () => {
    const real = await cenario({ modoAceito: "real" });
    const torta = await conectarInfinitePay(real, real.dono.token, { chave: "rk_live_qualquer" });
    expect(torta.statusCode).toBe(422);
    expect(torta.json()).toMatchObject({
      erro: "chave_invalida",
      mensagem: "isso não é uma chave de API da InfinitePay: ela começa com inchk_",
    });
  });

  it("com a plataforma no modo de teste, a InfinitePay não conecta", async () => {
    const teste = await cenario();
    const emTeste = await conectarInfinitePay(teste, teste.dono.token);
    expect(emTeste.statusCode).toBe(422);
    expect(emTeste.json()).toMatchObject({
      erro: "modo_errado",
      mensagem: "a InfinitePay não tem chave de teste, e aqui só vale a de teste",
    });
    expect(await prisma.conexaoDePagamento.count()).toBe(0);
  });

  it("chave que a InfinitePay não aceita (ou de outra conta que não a da tag) é 422 chave_recusada", async () => {
    const c = await cenario({ modoAceito: "real" });
    c.provedores.chavesInvalidas.add(CHAVE_DA_INFINITEPAY);

    const resposta = await conectarInfinitePay(c, c.dono.token);

    expect(resposta.statusCode).toBe(422);
    expect(resposta.json().erro).toBe("chave_recusada");
    expect(await prisma.conexaoDePagamento.count()).toBe(0);
  });

  it("trocar a chave: a nova vale com a tag gravada; de outra conta, 422 outra_conta e nada muda", async () => {
    const c = await cenario({ modoAceito: "real" });
    await conectarInfinitePay(c, c.dono.token);
    c.provedores.tagsDasContas.set(TAG, CHAVE_DA_INFINITEPAY);
    const daMesma = "inchk_chave-nova-1357";
    c.provedores.contas.set(daMesma, CHAVE_DA_INFINITEPAY);

    const trocada = await conectarInfinitePay(c, c.dono.token, { chave: daMesma });
    const deOutra = await conectarInfinitePay(c, c.dono.token, { chave: "inchk_de-outra-conta-9999" });

    expect(trocada.statusCode).toBe(200);
    expect(trocada.json().conta).toMatchObject({ chaveFinal: "1357", infiniteTag: TAG, diasParaCancelar: 10 });
    expect(deOutra.statusCode).toBe(422);
    expect(deOutra.json()).toMatchObject({
      erro: "outra_conta",
      mensagem: "esta chave não vale para a InfiniteTag barbearia-exemplo: confira se ela é dessa conta e se está ativa",
    });
    const conexao = await prisma.conexaoDePagamento.findFirstOrThrow();
    expect(conexao.chaveFinal).toBe("1357");
  });

  it("trocar a tag com a conta ligada é 422 outra_conta: desconecte antes", async () => {
    const c = await cenario({ modoAceito: "real" });
    await conectarInfinitePay(c, c.dono.token);

    const resposta = await conectarInfinitePay(c, c.dono.token, { tag: "outra-tag" });

    expect(resposta.statusCode).toBe(422);
    expect(resposta.json()).toMatchObject({
      erro: "outra_conta",
      mensagem: "a conta conectada é a da InfiniteTag barbearia-exemplo: desconecte antes de conectar outra",
    });
  });

  it("com o Asaas conectado, a InfinitePay é 422 outra_conta", async () => {
    const c = await cenario({ modoAceito: "real" });
    await conectar(c, c.dono.token, "$aact_prod_chave-do-dono-1234");

    const resposta = await conectarInfinitePay(c, c.dono.token);

    expect(resposta.statusCode).toBe(422);
    expect(resposta.json()).toMatchObject({
      erro: "outra_conta",
      mensagem: "a conta conectada é do Asaas: desconecte antes de conectar a da InfinitePay",
    });
  });

  it("os dias para cancelar: de 3 a 30, só na conta da InfinitePay", async () => {
    const c = await cenario({ modoAceito: "real" });
    expect((await mudarDias(c, c.dono.token, 15)).statusCode).toBe(404);
    await conectarInfinitePay(c, c.dono.token);

    const mudou = await mudarDias(c, c.dono.token, 15);

    expect(mudou.statusCode).toBe(200);
    expect(mudou.json().conta).toMatchObject({ provedor: "infinitepay", diasParaCancelar: 15 });
    for (const ruim of [2, 31, 7.5, "dez"]) {
      expect((await mudarDias(c, c.dono.token, ruim)).statusCode).toBe(400);
    }
    expect((await prisma.conexaoDePagamento.findFirstOrThrow()).diasParaCancelar).toBe(15);

    await desconectar(c, c.dono.token);
    await conectar(c, c.dono.token, "$aact_prod_chave-do-dono-1234");
    const noAsaas = await mudarDias(c, c.dono.token, 15);
    expect(noAsaas.statusCode).toBe(422);
    expect(noAsaas.json()).toMatchObject({
      erro: "so_na_infinitepay",
      mensagem: "os dias para cancelar são só da InfinitePay: o Asaas cancela pelas próprias regras",
    });
  });

  it("os dias para cancelar: quem tem a conta muda a dele; a da casa, só o dono; recepção, nada", async () => {
    const c = await cenario({ modoAceito: "real" });
    await liberarVenda(c, c.lucas.barbeiroId);
    await conectarInfinitePay(c, c.lucas.token);
    await conectarInfinitePay(c, c.dono.token, {}, true);

    expect((await mudarDias(c, c.lucas.token, 20)).statusCode).toBe(200);
    expect((await mudarDias(c, c.lucas.token, 20, true)).statusCode).toBe(403);
    expect((await mudarDias(c, c.recepcao.token, 20)).statusCode).toBe(403);
    expect((await mudarDias(c, c.dono.token, 25, true)).json().conta.diasParaCancelar).toBe(25);
  });

  it("desconectar desliga sem falar com a InfinitePay e tira a chave; a tag fica, pelo histórico", async () => {
    const c = await cenario({ modoAceito: "real" });
    await conectarInfinitePay(c, c.dono.token);

    const resposta = await desconectar(c, c.dono.token);

    expect(resposta.statusCode).toBe(204);
    const conexao = await prisma.conexaoDePagamento.findFirstOrThrow();
    expect(conexao.desconectadaEm).not.toBeNull();
    expect(Buffer.from(conexao.chaveCifrada)).toHaveLength(0);
    expect(conexao.infiniteTag).toBe(TAG);
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
