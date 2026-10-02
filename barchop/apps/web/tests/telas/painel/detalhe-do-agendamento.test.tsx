import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { criarApiClientFalso, ErroDaApi, type EdicaoDoAgendamento } from "@barchop/api-client";
import { DetalheDoAgendamento } from "../../../src/telas/painel/DetalheDoAgendamento";
import { navegacaoFalsa } from "../../ajudantes/navegacao";
import { montarPainel } from "../../ajudantes/painel";
import { montarPainelComSonda } from "../../ajudantes/sondaDeCorrida";

function semear() {
  return criarApiClientFalso({
    clientes: [
      { id: "c1", nome: "João Silva", telefone: "(11) 99999-0001", email: null, temConta: false },
    ],
    agendamentos: [
      {
        id: "a1",
        clienteId: "c1",
        data: "2026-09-08",
        horaInicio: "09:00",
        horaFim: "09:30",
        status: "pendente",
        origem: "cliente",
        observacoes: null,
        servicos: [
          { servicoId: "s1", nome: "Corte", precoNoMomento: "40.00", duracaoNoMomento: 30 },
        ],
      },
    ],
  });
}

describe("detalhe do agendamento", () => {
  beforeEach(() => {
    localStorage.clear();
    navegacaoFalsa.redefinir({
      pathname: "/painel/agendamentos/a1",
      params: { id: "a1" },
    });
  });

  it("mostra cliente, serviços e o preço congelado", async () => {
    montarPainel(<DetalheDoAgendamento />, semear());

    expect(await screen.findByText(/João Silva/)).toBeInTheDocument();
    // precoNoMomento, não o preço de hoje: é o que foi combinado com
    // aquele cliente naquele dia.
    expect(screen.getByText("R$ 40,00")).toBeInTheDocument();
  });

  it("muda o status", async () => {
    const falso = semear();
    // O original e capturado ANTES da troca: `montarPainel` passa
    // `falso.barbeiro` por referencia, entao dentro do mock
    // `falso.barbeiro.atualizarAgendamento` ja resolveria para o proprio
    // mock — recursao infinita que o catch da tela engole, deixando o
    // teste verde sem nunca provar que a chamada real aconteceu.
    const original = falso.barbeiro.atualizarAgendamento;
    const atualizar = vi.fn(
      async (id: string, edicao: EdicaoDoAgendamento) =>
        original(id, edicao)
    );
    falso.barbeiro.atualizarAgendamento = atualizar;

    montarPainel(<DetalheDoAgendamento />, falso);

    await userEvent.click(await screen.findByRole("button", { name: /confirmado/i }));

    await waitFor(() => expect(atualizar).toHaveBeenCalledWith("a1", { status: "confirmado" }));
  });

  it("salva observações", async () => {
    const falso = semear();
    // O original e capturado ANTES da troca: `montarPainel` passa
    // `falso.barbeiro` por referencia, entao dentro do mock
    // `falso.barbeiro.atualizarAgendamento` ja resolveria para o proprio
    // mock — recursao infinita que o catch da tela engole, deixando o
    // teste verde sem nunca provar que a chamada real aconteceu.
    const original = falso.barbeiro.atualizarAgendamento;
    const atualizar = vi.fn(
      async (id: string, edicao: EdicaoDoAgendamento) =>
        original(id, edicao)
    );
    falso.barbeiro.atualizarAgendamento = atualizar;

    montarPainel(<DetalheDoAgendamento />, falso);

    await userEvent.type(await screen.findByLabelText(/observações/i), "cliente atrasa");
    await userEvent.click(screen.getByRole("button", { name: /salvar observações/i }));

    await waitFor(() =>
      expect(atualizar).toHaveBeenCalledWith("a1", { observacoes: "cliente atrasa" })
    );
  });

  it("diz que remarcar é cancelar e criar, sem oferecer botão que a API recusaria", async () => {
    // PATCH /agendamentos/:id aceita só status e observacoes; remarcar
    // existe apenas no escopo do cliente.
    montarPainel(<DetalheDoAgendamento />, semear());

    expect(await screen.findByText(/para mudar o horário, cancele e crie outro/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /remarcar/i })).not.toBeInTheDocument();
  });

  it("agendamento inexistente vira aviso, não tela em branco", async () => {
    navegacaoFalsa.redefinir({
      pathname: "/painel/agendamentos/a9",
      params: { id: "a9" },
    });
    montarPainel(<DetalheDoAgendamento />, semear());

    expect(await screen.findByText(/agendamento não encontrado/i)).toBeInTheDocument();
  });

  // O dublê de `agendamento(id)` devolve, para o 404, a mesma frase
  // ("agendamento não encontrado") que a tela mostraria mesmo sem
  // ramificar por `codigo` — bastaria exibir `erro.mensagem` cru. O
  // teste acima não prova, sozinho, que a tela lê `codigo`: prova
  // apenas que *alguma* mensagem com essas palavras apareceu. Este
  // teste força um `mensagem` vazio no erro, então só a ramificação por
  // `codigo === "nao_encontrado"` pode produzir o texto esperado —
  // remover ou inverter essa ramificação mostraria uma tela em branco.
  it("a mensagem de agendamento não encontrado vem do código, não do texto cru da API", async () => {
    const falso = semear();
    falso.barbeiro.agendamento = vi.fn(async () => {
      throw new ErroDaApi(404, "nao_encontrado", "");
    });

    montarPainel(<DetalheDoAgendamento />, falso);

    expect(await screen.findByText(/agendamento não encontrado/i)).toBeInTheDocument();
  });

  // Apêndice: DetalheDoAgendamento.tsx sincroniza `observacoes` durante
  // a renderização, rastreando `agendamento.dados` por referência. Toda
  // ação em `aplicar()` — inclusive um clique de status, que não mexe
  // em observações — chama `agendamento.recarregar()` depois de
  // salvar, e o dublê (`comCliente`) devolve um objeto literal novo em
  // toda chamada a `agendamento(id)`. Isso importa: se o rastreador
  // fosse trocado por um booleano "já sincronizei uma vez" (o jeito
  // ingênuo de calar o aviso de loop de render), esse recarregamento
  // nunca reabriria a sincronização, e o campo ficaria preso no valor
  // da primeira leitura mesmo com o servidor tendo mudado embaixo dele.
  //
  // (Não é uma reprodução da corrida de sincronização em si — isso está
  // no teste seguinte, via a sonda em `sondaDeCorrida.tsx`. Mesma
  // ressalva do apêndice equivalente em servicos.test.tsx: um primeiro
  // round de três técnicas — temporizador único, MessageChannel,
  // MutationObserver, todas observando de FORA — não encontrou uma
  // janela aqui; a sonda funciona por participar do MESMO commit, não
  // por observá-lo de fora. Ver o relatório.)
  it("um clique de status também traz observações atualizadas do servidor (recarregar reabre a sincronização)", async () => {
    const falso = semear();
    // Simula outra origem mudando a observação entre o clique de status
    // e o refetch que ele dispara — poderia ser outra aba do mesmo
    // barbeiro. O que importa pro teste é só que a resposta de
    // `agendamento.recarregar()` traga uma observação diferente da que
    // já estava no campo.
    const original = falso.barbeiro.atualizarAgendamento;
    falso.barbeiro.atualizarAgendamento = async (id: string, edicao: EdicaoDoAgendamento) =>
      original(id, { ...edicao, observacoes: "mudou no servidor" });

    montarPainel(<DetalheDoAgendamento />, falso);

    await userEvent.click(await screen.findByRole("button", { name: /confirmado/i }));

    // `aplicar` chama `agendamento.recarregar()` depois do PATCH: o
    // objeto que `comCliente` devolve é sempre novo, então o
    // rastreador correto reabre a sincronização e o campo reflete o
    // valor recém-chegado — mesmo tendo sido um clique de status, não
    // de observações.
    expect(
      await screen.findByDisplayValue("mudou no servidor")
    ).toBeInTheDocument();
  });

  // Apêndice: prova a corrida de sincronização em si. Mecanismo (ver
  // `sondaDeCorrida.tsx` e o relatório para o histórico da primeira
  // rodada de tentativas, todas descartadas): uma sonda irmã da tela,
  // com um layout effect sem array de dependências, disparada de
  // dentro do mock de `agendamento()` no exato ponto síncrono em que
  // ele retoma de uma promessa travada. O React garante que, dentro do
  // commit em que as duas atualizações caem juntas, layout effects
  // rodam antes de qualquer effect passivo — por isso o layout effect
  // da sonda vê `observacoes` tal como a tela o deixou, antes do
  // `useEffect` de preenchimento (se a tela ainda estiver na versão com
  // bug) rodar.
  it("digitar no instante em que o agendamento chega não perde a edição (corrida de sincronização)", async () => {
    const falso = semear();
    const original = falso.barbeiro.atualizarAgendamento;
    const atualizar = vi.fn(
      async (id: string, edicao: EdicaoDoAgendamento) => original(id, edicao)
    );
    falso.barbeiro.atualizarAgendamento = atualizar;

    // Trava a leitura do agendamento até o teste mandar liberar.
    let liberar: () => void = () => {};
    const pendente = new Promise<void>((resolve) => {
      liberar = resolve;
    });
    const agendamentoOriginal = falso.barbeiro.agendamento;
    let disparoDaSonda: () => void = () => {};
    falso.barbeiro.agendamento = async (id: string) => {
      await pendente;
      // Síncrono, antes de qualquer outro `await`: coloca a
      // atualização da sonda no mesmo lote que o `setDados` da tela.
      disparoDaSonda();
      return agendamentoOriginal(id);
    };

    // A sonda roda `aoRenderizar` uma vez no mount (tela ainda
    // carregando — ignorada abaixo) e de novo quando `disparar()` é
    // chamado. Nesse segundo turno, resolve `prontinho`, e o
    // `fireEvent.change` do teste roda no microtask seguinte.
    let chamadas = 0;
    let resolverProntinho: () => void = () => {};
    const prontinho = new Promise<void>((resolve) => {
      resolverProntinho = resolve;
    });
    const { disparar } = montarPainelComSonda(<DetalheDoAgendamento />, falso, () => {
      chamadas++;
      if (chamadas < 2) return;
      resolverProntinho();
    });
    disparoDaSonda = disparar;

    await screen.findByText(/carregando/i);
    liberar();

    await prontinho;
    const campo = screen.getByLabelText(/observações/i) as HTMLInputElement;
    fireEvent.change(campo, { target: { value: "cliente atrasa" } });

    await userEvent.click(screen.getByRole("button", { name: /salvar observações/i }));

    await waitFor(() =>
      expect(atualizar).toHaveBeenCalledWith("a1", { observacoes: "cliente atrasa" })
    );
  });

  it("os botões de status mostram o rótulo traduzido, não o enum cru", async () => {
    montarPainel(<DetalheDoAgendamento />, semear());

    expect(await screen.findByRole("button", { name: "concluído" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "não compareceu" })).toBeInTheDocument();
    // O enum cru não pode aparecer em nenhum botão.
    expect(screen.queryByRole("button", { name: "concluido" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "no_show" })).not.toBeInTheDocument();
  });
});
