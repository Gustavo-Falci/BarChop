import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CODIGO_DO_BARBEIRO_FALSO,
  criarApiClientFalso,
  ErroDaApi,
} from "@barchop/api-client";
import { ProvedorDoPainel } from "../../../src/painel/ProvedorDoPainel";
import { EntrarNoPainel } from "../../../src/telas/painel/EntrarNoPainel";
import {
  sessaoDaBarbearia,
  sessaoDoBarbeiro,
} from "../../../src/sessao/armazenamento";
import { navegacaoFalsa } from "../../ajudantes/navegacao";

function montar(falso = criarApiClientFalso()) {
  render(
    <ProvedorDoPainel valor={{ barbeiro: falso.barbeiro, publico: falso.publico }}>
      <EntrarNoPainel />
    </ProvedorDoPainel>
  );
  return falso;
}

describe("entrar no painel", () => {
  beforeEach(() => {
    localStorage.clear();
    navegacaoFalsa.redefinir({ pathname: "/painel/entrar" });
  });

  it("entra e guarda token e slug", async () => {
    montar();

    await userEvent.type(screen.getByLabelText(/e-mail/i), "rafael@gr.com");
    await userEvent.type(screen.getByLabelText(/^senha/i), "segredo123");
    await userEvent.click(screen.getByRole("button", { name: "Entrar" }));

    await waitFor(() => expect(sessaoDoBarbeiro.ler()).toBe("jwt-falso-barbeiro"));
    // O slug é o que a tela de novo agendamento vai usar pra chamar a
    // disponibilidade, que é rota pública por slug.
    expect(sessaoDaBarbearia.ler()).toBe("gr-barber");
    expect(navegacaoFalsa.push).toHaveBeenCalledWith("/painel");
  });

  // O código que a API MANDA de verdade em POST /auth/login — e hoje
  // também no login do cliente, que era o desvio. O teste antigo usava
  // `nao_autenticado` e por isso passava enquanto a tela mostrava o
  // aviso genérico em produção: confira o código no router, não no
  // falso.ts.
  it("traduz credenciais_invalidas em email ou senha incorretos", async () => {
    const falso = criarApiClientFalso();
    falso.barbeiro.login = async () => {
      throw new ErroDaApi(401, "credenciais_invalidas", "");
    };
    montar(falso);

    await userEvent.type(screen.getByLabelText(/e-mail/i), "rafael@gr.com");
    await userEvent.type(screen.getByLabelText(/^senha/i), "errada12");
    await userEvent.click(screen.getByRole("button", { name: "Entrar" }));

    expect(await screen.findByText(/e-mail ou senha incorretos/i)).toBeInTheDocument();
  });

  it("esqueci a senha: pede o código, redefine e entra", async () => {
    const falso = criarApiClientFalso();
    const pedir = vi.fn(falso.barbeiro.pedirCodigo);
    falso.barbeiro.pedirCodigo = pedir;
    montar(falso);

    await userEvent.click(screen.getByRole("button", { name: /esqueci a senha/i }));
    await userEvent.type(screen.getByLabelText(/e-mail/i), "rafael@gr.com");
    await userEvent.click(screen.getByRole("button", { name: /enviar código/i }));

    await waitFor(() => expect(pedir).toHaveBeenCalledWith("rafael@gr.com"));
    await userEvent.type(await screen.findByLabelText(/código/i), CODIGO_DO_BARBEIRO_FALSO);
    await userEvent.type(screen.getByLabelText(/nova senha/i), "nova-senha-789");
    await userEvent.click(screen.getByRole("button", { name: /salvar e entrar/i }));

    await waitFor(() => expect(sessaoDoBarbeiro.ler()).toBeTruthy());
    expect(sessaoDaBarbearia.ler()).toBe("gr-barber");
    expect(navegacaoFalsa.push).toHaveBeenCalledWith("/painel");
  });

  it("esqueci a senha: código errado avisa no campo e não entra", async () => {
    montar();

    await userEvent.click(screen.getByRole("button", { name: /esqueci a senha/i }));
    await userEvent.type(screen.getByLabelText(/e-mail/i), "rafael@gr.com");
    await userEvent.click(screen.getByRole("button", { name: /enviar código/i }));
    await userEvent.type(await screen.findByLabelText(/código/i), "000000");
    await userEvent.type(screen.getByLabelText(/nova senha/i), "nova-senha-789");
    await userEvent.click(screen.getByRole("button", { name: /salvar e entrar/i }));

    expect(await screen.findByText(/código inválido ou vencido/i)).toBeInTheDocument();
    expect(sessaoDoBarbeiro.ler()).toBeNull();
  });

  it("traduz tentativas_excedidas em espere, e não em senha incorreta", async () => {
    // O limite da API é por e-mail e por IP. Mostrar "senha incorreta"
    // aqui mandaria a pessoa certa trocar uma senha que estava certa.
    const falso = criarApiClientFalso();
    falso.barbeiro.login = async () => {
      throw new ErroDaApi(
        429,
        "tentativas_excedidas",
        "Muitas tentativas. Tente de novo em 1 minuto."
      );
    };
    montar(falso);

    await userEvent.type(screen.getByLabelText(/e-mail/i), "rafael@gr.com");
    await userEvent.type(screen.getByLabelText(/^senha/i), "errada12");
    await userEvent.click(screen.getByRole("button", { name: "Entrar" }));

    expect(await screen.findByText(/tente de novo em 1 minuto/i)).toBeInTheDocument();
    expect(screen.queryByText(/senha incorretos/i)).not.toBeInTheDocument();
  });

  it("o Enter no campo de senha entra, sem passar pelo botão", async () => {
    // É como quase todo mundo entra num formulário de dois campos.
    montar();

    await userEvent.type(screen.getByLabelText(/e-mail/i), "rafael@gr.com");
    await userEvent.type(screen.getByLabelText(/^senha/i), "segredo123{Enter}");

    await waitFor(() => expect(sessaoDoBarbeiro.ler()).toBe("jwt-falso-barbeiro"));
    expect(navegacaoFalsa.push).toHaveBeenCalledWith("/painel");
  });

  it("e-mail em branco acusa o campo, e não tenta a API", async () => {
    // Sem isto o vazio ia até a API e voltava 400 do AJV em inglês, no
    // lugar reservado pra "e-mail ou senha incorretos".
    const falso = criarApiClientFalso();
    let chamou = false;
    falso.barbeiro.login = async () => {
      chamou = true;
      throw new ErroDaApi(400, "requisicao_invalida", "");
    };
    montar(falso);

    await userEvent.type(screen.getByLabelText(/^senha/i), "segredo123{Enter}");

    expect(await screen.findByText(/informe seu e-mail/i)).toBeInTheDocument();
    expect(chamou).toBe(false);
  });

  it("senha em branco acusa o campo, e não tenta a API", async () => {
    const falso = criarApiClientFalso();
    let chamou = false;
    falso.barbeiro.login = async () => {
      chamou = true;
      throw new ErroDaApi(400, "requisicao_invalida", "");
    };
    montar(falso);

    await userEvent.type(screen.getByLabelText(/e-mail/i), "rafael@gr.com{Enter}");

    expect(await screen.findByText(/informe sua senha/i)).toBeInTheDocument();
    expect(chamou).toBe(false);
  });

  it("anuncia os tokens que o gerenciador de senhas usa", () => {
    // Sem o par username/current-password o navegador trata o e-mail
    // como contato solto e não oferece a credencial salva.
    montar();

    expect(screen.getByLabelText(/e-mail/i)).toHaveAttribute(
      "autocomplete",
      "username"
    );
    expect(screen.getByLabelText(/^senha/i)).toHaveAttribute(
      "autocomplete",
      "current-password"
    );
  });

  it("quem ainda não tem barbearia vai pro cadastro, numa tela própria", () => {
    // Onda 1, F1: o modo "criar" saiu daqui e virou /painel/cadastro.
    montar();

    expect(screen.getByRole("link", { name: /criar barbearia/i })).toHaveAttribute(
      "href",
      "/painel/cadastro"
    );
    expect(screen.queryByLabelText(/nome da barbearia/i)).toBeNull();
  });
});
