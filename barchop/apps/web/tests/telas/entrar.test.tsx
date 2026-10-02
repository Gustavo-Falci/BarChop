import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { CODIGO_DO_CLIENTE_FALSO, criarApiClientFalso, ErroDaApi } from "@barchop/api-client";
import { ProvedorDaApi } from "../../src/api/ProvedorDaApi";
import { Entrar } from "../../src/telas/Entrar";
import { sessaoDoCliente } from "../../src/sessao/armazenamento";
import { navegacaoFalsa } from "../ajudantes/navegacao";

function montar(falso = criarApiClientFalso()) {
  render(
    <ProvedorDaApi valor={falso}>
      <Entrar />
    </ProvedorDaApi>
  );
  return falso;
}

async function preencher() {
  await userEvent.type(screen.getByLabelText(/telefone/i), "11999998888");
  await userEvent.type(screen.getByLabelText(/^senha$/i), "segredo123");
}

describe("entrar", () => {
  beforeEach(() => {
    localStorage.clear();
    navegacaoFalsa.redefinir();
  });

  it("entra e guarda o token daquela barbearia", async () => {
    montar();
    await preencher();

    await userEvent.click(screen.getByRole("button", { name: "Entrar" }));

    await waitFor(() =>
      expect(sessaoDoCliente("gr-barber").ler()).toBe("jwt-falso-cliente")
    );
    expect(navegacaoFalsa.push).toHaveBeenCalledWith("/gr-barber/minha-conta");
  });

  it("traduz credenciais_invalidas em telefone ou senha incorretos", async () => {
    const falso = criarApiClientFalso();
    falso.publico.loginCliente = async () => {
      throw new ErroDaApi(401, "credenciais_invalidas", "");
    };
    montar(falso);
    await preencher();

    await userEvent.click(screen.getByRole("button", { name: "Entrar" }));

    await waitFor(() =>
      expect(screen.getByText(/telefone ou senha incorretos/i)).toBeInTheDocument()
    );
  });

  it("telefone sem DDD acusa o campo, e não tenta o login", async () => {
    // O ponto da nota 3: um telefone incompleto é erro de digitação, e
    // não pode aparecer como se a senha estivesse errada. Por isso a
    // API nem chega a ser chamada aqui.
    const falso = criarApiClientFalso();
    let tentou = false;
    falso.publico.loginCliente = async () => {
      tentou = true;
      throw new ErroDaApi(401, "credenciais_invalidas", "");
    };
    montar(falso);

    await userEvent.type(screen.getByLabelText(/telefone/i), "99999");
    await userEvent.type(screen.getByLabelText(/^senha$/i), "segredo123");
    await userEvent.click(screen.getByRole("button", { name: "Entrar" }));

    expect(await screen.findByText(/informe o ddd/i)).toBeInTheDocument();
    expect(screen.queryByText(/telefone ou senha incorretos/i)).toBeNull();
    expect(tentou).toBe(false);
  });

  it("I4: senha em branco acusa o campo, e não tenta a API", async () => {
    const falso = criarApiClientFalso();
    let tentou = false;
    falso.publico.loginCliente = async () => {
      tentou = true;
      throw new ErroDaApi(401, "credenciais_invalidas", "");
    };
    montar(falso);
    await userEvent.type(screen.getByLabelText(/telefone/i), "11999998888");

    await userEvent.click(screen.getByRole("button", { name: "Entrar" }));

    expect(await screen.findByText(/informe sua senha/i)).toBeInTheDocument();
    expect(tentou).toBe(false);
  });

  it("um telefone inválido não deixa um erro de senha de tentativa anterior preso na tela", async () => {
    // Regressão: erroSenha só era limpo dentro do próprio `if` da senha,
    // que nunca rodava quando o telefone barrava antes. Um erro de senha
    // de uma tentativa anterior sobrevivia a um telefone que falhou
    // depois.
    montar();
    await userEvent.type(screen.getByLabelText(/telefone/i), "11999998888");
    await userEvent.click(screen.getByRole("button", { name: "Entrar" }));
    expect(await screen.findByText(/informe sua senha/i)).toBeInTheDocument();

    await userEvent.clear(screen.getByLabelText(/telefone/i));
    await userEvent.type(screen.getByLabelText(/telefone/i), "99999");
    await userEvent.type(screen.getByLabelText(/^senha$/i), "segredo123");
    await userEvent.click(screen.getByRole("button", { name: "Entrar" }));

    expect(await screen.findByText(/informe o ddd/i)).toBeInTheDocument();
    expect(screen.queryByText(/informe sua senha/i)).toBeNull();
  });

  it("traduz tentativas_excedidas em espere, e não em senha incorreta", async () => {
    const falso = criarApiClientFalso();
    falso.publico.loginCliente = async () => {
      throw new ErroDaApi(
        429,
        "tentativas_excedidas",
        "Muitas tentativas. Tente de novo em 1 minuto."
      );
    };
    montar(falso);
    await preencher();

    await userEvent.click(screen.getByRole("button", { name: "Entrar" }));

    expect(await screen.findByText(/tente de novo em 1 minuto/i)).toBeInTheDocument();
    expect(screen.queryByText(/senha incorretos/i)).not.toBeInTheDocument();
  });

  it("volta pro passo do agendamento de onde veio", async () => {
    // Quem chegou aqui pelo "Já tem conta?" da confirmação precisa cair
    // de volta no mesmo ponto, com serviços, data e hora — senão entrar
    // custa refazer o fluxo, e ninguém faz isso. `voltar=dados` é o
    // nome antigo desse passo, e ainda precisa levar pra confirmação.
    navegacaoFalsa.redefinir({
      query: {
        voltar: "dados",
        servicos: "s1",
        data: "2026-09-10",
        hora: "09:00",
      },
    });
    montar();
    await preencher();

    await userEvent.click(screen.getByRole("button", { name: "Entrar" }));

    await waitFor(() =>
      expect(navegacaoFalsa.push).toHaveBeenCalledWith(
        "/gr-barber/agendar/confirmar?servicos=s1&data=2026-09-10&hora=09%3A00"
      )
    );
  });

  it("um voltar que não é passo nenhum cai no destino padrão", async () => {
    // O destino viaja como NOME de passo justamente pra isto: uma URL
    // vinda de fora nunca chega no router. Se chegasse, seria
    // redirecionamento aberto — o link do WhatsApp é público, e
    // qualquer um monta a query.
    navegacaoFalsa.redefinir({ query: { voltar: "https://outro-site.com" } });
    montar();
    await preencher();

    await userEvent.click(screen.getByRole("button", { name: "Entrar" }));

    await waitFor(() =>
      expect(navegacaoFalsa.push).toHaveBeenCalledWith("/gr-barber/minha-conta")
    );
  });

  it("anuncia os tokens que o gerenciador de senhas do celular usa", async () => {
    // Este fluxo chega por link de WhatsApp, quase sempre no celular:
    // sem o par tel/current-password ninguém preenche nem salva.
    montar();

    const telefone = screen.getByLabelText(/telefone/i);
    expect(telefone).toHaveAttribute("autocomplete", "tel");
    // `inputMode` e não `type="tel"`: o teclado numérico abre do mesmo
    // jeito, e o campo continua a string que o formatador reescreve.
    expect(telefone).toHaveAttribute("inputmode", "tel");
    expect(screen.getByLabelText(/^senha$/i)).toHaveAttribute(
      "autocomplete",
      "current-password"
    );
  });
});

// Primeiro acesso e esqueci a senha são o mesmo caminho: provar o
// telefone com o código e definir a senha. Antes, o primeiro acesso
// definia a senha de qualquer cadastro sem senha, sem prova nenhuma — e
// quem chegasse primeiro ficava com o histórico de outra pessoa.
describe("entrar — primeiro acesso ou esqueci a senha", () => {
  beforeEach(() => {
    localStorage.clear();
    navegacaoFalsa.redefinir();
  });

  async function abrirCodigo() {
    await userEvent.click(
      screen.getByRole("button", { name: /primeiro acesso ou esqueceu a senha/i })
    );
  }

  async function pedirCodigo(telefone = "11999998888") {
    await abrirCodigo();
    await userEvent.type(screen.getByLabelText(/telefone/i), telefone);
    await userEvent.click(screen.getByRole("button", { name: "Enviar código" }));
  }

  async function preencherCodigo(codigo = CODIGO_DO_CLIENTE_FALSO, senha = "segredo123") {
    await userEvent.type(await screen.findByLabelText(/^código$/i), codigo);
    await userEvent.type(screen.getByLabelText(/seu nome/i), "Maria Souza");
    await userEvent.type(screen.getByLabelText(/^nova senha$/i), senha);
  }

  it("pede o código, define a senha com ele e entra", async () => {
    const falso = montar();
    const pedidos: string[] = [];
    const original = falso.publico.pedirCodigoDoCliente;
    falso.publico.pedirCodigoDoCliente = async (slug, telefone) => {
      pedidos.push(telefone);
      return original(slug, telefone);
    };

    await pedirCodigo();
    expect(await screen.findByText(/enviamos um código/i)).toBeInTheDocument();
    // Normalizado antes de sair: é a chave do código na API.
    expect(pedidos).toEqual(["(11) 99999-8888"]);

    await preencherCodigo();
    await userEvent.click(screen.getByRole("button", { name: "Salvar e entrar" }));

    await waitFor(() =>
      expect(sessaoDoCliente("gr-barber").ler()).toBe("jwt-falso-cliente")
    );
    expect(navegacaoFalsa.push).toHaveBeenCalledWith("/gr-barber/minha-conta");
  });

  it("código errado acusa o campo do código, sem sair da tela", async () => {
    montar();
    await pedirCodigo();
    await preencherCodigo("000000");

    await userEvent.click(screen.getByRole("button", { name: "Salvar e entrar" }));

    expect(await screen.findByText(/código inválido ou vencido/i)).toBeInTheDocument();
    expect(sessaoDoCliente("gr-barber").ler()).toBeNull();
    expect(navegacaoFalsa.push).not.toHaveBeenCalled();
  });

  it("telefone sem DDD acusa o campo e não pede código", async () => {
    const falso = montar();
    let pediu = false;
    falso.publico.pedirCodigoDoCliente = async () => {
      pediu = true;
    };

    await pedirCodigo("999");

    expect(await screen.findByText(/informe o ddd/i)).toBeInTheDocument();
    expect(pediu).toBe(false);
  });

  it("senha curta acusa o campo antes de ir à API", async () => {
    const falso = montar();
    let definiu = false;
    falso.publico.definirSenhaDoCliente = async () => {
      definiu = true;
      throw new Error("não devia chegar aqui");
    };
    await pedirCodigo();
    await preencherCodigo(CODIGO_DO_CLIENTE_FALSO, "curta");

    await userEvent.click(screen.getByRole("button", { name: "Salvar e entrar" }));

    expect(await screen.findByText(/pelo menos 8 caracteres/i)).toBeInTheDocument();
    expect(definiu).toBe(false);
  });

  it("reenviar pede outro código pro mesmo telefone", async () => {
    const falso = montar();
    const pedidos: string[] = [];
    falso.publico.pedirCodigoDoCliente = async (_slug, telefone) => {
      pedidos.push(telefone);
    };
    await pedirCodigo();
    await screen.findByText(/enviamos um código/i);

    await userEvent.click(screen.getByRole("button", { name: "Reenviar código" }));

    await waitFor(() => expect(pedidos).toEqual(["(11) 99999-8888", "(11) 99999-8888"]));
  });

  it("limite de pedidos avisa quanto esperar", async () => {
    const falso = montar();
    falso.publico.pedirCodigoDoCliente = async () => {
      throw new ErroDaApi(429, "tentativas_excedidas", "Muitas tentativas. Tente de novo em 9 minutos.");
    };

    await pedirCodigo();

    expect(await screen.findByText(/tente de novo em 9 minutos/i)).toBeInTheDocument();
  });

  it("voltar leva de novo ao login", async () => {
    montar();
    await abrirCodigo();

    await userEvent.click(screen.getByRole("button", { name: "Voltar pra entrar" }));

    expect(screen.getByLabelText(/^senha$/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Entrar" })).toBeInTheDocument();
  });

  it("anuncia o código e a senha nova pros recursos do celular", async () => {
    // `one-time-code` faz o teclado do celular sugerir o código que
    // acabou de chegar; `new-password` faz o gerenciador oferecer salvar.
    montar();
    await pedirCodigo();

    const codigo = await screen.findByLabelText(/^código$/i);
    expect(codigo).toHaveAttribute("autocomplete", "one-time-code");
    expect(codigo).toHaveAttribute("inputmode", "numeric");
    expect(screen.getByLabelText(/^nova senha$/i)).toHaveAttribute(
      "autocomplete",
      "new-password"
    );
  });
});
