import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { criarApiClientFalso, ErroDaApi } from "@barchop/api-client";
import { ProvedorDaApi } from "../../src/api/ProvedorDaApi";
import { EscolhaDeServicos } from "../../src/telas/EscolhaDeServicos";
import { navegacaoFalsa } from "../ajudantes/navegacao";

function montar(apiClient = criarApiClientFalso()) {
  render(
    <ProvedorDaApi valor={apiClient}>
      <EscolhaDeServicos />
    </ProvedorDaApi>
  );
}

describe("escolha dos serviços", () => {
  beforeEach(() => navegacaoFalsa.redefinir());

  it("lista os serviços ativos com preço", async () => {
    montar();
    await waitFor(() => screen.getByText("Corte"));
    expect(screen.getByText("R$ 40,00")).toBeInTheDocument();
  });

  it("soma duração e preço do que foi marcado", async () => {
    montar();
    await waitFor(() => screen.getByText("Corte"));

    await userEvent.click(screen.getByRole("checkbox", { name: /Corte/ }));
    await userEvent.click(screen.getByRole("checkbox", { name: /Barba/ }));

    // Corte 30min R$40 + Barba 20min R$25 — é o "2 serviços · 50 min"
    // do design, com o total que a tela de confirmação repete.
    expect(screen.getByText("2 serviços")).toBeInTheDocument();
    expect(screen.getByText("50 min")).toBeInTheDocument();
    expect(screen.getByText("R$ 65,00")).toBeInTheDocument();
  });

  it("não deixa continuar sem escolher nada", async () => {
    montar();
    await waitFor(() => screen.getByText("Corte"));

    expect(screen.getByRole("button", { name: /continuar/i })).toBeDisabled();
  });

  it("leva pro passo de data levando os ids escolhidos", async () => {
    montar();
    await waitFor(() => screen.getByText("Corte"));

    await userEvent.click(screen.getByRole("checkbox", { name: /Corte/ }));
    await userEvent.click(screen.getByRole("button", { name: /continuar/i }));

    expect(navegacaoFalsa.push).toHaveBeenCalledWith(
      "/gr-barber/agendar/data?servicos=s1"
    );
  });

  it("começa com o que já estava na URL marcado", async () => {
    // Voltar do passo de data não pode perder a escolha.
    navegacaoFalsa.redefinir({ query: { servicos: "s2" } });
    montar();

    await waitFor(() => screen.getByText("Barba"));
    expect(screen.getByRole("checkbox", { name: /Barba/ })).toBeChecked();
  });

  it("não leva id inexistente pro próximo passo", async () => {
    // um id que a lista não traz é serviço desativado, e levá-lo adiante o faria chegar ao POST.
    navegacaoFalsa.redefinir({ query: { servicos: "s1,inexistente" } });
    montar();

    await waitFor(() => screen.getByText("Corte"));
    await userEvent.click(screen.getByRole("button", { name: /continuar/i }));

    expect(navegacaoFalsa.push).toHaveBeenCalledWith(
      "/gr-barber/agendar/data?servicos=s1"
    );
  });

  it("exibe erro quando falha carregar os serviços", async () => {
    const falso = criarApiClientFalso();
    falso.publico.servicos = async () => {
      throw new ErroDaApi(500, "erro_interno", "");
    };
    montar(falso);

    await waitFor(() =>
      screen.getByText("Não foi possível carregar os serviços")
    );
    expect(screen.getByText("Não foi possível carregar os serviços")).toBeInTheDocument();
  });
});
