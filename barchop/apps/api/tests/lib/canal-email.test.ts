import { describe, expect, it, vi } from "vitest";
import { canalDeEmail } from "../../src/lib/canal-email";

function fetchQueResponde(status: number, corpo: unknown = { id: "abc" }) {
  return vi.fn(async () => new Response(JSON.stringify(corpo), { status }));
}

const config = { chave: "re_teste", remetente: "BarChop <nao-responda@barchop.com.br>" };

describe("canal de e-mail (Resend)", () => {
  it("posta no Resend com a chave, o remetente, o destino, o assunto e o texto", async () => {
    const fetch = fetchQueResponde(200);
    const canal = canalDeEmail({ ...config, fetch });

    await canal.enviar({
      para: "dono@barbearia.com",
      assunto: "Seu código",
      texto: "Seu código: 123456",
    });

    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer re_teste");
    expect(JSON.parse(init.body as string)).toEqual({
      from: config.remetente,
      to: ["dono@barbearia.com"],
      subject: "Seu código",
      text: "Seu código: 123456",
    });
  });

  it("sem assunto, usa o nome do produto — e-mail sem assunto cai no spam", async () => {
    const fetch = fetchQueResponde(200);
    await canalDeEmail({ ...config, fetch }).enviar({
      para: "dono@barbearia.com",
      texto: "oi",
    });

    const [, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string).subject).toBe("BarChop");
  });

  it("resposta fora de 2xx vira erro com o status, pra quem chama registrar", async () => {
    const canal = canalDeEmail({ ...config, fetch: fetchQueResponde(422, { message: "x" }) });

    await expect(
      canal.enviar({ para: "dono@barbearia.com", texto: "oi" })
    ).rejects.toThrow(/422/);
  });

  it("destino que não é e-mail é recusado antes de gastar a chamada", async () => {
    const fetch = fetchQueResponde(200);
    const canal = canalDeEmail({ ...config, fetch });

    await expect(canal.enviar({ para: "(11) 99999-8888", texto: "oi" })).rejects.toThrow(
      /e-mail/
    );
    expect(fetch).not.toHaveBeenCalled();
  });
});
