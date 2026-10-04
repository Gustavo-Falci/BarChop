import { describe, expect, it, vi } from "vitest";
import { canalComposto, canalDeMemoria, canalDoAmbiente } from "../../src/lib/canal";
import { canalDeWhatsApp } from "../../src/lib/canal-whatsapp";

function fetchQueResponde(status: number, corpo: unknown = { messages: [{ id: "wamid.x" }] }) {
  return vi.fn(async () => new Response(JSON.stringify(corpo), { status }));
}

const config = { token: "EAAteste", numeroId: "1234567890" };

describe("canal de WhatsApp (Cloud API da Meta)", () => {
  it("manda o modelo aprovado pro número, com os parâmetros no corpo", async () => {
    const fetch = fetchQueResponde(200);
    const canal = canalDeWhatsApp({ ...config, fetch });

    await canal.enviar({
      para: "(11) 99999-8888",
      texto: "Seu código: 123456",
      modelo: { nome: "codigo_de_acesso", parametros: ["123456"] },
    });

    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://graph.facebook.com/v21.0/1234567890/messages");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer EAAteste");
    expect(JSON.parse(init.body as string)).toEqual({
      messaging_product: "whatsapp",
      to: "5511999998888",
      type: "template",
      template: {
        name: "codigo_de_acesso",
        language: { code: "pt_BR" },
        components: [{ type: "body", parameters: [{ type: "text", text: "123456" }] }],
      },
    });
  });

  it("sem modelo não manda: a Meta só entrega mensagem iniciada pela empresa com modelo aprovado", async () => {
    // Texto livre seria aceito pela API e descartado na entrega — o
    // cliente nunca receberia, e nada avisaria.
    const fetch = fetchQueResponde(200);
    const canal = canalDeWhatsApp({ ...config, fetch });

    await expect(canal.enviar({ para: "(11) 99999-8888", texto: "oi" })).rejects.toThrow(/modelo/);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("recusa destino que não é telefone", async () => {
    const canal = canalDeWhatsApp({ ...config, fetch: fetchQueResponde(200) });

    await expect(
      canal.enviar({ para: "dono@barbearia.com", texto: "oi", modelo: { nome: "x", parametros: [] } })
    ).rejects.toThrow(/telefone/);
  });

  it("erro da Meta lança só com o status, sem o corpo (que ecoa o número)", async () => {
    const canal = canalDeWhatsApp({ ...config, fetch: fetchQueResponde(400, { error: { message: "5511999998888 inválido" } }) });

    const erro = await canal
      .enviar({ para: "(11) 99999-8888", texto: "oi", modelo: { nome: "x", parametros: [] } })
      .catch((e: Error) => e);

    expect((erro as Error).message).toMatch(/400/);
    expect((erro as Error).message).not.toContain("5511999998888");
  });

  it("só sabe entregar pra telefone", () => {
    expect(canalDeWhatsApp(config).destinos).toEqual(["telefone"]);
  });
});

describe("canalComposto", () => {
  it("e-mail vai pro canal de e-mail, telefone pro de WhatsApp", async () => {
    const email = { ...canalDeMemoria(), destinos: ["email"] as const };
    const whatsapp = { ...canalDeMemoria(), destinos: ["telefone"] as const };
    const canal = canalComposto(email, whatsapp);

    await canal.enviar({ para: "dono@barbearia.com", texto: "a" });
    await canal.enviar({ para: "(11) 99999-8888", texto: "b" });

    expect(email.enviadas.map((m) => m.texto)).toEqual(["a"]);
    expect(whatsapp.enviadas.map((m) => m.texto)).toEqual(["b"]);
    expect(canal.destinos).toEqual(["email", "telefone"]);
  });
});

describe("WHATSAPP_ATIVO no canalDoAmbiente", () => {
  const log = { info: vi.fn() };
  const comEmail = {
    NODE_ENV: "production",
    CANAL_DE_MENSAGEM: "email",
    RESEND_API_KEY: "re_x",
    EMAIL_REMETENTE: "BarChop <a@barchop.com.br>",
  };

  it("desligada (ausente), nada muda: só e-mail", () => {
    expect(canalDoAmbiente(log, comEmail).destinos).toEqual(["email"]);
  });

  it("ligada, junta o WhatsApp pros telefones", () => {
    const canal = canalDoAmbiente(log, {
      ...comEmail,
      WHATSAPP_ATIVO: "true",
      WHATSAPP_TOKEN: "EAAx",
      WHATSAPP_NUMERO_ID: "123",
    });

    expect(canal.destinos).toEqual(["email", "telefone"]);
  });

  it("ligada sem credencial, a API não sobe", () => {
    expect(() => canalDoAmbiente(log, { ...comEmail, WHATSAPP_ATIVO: "true" })).toThrow(/WHATSAPP_TOKEN/);
    expect(() =>
      canalDoAmbiente(log, { ...comEmail, WHATSAPP_ATIVO: "true", WHATSAPP_TOKEN: "EAAx" })
    ).toThrow(/WHATSAPP_NUMERO_ID/);
  });

  it("valor torto é erro, não desligada em silêncio", () => {
    expect(() => canalDoAmbiente(log, { ...comEmail, WHATSAPP_ATIVO: "sim" })).toThrow(/WHATSAPP_ATIVO/);
  });

  it("false explícito também é desligada", () => {
    expect(canalDoAmbiente(log, { ...comEmail, WHATSAPP_ATIVO: "false" }).destinos).toEqual(["email"]);
  });
});
