import { describe, expect, it } from "vitest";
import { metadata } from "../../app/(publico)/[slug]/lembrete/[token]/page";

// O token do link do lembrete está na URL desta página, e ele confirma
// ou cancela um horário. Sem `no-referrer`, a URL inteira sairia no
// cabeçalho Referer pra qualquer recurso de fora (fonte, link do
// Instagram da barbearia); sem `noindex`, um buscador que a achasse
// guardaria o link.
describe("página do link do lembrete", () => {
  it("não manda a URL com o token como Referer", () => {
    expect(metadata.referrer).toBe("no-referrer");
  });

  it("não deixa buscador indexar nem seguir", () => {
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });
});
