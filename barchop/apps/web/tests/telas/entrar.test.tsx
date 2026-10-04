import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import {
  CODIGO_DO_CLIENTE_FALSO,
  criarApiClientFalso,
  ErroDaApi,
  type CredenciaisDoCliente,
  type DefinicaoDeSenhaDoCliente,
  type DestinoDoCodigo,
} from "@barchop/api-client";
import { ProvedorDaApi } from "../../src/api/ProvedorDaApi";
import { Entrar } from "../../src/telas/Entrar";
import { sessaoDoCliente } from "../../src/sessao/armazenamento";
import { navegacaoFalsa } from "../ajudantes/navegacao";

// No piloto o cliente entra por e-mail (plano da Onda 1, decisão de
// 2026-10-03): sem a verificação da Meta não há WhatsApp, e o código só
// tem por onde chegar no e-mail. O telefone continua no cadastro — é por
// ele que a barbearia reconhece o cliente — e é pedido só ao criar.

const EMAIL = "maria@exemplo.com";

function montar(falso = criarApiClientFalso()) {
  render(
    <ProvedorDaApi valor={falso}>
      <Entrar />
    </ProvedorDaApi>
  );
  return falso;
}

async function preencher(email = EMAIL) {
  await userEvent.type(screen.getByLabelText(/e-mail/i), email);
  await userEvent.type(screen.getByLabelText(/^senha$/i), "segredo123");
}

describe("entrar", () => {
  beforeEach(() => {
    localStorage.clear();
    navegacaoFalsa.redefinir();
  });

  it("entra com e-mail e senha e guarda o token daquela barbearia", async () => {
    const falso = montar();
    const tentativas: CredenciaisDoCliente[] = [];
    const original = falso.publico.loginCliente;
    falso.publico.loginCliente = async (slug, credenciais) => {
      tentativas.push(credenciais);
      return original(slug, credenciais);
    };
    await preencher("Maria@Exemplo.com");

    await userEvent.click(screen.getByRole("button", { name: "Entrar" }));

    await waitFor(() =>
      expect(sessaoDoCliente("gr-barber").ler()).toBe("jwt-falso-cliente")
    );
    // Normalizado antes de sair: a API busca pelo e-mail em minúsculas.
    expect(tentativas).toEqual([{ email: EMAIL, senha: "segredo123" }]);
    expect(navegacaoFalsa.push).toHaveBeenCalledWith("/gr-barber/minha-conta");
  });

  it("traduz credenciais_invalidas em e-mail ou senha incorretos", async () => {
    const falso = criarApiClientFalso();
    falso.publico.loginCliente = async () => {
      throw new ErroDaApi(401, "credenciais_invalidas", "");
    };
    montar(falso);
    await preencher();

    await userEvent.click(screen.getByRole("button", { name: "Entrar" }));

    await waitFor(() =>
      expect(screen.getByText(/e-mail ou senha incorretos/i)).toBeInTheDocument()
    );
  });

  it("e-mail inválido acusa o campo, e não tenta o login", async () => {
    // Erro de digitação não pode aparecer como se a senha estivesse
    // errada. Por isso a API nem chega a ser chamada aqui.
    const falso = criarApiClientFalso();
    let tentou = false;
    falso.publico.loginCliente = async () => {
      tentou = true;
      throw new ErroDaApi(401, "credenciais_invalidas", "");
    };
    montar(falso);

    await preencher("maria-sem-arroba");
    await userEvent.click(screen.getByRole("button", { name: "Entrar" }));

    expect(await screen.findByText(/informe um e-mail válido/i)).toBeInTheDocument();
    expect(screen.queryByText(/e-mail ou senha incorretos/i)).toBeNull();
    expect(tentou).toBe(false);
  });

  it("senha em branco acusa o campo, e não tenta a API", async () => {
    const falso = criarApiClientFalso();
    let tentou = false;
    falso.publico.loginCliente = async () => {
      tentou = true;
      throw new ErroDaApi(401, "credenciais_invalidas", "");
    };
    montar(falso);
    await userEvent.type(screen.getByLabelText(/e-mail/i), EMAIL);

    await userEvent.click(screen.getByRole("button", { name: "Entrar" }));

    expect(await screen.findByText(/informe sua senha/i)).toBeInTheDocument();
    expect(tentou).toBe(false);
  });

  it("um e-mail inválido não deixa um erro de senha de tentativa anterior preso na tela", async () => {
    montar();
    await userEvent.type(screen.getByLabelText(/e-mail/i), EMAIL);
    await userEvent.click(screen.getByRole("button", { name: "Entrar" }));
    expect(await screen.findByText(/informe sua senha/i)).toBeInTheDocument();

    await userEvent.clear(screen.getByLabelText(/e-mail/i));
    await preencher("maria-sem-arroba");
    await userEvent.click(screen.getByRole("button", { name: "Entrar" }));

    expect(await screen.findByText(/informe um e-mail válido/i)).toBeInTheDocument();
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
    // sem o par email/current-password ninguém preenche nem salva.
    montar();

    const email = screen.getByLabelText(/e-mail/i);
    expect(email).toHaveAttribute("autocomplete", "email");
    expect(email).toHaveAttribute("inputmode", "email");
    expect(screen.getByLabelText(/^senha$/i)).toHaveAttribute(
      "autocomplete",
      "current-password"
    );
  });
});

// Primeiro acesso e esqueci a senha são o mesmo caminho: provar o
// e-mail com o código e definir a senha. Antes, o primeiro acesso
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

  async function pedirCodigo(email = EMAIL) {
    await abrirCodigo();
    await userEvent.type(screen.getByLabelText(/e-mail/i), email);
    await userEvent.click(screen.getByRole("button", { name: "Enviar código" }));
  }

  async function preencherCodigo(
    codigo = CODIGO_DO_CLIENTE_FALSO,
    senha = "segredo123",
    telefone = "11999998888"
  ) {
    await userEvent.type(await screen.findByLabelText(/^código$/i), codigo);
    await userEvent.type(screen.getByLabelText(/seu nome/i), "Maria Souza");
    await userEvent.type(screen.getByLabelText(/telefone/i), telefone);
    await userEvent.type(screen.getByLabelText(/^nova senha$/i), senha);
  }

  it("pede o código pro e-mail, define a senha com ele e entra", async () => {
    const falso = montar();
    const pedidos: DestinoDoCodigo[] = [];
    const definicoes: DefinicaoDeSenhaDoCliente[] = [];
    const pedir = falso.publico.pedirCodigoDoCliente;
    const definir = falso.publico.definirSenhaDoCliente;
    falso.publico.pedirCodigoDoCliente = async (slug, destino) => {
      pedidos.push(destino);
      return pedir(slug, destino);
    };
    falso.publico.definirSenhaDoCliente = async (slug, definicao) => {
      definicoes.push(definicao);
      return definir(slug, definicao);
    };

    await pedirCodigo("Maria@Exemplo.com");
    expect(await screen.findByText(/enviamos um código/i)).toBeInTheDocument();
    // Normalizado antes de sair: é a chave do código na API.
    expect(pedidos).toEqual([{ email: EMAIL }]);

    await preencherCodigo();
    await userEvent.click(screen.getByRole("button", { name: "Salvar e entrar" }));

    await waitFor(() =>
      expect(sessaoDoCliente("gr-barber").ler()).toBe("jwt-falso-cliente")
    );
    expect(definicoes).toEqual([
      {
        email: EMAIL,
        telefone: "(11) 99999-8888",
        codigo: CODIGO_DO_CLIENTE_FALSO,
        nome: "Maria Souza",
        senha: "segredo123",
      },
    ]);
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

  it("e-mail inválido acusa o campo e não pede código", async () => {
    const falso = montar();
    let pediu = false;
    falso.publico.pedirCodigoDoCliente = async () => {
      pediu = true;
    };

    await pedirCodigo("maria-sem-arroba");

    expect(await screen.findByText(/informe um e-mail válido/i)).toBeInTheDocument();
    expect(pediu).toBe(false);
  });

  it("telefone sem DDD acusa o campo antes de ir à API", async () => {
    const falso = montar();
    let definiu = false;
    falso.publico.definirSenhaDoCliente = async () => {
      definiu = true;
      throw new Error("não devia chegar aqui");
    };
    await pedirCodigo();
    await preencherCodigo(CODIGO_DO_CLIENTE_FALSO, "segredo123", "99999");

    await userEvent.click(screen.getByRole("button", { name: "Salvar e entrar" }));

    expect(await screen.findByText(/informe o ddd/i)).toBeInTheDocument();
    expect(definiu).toBe(false);
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

  it("telefone de outro cadastro explica o que fazer", async () => {
    // A API não vincula o e-mail a um cadastro do balcão — seria tomar a
    // conta de quem a barbearia cadastrou. Quem resolve é a barbearia.
    const falso = montar();
    falso.publico.definirSenhaDoCliente = async () => {
      throw new ErroDaApi(422, "telefone_ja_cadastrado", "");
    };
    await pedirCodigo();
    await preencherCodigo();

    await userEvent.click(screen.getByRole("button", { name: "Salvar e entrar" }));

    expect(
      await screen.findByText(/peça pra barbearia incluir seu e-mail/i)
    ).toBeInTheDocument();
  });

  it("reenviar pede outro código pro mesmo e-mail", async () => {
    const falso = montar();
    const pedidos: DestinoDoCodigo[] = [];
    falso.publico.pedirCodigoDoCliente = async (_slug, destino) => {
      pedidos.push(destino);
    };
    await pedirCodigo();
    await screen.findByText(/enviamos um código/i);

    await userEvent.click(screen.getByRole("button", { name: "Reenviar código" }));

    await waitFor(() => expect(pedidos).toEqual([{ email: EMAIL }, { email: EMAIL }]));
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

  it("anuncia o código, o telefone e a senha nova pros recursos do celular", async () => {
    // `one-time-code` faz o teclado do celular sugerir o código que
    // acabou de chegar; `new-password` faz o gerenciador oferecer salvar.
    montar();
    await pedirCodigo();

    const codigo = await screen.findByLabelText(/^código$/i);
    expect(codigo).toHaveAttribute("autocomplete", "one-time-code");
    expect(codigo).toHaveAttribute("inputmode", "numeric");
    expect(screen.getByLabelText(/telefone/i)).toHaveAttribute("autocomplete", "tel");
    expect(screen.getByLabelText(/^nova senha$/i)).toHaveAttribute(
      "autocomplete",
      "new-password"
    );
  });
});
