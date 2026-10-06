import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { criarApiClientFalso } from "@barchop/api-client";
import { IndiceDeConfiguracoes } from "../../../src/telas/painel/configuracoes/IndiceDeConfiguracoes";
import { navegacaoFalsa } from "../../ajudantes/navegacao";
import { montarPainel } from "../../ajudantes/painel";

// Painel v2, marco 2: Configurações vira um índice de áreas. Cada linha
// mostra o que vale hoje ou, se a área nunca foi salva, o que acontece
// se ficar assim — e a contagem "X de 4 decididas" no topo. Decidida =
// salva pelo menos uma vez (decisão do dono do produto, 2026-10-06).

describe("índice das configurações", () => {
  beforeEach(() => {
    localStorage.clear();
    navegacaoFalsa.redefinir({ pathname: "/painel/configuracoes" });
  });

  it("conta quantas áreas já foram decididas", async () => {
    montarPainel(<IndiceDeConfiguracoes />, criarApiClientFalso({ areasDecididas: ["horarios", "comunicacao"] }));

    expect(await screen.findByText("2 de 4 decididas")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: /decididas/i })).toHaveAttribute("aria-valuenow", "2");
  });

  it("cada área leva à subtela dela", async () => {
    montarPainel(<IndiceDeConfiguracoes />, criarApiClientFalso());

    expect(await screen.findByRole("link", { name: /^Horários/ })).toHaveAttribute(
      "href",
      "/painel/configuracoes/horarios"
    );
    expect(screen.getByRole("link", { name: /^Dados do negócio/ })).toHaveAttribute(
      "href",
      "/painel/configuracoes/dados-do-negocio"
    );
    expect(screen.getByRole("link", { name: /^Comunicação/ })).toHaveAttribute(
      "href",
      "/painel/configuracoes/comunicacao"
    );
    expect(screen.getByRole("link", { name: /^Notificações/ })).toHaveAttribute(
      "href",
      "/painel/configuracoes/notificacoes"
    );
    expect(screen.getByRole("link", { name: /^Seu perfil/ })).toHaveAttribute(
      "href",
      "/painel/configuracoes/perfil"
    );
  });

  it("área decidida mostra o que vale hoje, sem pedir pra configurar", async () => {
    montarPainel(
      <IndiceDeConfiguracoes />,
      criarApiClientFalso({ areasDecididas: ["horarios", "dados_do_negocio", "comunicacao", "notificacoes"] })
    );

    expect(await screen.findByRole("link", { name: /^Horários/ })).toHaveTextContent("Aberto 6 dias por semana");
    expect(screen.getByRole("link", { name: /^Dados do negócio/ })).toHaveTextContent(
      "GR Barber · Rua das Tesouras, 123"
    );
    expect(screen.getByRole("link", { name: /^Comunicação/ })).toHaveTextContent("1 canal de contato");
    expect(screen.getByRole("link", { name: /^Notificações/ })).toHaveTextContent(
      "Lembrete por e-mail 24 horas antes"
    );
    expect(screen.getByText("4 de 4 decididas")).toBeInTheDocument();
    expect(screen.queryByText(/configurar/i)).not.toBeInTheDocument();
  });

  it("área não decidida mostra a consequência e o configurar", async () => {
    montarPainel(<IndiceDeConfiguracoes />, criarApiClientFalso({ areasDecididas: ["horarios"] }));

    const comunicacao = await screen.findByRole("link", { name: /^Comunicação/ });
    expect(comunicacao).toHaveTextContent(/sem whatsapp/i);
    expect(comunicacao).toHaveTextContent(/configurar/i);
    expect(screen.getByRole("link", { name: /^Horários/ })).not.toHaveTextContent(/configurar/i);
  });

  it("o perfil é de cada pessoa: não entra na contagem nem pede configurar", async () => {
    montarPainel(<IndiceDeConfiguracoes />, criarApiClientFalso());

    const perfil = await screen.findByRole("link", { name: /^Seu perfil/ });
    expect(perfil).not.toHaveTextContent(/configurar/i);
    expect(screen.getByText("0 de 4 decididas")).toBeInTheDocument();
  });

  it("quem não é dono vê só o próprio perfil, sem o índice", async () => {
    montarPainel(<IndiceDeConfiguracoes />, criarApiClientFalso({ papel: "recepcao" }));

    expect(await screen.findByRole("button", { name: /salvar perfil/i })).toBeInTheDocument();
    expect(screen.queryByText(/decididas/)).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /^Horários/ })).not.toBeInTheDocument();
  });
});
