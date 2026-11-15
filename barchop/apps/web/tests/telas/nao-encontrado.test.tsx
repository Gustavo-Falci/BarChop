import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { NaoEncontrado } from "../../src/telas/NaoEncontrado";

// As três versões do 404 (canvas "Página não encontrada", aprovado 15/11).
describe("página não encontrada", () => {
  describe("no site", () => {
    it("diz o que houve, com o cabeçalho e o rodapé do site", () => {
      render(<NaoEncontrado versao="site" urlDoSite="https://barchop.com.br" />);

      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Não encontramos esta página");
      expect(screen.getByText("Erro 404")).toBeInTheDocument();
      expect(screen.getByText(/pode ter mudado ou estar escrito errado/)).toBeInTheDocument();
      expect(screen.getByText("suabarbearia.barchop.com.br")).toBeInTheDocument();
      expect(screen.getByRole("banner")).toBeInTheDocument();
      expect(screen.getByRole("contentinfo")).toBeInTheDocument();
    });

    it("leva ao início e aos preços", () => {
      render(<NaoEncontrado versao="site" urlDoSite="https://barchop.com.br" />);
      const principal = within(screen.getByRole("main"));

      expect(principal.getByRole("link", { name: "Ir para o início" })).toHaveAttribute("href", "/");
      expect(principal.getByRole("link", { name: "Ver os preços" })).toHaveAttribute("href", "/precos");
    });
  });

  describe("no link de uma barbearia", () => {
    it("diz que a barbearia não foi encontrada e como achar o link certo", () => {
      render(<NaoEncontrado versao="barbearia" urlDoSite="https://barchop.com.br" />);

      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Não encontramos essa barbearia");
      expect(screen.getByText("Erro 404")).toBeInTheDocument();
      expect(screen.getByText(/pelo WhatsApp ou no balcão/)).toBeInTheDocument();
      // Sem os links do site no alto: a pessoa veio atrás de uma barbearia.
      expect(screen.queryByRole("link", { name: "Criar barbearia" })).not.toBeInTheDocument();
    });

    it("no pé, o BarChop, com o link pro site inteiro", () => {
      render(<NaoEncontrado versao="barbearia" urlDoSite="https://barchop.com.br" />);
      const pe = within(screen.getByRole("contentinfo"));

      expect(pe.getByText("Agenda feita com BarChop")).toBeInTheDocument();
      expect(pe.getByRole("link", { name: "É dono de barbearia? Conheça o BarChop" })).toHaveAttribute(
        "href",
        "https://barchop.com.br/"
      );
    });

    it("sem o site configurado, o link vai pra raiz daqui", () => {
      render(<NaoEncontrado versao="barbearia" urlDoSite={undefined} />);

      expect(screen.getByRole("link", { name: "É dono de barbearia? Conheça o BarChop" })).toHaveAttribute(
        "href",
        "/"
      );
    });
  });

  describe("no painel", () => {
    it("sem os links do site, com o caminho de volta ao painel", () => {
      render(<NaoEncontrado versao="painel" urlDoSite="https://barchop.com.br" />);

      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Não encontramos esta página");
      expect(screen.getByText("Erro 404")).toBeInTheDocument();
      expect(screen.getByText(/Sua agenda e seus dados estão como sempre/)).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Voltar ao painel" })).toHaveAttribute("href", "/painel");
      expect(screen.queryByRole("link", { name: "Criar barbearia" })).not.toBeInTheDocument();
      expect(screen.queryByRole("link", { name: "Ver os preços" })).not.toBeInTheDocument();
    });
  });
});
