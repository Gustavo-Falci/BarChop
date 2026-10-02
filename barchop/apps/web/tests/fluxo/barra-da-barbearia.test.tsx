import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { criarApiClientFalso, ErroDaApi } from "@barchop/api-client";
import { ProvedorDaApi } from "../../src/api/ProvedorDaApi";
import { BarraDaBarbearia } from "../../src/fluxo/BarraDaBarbearia";
import { sessaoDoCliente } from "../../src/sessao/armazenamento";
import { navegacaoFalsa } from "../ajudantes/navegacao";

function montar(falso = criarApiClientFalso()) {
  render(
    <ProvedorDaApi valor={falso}>
      <BarraDaBarbearia />
    </ProvedorDaApi>
  );
  return falso;
}

describe("barra da barbearia", () => {
  beforeEach(() => navegacaoFalsa.redefinir({ pathname: "/gr-barber/entrar" }));

  it("diz de qual barbearia é a tela", async () => {
    // O fluxo chega por link de WhatsApp. Fora da página inicial, nada
    // dizia de quem era a página: "Minha conta" e "Escolha um horário"
    // valem pra qualquer barbearia do mundo.
    montar();

    expect(await screen.findByText("GR Barber")).toBeInTheDocument();
  });

  it("o nome leva de volta pra página da barbearia", async () => {
    // O "voltar pro começo" que o fluxo não tinha.
    montar();

    const marca = await screen.findByRole("link", { name: "GR Barber" });
    expect(marca).toHaveAttribute("href", "/gr-barber");
  });

  it("some na página da própria barbearia, onde o nome já é o título", () => {
    // Lá o <h1> é o nome. Com a barra, o mesmo texto apareceria duas
    // vezes, um colado no outro — o que se lê como defeito.
    navegacaoFalsa.redefinir({ pathname: "/gr-barber" });
    const falso = criarApiClientFalso();
    let buscou = false;
    falso.publico.perfilDaBarbearia = async (slug: string) => {
      buscou = true;
      throw new ErroDaApi(500, "erro_interno", slug);
    };
    montar(falso);

    expect(screen.queryByRole("banner")).toBeNull();
    // E nem chega a buscar: a tela de lá já pede o mesmo perfil.
    expect(buscou).toBe(false);
  });

  it("slug inexistente não vira cabeçalho escrito 'undefined'", async () => {
    // Link errado no WhatsApp é tráfego comum. Quem precisa explicar é
    // a tela de baixo; a barra só não pode inventar nome.
    const falso = criarApiClientFalso();
    falso.publico.perfilDaBarbearia = async () => {
      throw new ErroDaApi(404, "nao_encontrado", "");
    };
    montar(falso);

    // A barra continua no DOM — é ela que reserva a altura, pra o nome
    // não empurrar a tela quando (e se) chegar.
    expect(screen.getByRole("banner")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("link")).toBeNull());
    expect(screen.queryByText(/undefined/i)).toBeNull();
  });
});

// Quem já tem conta não tinha caminho até ela: nenhuma tela pública
// linkava "Entrar" nem "Meus agendamentos". Só se chegava digitando a
// URL, ou pelo "Já tenho conta" no meio de um agendamento — que volta
// pro agendamento, não pra conta.
describe("barra da barbearia — acesso à conta", () => {
  beforeEach(() => {
    localStorage.clear();
    navegacaoFalsa.redefinir({ pathname: "/gr-barber/agendar/data" });
  });

  it("sem sessão, oferece entrar", async () => {
    montar();

    expect(await screen.findByRole("link", { name: "Entrar" })).toHaveAttribute(
      "href",
      "/gr-barber/entrar"
    );
  });

  it("com sessão, leva aos agendamentos do cliente", async () => {
    sessaoDoCliente("gr-barber").gravar("token");
    montar();

    expect(
      await screen.findByRole("link", { name: "Meus agendamentos" })
    ).toHaveAttribute("href", "/gr-barber/minha-conta");
    expect(screen.queryByRole("link", { name: "Entrar" })).toBeNull();
  });

  it("sessão de outra barbearia não conta", async () => {
    // O login do cliente é por barbearia: o token de lá não abre a conta
    // daqui.
    sessaoDoCliente("outra-barbearia").gravar("token");
    montar();

    expect(await screen.findByRole("link", { name: "Entrar" })).toBeInTheDocument();
  });

  it("não oferece entrar na própria tela de entrar", async () => {
    navegacaoFalsa.redefinir({ pathname: "/gr-barber/entrar" });
    montar();

    await screen.findByRole("link", { name: "GR Barber" });
    expect(screen.queryByRole("link", { name: "Entrar" })).toBeNull();
  });

  it("não oferece meus agendamentos em cima da própria lista", async () => {
    navegacaoFalsa.redefinir({ pathname: "/gr-barber/minha-conta" });
    sessaoDoCliente("gr-barber").gravar("token");
    montar();

    await screen.findByRole("link", { name: "GR Barber" });
    expect(screen.queryByRole("link", { name: "Meus agendamentos" })).toBeNull();
  });

  it("troca pra meus agendamentos assim que a sessão é gravada, sem remontar", async () => {
    // A barra mora no layout e não remonta entre as telas: lida uma vez
    // só, continuaria oferecendo "Entrar" depois do login.
    montar();
    await screen.findByRole("link", { name: "Entrar" });

    act(() => sessaoDoCliente("gr-barber").gravar("token"));

    expect(
      await screen.findByRole("link", { name: "Meus agendamentos" })
    ).toBeInTheDocument();
  });

  it("volta pra entrar quando a sessão é limpa sem navegar", async () => {
    // É o "Não é você?" do passo de dados: limpa a sessão e fica na tela.
    sessaoDoCliente("gr-barber").gravar("token");
    montar();
    await screen.findByRole("link", { name: "Meus agendamentos" });

    act(() => sessaoDoCliente("gr-barber").limpar());

    expect(await screen.findByRole("link", { name: "Entrar" })).toBeInTheDocument();
  });

  it("slug inexistente não oferece entrar numa barbearia que não existe", async () => {
    const falso = criarApiClientFalso();
    falso.publico.perfilDaBarbearia = async () => {
      throw new ErroDaApi(404, "nao_encontrado", "");
    };
    montar(falso);

    await waitFor(() => expect(screen.queryByRole("link")).toBeNull());
  });
});
