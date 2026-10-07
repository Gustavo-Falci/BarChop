import { describe, expect, it } from "vitest";
import { linkDaBarbearia, mensagemDoLink, urlDoWhatsApp } from "../../src/painel/compartilhar";

// O que a janela de compartilhar (painel v2, marco 4) manda: o endereço
// inteiro da página da barbearia e a frase que vai junto.
describe("link da barbearia", () => {
  it("com o site configurado, é o host da barbearia", () => {
    expect(linkDaBarbearia("gr-barber", "https://barchop.com.br", "https://painel.barchop.com.br")).toBe(
      "https://gr-barber.barchop.com.br"
    );
  });

  it("sem o site (desenvolvimento), é o caminho no host atual", () => {
    // O link vai pro WhatsApp: precisa abrir fora do painel.
    expect(linkDaBarbearia("gr-barber", undefined, "http://localhost:3000")).toBe(
      "http://localhost:3000/gr-barber"
    );
  });
});

describe("mensagem e WhatsApp", () => {
  it("convida a agendar, com o nome da casa e o link", () => {
    expect(mensagemDoLink("GR Barber", "https://gr-barber.barchop.com.br")).toBe(
      "Agende seu horário na GR Barber pelo link: https://gr-barber.barchop.com.br"
    );
  });

  it("abre o WhatsApp sem número, com a mensagem pronta", () => {
    // Sem número: quem compartilha escolhe o contato ou o grupo.
    const url = new URL(urlDoWhatsApp("GR Barber", "https://gr-barber.barchop.com.br"));

    expect(url.origin + url.pathname).toBe("https://wa.me/");
    expect(url.searchParams.get("text")).toBe(
      "Agende seu horário na GR Barber pelo link: https://gr-barber.barchop.com.br"
    );
  });
});
