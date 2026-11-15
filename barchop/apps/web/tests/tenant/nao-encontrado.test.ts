import { describe, expect, it } from "vitest";
import { versaoDoNaoEncontrado } from "../../src/tenant/naoEncontrado";

// Qual 404 mostrar (canvas "Página não encontrada", aprovado 15/11): o do
// painel, o da barbearia ou o do site. Quem diz é o que o proxy mandou: o
// caminho pedido e, no host da barbearia, o nome dela.
describe("versão da página não encontrada", () => {
  it("dentro do painel, a do painel", () => {
    expect(versaoDoNaoEncontrado({ caminho: "/painel/agendaa", barbearia: null })).toBe("painel");
    expect(versaoDoNaoEncontrado({ caminho: "/painel", barbearia: null })).toBe("painel");
  });

  it("no host de uma barbearia, a da barbearia", () => {
    expect(versaoDoNaoEncontrado({ caminho: "/", barbearia: "nome-errado" })).toBe("barbearia");
    expect(versaoDoNaoEncontrado({ caminho: "/agendar", barbearia: "nome-errado" })).toBe("barbearia");
  });

  it("no /<slug> do desenvolvimento, a da barbearia", () => {
    expect(versaoDoNaoEncontrado({ caminho: "/nao-existe", barbearia: null })).toBe("barbearia");
    expect(versaoDoNaoEncontrado({ caminho: "/nao-existe/agendar", barbearia: null })).toBe("barbearia");
  });

  it("no site, o resto: reservados, o que não é slug e sem caminho", () => {
    expect(versaoDoNaoEncontrado({ caminho: "/blog", barbearia: null })).toBe("site");
    expect(versaoDoNaoEncontrado({ caminho: "/home", barbearia: null })).toBe("site");
    expect(versaoDoNaoEncontrado({ caminho: "/wp-login.php", barbearia: null })).toBe("site");
    expect(versaoDoNaoEncontrado({ caminho: null, barbearia: null })).toBe("site");
  });

  it("só o segmento inteiro conta como o painel", () => {
    expect(versaoDoNaoEncontrado({ caminho: "/painelzinho", barbearia: null })).toBe("barbearia");
  });

  it("a query não confunde", () => {
    expect(versaoDoNaoEncontrado({ caminho: "/painel/x?dia=2026-11-15", barbearia: null })).toBe("painel");
    expect(versaoDoNaoEncontrado({ caminho: "/blog?x=1", barbearia: null })).toBe("site");
  });
});
