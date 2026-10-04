import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { criarApiClientFalso, ErroDaApi } from "@barchop/api-client";
import { ProvedorDoPainel } from "../../../src/painel/ProvedorDoPainel";
import { sessaoDaBarbearia, sessaoDoBarbeiro } from "../../../src/sessao/armazenamento";
import { CadastroDoDono } from "../../../src/telas/painel/CadastroDoDono";
import { navegacaoFalsa } from "../../ajudantes/navegacao";

// Onda 1, F1: o cadastro do dono sai do modo "criar" do /painel/entrar
// e vira tela própria, /painel/cadastro — promessa à esquerda,
// formulário à direita, prévia do link.
function montar(falso = criarApiClientFalso()) {
  render(
    <ProvedorDoPainel valor={{ barbeiro: falso.barbeiro, publico: falso.publico }}>
      <CadastroDoDono />
    </ProvedorDoPainel>
  );
  return falso;
}

async function preencher({
  barbearia = "Barbearia do Zé",
  link,
  nome = "Zé",
  email = "ze@barbearia.com",
  senha = "segredo123",
}: { barbearia?: string; link?: string; nome?: string; email?: string; senha?: string } = {}) {
  await userEvent.type(screen.getByLabelText(/nome da barbearia/i), barbearia);
  if (link !== undefined) {
    const campo = screen.getByLabelText(/endereço do link/i);
    await userEvent.clear(campo);
    await userEvent.type(campo, link);
  }
  await userEvent.type(screen.getByLabelText(/seu nome/i), nome);
  if (email) await userEvent.type(screen.getByLabelText(/e-mail/i), email);
  if (senha) await userEvent.type(screen.getByLabelText(/^senha/i), senha);
}

function criar() {
  return userEvent.click(screen.getByRole("button", { name: /criar e entrar/i }));
}

describe("cadastro do dono", () => {
  beforeEach(() => {
    localStorage.clear();
    navegacaoFalsa.redefinir({ pathname: "/painel/cadastro" });
  });

  it("cria a barbearia com o link sugerido pelo nome e entra no painel", async () => {
    montar();

    await preencher();
    expect(screen.getByLabelText(/endereço do link/i)).toHaveValue("barbearia-do-ze");
    await criar();

    await waitFor(() => expect(sessaoDoBarbeiro.ler()).toBe("jwt-falso-barbeiro"));
    expect(sessaoDaBarbearia.ler()).toBe("barbearia-do-ze");
    expect(navegacaoFalsa.push).toHaveBeenCalledWith("/painel");
  });

  it("o nome para de mexer no link depois que o dono edita o link", async () => {
    montar();

    await userEvent.type(screen.getByLabelText(/nome da barbearia/i), "Zé");
    const link = screen.getByLabelText(/endereço do link/i);
    await userEvent.clear(link);
    await userEvent.type(link, "ze-cortes");
    await userEvent.type(screen.getByLabelText(/nome da barbearia/i), " Barbearia");

    expect(link).toHaveValue("ze-cortes");
  });

  it("a prévia do link pertence ao campo e acompanha o que foi digitado", async () => {
    montar();
    const campo = screen.getByLabelText(/endereço do link/i);

    expect(campo).toHaveAccessibleDescription(/sua-barbearia/);
    await userEvent.type(screen.getByLabelText(/nome da barbearia/i), "Barbearia do Zé");
    expect(campo).toHaveAccessibleDescription(/barbearia-do-ze/);
  });

  it("recusa link fora do formato antes de chamar a API", async () => {
    const falso = criarApiClientFalso();
    let chamou = false;
    falso.barbeiro.signup = async () => {
      chamou = true;
      throw new ErroDaApi(400, "requisicao_invalida", "");
    };
    montar(falso);

    await preencher({ link: "Zé Barbearia!" });
    await criar();

    expect(await screen.findByText(/letras minúsculas, números e hífen/i)).toBeInTheDocument();
    expect(chamou).toBe(false);
  });

  it("recusa link reservado antes de chamar a API", async () => {
    const falso = criarApiClientFalso();
    let chamou = false;
    falso.barbeiro.signup = async () => {
      chamou = true;
      throw new ErroDaApi(422, "slug_reservado", "");
    };
    montar(falso);

    await preencher({ barbearia: "Painel" });
    await criar();

    expect(await screen.findByText(/esse link é reservado/i)).toBeInTheDocument();
    expect(chamou).toBe(false);
  });

  it("e-mail em branco e senha curta acusam o campo, sem chamar a API", async () => {
    const falso = criarApiClientFalso();
    let chamou = false;
    falso.barbeiro.signup = async () => {
      chamou = true;
      throw new ErroDaApi(400, "requisicao_invalida", "");
    };
    montar(falso);

    await preencher({ email: "", senha: "" });
    await criar();
    expect(await screen.findByText(/informe seu e-mail/i)).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText(/e-mail/i), "ze@barbearia.com");
    await userEvent.type(screen.getByLabelText(/^senha/i), "curta");
    await criar();
    expect(await screen.findByText(/pelo menos 8 caracteres/i)).toBeInTheDocument();
    expect(chamou).toBe(false);
  });

  it("traduz conflito sem dizer qual dos dois repetiu", async () => {
    const falso = criarApiClientFalso();
    falso.barbeiro.signup = async () => {
      throw new ErroDaApi(409, "conflito", "");
    };
    montar(falso);

    await preencher();
    await criar();

    expect(await screen.findByText(/e-mail ou esse endereço já está em uso/i)).toBeInTheDocument();
  });

  it("traduz tentativas_excedidas na mensagem da API", async () => {
    const falso = criarApiClientFalso();
    falso.barbeiro.signup = async () => {
      throw new ErroDaApi(429, "tentativas_excedidas", "Muitas tentativas. Tente de novo em 1 hora.");
    };
    montar(falso);

    await preencher();
    await criar();

    expect(await screen.findByText(/tente de novo em 1 hora/i)).toBeInTheDocument();
  });

  it("anuncia os tokens do gerenciador de senhas pra conta nova", () => {
    montar();

    expect(screen.getByLabelText(/e-mail/i)).toHaveAttribute("autocomplete", "username");
    expect(screen.getByLabelText(/^senha/i)).toHaveAttribute("autocomplete", "new-password");
  });

  it("começa no nome da barbearia e leva quem já tem conta pro entrar", () => {
    montar();

    expect(screen.getByLabelText(/nome da barbearia/i)).toHaveFocus();
    expect(screen.getByRole("link", { name: "Entrar" })).toHaveAttribute("href", "/painel/entrar");
  });

  it("diz o que a barbearia ganha, ao lado do formulário", () => {
    montar();

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/crie sua barbearia/i);
    expect(screen.getByText(/link próprio/i)).toBeInTheDocument();
  });
});
