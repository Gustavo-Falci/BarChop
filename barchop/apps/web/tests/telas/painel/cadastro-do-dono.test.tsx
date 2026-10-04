import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { CODIGO_DO_CADASTRO_FALSO, criarApiClientFalso, ErroDaApi } from "@barchop/api-client";
import { ProvedorDoPainel } from "../../../src/painel/ProvedorDoPainel";
import { sessaoDaBarbearia, sessaoDoBarbeiro } from "../../../src/sessao/armazenamento";
import { CadastroDoDono } from "../../../src/telas/painel/CadastroDoDono";
import { navegacaoFalsa } from "../../ajudantes/navegacao";

// Onda 1, F1: o cadastro do dono sai do modo "criar" do /painel/entrar
// e vira tela própria, /painel/cadastro — promessa à esquerda,
// formulário à direita, prévia do link. F3: o e-mail é verificado antes
// de a barbearia existir — os dados, depois o código que chegou nele.
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

function continuar() {
  return userEvent.click(screen.getByRole("button", { name: /continuar/i }));
}

async function digitarCodigo(codigo = CODIGO_DO_CADASTRO_FALSO) {
  await userEvent.type(await screen.findByLabelText(/código/i), codigo);
  await userEvent.click(screen.getByRole("button", { name: /criar e entrar/i }));
}

describe("cadastro do dono", () => {
  beforeEach(() => {
    localStorage.clear();
    navegacaoFalsa.redefinir({ pathname: "/painel/cadastro" });
  });

  it("manda o código pro e-mail e cria a barbearia com ele", async () => {
    const falso = criarApiClientFalso();
    const pedidos: string[] = [];
    const pedir = falso.barbeiro.pedirCodigoDeCadastro;
    falso.barbeiro.pedirCodigoDeCadastro = async (email: string) => {
      pedidos.push(email);
      return pedir(email);
    };
    montar(falso);

    await preencher();
    expect(screen.getByLabelText(/endereço do link/i)).toHaveValue("barbearia-do-ze");
    await continuar();

    expect(await screen.findByText(/enviamos um código para ze@barbearia\.com/i)).toBeInTheDocument();
    expect(pedidos).toEqual(["ze@barbearia.com"]);
    await digitarCodigo();

    await waitFor(() => expect(sessaoDoBarbeiro.ler()).toBe("jwt-falso-barbeiro"));
    expect(sessaoDaBarbearia.ler()).toBe("barbearia-do-ze");
    expect(navegacaoFalsa.push).toHaveBeenCalledWith("/painel");
  });

  it("código errado acusa o campo e não entra", async () => {
    montar();

    await preencher();
    await continuar();
    await digitarCodigo("000000");

    expect(await screen.findByText(/código inválido ou vencido/i)).toBeInTheDocument();
    expect(sessaoDoBarbeiro.ler()).toBeNull();
  });

  it("link já usado volta pros dados com o erro no link, e não pede outro código", async () => {
    const falso = criarApiClientFalso();
    let pedidos = 0;
    falso.barbeiro.pedirCodigoDeCadastro = async () => {
      pedidos += 1;
    };
    const original = falso.barbeiro.signup;
    falso.barbeiro.signup = async (nova) => {
      if (nova.barbearia.slug === "barbearia-do-ze") throw new ErroDaApi(409, "conflito", "");
      return original(nova);
    };
    montar(falso);

    await preencher();
    await continuar();
    await digitarCodigo();

    expect(await screen.findByText(/esse endereço já está em uso/i)).toBeInTheDocument();
    const link = screen.getByLabelText(/endereço do link/i);
    await userEvent.clear(link);
    await userEvent.type(link, "ze-cortes");
    await continuar();
    // O código digitado continua valendo: o 409 desfez a criação inteira.
    await userEvent.click(await screen.findByRole("button", { name: /criar e entrar/i }));

    await waitFor(() => expect(sessaoDaBarbearia.ler()).toBe("ze-cortes"));
    expect(pedidos).toBe(1);
  });

  it("trocar o e-mail volta pros dados e o próximo pedido vai pro novo", async () => {
    const falso = criarApiClientFalso();
    const pedidos: string[] = [];
    falso.barbeiro.pedirCodigoDeCadastro = async (email: string) => {
      pedidos.push(email);
    };
    montar(falso);

    await preencher();
    await continuar();
    await userEvent.click(await screen.findByRole("button", { name: /trocar e-mail/i }));
    const email = screen.getByLabelText(/e-mail/i);
    await userEvent.clear(email);
    await userEvent.type(email, "ze2@barbearia.com");
    await continuar();

    expect(await screen.findByText(/enviamos um código para ze2@barbearia\.com/i)).toBeInTheDocument();
    expect(pedidos).toEqual(["ze@barbearia.com", "ze2@barbearia.com"]);
  });

  it("reenviar pede outro código pro mesmo e-mail", async () => {
    const falso = criarApiClientFalso();
    let pedidos = 0;
    falso.barbeiro.pedirCodigoDeCadastro = async () => {
      pedidos += 1;
    };
    montar(falso);

    await preencher();
    await continuar();
    await userEvent.click(await screen.findByRole("button", { name: /reenviar código/i }));

    expect(await screen.findByText(/código reenviado/i)).toBeInTheDocument();
    expect(pedidos).toBe(2);
  });

  it("limite de pedidos de código vira aviso com a mensagem da API", async () => {
    const falso = criarApiClientFalso();
    falso.barbeiro.pedirCodigoDeCadastro = async () => {
      throw new ErroDaApi(429, "tentativas_excedidas", "Muitas tentativas. Tente de novo em 15 minutos.");
    };
    montar(falso);

    await preencher();
    await continuar();

    expect(await screen.findByText(/tente de novo em 15 minutos/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/código/i)).toBeNull();
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

  it("recusa link fora do formato antes de pedir o código", async () => {
    const falso = criarApiClientFalso();
    let chamou = false;
    falso.barbeiro.pedirCodigoDeCadastro = async () => {
      chamou = true;
    };
    montar(falso);

    await preencher({ link: "Zé Barbearia!" });
    await continuar();

    expect(await screen.findByText(/letras minúsculas, números e hífen/i)).toBeInTheDocument();
    expect(chamou).toBe(false);
  });

  it("recusa link reservado antes de pedir o código", async () => {
    const falso = criarApiClientFalso();
    let chamou = false;
    falso.barbeiro.pedirCodigoDeCadastro = async () => {
      chamou = true;
    };
    montar(falso);

    await preencher({ barbearia: "Painel" });
    await continuar();

    expect(await screen.findByText(/esse link é reservado/i)).toBeInTheDocument();
    expect(chamou).toBe(false);
  });

  it("e-mail em branco e senha curta acusam o campo, sem pedir o código", async () => {
    const falso = criarApiClientFalso();
    let chamou = false;
    falso.barbeiro.pedirCodigoDeCadastro = async () => {
      chamou = true;
    };
    montar(falso);

    await preencher({ email: "", senha: "" });
    await continuar();
    expect(await screen.findByText(/informe seu e-mail/i)).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText(/e-mail/i), "ze@barbearia.com");
    await userEvent.type(screen.getByLabelText(/^senha/i), "curta");
    await continuar();
    expect(await screen.findByText(/pelo menos 8 caracteres/i)).toBeInTheDocument();
    expect(chamou).toBe(false);
  });

  it("traduz tentativas_excedidas no cadastro na mensagem da API", async () => {
    const falso = criarApiClientFalso();
    falso.barbeiro.signup = async () => {
      throw new ErroDaApi(429, "tentativas_excedidas", "Muitas tentativas. Tente de novo em 1 hora.");
    };
    montar(falso);

    await preencher();
    await continuar();
    await digitarCodigo();

    expect(await screen.findByText(/tente de novo em 1 hora/i)).toBeInTheDocument();
  });

  it("anuncia os tokens do gerenciador de senhas e do código", async () => {
    montar();

    expect(screen.getByLabelText(/e-mail/i)).toHaveAttribute("autocomplete", "username");
    expect(screen.getByLabelText(/^senha/i)).toHaveAttribute("autocomplete", "new-password");

    await preencher();
    await continuar();
    expect(await screen.findByLabelText(/código/i)).toHaveAttribute("autocomplete", "one-time-code");
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
