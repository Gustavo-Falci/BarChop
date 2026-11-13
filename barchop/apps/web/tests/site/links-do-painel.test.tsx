import type { AnchorHTMLAttributes } from "react";
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// O dublê marca o que sai do <Link> do Next: é ele que pré-carrega e
// navega por fetch.
vi.mock("next/link", () => ({
  default: ({ href, ...resto }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a data-next-link="" href={href} {...resto} />
  ),
}));
vi.mock("next/font/local", () => ({
  default: ({ variable }: { variable: string }) => ({ variable }),
}));

import { CabecalhoDaHome } from "../../src/site/CabecalhoDaHome";
import { CabecalhoDoSite } from "../../src/site/CabecalhoDoSite";
import { TabelaDePrecos } from "../../src/site/TabelaDePrecos";
import { TopoDaHome } from "../../src/site/TopoDaHome";

// No host do site, /painel/* é 308 pro host `painel.` (src/tenant/rota.ts).
// O <Link> do Next pré-carregava esse caminho por fetch, seguia o 308 pra
// outra origem e o navegador barrava (CORS) — console cheio de erro e o
// clique tentando fetch antes de navegar. Link do painel é <a> comum.
describe("links do site pro painel", () => {
  const telas = {
    "cabeçalho do site": <CabecalhoDoSite />,
    "cabeçalho da home": <CabecalhoDaHome topo="topo-da-home" />,
    "topo da home": <TopoDaHome />,
    "tabela de preços": <TabelaDePrecos />,
  };

  for (const [nome, tela] of Object.entries(telas)) {
    it(`${nome}: o painel abre por navegação comum, sem o Link do Next`, () => {
      const { container } = render(tela);
      const doPainel = [...container.querySelectorAll<HTMLAnchorElement>('a[href^="/painel"]')];
      expect(doPainel.length).toBeGreaterThan(0);
      for (const link of doPainel) {
        expect({ href: link.getAttribute("href"), nextLink: link.hasAttribute("data-next-link") }).toEqual({
          href: link.getAttribute("href"),
          nextLink: false,
        });
      }
    });
  }

  it("as páginas do próprio site seguem com o Link do Next", () => {
    const { container } = render(<CabecalhoDoSite />);
    expect(container.querySelector('a[href="/precos"]')).toHaveAttribute("data-next-link");
  });
});
