import { describe, expect, it, vi } from "vitest";

// Ver tests/app/layout.test.tsx: as fontes só existem dentro do build
// do Next.
vi.mock("next/font/local", () => ({
  default: () => ({ variable: "fonte-display" }),
}));

vi.mock("next/font/google", () => ({
  Inter: () => ({ variable: "fonte-corpo" }),
}));

import { metadata } from "../../app/(marketing)/page";
import { metadata as metadataDoLayoutRaiz } from "../../app/layout";

// A home é a página que o buscador mostra pra quem procura agenda de
// barbearia: título e descrição próprios, não os padrões do layout.
describe("página da home do site", () => {
  it("tem título e descrição de quem vende o produto", () => {
    expect(metadata.title).toMatch(/BarChop/);
    expect(metadata.description).toMatch(/barbearia/i);
  });

  it("monta a prévia do link com o mesmo título e descrição", () => {
    // É o que aparece quando alguém cola barchop.com.br no WhatsApp.
    expect(metadata.openGraph).toMatchObject({
      type: "website",
      locale: "pt_BR",
      siteName: "BarChop",
      url: "/",
      title: metadata.title,
      description: metadata.description,
    });
  });
});

describe("layout raiz", () => {
  it("descreve o produto, não só o assunto", () => {
    // Vale pra toda página sem descrição própria (o painel, por exemplo).
    expect(metadataDoLayoutRaiz.description).toMatch(/BarChop/);
    expect(metadataDoLayoutRaiz.description).toMatch(/barbearias/i);
  });
});
