import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `next/font/local` só existe dentro do build do Next: o dublê devolve só o `.variable`.
vi.mock("next/font/local", () => ({
  default: ({ variable }: { variable: string }) => ({ variable }),
}));

const tocar = vi.fn();
vi.mock("../../src/site/abertura/tocar", () => ({ tocar }));

import { AberturaDaHome } from "../../src/site/AberturaDaHome";
import { CabecalhoDaHome } from "../../src/site/CabecalhoDaHome";
import { Home } from "../../src/site/Home";
import { TopoDaHome } from "../../src/site/TopoDaHome";
import { depoisDaAbertura } from "../../src/site/abertura/fim";
import { CLASSE_DA_ABERTURA, SCRIPT_DA_ABERTURA } from "../../src/site/abertura/script";

// Home nova, marco 5: a abertura é o próprio topo no primeiro estado. As
// peças dela (a agenda do dia, a navalha, os cantos e o botão de pular)
// moram no topo e só aparecem com a classe que o script inline põe no
// <html>; o código que toca só é baixado quando a classe está lá.

const html = () => document.documentElement;

describe("abertura da home", () => {
  beforeEach(() => {
    tocar.mockReset();
    html().classList.remove(CLASSE_DA_ABERTURA);
  });

  afterEach(() => {
    html().classList.remove(CLASSE_DA_ABERTURA);
  });

  it("a home leva o script que decide a abertura antes da primeira pintura", () => {
    const { container } = render(<Home />);
    const scripts = [...container.querySelectorAll("script")].map((s) => s.innerHTML);
    expect(scripts).toContain(SCRIPT_DA_ABERTURA);
  });

  it("o topo tem o botão de pular, com nome, que quem usa teclado alcança", () => {
    render(<TopoDaHome />);
    const pular = screen.getByRole("button", { name: "Pular abertura" });
    expect(pular).toHaveAttribute("type", "button");
    expect(pular).not.toHaveAttribute("tabindex", "-1");
  });

  it("a agenda do dia, a navalha e os cantos são só desenho pro leitor de tela", () => {
    const { container } = render(<TopoDaHome />);
    for (const peca of ["[data-agenda]", "[data-navalha]", "[data-cantos]", "[data-fios]"]) {
      expect(container.querySelector(peca)).toHaveAttribute("aria-hidden", "true");
    }
    // Dez horários, quatro profissionais e os agendamentos que a navalha acende.
    expect(container.querySelectorAll("[data-agenda] [data-bloco]").length).toBeGreaterThan(10);
    expect(container.querySelector("[data-contador]")).toHaveTextContent("8");
  });

  it("o cabeçalho marca o ícone onde o B pousa", () => {
    const { container } = render(<CabecalhoDaHome topo="topo-da-home" />);
    expect(container.querySelector("[data-marca-da-nav] svg")).not.toBeNull();
  });

  it("sem a classe no <html>, nada da abertura é baixado", async () => {
    render(<AberturaDaHome />);
    await new Promise((r) => setTimeout(r, 0));
    expect(tocar).not.toHaveBeenCalled();
  });

  it("com a classe, toca no topo", async () => {
    html().classList.add(CLASSE_DA_ABERTURA);
    render(
      <section data-topo="">
        <AberturaDaHome />
      </section>
    );
    await waitFor(() => expect(tocar).toHaveBeenCalledTimes(1));
    expect(tocar.mock.calls[0][0]).toMatchObject({ topo: expect.any(HTMLElement) });
  });
});

describe("depoisDaAbertura", () => {
  afterEach(() => {
    html().classList.remove(CLASSE_DA_ABERTURA);
  });

  it("sem abertura, segue na hora", async () => {
    await expect(depoisDaAbertura()).resolves.toBeUndefined();
  });

  it("com abertura, espera a classe sair do <html> (pelo fim ou pela trava)", async () => {
    html().classList.add(CLASSE_DA_ABERTURA);
    let seguiu = false;
    void depoisDaAbertura().then(() => {
      seguiu = true;
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(seguiu).toBe(false);

    await act(async () => {
      html().classList.remove(CLASSE_DA_ABERTURA);
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(seguiu).toBe(true);
  });
});
