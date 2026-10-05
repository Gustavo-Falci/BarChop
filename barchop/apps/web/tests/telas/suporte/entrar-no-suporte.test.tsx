import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  criarApiClientFalso,
  EMAIL_DO_SUPORTE_FALSO,
  SENHA_DO_SUPORTE_FALSA,
} from "@barchop/api-client";
import { sessaoDoBarbeiro, sessaoDoSuporte } from "../../../src/sessao/armazenamento";
import { ProvedorDoSuporte } from "../../../src/suporte/ProvedorDoSuporte";
import { EntrarNoSuporte } from "../../../src/telas/suporte/EntrarNoSuporte";
import { navegacaoFalsa } from "../../ajudantes/navegacao";

// Onda 1, F4d: o suporte da plataforma entra com conta própria, fora de
// qualquer equipe, numa sessão que não se mistura com a do painel.
function montar(falso = criarApiClientFalso()) {
  render(
    <ProvedorDoSuporte valor={falso.suporte}>
      <EntrarNoSuporte />
    </ProvedorDoSuporte>
  );
  return falso;
}

describe("entrar no suporte", () => {
  beforeEach(() => {
    localStorage.clear();
    navegacaoFalsa.redefinir({ pathname: "/painel/suporte/entrar" });
  });

  it("entra, guarda a sessão do suporte e vai pra fila", async () => {
    montar();

    await userEvent.type(screen.getByLabelText(/e-mail/i), EMAIL_DO_SUPORTE_FALSO);
    await userEvent.type(screen.getByLabelText(/^senha/i), SENHA_DO_SUPORTE_FALSA);
    await userEvent.click(screen.getByRole("button", { name: /entrar/i }));

    await waitFor(() => expect(navegacaoFalsa.push).toHaveBeenCalledWith("/painel/suporte"));
    expect(sessaoDoSuporte.ler()).toBe("jwt-falso-suporte");
    // A sessão do painel é outra coisa: entrar no suporte não abre o painel.
    expect(sessaoDoBarbeiro.ler()).toBeNull();
  });

  it("credencial errada avisa e não grava nada", async () => {
    montar();

    await userEvent.type(screen.getByLabelText(/e-mail/i), EMAIL_DO_SUPORTE_FALSO);
    await userEvent.type(screen.getByLabelText(/^senha/i), "errada");
    await userEvent.click(screen.getByRole("button", { name: /entrar/i }));

    expect(await screen.findByText("E-mail ou senha incorretos.")).toBeInTheDocument();
    expect(sessaoDoSuporte.ler()).toBeNull();
    expect(navegacaoFalsa.push).not.toHaveBeenCalled();
  });

  it("campo vazio acusa o campo, sem chamar a API", async () => {
    const falso = criarApiClientFalso();
    const login = vi.fn(falso.suporte.login);
    falso.suporte.login = login;
    montar(falso);

    await userEvent.click(screen.getByRole("button", { name: /entrar/i }));

    expect(await screen.findByText(/informe seu e-mail/i)).toBeInTheDocument();
    expect(login).not.toHaveBeenCalled();
  });
});
