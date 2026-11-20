import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../../src/app";
import { criarOperadorDeSuporte } from "../../src/lib/suporte";
import type { App } from "../../src/tipos";
import { auth, criarBarbeariaComToken } from "../helpers/barbearia";
import { definirSenhaComCodigo } from "../helpers/cliente";

// Auditoria de segurança de 15/11, SEC-003: a sessão do navegador vai em
// cookie httpOnly posto pela API, e não mais no localStorage, onde um
// script injetado lia o token. Cada cookie só vale vindo da origem dele
// (lib/sessao-por-cookie.ts): é isso que impede a página de uma
// barbearia de usar o painel de quem a visita, e um site de fora de
// mandar pedidos com a sessão de alguém (CSRF).

const PAINEL = "https://painel.barchop.com.br";
const SENHA = "senha-forte-123";
const TELEFONE = "11999998888";

function daBarbearia(slug: string): string {
  return `https://${slug}.barchop.com.br`;
}

beforeEach(() => {
  vi.stubEnv("URL_DO_PAINEL", PAINEL);
  vi.stubEnv("URL_DAS_BARBEARIAS", "https://{slug}.barchop.com.br");
  vi.stubEnv("ORIGENS_PERMITIDAS", `${PAINEL},https://barchop.com.br,https://*.barchop.com.br`);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

function cookiesDa(resposta: { headers: Record<string, unknown> }): string[] {
  const bruto = resposta.headers["set-cookie"];
  if (bruto === undefined) return [];
  return Array.isArray(bruto) ? bruto.map(String) : [String(bruto)];
}

// "nome=valor" do Set-Cookie, pra mandar de volta no Cookie.
function parDo(cookie: string): string {
  return cookie.split(";")[0];
}

function loginDoPainel(app: App, origem?: string) {
  return app.inject({
    method: "POST",
    url: "/auth/login",
    headers: origem ? { origin: origem } : {},
    payload: { email: "um@exemplo.com", senha: SENHA },
  });
}

function me(app: App, headers: Record<string, string>) {
  return app.inject({ method: "GET", url: "/me", headers });
}

describe("sessão do painel por cookie", () => {
  it("o login vindo do painel põe o cookie httpOnly, e o token segue no corpo", async () => {
    const app = buildApp();
    await criarBarbeariaComToken(app);

    const resposta = await loginDoPainel(app, PAINEL);

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json().token).toEqual(expect.any(String));
    const [cookie] = cookiesDa(resposta);
    expect(cookie).toMatch(/^__Host-barchop_painel=[^;]+/);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain(`Max-Age=${7 * 24 * 60 * 60}`);
    expect(cookie).not.toMatch(/Domain=/i);
    await app.close();
  });

  it("login sem Origin (app mobile) não põe cookie", async () => {
    const app = buildApp();
    await criarBarbeariaComToken(app);

    const resposta = await loginDoPainel(app);

    expect(resposta.statusCode).toBe(200);
    expect(cookiesDa(resposta)).toHaveLength(0);
    await app.close();
  });

  it("o cookie abre o painel só vindo do painel", async () => {
    const app = buildApp();
    const { slug } = await criarBarbeariaComToken(app);
    const cookie = parDo(cookiesDa(await loginDoPainel(app, PAINEL))[0]);

    expect((await me(app, { cookie, origin: PAINEL })).statusCode).toBe(200);
    // A página de uma barbearia é do mesmo site e leva o cookie junto,
    // mas não pode usar o painel de quem a visita.
    expect((await me(app, { cookie, origin: daBarbearia(slug) })).statusCode).toBe(401);
    // Site de fora (CSRF) e pedido sem Origin (navegação, formulário).
    expect((await me(app, { cookie, origin: "https://malicioso.example" })).statusCode).toBe(401);
    expect((await me(app, { cookie })).statusCode).toBe(401);
    await app.close();
  });

  it("o Bearer continua valendo, com ou sem cookie", async () => {
    const app = buildApp();
    const { token } = await criarBarbeariaComToken(app);

    expect((await me(app, auth(token))).statusCode).toBe(200);
    await app.close();
  });

  it("cookie com token inválido: 401, e a resposta apaga o cookie", async () => {
    const app = buildApp();

    const resposta = await me(app, { cookie: "__Host-barchop_painel=lixo", origin: PAINEL });

    expect(resposta.statusCode).toBe(401);
    expect(resposta.json()).toEqual({ erro: "nao_autenticado" });
    const [apagado] = cookiesDa(resposta);
    expect(apagado).toMatch(/^__Host-barchop_painel=;/);
    expect(apagado).toContain("Max-Age=0");
    await app.close();
  });

  it("sair apaga o cookie", async () => {
    const app = buildApp();

    const resposta = await app.inject({ method: "POST", url: "/auth/sair", headers: { origin: PAINEL } });

    expect(resposta.statusCode).toBe(204);
    const [apagado] = cookiesDa(resposta);
    expect(apagado).toMatch(/^__Host-barchop_painel=;/);
    expect(apagado).toContain("Max-Age=0");
    await app.close();
  });

  it("o Novo agendamento do painel reconhece o membro pelo cookie", async () => {
    const app = buildApp();
    const { slug } = await criarBarbeariaComToken(app);
    const cookie = parDo(cookiesDa(await loginDoPainel(app, PAINEL))[0]);
    const hoje = new Date().toISOString().slice(0, 10);

    const comCookie = await app.inject({
      method: "GET",
      url: `/barbearias/${slug}/disponibilidade/mes?mes=${hoje.slice(0, 7)}`,
      headers: { cookie, origin: PAINEL },
    });

    // A rota é pública: responde com ou sem sessão. O que importa aqui é
    // não quebrar por causa do cookie.
    expect(comCookie.statusCode).toBeLessThan(500);
    await app.close();
  });
});

describe("sessão do cliente por cookie, uma por barbearia", () => {
  async function loginDoCliente(app: App, slug: string, origem: string) {
    await definirSenhaComCodigo(app, slug, { telefone: TELEFONE, senha: SENHA });
    return app.inject({
      method: "POST",
      url: `/barbearias/${slug}/auth/cliente/login`,
      headers: { origin: origem },
      payload: { telefone: TELEFONE, senha: SENHA },
    });
  }

  function clientesMe(app: App, headers: Record<string, string>) {
    return app.inject({ method: "GET", url: "/clientes/me", headers });
  }

  it("o login na página da barbearia põe o cookie dela", async () => {
    const app = buildApp();
    const { slug } = await criarBarbeariaComToken(app);

    const resposta = await loginDoCliente(app, slug, daBarbearia(slug));

    expect(resposta.statusCode).toBe(200);
    const [cookie] = cookiesDa(resposta);
    expect(cookie).toMatch(new RegExp(`^__Host-barchop_cliente_${slug}=[^;]+`));
    expect(cookie).toContain("HttpOnly");
    await app.close();
  });

  it("login de outra origem não põe cookie", async () => {
    const app = buildApp();
    const { slug } = await criarBarbeariaComToken(app);

    const resposta = await loginDoCliente(app, slug, PAINEL);

    expect(resposta.statusCode).toBe(200);
    expect(cookiesDa(resposta)).toHaveLength(0);
    await app.close();
  });

  it("o cookie vale só na página da própria barbearia", async () => {
    const app = buildApp();
    const { slug } = await criarBarbeariaComToken(app, "um");
    const outra = await criarBarbeariaComToken(app, "dois");
    const cookie = parDo(cookiesDa(await loginDoCliente(app, slug, daBarbearia(slug)))[0]);
    const escolha = { "x-barchop-barbearia": slug };

    expect((await clientesMe(app, { cookie, ...escolha, origin: daBarbearia(slug) })).statusCode).toBe(200);
    // A página de outra barbearia escolhendo este cookie.
    expect((await clientesMe(app, { cookie, ...escolha, origin: daBarbearia(outra.slug) })).statusCode).toBe(401);
    // O painel, que não é página de barbearia.
    expect((await clientesMe(app, { cookie, ...escolha, origin: PAINEL })).statusCode).toBe(401);
    // Sem dizer de qual barbearia: nenhum cookie é lido.
    expect((await clientesMe(app, { cookie, origin: daBarbearia(slug) })).statusCode).toBe(401);
    await app.close();
  });

  it("o cookie de uma barbearia, posto com o nome de outra, não vale", async () => {
    const app = buildApp();
    const { slug } = await criarBarbeariaComToken(app, "um");
    const outra = await criarBarbeariaComToken(app, "dois");
    const [, token] = parDo(cookiesDa(await loginDoCliente(app, slug, daBarbearia(slug)))[0]).split("=");

    const resposta = await clientesMe(app, {
      cookie: `__Host-barchop_cliente_${outra.slug}=${token}`,
      "x-barchop-barbearia": outra.slug,
      origin: daBarbearia(outra.slug),
    });

    expect(resposta.statusCode).toBe(401);
    await app.close();
  });

  it("sair apaga o cookie da barbearia", async () => {
    const app = buildApp();
    const { slug } = await criarBarbeariaComToken(app);

    const resposta = await app.inject({
      method: "POST",
      url: `/barbearias/${slug}/auth/cliente/sair`,
      headers: { origin: daBarbearia(slug) },
    });

    expect(resposta.statusCode).toBe(204);
    expect(cookiesDa(resposta)[0]).toMatch(new RegExp(`^__Host-barchop_cliente_${slug}=;.*Max-Age=0`));
    await app.close();
  });
});

describe("sessão do suporte por cookie", () => {
  async function loginDoSuporte(app: App, origem: string) {
    await criarOperadorDeSuporte({ nome: "Suporte", email: "suporte@barchop.com.br", senha: "senha-do-suporte-123" });
    return app.inject({
      method: "POST",
      url: "/suporte/login",
      headers: { origin: origem },
      payload: { email: "suporte@barchop.com.br", senha: "senha-do-suporte-123" },
    });
  }

  it("cookie de 2 horas, aceito só do painel", async () => {
    const app = buildApp();
    await criarBarbeariaComToken(app);
    const resposta = await loginDoSuporte(app, PAINEL);
    const [cookie] = cookiesDa(resposta);

    expect(cookie).toMatch(/^__Host-barchop_suporte=[^;]+/);
    expect(cookie).toContain(`Max-Age=${2 * 60 * 60}`);
    const par = parDo(cookie);
    const fila = (origem: string) =>
      app.inject({ method: "GET", url: "/suporte/pix", headers: { cookie: par, origin: origem } });
    expect((await fila(PAINEL)).statusCode).toBe(200);
    expect((await fila(daBarbearia("barbearia-um"))).statusCode).toBe(401);
    await app.close();
  });

  it("o cookie do painel não abre o suporte, nem o do suporte abre o painel", async () => {
    const app = buildApp();
    await criarBarbeariaComToken(app);
    const doPainel = parDo(cookiesDa(await loginDoPainel(app, PAINEL))[0]);
    const doSuporte = parDo(cookiesDa(await loginDoSuporte(app, PAINEL))[0]);

    const suporteComPainel = await app.inject({
      method: "GET",
      url: "/suporte/pix",
      headers: { cookie: doPainel, origin: PAINEL },
    });
    const painelComSuporte = await me(app, { cookie: doSuporte, origin: PAINEL });

    expect(suporteComPainel.statusCode).toBe(401);
    expect(painelComSuporte.statusCode).toBe(401);
    await app.close();
  });

  it("sair do suporte apaga só o cookie dele", async () => {
    const app = buildApp();

    const resposta = await app.inject({ method: "POST", url: "/suporte/sair", headers: { origin: PAINEL } });

    expect(resposta.statusCode).toBe(204);
    const cookies = cookiesDa(resposta);
    expect(cookies).toHaveLength(1);
    expect(cookies[0]).toMatch(/^__Host-barchop_suporte=;.*Max-Age=0/);
    await app.close();
  });
});

describe("CORS com credenciais", () => {
  it("a origem permitida recebe Allow-Credentials; a de fora, nada", async () => {
    const app = buildApp();

    const permitida = await app.inject({
      method: "OPTIONS",
      url: "/me",
      headers: {
        origin: PAINEL,
        "access-control-request-method": "GET",
        "access-control-request-headers": "x-barchop-barbearia",
      },
    });
    const deFora = await app.inject({
      method: "OPTIONS",
      url: "/me",
      headers: { origin: "https://malicioso.example", "access-control-request-method": "GET" },
    });

    expect(permitida.headers["access-control-allow-origin"]).toBe(PAINEL);
    expect(permitida.headers["access-control-allow-credentials"]).toBe("true");
    expect(String(permitida.headers["access-control-allow-headers"])).toContain("x-barchop-barbearia");
    expect(deFora.headers["access-control-allow-origin"]).toBeUndefined();
    expect(deFora.headers["access-control-allow-credentials"]).toBeUndefined();
    await app.close();
  });
});

describe("troca de senha pelo código", () => {
  it("o /auth/senha do painel põe o cookie novo, que sobrevive ao carimbo da troca", async () => {
    // A troca carimba senhaAlteradaEm e derruba as sessões antigas: se o
    // cookie ficasse com o token velho, a pessoa cairia logo depois de
    // trocar a senha.
    const app = buildApp();
    await criarBarbeariaComToken(app);
    const { emitirCodigo } = await import("../../src/lib/codigos");
    const codigo = await emitirCodigo({ finalidade: "senha_barbeiro", destino: "um@exemplo.com", barbeariaId: null });

    const resposta = await app.inject({
      method: "POST",
      url: "/auth/senha",
      headers: { origin: PAINEL },
      payload: { email: "um@exemplo.com", codigo, senha: "senha-nova-456" },
    });

    expect(resposta.statusCode).toBe(200);
    const cookie = parDo(cookiesDa(resposta)[0]);
    expect((await me(app, { cookie, origin: PAINEL })).statusCode).toBe(200);
    await app.close();
  });
});
