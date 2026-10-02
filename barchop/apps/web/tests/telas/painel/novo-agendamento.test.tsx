import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { criarApiClientFalso, ErroDaApi } from "@barchop/api-client";
import { NovoAgendamento } from "../../../src/telas/painel/NovoAgendamento";
import { navegacaoFalsa } from "../../ajudantes/navegacao";
import { montarPainel } from "../../ajudantes/painel";

const AGORA = new Date("2026-09-08T10:00:00-03:00");

function semear() {
  return criarApiClientFalso({
    clientes: [
      { id: "c1", nome: "João Silva", telefone: "(11) 99999-0001", email: null, temConta: false },
    ],
    horariosLivres: ["11:00", "11:30", "12:00"],
  });
}

async function abrirPasso(titulo: string) {
  await userEvent.click(await screen.findByRole("button", { name: titulo }));
}

describe("novo agendamento no painel", () => {
  beforeEach(() => {
    localStorage.clear();
    navegacaoFalsa.redefinir({
      pathname: "/painel/agendamentos/novo",
      query: { data: "2026-09-09", hora: "11:00" },
    });
  });

  it("chega preenchido pela URL que a agenda montou", async () => {
    montarPainel(<NovoAgendamento agora={AGORA} />, semear());

    expect(await screen.findByRole("button", { name: "11:00", current: true })).toBeInTheDocument();
  });

  it("com ?cliente= na URL, chega com o cliente já escolhido", async () => {
    // É a ação "Agendar" de cada linha da lista de clientes. Sem isto,
    // quem clicou lá tinha que procurar de novo a pessoa que acabou de
    // escolher.
    navegacaoFalsa.redefinir({
      pathname: "/painel/agendamentos/novo",
      query: { data: "2026-09-09", cliente: "c1" },
    });
    montarPainel(<NovoAgendamento agora={AGORA} />, semear());

    // O passo Cliente só escreve o resumo quando está recolhido E com
    // escolha feita — é a prova de que a URL preencheu a escolha, e de
    // que a tela avançou em vez de parar no primeiro passo.
    expect(
      await screen.findByText("João Silva · (11) 99999-0001")
    ).toBeInTheDocument();
  });

  it("agenda com cliente, serviço, data e hora", async () => {
    const falso = semear();
    // `falso.barbeiro` é o mesmo objeto que a tela recebe (montarPainel
    // passa por referência), então uma arrow function que chama de volta
    // `falso.barbeiro.criarAgendamento` faz uma busca de propriedade no
    // momento da chamada — e essa propriedade já é o próprio mock depois
    // da linha de baixo. O resultado é recursão síncrona infinita, que o
    // catch da tela engoliria como "não foi possível agendar agora",
    // com o teste passando em verde sem nunca ter provado uma criação de
    // verdade. Capturar a função original antes de sobrescrever evita a
    // auto-referência.
    const original = falso.barbeiro.criarAgendamento;
    const criar = vi.fn(async (novo: Parameters<typeof original>[0]) => original(novo));
    falso.barbeiro.criarAgendamento = criar;

    montarPainel(<NovoAgendamento agora={AGORA} />, falso);

    await userEvent.click(await screen.findByRole("button", { name: /João Silva/ }));
    await userEvent.click(screen.getByRole("checkbox", { name: /Corte/ }));
    await userEvent.click(screen.getByRole("button", { name: /^agendar$/i }));

    await waitFor(() => expect(criar).toHaveBeenCalled());
    // Prova que a chamada real aconteceu uma vez só — sem isto, a
    // recursão do parágrafo acima passaria despercebida de novo.
    expect(criar.mock.calls.length).toBe(1);
    expect(criar.mock.calls[0][0]).toMatchObject({
      // barbeiroId é o id do perfil logado: a barbearia do MVP tem um
      // barbeiro só.
      barbeiroId: "bb1",
      clienteId: "c1",
      servicoIds: ["s1"],
      data: "2026-09-09",
      horaInicio: "11:00",
    });
  });

  it("não deixa agendar sem cliente ou sem serviço", async () => {
    montarPainel(<NovoAgendamento agora={AGORA} />, semear());

    expect(await screen.findByRole("button", { name: /^agendar$/i })).toBeDisabled();
  });

  it("cadastra cliente novo sem sair da tela", async () => {
    montarPainel(<NovoAgendamento agora={AGORA} />, semear());

    await userEvent.click(await screen.findByRole("button", { name: /cadastrar novo/i }));
    await userEvent.type(screen.getByLabelText(/nome/i), "Ana Souza");
    await userEvent.type(screen.getByLabelText(/telefone/i), "11988887777");
    await userEvent.click(screen.getByRole("button", { name: /^cadastrar$/i }));

    expect(await screen.findByRole("button", { name: /Ana Souza/, current: true })).toBeInTheDocument();
  });

  it("telefone já cadastrado oferece o cliente existente em vez de erro", async () => {
    // É o caso comum do walk-in: quem chega já existe, criado pelo
    // upsert do agendamento público.
    const falso = semear();
    falso.barbeiro.criarCliente = async () => {
      throw new ErroDaApi(409, "conflito", "esse telefone já tem cadastro");
    };
    montarPainel(<NovoAgendamento agora={AGORA} />, falso);

    await userEvent.click(await screen.findByRole("button", { name: /cadastrar novo/i }));
    await userEvent.type(screen.getByLabelText(/nome/i), "João");
    await userEvent.type(screen.getByLabelText(/telefone/i), "11999990001");
    await userEvent.click(screen.getByRole("button", { name: /^cadastrar$/i }));

    expect(await screen.findByText(/esse telefone já tem cadastro/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /João Silva/ })).toBeInTheDocument();
    // As duas asserções acima também passariam com o branch de conflito
    // inteiro apagado: a mensagem genérica ecoaria o mesmo `mensagem` do
    // erro, e João Silva já aparece na lista inicial (busca vazia traz
    // todo mundo) mesmo sem nenhuma busca nova. Esta é a que realmente
    // depende do `setBusca(numero)` — o campo de busca só mostra esse
    // valor se o handler de conflito o tiver preenchido, e os campos do
    // cadastro já saíram do ar (`cadastrando` volta a false).
    expect(screen.getByDisplayValue("(11) 99999-0001")).toBeInTheDocument();
  });

  it("data no passado avisa e exige confirmar", async () => {
    // Registrar retroativamente é legítimo — garantirAlteravel não toca
    // o escopo do barbeiro. Fazer isso sem perceber, não.
    navegacaoFalsa.redefinir({
      pathname: "/painel/agendamentos/novo",
      query: { data: "2026-09-01", hora: "11:00" },
    });
    montarPainel(<NovoAgendamento agora={AGORA} />, semear());

    await userEvent.click(await screen.findByRole("button", { name: /João Silva/ }));
    await userEvent.click(screen.getByRole("checkbox", { name: /Corte/ }));

    expect(screen.getByText(/data no passado/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^agendar$/i })).toBeDisabled();

    await userEvent.click(screen.getByRole("checkbox", { name: /registrar mesmo assim/i }));

    expect(screen.getByRole("button", { name: /^agendar$/i })).toBeEnabled();
  });

  it("horario_ocupado manda recarregar os horários, não repetir o envio", async () => {
    // É a corrida que a trava do banco pega depois de a disponibilidade
    // já ter dito que cabia.
    const falso = semear();
    falso.barbeiro.criarAgendamento = async () => {
      throw new ErroDaApi(409, "horario_ocupado", "esse horário já está ocupado");
    };
    // Capturado antes de sobrescrever, pelo mesmo motivo do
    // `criarAgendamento` original lá em cima: um wrapper que chamasse de
    // volta `falso.publico.disponibilidadeDoDia` recursaria.
    const original = falso.publico.disponibilidadeDoDia;
    const disponibilidade = vi.fn(
      (slug: string, filtro: Parameters<typeof original>[1]) => original(slug, filtro)
    );
    falso.publico.disponibilidadeDoDia = disponibilidade;

    montarPainel(<NovoAgendamento agora={AGORA} />, falso);

    await userEvent.click(await screen.findByRole("button", { name: /João Silva/ }));
    await userEvent.click(screen.getByRole("checkbox", { name: /Corte/ }));
    await waitFor(() => expect(disponibilidade).toHaveBeenCalled());
    const chamadasAntesDoEnvio = disponibilidade.mock.calls.length;

    await userEvent.click(screen.getByRole("button", { name: /^agendar$/i }));

    expect(await screen.findByText(/esse horário acabou de ser ocupado/i)).toBeInTheDocument();
    // "Recarregar os horários, não repetir o envio" tem duas metades, e
    // a mensagem acima só prova a segunda (que a tela não ficou muda).
    // Sem o `horarios.recarregar()`, a mensagem apareceria do mesmo
    // jeito e esta asserção que falharia — é ela que prova que a lista
    // foi buscada de novo.
    await waitFor(() =>
      expect(disponibilidade.mock.calls.length).toBeGreaterThan(chamadasAntesDoEnvio)
    );
  });

  it("um segundo serviço que deixa de caber no horário escolhido tira a marca e desliga o agendar", async () => {
    // O cenário que o merge de `hora` na lista exibida (do teste de
    // "chega preenchido") não podia mais cobrir sem mentir: depois que
    // existe uma resposta de verdade da disponibilidade para a
    // combinação atual de serviços, essa resposta é a única fonte —
    // reintroduzir a hora antiga marcaria como atual, e deixaria
    // agendar, um horário que a própria API acabou de excluir.
    const falso = semear();
    falso.publico.disponibilidadeDoDia = vi.fn(
      async (_slug: string, filtro: { servicoIds: string[] }) =>
        filtro.servicoIds.length > 1 ? ["12:00"] : ["11:00", "11:30", "12:00"]
    );
    montarPainel(<NovoAgendamento agora={AGORA} />, falso);

    await userEvent.click(await screen.findByRole("button", { name: /João Silva/ }));
    await userEvent.click(screen.getByRole("checkbox", { name: /Corte/ }));

    expect(await screen.findByRole("button", { name: "11:00", current: true })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^agendar$/i })).toBeEnabled();

    await userEvent.click(screen.getByRole("checkbox", { name: /Barba/ }));

    // A duração somada de Corte + Barba não cabe mais às 11:00 na
    // disponibilidade combinada acima: o botão daquele horário some da
    // lista (não fica só "sem marca") porque a lista exibida agora é
    // exatamente o que a API respondeu, sem síntese nenhuma.
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "11:00" })).not.toBeInTheDocument()
    );
    expect(screen.getByRole("button", { name: /^agendar$/i })).toBeDisabled();
  });

  it("trocar de data limpa o horário escolhido, que era de outro dia", async () => {
    // Diferente do caso de somar um serviço, aqui não há resposta de
    // rede a esperar: um horário é sempre de um dia específico, e
    // trocar o dia sem limpar a hora deixaria a URL com um par que
    // nunca foi oferecido junto.
    const falso = semear();
    falso.estado.diasComVaga = { "2026-09-10": true };
    montarPainel(<NovoAgendamento agora={AGORA} />, falso);

    await userEvent.click(await screen.findByRole("button", { name: /João Silva/ }));
    await userEvent.click(screen.getByRole("checkbox", { name: /Corte/ }));
    await abrirPasso("Data");

    await waitFor(() => expect(screen.getByRole("button", { name: "10 de setembro" })).toBeEnabled());
    await userEvent.click(screen.getByRole("button", { name: "10 de setembro" }));

    const ultimaChamada = navegacaoFalsa.push.mock.calls.at(-1);
    expect(ultimaChamada?.[0]).toContain("data=2026-09-10");
    expect(ultimaChamada?.[0]).not.toContain("hora=");
  });

  // O quarto caminho de salvamento do painel (ao lado dos três save
  // buttons de Configurações, guardados em 8d044fa): o "Cadastrar"
  // embutido de BuscaDeCliente não tinha `salvando` nem `carregando`, e
  // um duplo clique disparava `criarCliente` duas vezes — a segunda
  // voltaria 409 e a tela culparia o barbeiro por um duplicado que ela
  // mesma acabou de criar. A asserção é sobre quantas vezes o método da
  // API foi chamado, não sobre o atributo `disabled`, mesma razão de
  // 8d044fa: o atributo prova o atributo, não o comportamento que ele
  // existe pra garantir.
  it("um segundo clique em Cadastrar (cliente embutido) não dispara outra chamada enquanto a primeira está em voo", async () => {
    const falso = semear();
    // Original capturado antes da troca — mesma nota de recursão das
    // outras chamadas deste arquivo.
    const original = falso.barbeiro.criarCliente;

    let liberar: () => void = () => {};
    const pendente = new Promise<void>((resolve) => {
      liberar = resolve;
    });
    const criar = vi.fn(async (novo: Parameters<typeof original>[0]) => {
      await pendente;
      return original(novo);
    });
    falso.barbeiro.criarCliente = criar;

    montarPainel(<NovoAgendamento agora={AGORA} />, falso);

    await userEvent.click(await screen.findByRole("button", { name: /cadastrar novo/i }));
    await userEvent.type(screen.getByLabelText(/nome/i), "Ana Souza");
    await userEvent.type(screen.getByLabelText(/telefone/i), "11988887777");

    const botao = screen.getByRole("button", { name: /^cadastrar$/i });
    await userEvent.click(botao);
    // Segundo clique enquanto a primeira chamada ainda não resolveu.
    await userEvent.click(botao);

    liberar();
    await waitFor(() => expect(criar).toHaveBeenCalled());
    expect(criar).toHaveBeenCalledTimes(1);
  });
  describe("o que a tela diz quando ainda falta escolher", () => {
    it("sem serviço, a data explica o que falta em vez de um mês todo apagado", async () => {
      // Sem serviço, /disponibilidade/mes nem é chamada e o mapa vem
      // vazio — o calendário saía com todos os dias desabilitados, o que
      // se lê como tela quebrada e não como "falta um passo".
      montarPainel(<NovoAgendamento agora={AGORA} />, semear());
      await abrirPasso("Data");

      expect(await screen.findByText(/escolha um serviço/i)).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /de setembro$/ })
      ).not.toBeInTheDocument();
    });

    it("sem hora na URL, data e horário dizem coisas diferentes", async () => {
      // Sem serviço escolhido os dois passos estão vazios. Repetir a
      // mesma frase nos dois faria o quadro virar um eco: quem abre o
      // horário depois da data não descobre nada novo.
      navegacaoFalsa.redefinir({
        pathname: "/painel/agendamentos/novo",
        query: { data: "2026-09-09" },
      });

      montarPainel(<NovoAgendamento agora={AGORA} />, semear());

      await abrirPasso("Data");
      expect(screen.getByText(/escolha um serviço/i)).toBeInTheDocument();

      await abrirPasso("Horário");
      expect(screen.getByText(/os horários aparecem/i)).toBeInTheDocument();
    });

    it("com serviço escolhido, o calendário aparece", async () => {
      montarPainel(<NovoAgendamento agora={AGORA} />, semear());

      await abrirPasso("Serviços");
      await userEvent.click(screen.getByRole("checkbox", { name: /Corte/ }));
      await abrirPasso("Data");

      expect(
        await screen.findByRole("button", { name: "10 de setembro" })
      ).toBeInTheDocument();
    });

    it("marca no calendário o dia que veio na URL", async () => {
      montarPainel(<NovoAgendamento agora={AGORA} />, semear());

      await abrirPasso("Serviços");
      await userEvent.click(screen.getByRole("checkbox", { name: /Corte/ }));
      await abrirPasso("Data");

      expect(
        await screen.findByRole("button", { name: "9 de setembro", current: "date" })
      ).toBeInTheDocument();
    });

    it("o botão desligado diz o que falta", async () => {
      // Cinco condições compõem `pronto` e nenhuma aparecia na tela: o
      // botão desabilitava calado.
      montarPainel(<NovoAgendamento agora={AGORA} />, semear());

      expect(await screen.findByText(/falta escolher/i)).toHaveTextContent(/cliente/i);
      expect(screen.getByText(/falta escolher/i)).toHaveTextContent(/serviço/i);
    });

    it("escolhido o cliente, ele sai da lista do que falta", async () => {
      montarPainel(<NovoAgendamento agora={AGORA} />, semear());

      await userEvent.click(await screen.findByRole("button", { name: /João Silva/ }));

      expect(screen.getByText(/falta escolher/i)).not.toHaveTextContent(/cliente/i);
    });

    it("o resumo soma duração e preço dos serviços escolhidos", async () => {
      montarPainel(<NovoAgendamento agora={AGORA} />, semear());

      await abrirPasso("Serviços");
      await userEvent.click(screen.getByRole("checkbox", { name: /Corte/ }));

      const resumo = await screen.findByTestId("resumo-do-pedido");
      expect(resumo).toHaveTextContent("30 min");
      expect(resumo).toHaveTextContent("R$ 40,00");
    });
  });
  describe("os passos numerados", () => {
    it("numera os quatro passos", async () => {
      montarPainel(<NovoAgendamento agora={AGORA} />, semear());

      const quadro = await screen.findByTestId("passos");
      for (const titulo of ["Cliente", "Serviços", "Data", "Horário"]) {
        expect(quadro).toHaveTextContent(titulo);
      }
    });

    it("escolhido o cliente, o passo recolhe e mostra quem ficou", async () => {
      // Cliente é escolha única: depois de escolher não há o que fazer
      // ali, e o corpo (busca, lista e cadastro) é o mais volumoso da
      // tela. Serviços não recolhe — lá a escolha é múltipla e recolher
      // no primeiro clique tiraria o segundo serviço do alcance.
      montarPainel(<NovoAgendamento agora={AGORA} />, semear());

      await userEvent.click(await screen.findByRole("button", { name: /João Silva/ }));

      expect(screen.queryByLabelText(/buscar cliente/i)).not.toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /João Silva/, current: true })
      ).toBeInTheDocument();
    });

    it("clicar em quem está escolhido reabre a busca", async () => {
      montarPainel(<NovoAgendamento agora={AGORA} />, semear());

      await userEvent.click(await screen.findByRole("button", { name: /João Silva/ }));
      await userEvent.click(screen.getByRole("button", { name: /João Silva/ }));

      expect(screen.getByLabelText(/buscar cliente/i)).toBeInTheDocument();
    });

    it("passo recolhido resume a escolha ao lado do título", async () => {
      // É o que faz o quadro responder "o que já está decidido" com
      // tudo fechado, sem abrir um passo de cada vez para conferir.
      montarPainel(<NovoAgendamento agora={AGORA} />, semear());

      await abrirPasso("Serviços");
      await userEvent.click(screen.getByRole("checkbox", { name: /Corte/ }));
      // Abrir outro passo é o que recolhe Serviços — não há recolhimento
      // automático ali, senão o segundo serviço sairia do alcance.
      await abrirPasso("Data");

      expect(screen.getByTestId("resumo-servicos")).toHaveTextContent("30 min");
      expect(screen.getByTestId("resumo-horario")).toHaveTextContent("11:00");
      expect(screen.queryByTestId("resumo-data")).not.toBeInTheDocument();
    });

    it("a confirmação da data no passado mora no fecho, não numa caixa à parte", async () => {
      // Solta entre o quadro e o fecho, ela virava um terceiro retângulo
      // empilhado dizendo o mesmo que o "Falta escolher" logo abaixo.
      navegacaoFalsa.redefinir({
        pathname: "/painel/agendamentos/novo",
        query: { data: "2026-09-02", hora: "11:00" },
      });

      montarPainel(<NovoAgendamento agora={AGORA} />, semear());

      await userEvent.click(await screen.findByRole("button", { name: /João Silva/ }));
      await userEvent.click(screen.getByRole("checkbox", { name: /Corte/ }));

      const fecho = screen.getByTestId("fecho");
      expect(fecho).toHaveTextContent(/data no passado/i);
      expect(fecho).toContainElement(
        screen.getByRole("checkbox", { name: /registrar mesmo assim/i })
      );
    });

    it("o que falta não repete o que a caixa de confirmação já pede", async () => {
      navegacaoFalsa.redefinir({
        pathname: "/painel/agendamentos/novo",
        query: { data: "2026-09-02", hora: "11:00" },
      });

      montarPainel(<NovoAgendamento agora={AGORA} />, semear());

      await userEvent.click(await screen.findByRole("button", { name: /João Silva/ }));
      await userEvent.click(screen.getByRole("checkbox", { name: /Corte/ }));

      // Só a confirmação do passado falta, e ela tem controle próprio à
      // vista — então não há lista de pendências a mostrar.
      expect(screen.queryByText(/falta escolher/i)).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: /^agendar$/i })).toBeDisabled();
    });

    it("o erro do envio aparece dentro do fecho, junto do botão que o causou", async () => {
      // Com o fecho numa coluna à parte, um aviso que ficasse na coluna
      // do quadro apareceria longe do botão que o disparou — e, com a
      // página rolada, possivelmente fora da vista.
      const falso = semear();
      falso.barbeiro.criarAgendamento = vi.fn(async () => {
        throw new ErroDaApi(409, "horario_ocupado", "Horário ocupado");
      });
      montarPainel(<NovoAgendamento agora={AGORA} />, falso);

      await userEvent.click(await screen.findByRole("button", { name: /João Silva/ }));
      await userEvent.click(screen.getByRole("checkbox", { name: /Corte/ }));
      await userEvent.click(screen.getByRole("button", { name: /^agendar$/i }));

      const fecho = await screen.findByTestId("fecho");
      expect(fecho).toHaveTextContent(/acabou de ser ocupado/i);
    });

    it("o fecho junta tempo, preço, data e horário acima do botão", async () => {
      montarPainel(<NovoAgendamento agora={AGORA} />, semear());

      await abrirPasso("Serviços");
      await userEvent.click(screen.getByRole("checkbox", { name: /Corte/ }));

      const fecho = await screen.findByTestId("resumo-do-pedido");
      expect(fecho).toHaveTextContent("30 min");
      expect(fecho).toHaveTextContent("R$ 40,00");
      expect(fecho).toHaveTextContent("9 de setembro");
      expect(fecho).toHaveTextContent("11:00");
    });
  });
});
