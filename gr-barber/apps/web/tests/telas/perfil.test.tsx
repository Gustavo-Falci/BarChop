import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { criarApiClientFalso, ErroDaApi } from "@gr-barber/api-client";
import { ProvedorDaApi } from "../../src/api/ProvedorDaApi";
import { PerfilDaBarbearia } from "../../src/telas/PerfilDaBarbearia";
import { sessaoDoCliente } from "../../src/sessao/armazenamento";
import { navegacaoFalsa } from "../ajudantes/navegacao";

function montar(falso = criarApiClientFalso()) {
  render(
    <ProvedorDaApi valor={falso}>
      <PerfilDaBarbearia />
    </ProvedorDaApi>
  );
  return falso;
}

describe("perfil da barbearia", () => {
  beforeEach(() => navegacaoFalsa.redefinir());

  it("mostra nome e endereço da barbearia", async () => {
    montar();
    // `level: 1` porque a página passou a ter os títulos de Serviços e
    // Horário de funcionamento: sem qualificar, `getByRole("heading")`
    // acha três e estoura.
    await waitFor(() =>
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
        "GR Barber"
      )
    );
    expect(screen.getByText("Rua das Tesouras, 123")).toBeInTheDocument();
  });

  it("leva pro primeiro passo do agendamento", async () => {
    montar();
    await waitFor(() => screen.getByRole("heading", { level: 1 }));

    await userEvent.click(screen.getByRole("button", { name: /agendar/i }));

    expect(navegacaoFalsa.push).toHaveBeenCalledWith("/gr-barber/agendar");
  });

  it("mostra a apresentação, os serviços com preço e o horário", async () => {
    // É o que a home existe pra dizer: quem chega pelo link do WhatsApp
    // decide aqui se vale agendar.
    montar();

    expect(
      await screen.findByText(/barbearia de bairro desde 2012/i)
    ).toBeInTheDocument();

    expect(screen.getByRole("heading", { name: /serviços/i })).toBeInTheDocument();
    expect(screen.getByText("Corte")).toBeInTheDocument();
    expect(screen.getByText("R$ 40,00")).toBeInTheDocument();

    expect(
      screen.getByRole("heading", { name: /horário de funcionamento/i })
    ).toBeInTheDocument();
    expect(screen.getByText("Segunda")).toBeInTheDocument();
    expect(screen.getAllByText("09:00 às 18:00").length).toBeGreaterThan(0);
  });

  it("não lista o dia fechado", async () => {
    // Domingo é `fechado: true` na semente. Listar "Domingo —" seria
    // dizer que abre e não informar o horário.
    montar();
    await screen.findByRole("heading", { name: /horário de funcionamento/i });

    expect(screen.queryByText("Domingo")).toBeNull();
  });

  it("esconde as seções vazias em vez de anunciar que não tem nada", async () => {
    // Barbearia recém-criada não tem serviço nem horário. "Serviços
    // (nenhum)" na página pública lê-se como barbearia fechada por quem
    // chegou pelo link, e como produto quebrado por quem acabou de criar
    // a conta. Quem cobra o cadastro é o painel, não a vitrine.
    const falso = criarApiClientFalso();
    falso.publico.servicos = async () => [];
    falso.publico.perfilDaBarbearia = async () => ({
      id: "b1",
      nome: "Barbearia Nova",
      slug: "gr-barber",
      telefone: null,
      endereco: null,
      logoUrl: null,
      sobre: null,
      horarios: [0, 1, 2, 3, 4, 5, 6].map((diaSemana) => ({
        diaSemana,
        horaAbertura: null,
        horaFechamento: null,
        fechado: true,
      })),
      barbeiros: [{ id: "barbeiro-1", nome: "Gu" }],
    });
    montar(falso);

    await screen.findByRole("heading", { name: "Barbearia Nova" });

    expect(screen.queryByRole("heading", { name: /serviços/i })).toBeNull();
    expect(
      screen.queryByRole("heading", { name: /horário de funcionamento/i })
    ).toBeNull();
    // E o caminho principal continua ali: sem cadastro nenhum, a home
    // ainda é um convite pra agendar.
    expect(screen.getByRole("button", { name: /agendar/i })).toBeInTheDocument();
  });

  it("dá tela própria pra barbearia que não existe", async () => {
    // Link errado no WhatsApp, slug renomeado: precisa ser uma tela, não
    // um erro cru.
    navegacaoFalsa.redefinir({ slug: "nao-existe" });
    montar();

    await waitFor(() =>
      expect(screen.getByText(/não encontramos essa barbearia/i)).toBeInTheDocument()
    );
  });

  it("distingue barbearia inexistente de API indisponível", async () => {
    // Uma barbearia inexistente (404) é tráfego comum do WhatsApp.
    // Uma API indisponível (500) precisa ser clara: não é "barbearia não
    // encontrada", porque o cliente precisaria de ações diferentes (tentar
    // de novo mais tarde vs. reportar link quebrado).
    const falso = criarApiClientFalso();
    falso.publico.perfilDaBarbearia = async () => {
      throw new ErroDaApi(500, "erro_interno", "");
    };
    montar(falso);

    await waitFor(() =>
      expect(screen.getByText(/não foi possível abrir esta página/i)).toBeInTheDocument()
    );
  });

  it("sem sessão, a página da barbearia oferece entrar", async () => {
    // Na home a barra não aparece (o nome já é o título), então o
    // caminho pra conta mora aqui.
    localStorage.clear();
    montar();
    await waitFor(() => screen.getByRole("heading", { level: 1 }));

    expect(await screen.findByRole("link", { name: "Entrar" })).toHaveAttribute(
      "href",
      "/gr-barber/entrar"
    );
  });

  it("com sessão, a página da barbearia leva aos agendamentos", async () => {
    localStorage.clear();
    sessaoDoCliente("gr-barber").gravar("token");
    montar();
    await waitFor(() => screen.getByRole("heading", { level: 1 }));

    expect(
      await screen.findByRole("link", { name: "Meus agendamentos" })
    ).toHaveAttribute("href", "/gr-barber/minha-conta");
  });
});
