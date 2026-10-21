import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EntradaDaTela } from "../../src/movimento/EntradaDaTela";
import { CURVA, DURACAO, curvaCss } from "../../src/movimento/tokens";
import { navegacaoFalsa } from "../ajudantes/navegacao";

// O jsdom não tem Web Animations API. O dublê registra a chamada; quem
// desenha o fade é o navegador.
const animar = vi.fn(() => ({ cancel: vi.fn() }) as unknown as Animation);

function arvore() {
  return (
    <EntradaDaTela className="container">
      <p>conteúdo da tela</p>
    </EntradaDaTela>
  );
}

function trocarDeRota(rerender: (ui: React.ReactNode) => void): void {
  navegacaoFalsa.pathname = "/painel/agenda";
  rerender(arvore());
}

describe("EntradaDaTela", () => {
  beforeEach(() => {
    navegacaoFalsa.redefinir({ pathname: "/painel/hoje" });
    animar.mockClear();
    HTMLElement.prototype.animate = animar;
  });

  afterEach(() => {
    delete (HTMLElement.prototype as Partial<HTMLElement>).animate;
  });

  it("renderiza os filhos no container com a classe recebida", () => {
    render(arvore());
    expect(screen.getByText("conteúdo da tela").parentElement).toHaveClass("container");
  });

  it("não anima na montagem: o HTML do servidor fica como veio", () => {
    render(arvore());
    expect(animar).not.toHaveBeenCalled();
  });

  it("anima quando a rota muda, com a duração e a curva dos tokens", () => {
    const { rerender } = render(arvore());
    trocarDeRota(rerender);
    expect(animar).toHaveBeenCalledTimes(1);
    expect(animar).toHaveBeenCalledWith([{ opacity: 0 }, { opacity: 1 }], {
      duration: DURACAO.media * 1000,
      easing: curvaCss(CURVA.entrada),
    });
  });

  it("só mexe em opacity: a barra fixa das telas não pode mudar de referência", () => {
    const { rerender } = render(arvore());
    trocarDeRota(rerender);
    const [quadros] = animar.mock.calls[0] as unknown as [Keyframe[]];
    expect(quadros.flatMap((quadro) => Object.keys(quadro))).toEqual(["opacity", "opacity"]);
  });

  it("não remonta a tela na troca de rota (o estado sobrevive)", () => {
    const { rerender } = render(arvore());
    const antes = screen.getByText("conteúdo da tela");
    trocarDeRota(rerender);
    expect(screen.getByText("conteúdo da tela")).toBe(antes);
  });

  it("sem a API no navegador, a tela só troca", () => {
    delete (HTMLElement.prototype as Partial<HTMLElement>).animate;
    const { rerender } = render(arvore());
    expect(() => trocarDeRota(rerender)).not.toThrow();
  });
});
