import { describe, expect, it, vi } from "vitest";
import { canalDeMemoria, canalDoAmbiente } from "../../src/lib/canal";

const log = { info: vi.fn() };

describe("canal de mensagem", () => {
  it("o de memória guarda o que foi enviado, pra os testes lerem", async () => {
    const canal = canalDeMemoria();

    await canal.enviar({ para: "(11) 99999-8888", texto: "Seu código: 123456" });

    expect(canal.enviadas).toEqual([
      { para: "(11) 99999-8888", texto: "Seu código: 123456" },
    ]);
  });

  it("em desenvolvimento, sem provedor, o código vai pro log da API", async () => {
    log.info.mockClear();
    const canal = canalDoAmbiente(log, { NODE_ENV: "development" });

    await canal.enviar({ para: "(11) 99999-8888", texto: "Seu código: 123456" });

    expect(log.info).toHaveBeenCalledOnce();
    expect(JSON.stringify(log.info.mock.calls[0])).toContain("123456");
  });

  it("nos testes, o padrão é o de memória", () => {
    expect(canalDoAmbiente(log, { NODE_ENV: "test" }).nome).toBe("memoria");
  });

  it("em produção se recusa a subir mandando código pro log", () => {
    // Código no log é conta de qualquer um que leia o log. Melhor a API
    // não subir do que subir assim sem ninguém perceber.
    expect(() => canalDoAmbiente(log, { NODE_ENV: "production" })).toThrow(
      /CANAL_DE_MENSAGEM/
    );
    expect(() =>
      canalDoAmbiente(log, { NODE_ENV: "production", CANAL_DE_MENSAGEM: "log" })
    ).toThrow(/CANAL_DE_MENSAGEM/);
  });

  it("canal desconhecido é erro de configuração, não um padrão silencioso", () => {
    expect(() =>
      canalDoAmbiente(log, { NODE_ENV: "development", CANAL_DE_MENSAGEM: "pombo" })
    ).toThrow(/pombo/);
  });

  it("com CANAL_DE_MENSAGEM=email e as credenciais, sobe o canal de e-mail — inclusive em produção", () => {
    const env = {
      NODE_ENV: "production",
      CANAL_DE_MENSAGEM: "email",
      RESEND_API_KEY: "re_teste",
      EMAIL_REMETENTE: "BarChop <nao-responda@barchop.com.br>",
    };
    expect(canalDoAmbiente(log, env).nome).toBe("email");
  });

  it("e-mail sem chave ou sem remetente é erro de configuração na subida", () => {
    expect(() =>
      canalDoAmbiente(log, {
        NODE_ENV: "production",
        CANAL_DE_MENSAGEM: "email",
        EMAIL_REMETENTE: "x@barchop.com.br",
      })
    ).toThrow(/RESEND_API_KEY/);
    expect(() =>
      canalDoAmbiente(log, {
        NODE_ENV: "production",
        CANAL_DE_MENSAGEM: "email",
        RESEND_API_KEY: "re_teste",
      })
    ).toThrow(/EMAIL_REMETENTE/);
  });
});
