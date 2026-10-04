import { describe, expect, it } from "vitest";
import { destinoDoSlugAntigo, enderecoDaBarbearia, noHostDaBarbearia } from "../../src/tenant/endereco";

// O endereço que o dono vê e divulga: o host próprio da barbearia
// quando o site está configurado, o caminho /<slug> sem ele.
describe("enderecoDaBarbearia", () => {
  it("com o site configurado, o host próprio", () => {
    expect(enderecoDaBarbearia("gr-barber", "https://barchop.com.br/")).toBe(
      "https://gr-barber.barchop.com.br"
    );
    expect(enderecoDaBarbearia("gr-barber", "http://localhost:3000")).toBe(
      "http://gr-barber.localhost:3000"
    );
  });

  it("sem ele, o caminho", () => {
    expect(enderecoDaBarbearia("gr-barber", undefined)).toBe("/gr-barber");
    expect(enderecoDaBarbearia("gr-barber", "")).toBe("/gr-barber");
  });
});

// As telas montam os caminhos com o slug na frente (`/gr-barber/agendar`).
// No host da barbearia o slug já está no host, e o caminho limpo é o
// que aparece na barra de endereço e no link copiado.
describe("noHostDaBarbearia", () => {
  it("no host da barbearia, tira o slug da frente", () => {
    expect(noHostDaBarbearia("/gr-barber", "gr-barber", "gr-barber")).toBe("/");
    expect(noHostDaBarbearia("/gr-barber/agendar?servicos=s1", "gr-barber", "gr-barber")).toBe(
      "/agendar?servicos=s1"
    );
    expect(noHostDaBarbearia("/gr-barber?x=1", "gr-barber", "gr-barber")).toBe("/?x=1");
  });

  it("só o segmento inteiro conta como o slug", () => {
    expect(noHostDaBarbearia("/gr-barberia", "gr-barber", "gr-barber")).toBe("/gr-barberia");
  });

  it("fora do host da barbearia, o caminho fica como está", () => {
    expect(noHostDaBarbearia("/gr-barber/agendar", "gr-barber", null)).toBe("/gr-barber/agendar");
    expect(noHostDaBarbearia("/gr-barber/agendar", "gr-barber", "outra")).toBe("/gr-barber/agendar");
  });
});

// O slug foi trocado e alguém chegou pelo antigo (a API acha a
// barbearia e diz o atual). O resto do caminho vai junto: o link do
// lembrete num e-mail já enviado é /<antigo>/lembrete/<token>, e sem o
// caminho o token se perderia.
describe("destinoDoSlugAntigo", () => {
  const site = "https://barchop.com.br";

  it("slug atual: fica onde está", () => {
    expect(
      destinoDoSlugAntigo({ pedido: "gr-barber", atual: "gr-barber", caminho: "/", barbeariaDoHost: null, site })
    ).toBeNull();
  });

  it("pelo caminho, troca o slug e mantém o resto e a query", () => {
    expect(
      destinoDoSlugAntigo({
        pedido: "antigo",
        atual: "novo",
        caminho: "/antigo/lembrete/aaa.bbb.ccc?x=1",
        barbeariaDoHost: null,
        site: undefined,
      })
    ).toBe("/novo/lembrete/aaa.bbb.ccc?x=1");
    expect(
      destinoDoSlugAntigo({ pedido: "antigo", atual: "novo", caminho: "/antigo", barbeariaDoHost: null, site: undefined })
    ).toBe("/novo");
  });

  it("pelo host da barbearia, vai pro host novo com o mesmo caminho", () => {
    expect(
      destinoDoSlugAntigo({
        pedido: "antigo",
        atual: "novo",
        caminho: "/lembrete/aaa.bbb.ccc",
        barbeariaDoHost: "antigo",
        site,
      })
    ).toBe("https://novo.barchop.com.br/lembrete/aaa.bbb.ccc");
  });

  it("pelo host da barbearia com o slug na frente do caminho, tira ele", () => {
    expect(
      destinoDoSlugAntigo({
        pedido: "antigo",
        atual: "novo",
        caminho: "/antigo/agendar",
        barbeariaDoHost: "antigo",
        site,
      })
    ).toBe("https://novo.barchop.com.br/agendar");
  });
});
