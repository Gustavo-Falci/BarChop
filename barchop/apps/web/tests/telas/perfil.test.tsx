import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { criarApiClientFalso, ErroDaApi } from "@barchop/api-client";
import { APARENCIA_PADRAO, CATEGORIAS_DE_SERVICO, REGRAS_PADRAO } from "@barchop/formato";
import type { ServicoSerializado } from "@barchop/types";
import { ProvedorDaApi } from "../../src/api/ProvedorDaApi";
import { PerfilDaBarbearia } from "../../src/telas/PerfilDaBarbearia";
import { sessaoDoCliente } from "../../src/sessao/armazenamento";
import { navegacaoFalsa } from "../ajudantes/navegacao";

// Terça, dez da manhã: dentro do horário da semente (seg a sáb, 9 às
// 18). O instante é prop, como nas telas do fluxo.
const TERCA_10H = new Date("2026-09-29T10:00:00-03:00");

function montar(falso = criarApiClientFalso(), agora = TERCA_10H) {
  render(
    <ProvedorDaApi valor={falso}>
      <PerfilDaBarbearia agora={agora} />
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

  it("o botão claro/escuro só aparece se o dono deixou o cliente trocar", async () => {
    const falso = criarApiClientFalso();
    montar(falso);
    await screen.findByRole("heading", { level: 1 });
    expect(screen.queryByRole("button", { name: /usar o modo/i })).not.toBeInTheDocument();
  });

  it("com a troca ligada na Aparência, a página inicial tem o botão", async () => {
    const falso = criarApiClientFalso();
    await falso.barbeiro.salvarRascunhoDaAparencia({ ...APARENCIA_PADRAO, clienteTrocaModo: true });
    await falso.barbeiro.publicarAparencia();
    montar(falso);

    expect(await screen.findByRole("button", { name: /usar o modo/i })).toBeInTheDocument();
  });

  describe("layout dos serviços (Aparência)", () => {
    const COM_CATEGORIAS: ServicoSerializado[] = [
      { id: "s1", nome: "Corte", duracaoMinutos: 30, preco: "40.00", ativo: true, categoria: "cabelo", descricao: null, fotoUrl: null },
      { id: "s2", nome: "Barba", duracaoMinutos: 20, preco: "30.00", ativo: true, categoria: "barba", descricao: null, fotoUrl: null },
    ];

    it("lista agrupada (o padrão): todas as categorias empilhadas, sem abas", async () => {
      montar(criarApiClientFalso({ servicos: COM_CATEGORIAS }));

      expect(await screen.findByRole("link", { name: /corte/i })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /barba/i })).toBeInTheDocument();
      expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    });

    it("abas de categoria: uma por vez, o cliente toca pra trocar", async () => {
      const falso = criarApiClientFalso({ servicos: COM_CATEGORIAS });
      await falso.barbeiro.salvarLayoutDosServicos("abas");
      montar(falso);

      const abas = await screen.findByRole("tablist", { name: /categorias/i });
      expect(within(abas).getByRole("tab", { name: "Cabelo" })).toHaveAttribute("aria-selected", "true");
      expect(screen.getByRole("link", { name: /corte/i })).toBeInTheDocument();
      expect(screen.queryByRole("link", { name: /barba/i })).not.toBeInTheDocument();

      await userEvent.click(within(abas).getByRole("tab", { name: "Barba" }));

      expect(screen.getByRole("tabpanel", { name: "Barba" })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /barba/i })).toBeInTheDocument();
      expect(screen.queryByRole("link", { name: /corte/i })).not.toBeInTheDocument();
    });

    it("as categorias seguem a ordem que o dono arrastou no painel", async () => {
      const falso = criarApiClientFalso({ servicos: COM_CATEGORIAS });
      await falso.barbeiro.salvarLayoutDosServicos("abas");
      await falso.barbeiro.salvarOrdemDasCategorias(["barba", "cabelo"]);
      montar(falso);

      const abas = await screen.findByRole("tablist", { name: /categorias/i });
      expect(within(abas).getAllByRole("tab").map((aba) => aba.textContent)).toEqual(["Barba", "Cabelo"]);
    });

    it("abas com uma categoria só não têm o que trocar: vira a lista", async () => {
      const falso = criarApiClientFalso({ servicos: [COM_CATEGORIAS[0]!] });
      await falso.barbeiro.salvarLayoutDosServicos("abas");
      montar(falso);

      expect(await screen.findByRole("link", { name: /corte/i })).toBeInTheDocument();
      expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    });
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
    expect(screen.getByText("Segunda a sábado")).toBeInTheDocument();
    expect(screen.getByText("09:00 às 18:00")).toBeInTheDocument();
  });

  it("diz que o domingo está fechado, em vez de sumir com ele", async () => {
    // Antes o dia fechado era omitido, pra não mostrar "Domingo —" sem
    // horário. Mas omitir deixava sem resposta quem queria saber se abre
    // domingo; "Fechado" é a resposta.
    montar();
    await screen.findByRole("heading", { name: /horário de funcionamento/i });

    expect(screen.getByText("Domingo")).toBeInTheDocument();
    expect(screen.getByText("Fechado")).toBeInTheDocument();
  });

  it("diz se está aberto agora e até quando", async () => {
    montar();

    expect(
      await screen.findByText("Aberto agora · fecha às 18:00")
    ).toBeInTheDocument();
  });

  it("cada serviço leva pro agendamento com ele já marcado, e mostra quanto dura", async () => {
    // Quem chega querendo "só um corte" não precisa achar o corte de
    // novo na tela seguinte.
    montar();

    const corte = await screen.findByRole("link", { name: /corte/i });
    expect(corte).toHaveAttribute("href", "/gr-barber/agendar?servicos=s1");
    expect(corte).toHaveTextContent("30 min");
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
      logoFormato: null,
      sobre: null,
      whatsapp: null,
      instagram: null,
      comodidades: [],
      formasDePagamento: [],
      capaUrl: null,
      aparencia: APARENCIA_PADRAO,
      ordemCategorias: [...CATEGORIAS_DE_SERVICO],
      ...REGRAS_PADRAO,
      horarios: [0, 1, 2, 3, 4, 5, 6].map((diaSemana) => ({
        diaSemana,
        horaAbertura: null,
        horaFechamento: null,
        fechado: true,
      })),
      barbeiros: [{ id: "barbeiro-1", nome: "Gu", servicoIds: [], fotoUrl: null }],
    });
    montar(falso);

    await screen.findByRole("heading", { name: "Barbearia Nova" });

    expect(screen.queryByRole("heading", { name: /serviços/i })).toBeNull();
    expect(
      screen.queryByRole("heading", { name: /horário de funcionamento/i })
    ).toBeNull();
    // Sem horário cadastrado, nada de "fechado" pra sempre.
    expect(screen.queryByText(/aberto agora|fechado agora/i)).toBeNull();
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
