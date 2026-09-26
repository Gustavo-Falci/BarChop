import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { criarApiClientFalso, ErroDaApi } from "@gr-barber/api-client";
import { ProvedorDaApi } from "../../src/api/ProvedorDaApi";
import { BarraDaBarbearia } from "../../src/fluxo/BarraDaBarbearia";
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
