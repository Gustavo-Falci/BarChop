import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { criarApiClientFalso } from "@barchop/api-client";
import { BarraDoTopo } from "../../src/painel/BarraDoTopo";
import { ProvedorDoPainel } from "../../src/painel/ProvedorDoPainel";
import { SessaoDoPainel } from "../../src/painel/SessaoDoPainel";
import { CHAVE_DO_TEMA } from "../../src/painel/tema";
import { CHAVE_DAS_NOVIDADES, NOVIDADES } from "../../src/painel/novidades";
import {
  sessaoDaBarbearia,
  sessaoDoBarbeiro,
} from "../../src/sessao/armazenamento";
import { navegacaoFalsa } from "../ajudantes/navegacao";

// jsdom não implementa matchMedia. Ver tests/painel/tema.test.ts.
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
        <BarraDoTopo />
      </SessaoDoPainel>
    </ProvedorDoPainel>
  );
  return falso;
}

describe("barra de topo do painel", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
    stubMatchMedia(false);
    navegacaoFalsa.redefinir({ pathname: "/painel" });
    sessaoDoBarbeiro.gravar("jwt");
    sessaoDaBarbearia.gravar("gr-barber");
  });

  describe("menu do usuário", () => {
    it("o gatilho mostra nome, barbearia e as iniciais, e começa fechado", async () => {
      montar();

      const gatilho = await screen.findByRole("button", { name: /Rafael/ });
      expect(gatilho).toHaveAttribute("aria-expanded", "false");
      // O nome da barbearia chega depois do perfil (minhaBarbearia).
      await waitFor(() => expect(gatilho).toHaveTextContent("GR Barber"));
      expect(gatilho).toHaveTextContent("R");
    });

    it("abre com e-mail, Minha conta, Faturas, Indique em breve, e Sair", async () => {
      montar();

      await userEvent.click(await screen.findByRole("button", { name: /Rafael/ }));

      const menu = screen.getByRole("group", { name: "Sua conta" });
      expect(within(menu).getByText("rafael@gr.com")).toBeInTheDocument();
      expect(within(menu).getByRole("link", { name: "Minha conta" })).toHaveAttribute(
        "href",
        "/painel/configuracoes/perfil"
      );
      // Faturas é a tela da assinatura, mesmo antes de assinar; a
      // indicação ainda não existe.
      expect(within(menu).getByRole("link", { name: /Faturas/ })).toHaveAttribute("href", "/painel/faturas");
      expect(within(menu).queryByRole("link", { name: /^Plano$/ })).not.toBeInTheDocument();
      expect(within(menu).getByRole("button", { name: /Indique e ganhe/ })).toBeDisabled();
      expect(within(menu).getAllByText("Em breve")).toHaveLength(1);
    });

    it("Sair encerra a sessão e volta pro login", async () => {
      montar();

      await userEvent.click(await screen.findByRole("button", { name: /Rafael/ }));
      await userEvent.click(screen.getByRole("button", { name: "Sair" }));

      expect(sessaoDoBarbeiro.ler()).toBeNull();
      expect(navegacaoFalsa.replace).toHaveBeenCalledWith("/painel/entrar");
    });

    it("Esc fecha e devolve o foco ao gatilho", async () => {
      montar();
      const gatilho = await screen.findByRole("button", { name: /Rafael/ });

      await userEvent.click(gatilho);
      await userEvent.keyboard("{Escape}");

      expect(screen.queryByRole("group", { name: "Sua conta" })).toBeNull();
      expect(gatilho).toHaveAttribute("aria-expanded", "false");
      expect(gatilho).toHaveFocus();
    });

    it("clicar fora fecha", async () => {
      montar();

      await userEvent.click(await screen.findByRole("button", { name: /Rafael/ }));
      await userEvent.click(document.body);

      expect(screen.queryByRole("group", { name: "Sua conta" })).toBeNull();
    });

    it("abrir um menu fecha o outro", async () => {
      montar();

      await userEvent.click(await screen.findByRole("button", { name: /Rafael/ }));
      await userEvent.click(screen.getByRole("button", { name: "Mais opções" }));

      expect(screen.queryByRole("group", { name: "Sua conta" })).toBeNull();
      expect(screen.getByRole("group", { name: "Mais opções" })).toBeInTheDocument();
    });
  });

  describe("menu de mais opções", () => {
    it("tem Central de ajuda levando à página de ajuda, e o idioma Português", async () => {
      montar();

      await userEvent.click(await screen.findByRole("button", { name: "Mais opções" }));

      const menu = screen.getByRole("group", { name: "Mais opções" });
      expect(within(menu).getByRole("link", { name: "Central de ajuda" })).toHaveAttribute(
        "href",
        "/painel/ajuda"
      );
      expect(within(menu).getByText("Idioma")).toBeInTheDocument();
      expect(within(menu).getByText("Português")).toBeInTheDocument();
    });

    it("Aparência: Escuro troca o <html> e grava a escolha", async () => {
      montar();

      await userEvent.click(await screen.findByRole("button", { name: "Mais opções" }));
      await userEvent.click(screen.getByRole("radio", { name: "Escuro" }));

      expect(screen.getByRole("radio", { name: "Escuro" })).toBeChecked();
      expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
      expect(localStorage.getItem(CHAVE_DO_TEMA)).toBe("escuro");
    });

    it("Aparência: sem escolha gravada, Sistema vem marcado", async () => {
      montar();

      await userEvent.click(await screen.findByRole("button", { name: "Mais opções" }));

      expect(screen.getByRole("radio", { name: "Sistema" })).toBeChecked();
    });

    it("Aparência: Sistema segue o aparelho e grava 'sistema'", async () => {
      localStorage.setItem(CHAVE_DO_TEMA, "claro");
      stubMatchMedia(true);
      montar();

      await userEvent.click(await screen.findByRole("button", { name: "Mais opções" }));
      await userEvent.click(screen.getByRole("radio", { name: "Sistema" }));

      expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
      expect(localStorage.getItem(CHAVE_DO_TEMA)).toBe("sistema");
    });

    it("Novidades mostra quantas são novas, abre a lista e zera o selo", async () => {
      montar();

      const maisOpcoes = await screen.findByRole("button", { name: "Mais opções" });
      // O ponto no gatilho avisa que há novidade sem abrir o menu. Vem de
      // um efeito depois da montagem (lê o localStorage): espera, senão o
      // teste corre contra o render.
      await waitFor(() => expect(maisOpcoes).toHaveAttribute("data-aviso"));
      await userEvent.click(maisOpcoes);

      const novidades = screen.getByRole("button", { name: /Novidades/ });
      expect(novidades).toHaveTextContent(`${NOVIDADES.length} novas`);

      await userEvent.click(novidades);

      const janela = screen.getByRole("dialog", { name: "Novidades" });
      expect(within(janela).getByText(NOVIDADES[0]!.titulo)).toBeInTheDocument();
      expect(localStorage.getItem(CHAVE_DAS_NOVIDADES)).toBe(NOVIDADES[0]!.data);
      expect(maisOpcoes).not.toHaveAttribute("data-aviso");
    });

    it("com tudo visto, nem selo nem ponto", async () => {
      localStorage.setItem(CHAVE_DAS_NOVIDADES, NOVIDADES[0]!.data);
      montar();

      const maisOpcoes = await screen.findByRole("button", { name: "Mais opções" });
      expect(maisOpcoes).not.toHaveAttribute("data-aviso");
      await userEvent.click(maisOpcoes);

      expect(screen.getByRole("button", { name: /Novidades/ })).not.toHaveTextContent(/novas?$/);
    });
  });
});
