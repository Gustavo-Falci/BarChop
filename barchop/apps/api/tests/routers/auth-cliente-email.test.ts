import { describe, expect, it } from "vitest";
import { prisma } from "@barchop/database";
import { buildApp } from "../../src/app";
import type { CanalDeMemoria, Mensagem } from "../../src/lib/canal";
import { auth, criarBarbeariaComToken } from "../helpers/barbearia";
import type { App } from "../../src/tipos";

// No piloto o código do cliente sai por e-mail (decisão de 2026-10-03,
// plano da Onda 1): sem a verificação da Meta não há WhatsApp, e o
// telefone sozinho não tem por onde receber nada.

const SENHA = "senha-forte-123";
const EMAIL = "joao@exemplo.com";
const TELEFONE = "11999998888";

// O canal de produção do piloto: entrega e-mail e só e-mail.
function canalSoDeEmail(): CanalDeMemoria {
  const enviadas: Mensagem[] = [];
  return {
    nome: "email",
    destinos: ["email"],
    enviadas,
    async enviar(mensagem) {
      enviadas.push(mensagem);
    },
  };
}

function enviadas(app: App): Mensagem[] {
  return (app.canal as CanalDeMemoria).enviadas;
}

function codigoEnviadoPara(app: App, para: string): string {
  const mensagem = enviadas(app).filter((m) => m.para === para).at(-1);
  const codigo = mensagem?.texto.match(/\b(\d{6})\b/)?.[1];
  if (!codigo) throw new Error(`nenhum código enviado para ${para}`);
  return codigo;
}

function pedirCodigo(app: App, slug: string, corpo: object) {
  return app.inject({
    method: "POST",
    url: `/barbearias/${slug}/auth/cliente/codigo`,
    payload: corpo,
  });
}

function definirSenha(app: App, slug: string, corpo: object) {
  return app.inject({
    method: "POST",
    url: `/barbearias/${slug}/auth/cliente/senha`,
    payload: { senha: SENHA, nome: "João da Silva", telefone: TELEFONE, ...corpo },
  });
}

function login(app: App, slug: string, corpo: object) {
  return app.inject({
    method: "POST",
    url: `/barbearias/${slug}/auth/cliente/login`,
    payload: corpo,
  });
}

async function contaPorEmail(app: App, slug: string, email = EMAIL) {
  await pedirCodigo(app, slug, { email });
  const codigo = codigoEnviadoPara(app, email);
  return definirSenha(app, slug, { email, codigo });
}

describe("código do cliente por e-mail", () => {
  it("manda o código pro e-mail normalizado, com assunto em nome da barbearia", async () => {
    const app = buildApp({ canal: canalSoDeEmail() });
    const { slug } = await criarBarbeariaComToken(app);

    const resposta = await pedirCodigo(app, slug, { email: "  Joao@Exemplo.com " });

    expect(resposta.statusCode).toBe(202);
    const [mensagem] = enviadas(app);
    expect(mensagem.para).toBe(EMAIL);
    expect(mensagem.assunto).toContain("Barbearia um");
    expect(mensagem.texto).toMatch(/\b\d{6}\b/);
    await app.close();
  });

  it("responde igual tendo ou não conta com aquele e-mail", async () => {
    const app = buildApp({ canal: canalSoDeEmail() });
    const { slug } = await criarBarbeariaComToken(app);
    await contaPorEmail(app, slug);

    const comConta = await pedirCodigo(app, slug, { email: EMAIL });
    const semConta = await pedirCodigo(app, slug, { email: "ninguem@exemplo.com" });

    expect(comConta.statusCode).toBe(semConta.statusCode);
    expect(comConta.body).toBe(semConta.body);
    await app.close();
  });

  it("telefone com um canal que só entrega e-mail é 422, não um 500 no envio", async () => {
    const app = buildApp({ canal: canalSoDeEmail() });
    const { slug } = await criarBarbeariaComToken(app);

    const resposta = await pedirCodigo(app, slug, { telefone: TELEFONE });

    expect(resposta.statusCode).toBe(422);
    expect(resposta.json().erro).toBe("destino_indisponivel");
    expect(enviadas(app)).toHaveLength(0);
    await app.close();
  });

  it("recusa com 400 o corpo com telefone e e-mail juntos, ou sem nenhum dos dois", async () => {
    const app = buildApp({ canal: canalSoDeEmail() });
    const { slug } = await criarBarbeariaComToken(app);

    expect((await pedirCodigo(app, slug, { email: EMAIL, telefone: TELEFONE })).statusCode).toBe(400);
    expect((await pedirCodigo(app, slug, {})).statusCode).toBe(400);
    expect((await pedirCodigo(app, slug, { email: "nao-e-email" })).statusCode).toBe(400);
    await app.close();
  });
});

describe("definir a senha provando o e-mail", () => {
  it("cadastro novo: cria o cliente com e-mail e telefone, e devolve a sessão", async () => {
    const app = buildApp({ canal: canalSoDeEmail() });
    const { slug, barbeariaId } = await criarBarbeariaComToken(app);

    const resposta = await contaPorEmail(app, slug);

    expect(resposta.statusCode).toBe(201);
    expect(resposta.json().token).toEqual(expect.any(String));
    const cliente = await prisma.cliente.findUniqueOrThrow({
      where: { barbeariaId_email: { barbeariaId, email: EMAIL } },
    });
    expect(cliente.telefone).toBe("(11) 99999-8888");
    expect(cliente.senhaHash).not.toBeNull();
    await app.close();
  });

  it("o telefone é obrigatório também no caminho do e-mail (o cadastro precisa dele)", async () => {
    const app = buildApp({ canal: canalSoDeEmail() });
    const { slug } = await criarBarbeariaComToken(app);
    await pedirCodigo(app, slug, { email: EMAIL });
    const codigo = codigoEnviadoPara(app, EMAIL);

    const resposta = await app.inject({
      method: "POST",
      url: `/barbearias/${slug}/auth/cliente/senha`,
      payload: { email: EMAIL, codigo, senha: SENHA, nome: "João" },
    });

    expect(resposta.statusCode).toBe(400);
    await app.close();
  });

  it("cadastro que a barbearia fez com aquele e-mail: define a senha nele, sem duplicar", async () => {
    const app = buildApp({ canal: canalSoDeEmail() });
    const { slug, token, barbeariaId } = await criarBarbeariaComToken(app);
    const criado = await app.inject({
      method: "POST",
      url: "/clientes",
      headers: auth(token),
      payload: { nome: "João (balcão)", telefone: "11977776666", email: EMAIL },
    });
    expect(criado.statusCode).toBe(201);

    const resposta = await contaPorEmail(app, slug);

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json().cliente.id).toBe(criado.json().id);
    expect(await prisma.cliente.count({ where: { barbeariaId } })).toBe(1);
    await app.close();
  });

  it("telefone de outro cadastro sem esse e-mail: recusa, e não vincula o e-mail a ele", async () => {
    // Vincular seria tomar a conta: quem controla um e-mail qualquer e
    // sabe o telefone de um cliente do balcão herdaria o histórico dele.
    // O caminho seguro é a barbearia incluir o e-mail no cadastro.
    const app = buildApp({ canal: canalSoDeEmail() });
    const { slug, token, barbeariaId } = await criarBarbeariaComToken(app);
    await app.inject({
      method: "POST",
      url: "/clientes",
      headers: auth(token),
      payload: { nome: "João do balcão", telefone: TELEFONE },
    });

    const resposta = await contaPorEmail(app, slug);

    expect(resposta.statusCode).toBe(422);
    expect(resposta.json().erro).toBe("telefone_ja_cadastrado");
    const balcao = await prisma.cliente.findFirstOrThrow({ where: { barbeariaId } });
    expect(balcao.email).toBeNull();
    expect(balcao.senhaHash).toBeNull();
    await app.close();
  });

  it("código emitido pro e-mail não vale pra outro e-mail", async () => {
    const app = buildApp({ canal: canalSoDeEmail() });
    const { slug } = await criarBarbeariaComToken(app);
    await pedirCodigo(app, slug, { email: EMAIL });
    const codigo = codigoEnviadoPara(app, EMAIL);

    const resposta = await definirSenha(app, slug, { email: "outro@exemplo.com", codigo });

    expect(resposta.statusCode).toBe(422);
    expect(resposta.json().erro).toBe("codigo_invalido");
    await app.close();
  });
});

describe("login do cliente por e-mail", () => {
  it("entra com e-mail e senha", async () => {
    const app = buildApp({ canal: canalSoDeEmail() });
    const { slug } = await criarBarbeariaComToken(app);
    await contaPorEmail(app, slug);

    const resposta = await login(app, slug, { email: "JOAO@exemplo.com", senha: SENHA });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json().cliente.email).toBe(EMAIL);
    await app.close();
  });

  it("senha errada ou e-mail sem conta: 401 credenciais_invalidas, igual", async () => {
    const app = buildApp({ canal: canalSoDeEmail() });
    const { slug } = await criarBarbeariaComToken(app);
    await contaPorEmail(app, slug);

    const errada = await login(app, slug, { email: EMAIL, senha: "outra-senha-1" });
    const semConta = await login(app, slug, { email: "ninguem@exemplo.com", senha: SENHA });

    expect(errada.statusCode).toBe(401);
    expect(errada.body).toBe(semConta.body);
    expect(errada.json().erro).toBe("credenciais_invalidas");
    await app.close();
  });
});
