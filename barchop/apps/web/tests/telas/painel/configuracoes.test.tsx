import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { criarApiClientFalso } from "@barchop/api-client";
import type { HorarioSerializado } from "@barchop/types";
import { ConfiguracoesDaBarbearia } from "../../../src/telas/painel/ConfiguracoesDaBarbearia";
import { navegacaoFalsa } from "../../ajudantes/navegacao";
import { montarPainel } from "../../ajudantes/painel";
import { montarPainelComSonda } from "../../ajudantes/sondaDeCorrida";
import { sessaoDaBarbearia } from "../../../src/sessao/armazenamento";

describe("configurações da barbearia", () => {
  beforeEach(() => {
    localStorage.clear();
    navegacaoFalsa.redefinir({ pathname: "/painel/configuracoes" });
  });

  it("chega preenchida com os dados da barbearia", async () => {
    montarPainel(<ConfiguracoesDaBarbearia />, criarApiClientFalso());

    expect(await screen.findByDisplayValue("GR Barber")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Rua das Tesouras, 123")).toBeInTheDocument();
  });

  it("lê a barbearia pelo escopo do painel, não pela rota pública", async () => {
    const falso = criarApiClientFalso();
    falso.publico.perfilDaBarbearia = async () => {
      throw new Error("Configurações não deveria ler a rota pública");
    };

    montarPainel(<ConfiguracoesDaBarbearia />, falso);

    expect(await screen.findByDisplayValue("GR Barber")).toBeInTheDocument();
  });

  it("troca o link da barbearia e atualiza o slug da sessão", async () => {
    const falso = criarApiClientFalso();
    const original = falso.barbeiro.trocarSlug;
    const trocar = vi.fn(async (slug: string) => original(slug));
    falso.barbeiro.trocarSlug = trocar;

    montarPainel(<ConfiguracoesDaBarbearia />, falso);

    const campo = await screen.findByLabelText(/link da barbearia/i);
    await userEvent.clear(campo);
    await userEvent.type(campo, "gr-barber-centro");
    await userEvent.click(screen.getByRole("button", { name: /trocar link/i }));

    await waitFor(() => expect(trocar).toHaveBeenCalledWith("gr-barber-centro"));
    await waitFor(() => expect(sessaoDaBarbearia.ler()).toBe("gr-barber-centro"));
  });

  it("trocar o link não apaga o que foi digitado e ainda não salvo", async () => {
    montarPainel(<ConfiguracoesDaBarbearia />, criarApiClientFalso());

    const nome = await screen.findByLabelText(/nome da barbearia/i);
    await userEvent.clear(nome);
    await userEvent.type(nome, "GR Barber Centro");

    const link = screen.getByLabelText(/link da barbearia/i);
    await userEvent.clear(link);
    await userEvent.type(link, "gr-barber-centro");
    await userEvent.click(screen.getByRole("button", { name: /trocar link/i }));

    await waitFor(() => expect(sessaoDaBarbearia.ler()).toBe("gr-barber-centro"));
    expect(screen.getByLabelText(/nome da barbearia/i)).toHaveValue("GR Barber Centro");
  });

  it("recusa link reservado no campo, sem chamar a API", async () => {
    const falso = criarApiClientFalso();
    const trocar = vi.fn(async () => {
      throw new Error("não deveria chamar");
    });
    falso.barbeiro.trocarSlug = trocar;

    montarPainel(<ConfiguracoesDaBarbearia />, falso);

    const campo = await screen.findByLabelText(/link da barbearia/i);
    await userEvent.clear(campo);
    await userEvent.type(campo, "admin");
    await userEvent.click(screen.getByRole("button", { name: /trocar link/i }));

    expect(await screen.findByText(/esse link é reservado/i)).toBeInTheDocument();
    expect(trocar).not.toHaveBeenCalled();
  });

  it("salva os dados da barbearia", async () => {
    const falso = criarApiClientFalso();
    const original = falso.barbeiro.atualizarMinhaBarbearia;
    const salvar = vi.fn(async (edicao: { nome?: string; endereco?: string | null }) =>
      original(edicao)
    );
    falso.barbeiro.atualizarMinhaBarbearia = salvar;

    montarPainel(<ConfiguracoesDaBarbearia />, falso);

    const campo = await screen.findByLabelText(/nome da barbearia/i);
    await userEvent.clear(campo);
    await userEvent.type(campo, "GR Barber Centro");
    await userEvent.click(screen.getByRole("button", { name: /salvar dados/i }));

    await waitFor(() =>
      expect(salvar).toHaveBeenCalledWith(expect.objectContaining({ nome: "GR Barber Centro" }))
    );
  });

  it("põe o perfil antes do horário no DOM, que é onde ele aparece na tela", async () => {
    // No desktop a tela é de duas colunas: Barbearia, Lembrete e Seu
    // perfil empilhados à esquerda, Horário de funcionamento à direita. A ordem
    // do DOM segue a ordem visual porque é ela que o Tab percorre —
    // deixar "Horário" no meio faria o foco saltar da coluna esquerda
    // pra direita e voltar.
    //
    // Isto morre se alguém reordenar as seções pela ordem que parece
    // mais lógica lendo o código (barbearia → horário → perfil), que é
    // justamente a que descasa do que se vê.
    montarPainel(<ConfiguracoesDaBarbearia />, criarApiClientFalso());

    await screen.findByRole("heading", { name: "Barbearia" });
    const titulos = screen
      .getAllByRole("heading", { level: 2 })
      .map((h) => h.textContent);

    expect(titulos).toEqual([
      "Barbearia",
      "Lembrete",
      "Seu perfil",
      "Horário de funcionamento",
    ]);
  });

  it("dá a cada hora da semana um nome acessível com o dia, apesar do rótulo curto", async () => {
    // O rótulo que se lê na tela é só "Abre"/"Fecha" — repetir o dia em
    // cada um fazia a coluna quebrar em duas linhas. O nome acessível
    // continua trazendo o dia, senão a semana vira uma fileira de
    // campos "Abre" indistinguíveis pra quem navega por voz.
    //
    // Este teste morre se alguém "limpar" o aria-label achando que ele
    // duplica o rótulo: sem ele o nome acessível vira "Abre", e a busca
    // pelo dia não acha nada.
    montarPainel(<ConfiguracoesDaBarbearia />, criarApiClientFalso());

    expect(await screen.findByLabelText("Abre na segunda")).toBeInTheDocument();
    expect(screen.getByLabelText("Fecha na segunda")).toBeInTheDocument();
    // Dois dias diferentes, pra provar que o nome acompanha a linha e
    // não é uma string fixa que passaria igual em qualquer uma.
    expect(screen.getByLabelText("Abre na terça")).toBeInTheDocument();

    // E o rótulo visível é mesmo o curto — se voltasse a ser o longo,
    // as duas asserções de cima passariam e o motivo da mudança teria
    // se perdido sem ninguém notar.
    expect(screen.getAllByText("Abre").length).toBeGreaterThan(1);
  });

  it("manda a semana inteira, inclusive os dias fechados", async () => {
    // Dia ausente do corpo vira fechado na API, de propósito: "sem
    // linha" e "fechado" são estados diferentes pro cálculo de
    // disponibilidade. A tela edita os sete e envia os sete, sempre.
    const falso = criarApiClientFalso();
    const original = falso.barbeiro.salvarHorarios;
    const salvar = vi.fn(async (horarios: HorarioSerializado[]) =>
      original(horarios)
    );
    falso.barbeiro.salvarHorarios = salvar;

    montarPainel(<ConfiguracoesDaBarbearia />, falso);

    await userEvent.click(await screen.findByRole("button", { name: /salvar horários/i }));

    await waitFor(() => expect(salvar).toHaveBeenCalled());
    expect(salvar.mock.calls[0][0]).toHaveLength(7);
  });

  it("fechar um dia limpa abertura e fechamento", async () => {
    const falso = criarApiClientFalso();
    const original = falso.barbeiro.salvarHorarios;
    const salvar = vi.fn(async (horarios: HorarioSerializado[]) =>
      original(horarios)
    );
    falso.barbeiro.salvarHorarios = salvar;

    montarPainel(<ConfiguracoesDaBarbearia />, falso);

    await userEvent.click(await screen.findByRole("checkbox", { name: /fechado na segunda/i }));
    await userEvent.click(screen.getByRole("button", { name: /salvar horários/i }));

    await waitFor(() => expect(salvar).toHaveBeenCalled());
    const segunda = salvar.mock.calls[0][0].find((h) => h.diaSemana === 1);
    expect(segunda).toMatchObject({ fechado: true, horaAbertura: null, horaFechamento: null });
  });

  it("telefone do perfil sem DDD para no campo", async () => {
    montarPainel(<ConfiguracoesDaBarbearia />, criarApiClientFalso());

    await userEvent.type(await screen.findByLabelText(/seu telefone/i), "988887777");
    await userEvent.click(screen.getByRole("button", { name: /salvar perfil/i }));

    expect(await screen.findByText(/informe o DDD/i)).toBeInTheDocument();
  });

  // Apêndice: a tela edita os sete dias e envia os sete, sempre — mas
  // antes de GET /barbearias/me/horarios responder, `semana` é `[]`.
  // Um clique em "Salvar horários" nessa janela mandaria um array
  // vazio, e a API fecha os sete dias quando um dia falta no corpo:
  // um clique comum, num instante comum, fecharia a barbearia inteira
  // em silêncio. Isso é dano de produção, não só a corrida de teste
  // que motivou a trava original — a trava também impede este clique.
  it("não manda horários vazios enquanto a semana ainda está carregando", async () => {
    const falso = criarApiClientFalso();
    const original = falso.barbeiro.salvarHorarios;
    const salvar = vi.fn(async (horarios: HorarioSerializado[]) => original(horarios));
    falso.barbeiro.salvarHorarios = salvar;

    // Trava a leitura da semana até o teste mandar liberar: sem isso
    // não há como observar a tela no instante em que a semana ainda
    // não chegou.
    let liberar: () => void = () => {};
    const pendente = new Promise<void>((resolve) => {
      liberar = resolve;
    });
    const horariosOriginais = falso.barbeiro.horarios;
    falso.barbeiro.horarios = async () => {
      await pendente;
      return horariosOriginais();
    };

    montarPainel(<ConfiguracoesDaBarbearia />, falso);

    await screen.findByText(/carregando/i);
    // O botão pode não existir ainda (tela travada) ou existir
    // desabilitado — o que importa é o resultado: nenhum array vazio
    // chega à API. Um clique tentado aqui não pode ter efeito.
    const botao = screen.queryByRole("button", { name: /salvar horários/i });
    if (botao) await userEvent.click(botao);

    expect(salvar).not.toHaveBeenCalled();

    liberar();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /salvar horários/i })).toBeInTheDocument()
    );
  });

  // Apêndice: nenhum dos três handlers tinha trava de reenvio — um
  // duplo clique enquanto a primeira chamada ainda está em voo mandaria
  // duas requisições da mesma ação. A asserção é sobre quantas vezes o
  // método da API foi chamado, não sobre o atributo `disabled` do
  // botão: checar só o atributo prova o atributo, não o comportamento
  // que ele existe pra garantir.
  it("um segundo clique não dispara outra chamada enquanto a primeira está em voo", async () => {
    const falso = criarApiClientFalso();
    const original = falso.barbeiro.atualizarMinhaBarbearia;

    // Trava a primeira chamada até o teste mandar liberar: sem isso
    // não há como tentar um segundo clique enquanto a primeira ainda
    // está em voo.
    let liberar: () => void = () => {};
    const pendente = new Promise<void>((resolve) => {
      liberar = resolve;
    });
    const salvar = vi.fn(async (edicao: { nome?: string; endereco?: string | null }) => {
      await pendente;
      return original(edicao);
    });
    falso.barbeiro.atualizarMinhaBarbearia = salvar;

    montarPainel(<ConfiguracoesDaBarbearia />, falso);

    const botao = await screen.findByRole("button", { name: /salvar dados/i });
    await userEvent.click(botao);
    // Segundo clique enquanto a primeira chamada ainda não resolveu.
    await userEvent.click(botao);

    liberar();
    await waitFor(() => expect(salvar).toHaveBeenCalled());
    expect(salvar).toHaveBeenCalledTimes(1);
  });

  // Apêndice: 181514d fechou a corrida de sincronização nesta tela
  // (o modelo que DetalheDoCliente, CadastroDeServico e
  // DetalheDoAgendamento copiaram), mas sem um teste que caísse se o
  // mecanismo fosse revertido pra `useEffect` — as asserções acima
  // usam `findByDisplayValue`/`waitFor`, que só esperam o elemento
  // existir, e passam igual sob as duas versões. Esta é essa prova.
  //
  // Mecanismo (ver `sondaDeCorrida.tsx` e o relatório): uma sonda
  // montada como irmã da tela, com um layout effect sem array de
  // dependências. O React garante que, dentro de UM commit, layout
  // effects rodam antes de qualquer effect passivo — a sonda explora
  // essa ordem em vez de contar temporizadores. O gatilho pra sua
  // renderização vem do mock de `minhaBarbearia`, chamado de forma
  // síncrona no ponto em que ele retoma de uma promessa travada; isso
  // costuma colocar a atualização da sonda no mesmo lote pendente do
  // React que o `setDados` da tela, fazendo as duas commitarem juntas.
  it("digitar no instante em que os dados chegam não perde a edição (corrida de sincronização)", async () => {
    const falso = criarApiClientFalso();
    const original = falso.barbeiro.atualizarMinhaBarbearia;
    const salvar = vi.fn(async (edicao: { nome?: string; endereco?: string | null }) =>
      original(edicao)
    );
    falso.barbeiro.atualizarMinhaBarbearia = salvar;

    // Trava a leitura da barbearia até o teste mandar liberar.
    let liberar: () => void = () => {};
    const pendente = new Promise<void>((resolve) => {
      liberar = resolve;
    });
    const barbeariaOriginal = falso.barbeiro.minhaBarbearia;
    let disparoDaSonda: () => void = () => {};
    falso.barbeiro.minhaBarbearia = async () => {
      await pendente;
      // Síncrono, antes de qualquer outro `await`: coloca a
      // atualização da sonda no mesmo lote que o `setDados` da tela.
      disparoDaSonda();
      return barbeariaOriginal();
    };

    // A sonda roda `aoRenderizar` uma vez no mount (ignorada abaixo) e
    // de novo quando `disparar()` é chamado — nesse segundo turno,
    // resolve `prontinho`, e o `fireEvent.change` do teste roda no
    // microtask seguinte, ainda antes de qualquer effect passivo
    // pendente da tela.
    let chamadas = 0;
    let resolverProntinho: () => void = () => {};
    const prontinho = new Promise<void>((resolve) => {
      resolverProntinho = resolve;
    });
    const { disparar } = montarPainelComSonda(<ConfiguracoesDaBarbearia />, falso, () => {
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
