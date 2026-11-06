import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import {
  CODIGO_DO_CLIENTE_FALSO,
  criarApiClientFalso,
  ErroDaApi,
  type DefinicaoDeSenhaDoCliente,
  type DestinoDoCodigo,
} from "@barchop/api-client";
import { ProvedorDaApi } from "../../src/api/ProvedorDaApi";
import { Entrar } from "../../src/telas/Entrar";
import { sessaoDoCliente } from "../../src/sessao/armazenamento";
import { navegacaoFalsa } from "../ajudantes/navegacao";

// Criar conta (06/11): antes ficava escondido atrás do "Receber um
// código no e-mail", junto com o esqueci a senha. Agora tem botão
// próprio no Entrar e uma chamada na tela de sucesso do agendamento,
// que chega aqui com o formulário preenchido e o token do agendamento.

function montar(falso = criarApiClientFalso()) {
  render(
    <ProvedorDaApi valor={falso}>
      <Entrar />
    </ProvedorDaApi>
  );
  return falso;
}

// O que a tela de sucesso grava na aba depois de agendar sem conta.
function gravarAgendamentoRecente(extra: Record<string, unknown> = {}) {
  sessionStorage.setItem(
    "agendamento.confirmado",
    JSON.stringify({
      slug: "gr-barber",
      agendamento: {
        id: "a9",
        data: "2026-11-06",
        horaInicio: "14:30",
        horaFim: "15:15",
        status: "pendente",
        origem: "cliente",
        observacoes: null,
        servicos: [],
        barbeiro: { id: "bb1", nome: "Rafael" },
        presencaConfirmadaEm: null,
      },
      linkDoHorario: "https://gr-barber.barchop.com.br/lembrete/x",
      telefone: "(11) 99999-8888",
      nome: "Lucas Andrade",
      email: "lucas@exemplo.com",
      tokenDaConta: "conta-a9",
      ...extra,
    })
  );
}

function espiarCriacao(falso: ReturnType<typeof criarApiClientFalso>) {
  const pedidos: DefinicaoDeSenhaDoCliente[] = [];
  const original = falso.publico.definirSenhaDoCliente;
  falso.publico.definirSenhaDoCliente = async (slug, definicao) => {
    pedidos.push(definicao);
    return original(slug, definicao);
  };
  return pedidos;
}

async function preencherDados({
  nome = "Maria Souza",
  telefone = "11988887777",
  email = "maria@exemplo.com",
} = {}) {
  if (nome) await userEvent.type(screen.getByLabelText(/^nome$/i), nome);
  if (telefone) await userEvent.type(screen.getByLabelText(/telefone/i), telefone);
  if (email) await userEvent.type(screen.getByLabelText(/e-mail/i), email);
}

async function confirmarCodigo(codigo = CODIGO_DO_CLIENTE_FALSO, senha = "segredo123") {
  await userEvent.type(await screen.findByLabelText(/^código$/i), codigo);
  await userEvent.type(screen.getByLabelText(/crie uma senha/i), senha);
  await userEvent.click(screen.getByRole("button", { name: "Criar conta" }));
}

describe("criar conta", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    navegacaoFalsa.redefinir();
  });

  it("o Criar conta do Entrar abre o formulário; Já tenho conta volta", async () => {
    montar();

    await userEvent.click(screen.getByRole("button", { name: "Criar conta" }));

    expect(screen.getByRole("heading", { level: 1, name: "Criar conta" })).toBeInTheDocument();
    expect(screen.getByLabelText(/telefone/i)).toHaveAttribute("autocomplete", "tel");
    await userEvent.click(screen.getByRole("button", { name: "Já tenho conta" }));
    expect(screen.getByRole("heading", { level: 1, name: "Entrar" })).toBeInTheDocument();
  });

  it("?criar=1 abre direto no Criar conta", () => {
    navegacaoFalsa.redefinir({ query: { criar: "1" } });
    montar();

    expect(screen.getByRole("heading", { level: 1, name: "Criar conta" })).toBeInTheDocument();
  });

  it("confere nome, telefone e e-mail antes de mandar o código", async () => {
    const falso = montar();
    const pedidos: DestinoDoCodigo[] = [];
    falso.publico.pedirCodigoDoCliente = async (_slug, destino) => {
      pedidos.push(destino);
    };
    await userEvent.click(screen.getByRole("button", { name: "Criar conta" }));
    await preencherDados({ nome: "", telefone: "9999", email: "nao-e-email" });

    await userEvent.click(screen.getByRole("button", { name: "Mandar o código" }));

    expect(screen.getByText("Informe seu nome")).toBeInTheDocument();
    expect(screen.getByText(/informe o ddd e o número/i)).toBeInTheDocument();
    expect(screen.getByText(/informe um e-mail válido/i)).toBeInTheDocument();
    expect(pedidos).toEqual([]);
  });

  it("cria a conta: código pro e-mail, senha, sessão gravada e a conta pronta", async () => {
    const falso = montar();
    const pedidos = espiarCriacao(falso);
    await userEvent.click(screen.getByRole("button", { name: "Criar conta" }));
    await preencherDados();
    await userEvent.click(screen.getByRole("button", { name: "Mandar o código" }));
    expect(await screen.findByText("maria@exemplo.com")).toBeInTheDocument();

    await confirmarCodigo();

    expect(await screen.findByRole("heading", { level: 1, name: "Conta criada" })).toBeInTheDocument();
    expect(sessaoDoCliente("gr-barber").ler()).toBe("jwt-falso-cliente");
    expect(pedidos).toEqual([
      {
        email: "maria@exemplo.com",
        telefone: "(11) 98888-7777",
        nome: "Maria Souza",
        codigo: CODIGO_DO_CLIENTE_FALSO,
        senha: "segredo123",
      },
    ]);
    expect(screen.getByRole("link", { name: "Ver meus horários" })).toHaveAttribute(
      "href",
      "/gr-barber/minha-conta"
    );
  });

  it("a conta pronta lista os horários marcados que vieram junto", async () => {
    const falso = criarApiClientFalso();
    const [servico] = await falso.publico.servicos("gr-barber");
    await falso.publico.agendar("gr-barber", {
      servicoIds: [servico.id],
      data: "2026-12-01",
      horaInicio: "10:00",
      cliente: { nome: "Maria", telefone: "(11) 98888-7777" },
    });
    montar(falso);
    await userEvent.click(screen.getByRole("button", { name: "Criar conta" }));
    await preencherDados();
    await userEvent.click(screen.getByRole("button", { name: "Mandar o código" }));

    await confirmarCodigo();

    expect(await screen.findByText(/10:00 · terça, 1 de dezembro/i)).toBeInTheDocument();
    expect(screen.getByText(/já estão nela/i)).toBeInTheDocument();
  });

  it("vindo do agendamento: chega preenchido, manda o token e apaga o cartão salvo", async () => {
    gravarAgendamentoRecente();
    navegacaoFalsa.redefinir({ query: { criar: "1" } });
    const falso = montar();
    const pedidos = espiarCriacao(falso);

    expect(screen.getByText(/trouxemos o que você digitou no agendamento/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^nome$/i)).toHaveValue("Lucas Andrade");
    expect(screen.getByLabelText(/telefone/i)).toHaveValue("(11) 99999-8888");
    expect(screen.getByLabelText(/e-mail/i)).toHaveValue("lucas@exemplo.com");

    await userEvent.click(screen.getByRole("button", { name: "Mandar o código" }));
    await confirmarCodigo();

    await screen.findByRole("heading", { level: 1, name: "Conta criada" });
    expect(pedidos[0]).toMatchObject({
      email: "lucas@exemplo.com",
      telefone: "(11) 99999-8888",
      tokenDaConta: "conta-a9",
    });
    // Com a conta, o cartão do link na tela de sucesso perdeu a razão.
    expect(sessionStorage.getItem("agendamento.confirmado")).toBeNull();
  });

  it("trocou o telefone do agendamento: não manda o token", async () => {
    gravarAgendamentoRecente();
    navegacaoFalsa.redefinir({ query: { criar: "1" } });
    const falso = montar();
    const pedidos = espiarCriacao(falso);
    const telefone = screen.getByLabelText(/telefone/i);
    await userEvent.clear(telefone);
    await userEvent.type(telefone, "11977776666");

    await userEvent.click(screen.getByRole("button", { name: "Mandar o código" }));
    await confirmarCodigo();

    await screen.findByRole("heading", { level: 1, name: "Conta criada" });
    expect(pedidos[0]).not.toHaveProperty("tokenDaConta");
  });

  it("o cartão de outra barbearia não preenche nada", () => {
    gravarAgendamentoRecente({ slug: "outra-barbearia" });
    navegacaoFalsa.redefinir({ query: { criar: "1" } });
    montar();

    expect(screen.queryByText(/trouxemos o que você digitou/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/^nome$/i)).toHaveValue("");
  });

  it("código errado acusa o campo do código, sem sair da etapa", async () => {
    montar();
    await userEvent.click(screen.getByRole("button", { name: "Criar conta" }));
    await preencherDados();
    await userEvent.click(screen.getByRole("button", { name: "Mandar o código" }));

    await confirmarCodigo("000000");

    expect(await screen.findByText(/código inválido ou vencido/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Confirme seu e-mail" })).toBeInTheDocument();
  });

  it("telefone com histórico: explica, pede pela barbearia no WhatsApp e deixa trocar o telefone", async () => {
    // Uma cópia do perfil: o padrão do dublê é compartilhado entre testes.
    const perfil = { ...criarApiClientFalso().estado.perfil, whatsapp: "(11) 98765-0000" };
    const falso = criarApiClientFalso({ telefonesComHistorico: ["11988887777"], perfil });
    montar(falso);
    await userEvent.click(screen.getByRole("button", { name: "Criar conta" }));
    await preencherDados();
    await userEvent.click(screen.getByRole("button", { name: "Mandar o código" }));

    await confirmarCodigo();

    expect(
      await screen.findByRole("heading", { level: 1, name: "Esse telefone já tem histórico aqui" })
    ).toBeInTheDocument();
    expect(sessaoDoCliente("gr-barber").ler()).toBeNull();
    const pedir = await screen.findByRole("link", { name: "Pedir pelo WhatsApp" });
    expect(pedir.getAttribute("href")).toContain("https://wa.me/5511987650000?text=");
    expect(decodeURIComponent(pedir.getAttribute("href")!)).toContain("maria@exemplo.com");

    await userEvent.click(screen.getByRole("button", { name: "Usar outro telefone" }));
    expect(screen.getByRole("heading", { level: 1, name: "Criar conta" })).toBeInTheDocument();
    expect(screen.getByLabelText(/telefone/i)).toHaveValue("(11) 98888-7777");
  });

  it("telefone com histórico e barbearia sem WhatsApp: oferece ligar", async () => {
    const falso = criarApiClientFalso();
    falso.publico.definirSenhaDoCliente = async () => {
      throw new ErroDaApi(422, "telefone_ja_cadastrado", "");
    };
    montar(falso);
    await userEvent.click(screen.getByRole("button", { name: "Criar conta" }));
    await preencherDados();
    await userEvent.click(screen.getByRole("button", { name: "Mandar o código" }));

    await confirmarCodigo();

    const ligar = await screen.findByRole("link", { name: "Ligar pra barbearia" });
    expect(ligar).toHaveAttribute("href", "tel:1133334444");
  });

  it("mandar outro código vai pro mesmo e-mail", async () => {
    const falso = montar();
    const pedidos: DestinoDoCodigo[] = [];
    falso.publico.pedirCodigoDoCliente = async (_slug, destino) => {
      pedidos.push(destino);
    };
    await userEvent.click(screen.getByRole("button", { name: "Criar conta" }));
    await preencherDados();
    await userEvent.click(screen.getByRole("button", { name: "Mandar o código" }));
    await screen.findByRole("heading", { level: 1, name: "Confirme seu e-mail" });

    await userEvent.click(screen.getByRole("button", { name: "Mandar outro código" }));

    await waitFor(() =>
      expect(pedidos).toEqual([{ email: "maria@exemplo.com" }, { email: "maria@exemplo.com" }])
    );
  });
});
