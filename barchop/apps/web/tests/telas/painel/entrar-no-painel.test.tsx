import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { criarApiClientFalso, ErroDaApi } from "@barchop/api-client";
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

  it("cria a barbearia e entra com o slug enviado", async () => {
    montar();

    await userEvent.click(screen.getByRole("button", { name: /criar barbearia/i }));
    await userEvent.type(screen.getByLabelText(/nome da barbearia/i), "Barbearia do Zé");
    await userEvent.type(screen.getByLabelText(/endereço do link/i), "barbearia-do-ze");
    await userEvent.type(screen.getByLabelText(/seu nome/i), "Zé");
    await userEvent.type(screen.getByLabelText(/e-mail/i), "ze@barbearia.com");
    await userEvent.type(screen.getByLabelText(/^senha/i), "segredo123");
    await userEvent.click(screen.getByRole("button", { name: /criar e entrar/i }));

    await waitFor(() => expect(sessaoDaBarbearia.ler()).toBe("barbearia-do-ze"));
    expect(navegacaoFalsa.push).toHaveBeenCalledWith("/painel");
  });

  it("recusa slug fora do formato antes de chamar a API", async () => {
    // A API responde 400 do pattern ^[a-z0-9-]{3,80}$; barrar aqui
    // mantém o erro no campo em vez de virar aviso genérico.
    const falso = criarApiClientFalso();
    let chamou = false;
    falso.barbeiro.signup = async () => {
      chamou = true;
      throw new ErroDaApi(400, "requisicao_invalida", "");
    };
    montar(falso);

    await userEvent.click(screen.getByRole("button", { name: /criar barbearia/i }));
    await userEvent.type(screen.getByLabelText(/nome da barbearia/i), "Barbearia do Zé");
    await userEvent.type(screen.getByLabelText(/endereço do link/i), "Zé Barbearia!");
    await userEvent.type(screen.getByLabelText(/seu nome/i), "Zé");
    await userEvent.type(screen.getByLabelText(/e-mail/i), "ze@barbearia.com");
    await userEvent.type(screen.getByLabelText(/^senha/i), "segredo123");
    await userEvent.click(screen.getByRole("button", { name: /criar e entrar/i }));

    expect(await screen.findByText(/letras minúsculas, números e hífen/i)).toBeInTheDocument();
    expect(chamou).toBe(false);
  });

  it("traduz conflito sem dizer qual dos dois campos repetiu", async () => {
    // A dívida do 409 já é conhecida; a tela não a amplia dizendo se foi
    // o e-mail ou o endereço.
    const falso = criarApiClientFalso();
    falso.barbeiro.signup = async () => {
      throw new ErroDaApi(409, "conflito", "");
    };
    montar(falso);

    await userEvent.click(screen.getByRole("button", { name: /criar barbearia/i }));
    await userEvent.type(screen.getByLabelText(/nome da barbearia/i), "Barbearia do Zé");
    await userEvent.type(screen.getByLabelText(/endereço do link/i), "barbearia-do-ze");
    await userEvent.type(screen.getByLabelText(/seu nome/i), "Zé");
    await userEvent.type(screen.getByLabelText(/e-mail/i), "ze@barbearia.com");
    await userEvent.type(screen.getByLabelText(/^senha/i), "segredo123");
    await userEvent.click(screen.getByRole("button", { name: /criar e entrar/i }));

    expect(
      await screen.findByText(/e-mail ou esse endereço já está em uso/i)
    ).toBeInTheDocument();
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

  it("trocar pra criar barbearia não envia o formulário", async () => {
    // O botão está dentro do <form>, e um <button> sem type é submit:
    // sem type="button" ele tentaria o login com os campos vazios.
    const falso = criarApiClientFalso();
    let chamou = false;
    falso.barbeiro.login = async () => {
      chamou = true;
      throw new ErroDaApi(401, "credenciais_invalidas", "");
    };
    montar(falso);

    await userEvent.click(screen.getByRole("button", { name: /criar barbearia/i }));

    expect(chamou).toBe(false);
    expect(screen.getByRole("heading")).toHaveTextContent(/criar barbearia/i);
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

  it("trocar de modo leva o foco pro primeiro campo do modo novo", async () => {
    // Indo pro "criar", três campos nascem ACIMA de onde o foco está —
    // sem mover, quem usa teclado tem que voltar de shift+tab. Voltando
    // pro "entrar", o campo focado é um dos que desmontaram, e o foco
    // cairia no <body>.
    montar();

    await userEvent.click(screen.getByRole("button", { name: /criar barbearia/i }));
    expect(screen.getByLabelText(/nome da barbearia/i)).toHaveFocus();

    await userEvent.click(screen.getByRole("button", { name: "Entrar" }));
    expect(screen.getByLabelText(/e-mail/i)).toHaveFocus();
  });

  it("a prévia do link pertence ao campo, e não à tela", async () => {
    // Como <p> solto ela ficava a 24px do campo que descreve e a 24px
    // do seguinte, grudando no errado. No `apoio` do Campo ela é
    // descrita junto do rótulo pra quem usa leitor de tela.
    montar();

    await userEvent.click(screen.getByRole("button", { name: /criar barbearia/i }));
    const campoDoLink = screen.getByLabelText(/endereço do link/i);

    expect(campoDoLink).toHaveAccessibleDescription(/sua-barbearia/);

    await userEvent.type(campoDoLink, "barbearia-do-ze");
    expect(campoDoLink).toHaveAccessibleDescription(/\/barbearia-do-ze/);
  });

  it("anuncia os tokens que o gerenciador de senhas usa", async () => {
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

    // Na criação o token vira new-password: é o que faz o navegador
    // oferecer uma senha forte e salvar a nova, em vez de preencher a
    // que já está guardada.
    await userEvent.click(screen.getByRole("button", { name: /criar barbearia/i }));
    expect(screen.getByLabelText(/^senha/i)).toHaveAttribute(
      "autocomplete",
      "new-password"
    );
  });
});
