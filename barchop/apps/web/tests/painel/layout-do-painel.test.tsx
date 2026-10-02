import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { criarApiClientFalso } from "@barchop/api-client";
import { LayoutDoPainel } from "../../src/painel/LayoutDoPainel";
import { ProvedorDoPainel } from "../../src/painel/ProvedorDoPainel";
import { SessaoDoPainel } from "../../src/painel/SessaoDoPainel";
import {
  sessaoDaBarbearia,
  sessaoDoBarbeiro,
} from "../../src/sessao/armazenamento";
import { navegacaoFalsa } from "../ajudantes/navegacao";

// jsdom não implementa matchMedia, e a barra lateral lê o tema do
// sistema na montagem. Ver tests/painel/navegacao-do-painel.test.tsx.
function stubMatchMedia(): void {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

function montar() {
  const falso = criarApiClientFalso();
  render(
    <ProvedorDoPainel valor={{ barbeiro: falso.barbeiro, publico: falso.publico }}>
      <SessaoDoPainel>
        <LayoutDoPainel>
          <p>conteúdo da tela</p>
        </LayoutDoPainel>
      </SessaoDoPainel>
    </ProvedorDoPainel>
  );
}

describe("shell do painel", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
    stubMatchMedia();
    navegacaoFalsa.redefinir({ pathname: "/painel" });
    sessaoDoBarbeiro.gravar("jwt");
    sessaoDaBarbearia.gravar("gr-barber");
  });

  it("põe a tela dentro do <main>, e não ao lado da navegação", async () => {
    montar();

    // O conteúdo precisa estar DENTRO do main: era isso que faltava
    // quando cada tela centrava a si mesma e o layout só empilhava
    // navegação e children como irmãos.
    const principal = await screen.findByRole("main");
    expect(principal).toContainElement(screen.getByText("conteúdo da tela"));
  });

  it("expõe a navegação como landmark próprio, com nome", async () => {
    montar();

    // Nome no <nav> porque a barra lateral não é a única navegação da
    // página — sem rótulo, quem navega por landmark recebe dois "nav"
    // indistinguíveis.
    const navegacao = await screen.findByRole("navigation", {
      name: "Seções do painel",
    });
    expect(navegacao).toBeInTheDocument();
    // E a navegação fica FORA do main: dentro, ela seria relida como
    // parte do conteúdo a cada troca de tela.
    expect(screen.getByRole("main")).not.toContainElement(navegacao);
  });
});
