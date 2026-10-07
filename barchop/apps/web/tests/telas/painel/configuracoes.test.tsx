import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { criarApiClientFalso } from "@barchop/api-client";
import type { HorarioSerializado } from "@barchop/types";
import { ComunicacaoDaBarbearia } from "../../../src/telas/painel/configuracoes/ComunicacaoDaBarbearia";
import { DadosDoNegocio } from "../../../src/telas/painel/configuracoes/DadosDoNegocio";
import { HorariosDaBarbearia } from "../../../src/telas/painel/configuracoes/HorariosDaBarbearia";
import { NotificacoesDaBarbearia } from "../../../src/telas/painel/configuracoes/NotificacoesDaBarbearia";
import { SeuPerfil } from "../../../src/telas/painel/configuracoes/SeuPerfil";
import { navegacaoFalsa } from "../../ajudantes/navegacao";
import { montarPainel } from "../../ajudantes/painel";
import { montarPainelComSonda } from "../../ajudantes/sondaDeCorrida";
import { sessaoDaBarbearia } from "../../../src/sessao/armazenamento";

// As subtelas das Configurações (painel v2, marco 2). Os casos que antes
// moravam na tela única foram pra subtela da área deles, sem mudar o
// comportamento; os novos cobrem a moldura (voltar, selo, próxima área).

const GR_BARBER = { id: "b1", nome: "GR Barber", slug: "gr-barber" };
const PEDIDO = {
  id: "pedido-semeado",
  slugPedido: "gr-barber-centro",
  motivo: null,
  status: "pendente" as const,
  resposta: null,
  criadoEm: "2026-10-04T12:00:00.000Z",
  decididoEm: null,
};

beforeEach(() => {
  localStorage.clear();
  navegacaoFalsa.redefinir({ pathname: "/painel/configuracoes" });
});

describe("moldura das subtelas", () => {
  it("volta pro índice das Configurações", async () => {
    montarPainel(<ComunicacaoDaBarbearia />, criarApiClientFalso());

    expect(await screen.findByRole("link", { name: /Configurações/ })).toHaveAttribute(
      "href",
      "/painel/configuracoes"
    );
  });

  it("área nunca salva tem o selo Faltando; salvar troca pra Configurado", async () => {
    montarPainel(<ComunicacaoDaBarbearia />, criarApiClientFalso());

    const cabecalho = await screen.findByRole("banner");
    expect(cabecalho).toHaveTextContent("Faltando");

    await userEvent.click(screen.getByRole("button", { name: /salvar comunicação/i }));

    await waitFor(() => expect(screen.getByRole("banner")).toHaveTextContent("Configurado"));
  });

  it("aponta a próxima área que falta, na ordem do índice", async () => {
    montarPainel(<ComunicacaoDaBarbearia />, criarApiClientFalso({ areasDecididas: ["horarios", "regras_de_agendamento"] }));

    expect(await screen.findByRole("link", { name: /próxima área faltando: dados do negócio/i })).toHaveAttribute(
      "href",
      "/painel/configuracoes/dados-do-negocio"
    );
  });

  it("não aponta a própria área nem as já decididas", async () => {
    montarPainel(
      <ComunicacaoDaBarbearia />,
      criarApiClientFalso({ areasDecididas: ["horarios", "regras_de_agendamento", "dados_do_negocio"] })
    );

    expect(await screen.findByRole("link", { name: /próxima área faltando: notificações/i })).toBeInTheDocument();
  });

  it("com tudo decidido, não há próxima área", async () => {
    montarPainel(
      <ComunicacaoDaBarbearia />,
      criarApiClientFalso({ areasDecididas: ["horarios", "regras_de_agendamento", "dados_do_negocio", "comunicacao", "notificacoes"] })
    );

    await screen.findByRole("button", { name: /salvar comunicação/i });
    expect(screen.queryByRole("link", { name: /próxima área faltando/i })).not.toBeInTheDocument();
  });

  it("quem não é dono não edita a área da barbearia", async () => {
    montarPainel(<HorariosDaBarbearia />, criarApiClientFalso({ papel: "profissional" }));

    expect(await screen.findByText(/só o dono/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /salvar horários/i })).not.toBeInTheDocument();
  });
});

describe("dados do negócio · identidade", () => {
  it("chega preenchida com os dados da barbearia", async () => {
    montarPainel(<DadosDoNegocio />, criarApiClientFalso());

    expect(await screen.findByDisplayValue("GR Barber")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Rua das Tesouras, 123")).toBeInTheDocument();
  });

  it("lê a barbearia pelo escopo do painel, não pela rota pública", async () => {
    const falso = criarApiClientFalso();
    falso.publico.perfilDaBarbearia = async () => {
      throw new Error("Configurações não deveria ler a rota pública");
    };

    montarPainel(<DadosDoNegocio />, falso);

    expect(await screen.findByDisplayValue("GR Barber")).toBeInTheDocument();
  });

  it("as abas são Identidade, Marca e Comodidades, e trocam o painel", async () => {
    montarPainel(<DadosDoNegocio />, criarApiClientFalso());

    const identidade = await screen.findByRole("tab", { name: "Identidade" });
    expect(identidade).toHaveAttribute("aria-selected", "true");
    await userEvent.click(screen.getByRole("tab", { name: "Comodidades" }));

    expect(screen.getByRole("tab", { name: "Comodidades" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("checkbox", { name: "Wi-Fi" })).toBeInTheDocument();
    expect(screen.queryByLabelText(/nome da barbearia/i)).not.toBeInTheDocument();
  });

  it("a aba vem da URL (?aba=marca)", async () => {
    navegacaoFalsa.redefinir({ pathname: "/painel/configuracoes/dados-do-negocio", query: { aba: "marca" } });
    montarPainel(<DadosDoNegocio />, criarApiClientFalso());

    expect(await screen.findByRole("tab", { name: "Marca" })).toHaveAttribute("aria-selected", "true");
  });

  // F4 (decisão do dono, 2026-10-04): o link é único pra sempre e só o
  // suporte troca. A identidade mostra o link e pede a troca.
  it("mostra o link no host da barbearia, só pra leitura", async () => {
    vi.stubEnv("NEXT_PUBLIC_URL_DO_SITE", "https://barchop.com.br");
    try {
      montarPainel(<DadosDoNegocio />, criarApiClientFalso());

      const campo = await screen.findByLabelText(/link da barbearia/i);
      expect(campo).toHaveValue("https://gr-barber.barchop.com.br");
      expect(campo).toHaveAttribute("readonly");
      expect(campo).toHaveAccessibleDescription(/suporte/i);
      expect(screen.queryByRole("button", { name: /trocar link/i })).not.toBeInTheDocument();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("pede a troca do link com o motivo, e o link não muda até o suporte aprovar", async () => {
    const falso = criarApiClientFalso();
    sessaoDaBarbearia.gravar("gr-barber");
    montarPainel(<DadosDoNegocio />, falso);

    await userEvent.type(await screen.findByLabelText(/novo link/i), "GR-Barber-Centro");
    await userEvent.type(screen.getByLabelText(/motivo/i), "mudamos de endereço");
    await userEvent.click(screen.getByRole("button", { name: /pedir troca/i }));

    expect(await screen.findByText(/aguardando o suporte/i)).toBeInTheDocument();
    expect(screen.getByText(/gr-barber-centro/)).toBeInTheDocument();
    expect(falso.estado.solicitacoesDeLink).toMatchObject([
      { slugPedido: "gr-barber-centro", motivo: "mudamos de endereço", status: "pendente" },
    ]);
    expect(falso.estado.perfil.slug).toBe("gr-barber");
    expect(sessaoDaBarbearia.ler()).toBe("gr-barber");
    expect(screen.queryByLabelText(/novo link/i)).not.toBeInTheDocument();
  });

  it("pedir a troca não apaga o que foi digitado e ainda não salvo", async () => {
    montarPainel(<DadosDoNegocio />, criarApiClientFalso());

    const nome = await screen.findByLabelText(/nome da barbearia/i);
    await userEvent.clear(nome);
    await userEvent.type(nome, "GR Barber Centro");
    await userEvent.type(screen.getByLabelText(/novo link/i), "gr-barber-centro");
    await userEvent.click(screen.getByRole("button", { name: /pedir troca/i }));

    expect(await screen.findByText(/aguardando o suporte/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/nome da barbearia/i)).toHaveValue("GR Barber Centro");
  });

  it.each([
    ["fora do formato", "gr", /letras minúsculas, números e hífen/i],
    ["reservado", "admin", /reservado/i],
    ["igual ao atual", "gr-barber", /já é o link/i],
  ])("recusa link %s no campo, sem chamar a API", async (_caso, digitado, mensagem) => {
    const falso = criarApiClientFalso();
    const pedir = vi.fn(async () => {
      throw new Error("não deveria chamar");
    });
    falso.barbeiro.pedirTrocaDeLink = pedir;

    montarPainel(<DadosDoNegocio />, falso);

    await userEvent.type(await screen.findByLabelText(/novo link/i), digitado);
    await userEvent.click(screen.getByRole("button", { name: /pedir troca/i }));

    expect(await screen.findByText(mensagem)).toBeInTheDocument();
    expect(pedir).not.toHaveBeenCalled();
  });

  it("link de outra barbearia fica no campo", async () => {
    montarPainel(<DadosDoNegocio />, criarApiClientFalso({ slugsEmUso: ["navalha"] }));

    await userEvent.type(await screen.findByLabelText(/novo link/i), "navalha");
    await userEvent.click(screen.getByRole("button", { name: /pedir troca/i }));

    expect(await screen.findByText(/já está em uso/i)).toBeInTheDocument();
  });

  it("com pedido pendente, mostra o pedido e deixa cancelar", async () => {
    const falso = criarApiClientFalso({
      solicitacoesDeLink: [{ ...PEDIDO, barbearia: GR_BARBER }],
    });
    montarPainel(<DadosDoNegocio />, falso);

    expect(await screen.findByText(/aguardando o suporte/i)).toBeInTheDocument();
    expect(screen.getByText(/gr-barber-centro/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /cancelar pedido/i }));

    expect(await screen.findByLabelText(/novo link/i)).toBeInTheDocument();
    expect(falso.estado.solicitacoesDeLink![0].status).toBe("cancelada");
  });

  it("pedido recusado mostra a resposta do suporte e deixa pedir de novo", async () => {
    const falso = criarApiClientFalso({
      solicitacoesDeLink: [
        {
          ...PEDIDO,
          status: "recusada",
          resposta: "Esse nome é de uma marca registrada.",
          decididoEm: "2026-10-05T10:00:00.000Z",
          barbearia: GR_BARBER,
        },
      ],
    });
    montarPainel(<DadosDoNegocio />, falso);

    expect(await screen.findByText(/recusado/i)).toBeInTheDocument();
    expect(screen.getByText("Esse nome é de uma marca registrada.")).toBeInTheDocument();
    expect(screen.getByLabelText(/novo link/i)).toBeInTheDocument();
  });

  it("salva nome, endereço e sobre — e o telefone não vai junto (é da Comunicação)", async () => {
    const falso = criarApiClientFalso();
    const original = falso.barbeiro.atualizarMinhaBarbearia;
    const salvar = vi.fn(async (edicao: Parameters<typeof original>[0]) => original(edicao));
    falso.barbeiro.atualizarMinhaBarbearia = salvar;

    montarPainel(<DadosDoNegocio />, falso);

    const campo = await screen.findByLabelText(/nome da barbearia/i);
    await userEvent.clear(campo);
    await userEvent.type(campo, "GR Barber Centro");
    await userEvent.click(screen.getByRole("button", { name: /salvar dados/i }));

    await waitFor(() =>
      expect(salvar).toHaveBeenCalledWith({
        nome: "GR Barber Centro",
        endereco: "Rua das Tesouras, 123",
        sobre: "Barbearia de bairro desde 2012. Corte na tesoura e barba na navalha.",
      })
    );
  });

  // Apêndice: nenhum dos handlers tinha trava de reenvio — um duplo
  // clique enquanto a primeira chamada ainda está em voo mandaria duas
  // requisições da mesma ação. A asserção é sobre quantas vezes o método
  // da API foi chamado, não sobre o atributo `disabled` do botão.
  it("um segundo clique não dispara outra chamada enquanto a primeira está em voo", async () => {
    const falso = criarApiClientFalso();
    const original = falso.barbeiro.atualizarMinhaBarbearia;

    let liberar: () => void = () => {};
    const pendente = new Promise<void>((resolve) => {
      liberar = resolve;
    });
    const salvar = vi.fn(async (edicao: Parameters<typeof original>[0]) => {
      await pendente;
      return original(edicao);
    });
    falso.barbeiro.atualizarMinhaBarbearia = salvar;

    montarPainel(<DadosDoNegocio />, falso);

    const botao = await screen.findByRole("button", { name: /salvar dados/i });
    await userEvent.click(botao);
    await userEvent.click(botao);

    liberar();
    await waitFor(() => expect(salvar).toHaveBeenCalled());
    expect(salvar).toHaveBeenCalledTimes(1);
  });

  // Apêndice: 181514d fechou a corrida de sincronização desta tela (o
  // modelo que DetalheDoCliente, CadastroDeServico e DetalheDoAgendamento
  // copiaram). Mecanismo da prova em `sondaDeCorrida.tsx`: a sonda faz a
  // tela commitar com os dados no mesmo lote, e o `fireEvent.change` roda
  // antes de qualquer effect passivo pendente.
  it("digitar no instante em que os dados chegam não perde a edição (corrida de sincronização)", async () => {
    const falso = criarApiClientFalso();
    const original = falso.barbeiro.atualizarMinhaBarbearia;
    const salvar = vi.fn(async (edicao: Parameters<typeof original>[0]) => original(edicao));
    falso.barbeiro.atualizarMinhaBarbearia = salvar;

    let liberar: () => void = () => {};
    const pendente = new Promise<void>((resolve) => {
      liberar = resolve;
    });
    const barbeariaOriginal = falso.barbeiro.minhaBarbearia;
    let disparoDaSonda: () => void = () => {};
    falso.barbeiro.minhaBarbearia = async () => {
      await pendente;
      disparoDaSonda();
      return barbeariaOriginal();
    };

    let chamadas = 0;
    let resolverProntinho: () => void = () => {};
    const prontinho = new Promise<void>((resolve) => {
      resolverProntinho = resolve;
    });
    const { disparar } = montarPainelComSonda(<DadosDoNegocio />, falso, () => {
      chamadas++;
      if (chamadas < 2) return;
      resolverProntinho();
    });
    disparoDaSonda = disparar;

    await screen.findByText(/carregando/i);
    liberar();

    await prontinho;
    const campo = screen.getByLabelText(/nome da barbearia/i) as HTMLInputElement;
    fireEvent.change(campo, { target: { value: "GR Barber Centro" } });

    await userEvent.click(screen.getByRole("button", { name: /salvar dados/i }));

    await waitFor(() =>
      expect(salvar).toHaveBeenCalledWith(expect.objectContaining({ nome: "GR Barber Centro" }))
    );
  });
});

describe("notificações", () => {
  // G2c: o interruptor do lembrete, por barbearia.
  it("mostra o lembrete ligado e desliga ao salvar", async () => {
    const falso = criarApiClientFalso();
    montarPainel(<NotificacoesDaBarbearia />, falso);

    const chave = await screen.findByRole("checkbox", { name: /enviar lembrete por e-mail/i });
    expect(chave).toBeChecked();
    await userEvent.click(chave);
    await userEvent.click(screen.getByRole("button", { name: /salvar lembrete/i }));

    await waitFor(() => expect(falso.estado.lembreteAtivo).toBe(false));
  });

  it("ligar avisa que os agendamentos já marcados também recebem", async () => {
    const falso = criarApiClientFalso({ lembreteAtivo: false });
    montarPainel(<NotificacoesDaBarbearia />, falso);

    const chave = await screen.findByRole("checkbox", { name: /enviar lembrete por e-mail/i });
    expect(chave).not.toBeChecked();
    expect(chave).toHaveAccessibleDescription(/já marcados/i);
    await userEvent.click(chave);
    await userEvent.click(screen.getByRole("button", { name: /salvar lembrete/i }));

    await waitFor(() => expect(falso.estado.lembreteAtivo).toBe(true));
  });
});

describe("horários", () => {
  it("dá a cada hora da semana um nome acessível com o dia, apesar do rótulo curto", async () => {
    // O rótulo visível é só "Abre"/"Fecha"; o nome acessível traz o dia,
    // senão a semana vira uma fileira de campos "Abre" indistinguíveis
    // pra quem navega por voz.
    montarPainel(<HorariosDaBarbearia />, criarApiClientFalso());

    expect(await screen.findByLabelText("Abre na segunda")).toBeInTheDocument();
    expect(screen.getByLabelText("Fecha na segunda")).toBeInTheDocument();
    expect(screen.getByLabelText("Abre na terça")).toBeInTheDocument();
    expect(screen.getAllByText("Abre").length).toBeGreaterThan(1);
  });

  it("manda a semana inteira, inclusive os dias fechados", async () => {
    // Dia ausente do corpo vira fechado na API, de propósito: "sem
    // linha" e "fechado" são estados diferentes pro cálculo de
    // disponibilidade. A tela edita os sete e envia os sete, sempre.
    const falso = criarApiClientFalso();
    const original = falso.barbeiro.salvarHorarios;
    const salvar = vi.fn(async (horarios: HorarioSerializado[]) => original(horarios));
    falso.barbeiro.salvarHorarios = salvar;

    montarPainel(<HorariosDaBarbearia />, falso);

    await userEvent.click(await screen.findByRole("button", { name: /salvar horários/i }));

    await waitFor(() => expect(salvar).toHaveBeenCalled());
    expect(salvar.mock.calls[0][0]).toHaveLength(7);
  });

  it("fechar um dia limpa abertura e fechamento", async () => {
    const falso = criarApiClientFalso();
    const original = falso.barbeiro.salvarHorarios;
    const salvar = vi.fn(async (horarios: HorarioSerializado[]) => original(horarios));
    falso.barbeiro.salvarHorarios = salvar;

    montarPainel(<HorariosDaBarbearia />, falso);

    await userEvent.click(await screen.findByRole("checkbox", { name: /fechado na segunda/i }));
    await userEvent.click(screen.getByRole("button", { name: /salvar horários/i }));

    await waitFor(() => expect(salvar).toHaveBeenCalled());
    const segunda = salvar.mock.calls[0][0].find((h) => h.diaSemana === 1);
    expect(segunda).toMatchObject({ fechado: true, horaAbertura: null, horaFechamento: null });
  });

  // Antes de GET /barbearias/me/horarios responder, `semana` é `[]`. Um
  // clique em "Salvar horários" nessa janela mandaria um array vazio, e
  // a API fecha os sete dias quando um dia falta no corpo.
  it("não manda horários vazios enquanto a semana ainda está carregando", async () => {
    const falso = criarApiClientFalso();
    const original = falso.barbeiro.salvarHorarios;
    const salvar = vi.fn(async (horarios: HorarioSerializado[]) => original(horarios));
    falso.barbeiro.salvarHorarios = salvar;

    let liberar: () => void = () => {};
    const pendente = new Promise<void>((resolve) => {
      liberar = resolve;
    });
    const horariosOriginais = falso.barbeiro.horarios;
    falso.barbeiro.horarios = async () => {
      await pendente;
      return horariosOriginais();
    };

    montarPainel(<HorariosDaBarbearia />, falso);

    await screen.findByText(/carregando/i);
    const botao = screen.queryByRole("button", { name: /salvar horários/i });
    if (botao) await userEvent.click(botao);

    expect(salvar).not.toHaveBeenCalled();

    liberar();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /salvar horários/i })).toBeInTheDocument()
    );
  });
});

describe("seu perfil", () => {
  it("telefone do perfil sem DDD para no campo", async () => {
    montarPainel(<SeuPerfil />, criarApiClientFalso());

    await userEvent.type(await screen.findByLabelText(/seu telefone/i), "988887777");
    await userEvent.click(screen.getByRole("button", { name: /salvar perfil/i }));

    expect(await screen.findByText(/informe o DDD/i)).toBeInTheDocument();
  });

  it("volta pras Configurações, sem selo: o perfil não conta como área", async () => {
    montarPainel(<SeuPerfil />, criarApiClientFalso());

    expect(await screen.findByRole("link", { name: /Configurações/ })).toBeInTheDocument();
    expect(screen.getByRole("banner")).not.toHaveTextContent(/faltando|configurado/i);
  });
});
