import { describe, expect, it, vi } from "vitest";

// Ver tests/app/layout.test.tsx: as fontes só existem dentro do build
// do Next.
vi.mock("next/font/local", () => ({
  default: ({ variable }: { variable: string }) => ({ variable }),
}));

import { metadata } from "../../app/(marketing)/page";
import { metadata as metadataDoLayoutRaiz } from "../../app/layout";
import { metadata as metadataDoGratis } from "../../app/(marketing)/(paginas)/gratis/page";
import { metadata as metadataDosPrecos } from "../../app/(marketing)/(paginas)/precos/page";
import { metadata as metadataDaPrivacidade } from "../../app/(marketing)/(paginas)/privacidade/page";
import { metadata as metadataDosTermos } from "../../app/(marketing)/(paginas)/termos/page";
import { paginasDoSitemap } from "../../src/site/rastreadores";

// A home é a página que o buscador mostra pra quem procura agenda de
// barbearia: título e descrição próprios, não os padrões do layout.
describe("página da home do site", () => {
  it("tem título e descrição de quem vende o produto", () => {
    expect(metadata.title).toMatch(/BarChop/);
    expect(metadata.description).toMatch(/barbearia/i);
  });

  it("a descrição fala do teste de 14 dias, não do lançamento", () => {
    expect(metadata.description).toMatch(/14 dias/);
    expect(metadata.description).not.toMatch(/lançamento/i);
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

// O canonical diz ao buscador qual é o endereço da página: o mesmo
// conteúdo chega por outros hosts (o www antes do redirect, `gr.` e os
// outros nomes reservados), e sem ele cada um conta como uma cópia. O
// caminho é relativo: o metadataBase do layout do site o completa.
describe("canonical das páginas do site", () => {
  const PAGINAS = {
    "/": metadata,
    "/precos": metadataDosPrecos,
    "/gratis": metadataDoGratis,
    "/termos": metadataDosTermos,
    "/privacidade": metadataDaPrivacidade,
  };

  it.each(Object.entries(PAGINAS))("%s aponta pra si mesma", (caminho, dados) => {
    expect(dados.alternates?.canonical).toBe(caminho);
  });

  it("cobre as mesmas páginas do sitemap", () => {
    const doSitemap = paginasDoSitemap("https://barchop.com.br").map(
      ({ url }) => new URL(url).pathname
    );
    expect(Object.keys(PAGINAS).sort()).toEqual(doSitemap.sort());
  });
});
