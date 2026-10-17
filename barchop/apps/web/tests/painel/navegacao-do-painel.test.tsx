import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { criarApiClientFalso } from "@barchop/api-client";
import { NavegacaoDoPainel } from "../../src/painel/NavegacaoDoPainel";
import { ProvedorDoPainel } from "../../src/painel/ProvedorDoPainel";
import { SessaoDoPainel } from "../../src/painel/SessaoDoPainel";
import { CHAVE_DA_BARRA } from "../../src/painel/barra";
import {
  sessaoDaBarbearia,
  sessaoDoBarbeiro,
} from "../../src/sessao/armazenamento";
import { navegacaoFalsa } from "../ajudantes/navegacao";

// jsdom não implementa matchMedia. Ver tests/painel/tema.test.ts — o mesmo
// stub, local a este arquivo porque só quem lê o sistema precisa dele.
function stubMatchMedia(prefereEscuro: boolean): void {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: prefereEscuro,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

function montar(falso = criarApiClientFalso()) {
  render(
    <ProvedorDoPainel valor={{ barbeiro: falso.barbeiro, publico: falso.publico }}>
      <SessaoDoPainel>
        <NavegacaoDoPainel />
      </SessaoDoPainel>
    </ProvedorDoPainel>
  );
  return falso;
}

describe("navegação do painel", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.removeAttribute("data-barra");
    stubMatchMedia(false);
    sessaoDoBarbeiro.gravar("jwt");
    sessaoDaBarbearia.gravar("gr-barber");
  });

  it("com logo, a marca mostra a logo na moldura dela, e o nome continua escrito", async () => {
    navegacaoFalsa.redefinir({ pathname: "/painel" });
    const falso = criarApiClientFalso();
    await falso.barbeiro.enviarLogo(new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])]), "redonda");

    montar(falso);

    const marca = await screen.findByText("gr-barber");
    const moldura = await waitFor(() => {
      const achada = document.querySelector<HTMLElement>('[data-formato="redonda"]');
      expect(achada).not.toBeNull();
      return achada!;
    });
    expect(marca.closest("strong")).toContainElement(moldura);
    // Decorativa: o nome escrito ao lado já diz de quem é.
    expect(moldura.querySelector("img")).toHaveAttribute("alt", "");
  });

  it("sem logo, a marca segue sendo o nome, sem imagem", async () => {
    navegacaoFalsa.redefinir({ pathname: "/painel" });

    montar();

    await screen.findByText("gr-barber");
    expect(document.querySelector("[data-formato]")).toBeNull();
  });

  it("em /painel, marca Hoje como atual e mais nada", async () => {
    navegacaoFalsa.redefinir({ pathname: "/painel" });

    montar();

    const hoje = await screen.findByRole("link", { name: "Hoje" });
    expect(hoje).toHaveAttribute("aria-current", "page");
    // Se Hoje comparasse por startsWith em vez de igualdade exata, este
    // teste não distinguiria os dois casos — a próxima marcação é quem
    // prova que só uma rota fica marcada por vez.
    expect(screen.getByRole("link", { name: "Agenda" })).not.toHaveAttribute(
      "aria-current"
    );
  });

  it("em /painel/agenda, marca Agenda como atual e Hoje deixa de ser — a distinção que existe pra Hoje não usar startsWith", async () => {
    navegacaoFalsa.redefinir({ pathname: "/painel/agenda" });

    montar();

    const agenda = await screen.findByRole("link", { name: "Agenda" });
    expect(agenda).toHaveAttribute("aria-current", "page");
    // O caso que mata o mutante: "/painel/agenda".startsWith("/painel") é
    // verdadeiro, então um Hoje comparado por prefixo (em vez de
    // igualdade exata) ficaria marcado aqui também.
    expect(screen.getByRole("link", { name: "Hoje" })).not.toHaveAttribute(
      "aria-current"
    );
  });

  it("o Caixa fica entre Agenda e Folgas, pra toda a equipe", async () => {
    navegacaoFalsa.redefinir({ pathname: "/painel/caixa" });

    montar(criarApiClientFalso({ papel: "profissional" }));

    const caixa = await screen.findByRole("link", { name: "Caixa" });
    expect(caixa).toHaveAttribute("href", "/painel/caixa");
    expect(caixa).toHaveAttribute("aria-current", "page");
    const nomes = screen
      .getAllByRole("link")
      .map((link) => link.textContent)
      .filter((nome) => ["Agenda", "Caixa", "Folgas"].includes(nome ?? ""));
    expect(nomes).toEqual(["Agenda", "Caixa", "Folgas"]);
  });

  it("tema e Sair não moram mais na barra lateral — foram pra barra de topo", async () => {
    navegacaoFalsa.redefinir({ pathname: "/painel" });

    montar();

    await screen.findByRole("link", { name: "Hoje" });
    expect(screen.queryByRole("button", { name: /Modo (escuro|claro)/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Sair" })).toBeNull();
  });
  // Abaixo de 900px a navegação é uma barra no pé da tela: Hoje, Agenda,
  // Novo, Caixa e Mais. O CSS decide o que aparece onde; aqui vale o que
  // existe e o que cada controle anuncia.
  describe("a barra inferior do celular", () => {
    it("Novo leva direto ao novo agendamento", async () => {
      navegacaoFalsa.redefinir({ pathname: "/painel" });

      montar();

      const novo = await screen.findByRole("link", { name: "Novo" });
      expect(novo).toHaveAttribute("href", "/painel/agendamentos/novo");
    });

    it("Mais começa fechado e abre o resto das seções", async () => {
      navegacaoFalsa.redefinir({ pathname: "/painel" });
      montar();

      const mais = await screen.findByRole("button", { name: "Mais" });
      expect(mais).toHaveAttribute("aria-expanded", "false");
      const controlado = document.getElementById(mais.getAttribute("aria-controls") ?? "");
      expect(controlado).not.toBeNull();
      expect(controlado).toHaveTextContent("Clientes");
      expect(controlado).not.toHaveTextContent("Agenda");

      await userEvent.click(mais);

      expect(mais).toHaveAttribute("aria-expanded", "true");
    });

    it("Esc fecha o Mais", async () => {
      navegacaoFalsa.redefinir({ pathname: "/painel" });
      montar();
      const mais = await screen.findByRole("button", { name: "Mais" });

      await userEvent.click(mais);
      await userEvent.keyboard("{Escape}");

      expect(mais).toHaveAttribute("aria-expanded", "false");
    });

    it("numa seção que mora no Mais, o Mais se marca como onde a pessoa está", async () => {
      navegacaoFalsa.redefinir({ pathname: "/painel/clientes" });

      montar();

      const mais = await screen.findByRole("button", { name: "Mais" });
      expect(mais).toHaveAttribute("data-atual", "true");
    });

    it("no novo agendamento, quem se marca é o Novo, não a Agenda", async () => {
      navegacaoFalsa.redefinir({ pathname: "/painel/agendamentos/novo" });

      montar();

      expect(await screen.findByRole("link", { name: "Novo" })).toHaveAttribute("aria-current", "page");
      expect(screen.getByRole("link", { name: "Agenda" })).not.toHaveAttribute("aria-current");
    });

    it("numa seção da barra, o Mais não se marca", async () => {
      navegacaoFalsa.redefinir({ pathname: "/painel/agenda" });

      montar();

      const mais = await screen.findByRole("button", { name: "Mais" });
      expect(mais).not.toHaveAttribute("data-atual");
    });
  });

  describe("recolher a barra", () => {
    it("começa expandida e o botão anuncia o que faz", async () => {
      navegacaoFalsa.redefinir({ pathname: "/painel" });

      montar();

      const botao = await screen.findByRole("button", { name: "Recolher barra" });
      expect(botao).toHaveAttribute("aria-expanded", "true");
    });

    it("clicar recolhe: troca o rótulo, marca o <html> e grava a escolha", async () => {
      navegacaoFalsa.redefinir({ pathname: "/painel" });
      montar();
      const botao = await screen.findByRole("button", { name: "Recolher barra" });

      await userEvent.click(botao);

      const expandir = screen.getByRole("button", { name: "Expandir barra" });
      expect(expandir).toHaveAttribute("aria-expanded", "false");
      // O atributo mora no <html> porque o CSS o lê de lá, e porque é
      // onde o script do <head> escreve antes da primeira pintura.
      expect(document.documentElement.getAttribute("data-barra")).toBe("recolhida");
      expect(localStorage.getItem(CHAVE_DA_BARRA)).toBe("recolhida");
    });

    it("clicar de novo expande e limpa o atributo", async () => {
      navegacaoFalsa.redefinir({ pathname: "/painel" });
      montar();

      await userEvent.click(await screen.findByRole("button", { name: "Recolher barra" }));
      await userEvent.click(screen.getByRole("button", { name: "Expandir barra" }));

      expect(screen.getByRole("button", { name: "Recolher barra" })).toBeInTheDocument();
      expect(document.documentElement.hasAttribute("data-barra")).toBe(false);
      expect(localStorage.getItem(CHAVE_DA_BARRA)).toBe("expandida");
    });

    it("com 'recolhida' gravado, monta já recolhida", async () => {
      navegacaoFalsa.redefinir({ pathname: "/painel" });
      localStorage.setItem(CHAVE_DA_BARRA, "recolhida");

      montar();

      expect(
        await screen.findByRole("button", { name: "Expandir barra" })
      ).toBeInTheDocument();
    });

    it("recolhida, os links continuam com o nome acessível — o ícone não substitui o rótulo", async () => {
      // Recolhida, só o ícone aparece. Se o rótulo saísse do DOM em vez
      // de ser escondido visualmente, cada link viraria um <a> sem nome
      // e a barra ficaria inutilizável por leitor de tela.
      navegacaoFalsa.redefinir({ pathname: "/painel" });
      localStorage.setItem(CHAVE_DA_BARRA, "recolhida");

      montar();

      for (const rotulo of ["Hoje", "Agenda", "Clientes", "Serviços", "Configurações"]) {
        expect(await screen.findByRole("link", { name: rotulo })).toBeInTheDocument();
      }
    });
  });
});
