import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { criarApiClientFalso } from "@barchop/api-client";
import type { MudancaDeServicos } from "@barchop/types";
import { ServicosDoAgendamento } from "../../../src/telas/painel/ServicosDoAgendamento";
import { navegacaoFalsa } from "../../ajudantes/navegacao";
import { montarPainel } from "../../ajudantes/painel";

// Mudar os serviços de um agendamento (22/11/2026; canvas aprovado,
// página "servicos"). Agendamento das 09:00 às 09:30 com Corte; o
// próximo atendimento (Lucas Andrade) começa às 09:40. Sobrancelha
// (10 min) cabe, Barba (20 min) não.

const CORTE = { servicoId: "s1", nome: "Corte", precoNoMomento: "30.00", duracaoNoMomento: 30 };
const SOBRANCELHA = { servicoId: "s3", nome: "Sobrancelha", precoNoMomento: "15.00", duracaoNoMomento: 10 };

function semear({
  servicos = [CORTE],
  horaFim = "09:30",
  email = "pedro@exemplo.com" as string | null,
} = {}) {
  return criarApiClientFalso({
    servicos: [
      { id: "s1", nome: "Corte", duracaoMinutos: 30, preco: "30.00", ativo: true, categoria: null, descricao: null, fotoUrl: null },
      { id: "s2", nome: "Barba", duracaoMinutos: 20, preco: "25.00", ativo: true, categoria: null, descricao: null, fotoUrl: null },
      { id: "s3", nome: "Sobrancelha", duracaoMinutos: 10, preco: "15.00", ativo: true, categoria: null, descricao: null, fotoUrl: null },
      { id: "s4", nome: "Antigo", duracaoMinutos: 10, preco: "10.00", ativo: false, categoria: null, descricao: null, fotoUrl: null },
      { id: "s5", nome: "Pigmentação", duracaoMinutos: 30, preco: "40.00", ativo: true, categoria: null, descricao: null, fotoUrl: null },
    ],
    // O logado (bb1) não faz Pigmentação.
    servicosPorMembro: { bb1: ["s1", "s2", "s3", "s4"] },
    clientes: [{ id: "c1", nome: "Pedro Alves", telefone: "(11) 99999-0001", email, temConta: false }],
    agendamentos: [
      {
        id: "a1",
        clienteId: "c1",
        data: "2030-12-10",
        horaInicio: "09:00",
        horaFim,
        status: "confirmado",
        origem: "barbeiro",
        observacoes: null,
        servicos,
      },
    ],
    limitesDaMudanca: {
      a1: { limite: "09:40", proximo: { tipo: "atendimento", cliente: "Lucas Andrade", horaInicio: "09:40" } },
    },
  });
}

function espiarMudanca(falso: ReturnType<typeof semear>) {
  const original = falso.barbeiro.mudarServicos;
  const mudar = vi.fn(async (id: string, mudanca: MudancaDeServicos) => original(id, mudanca));
  falso.barbeiro.mudarServicos = mudar;
  return mudar;
}

async function marcar(nome: RegExp) {
  await userEvent.click(await screen.findByRole("checkbox", { name: nome }));
}

describe("mudar os serviços do agendamento", () => {
  beforeEach(() => {
    localStorage.clear();
    navegacaoFalsa.redefinir({ pathname: "/painel/agendamentos/a1/servicos", params: { id: "a1" } });
  });

  it("mostra o que está no atendimento e só o que dá pra adicionar", async () => {
    montarPainel(<ServicosDoAgendamento />, semear());

    expect(await screen.findByRole("heading", { level: 1, name: "Serviços" })).toBeInTheDocument();
    const no = screen.getByRole("region", { name: "No atendimento" });
    expect(within(no).getByText("Corte")).toBeInTheDocument();
    const adicionar = await screen.findByRole("group", { name: "Adicionar" });
    const nomes = within(adicionar)
      .getAllByRole("checkbox")
      .map((caixa) => caixa.textContent);
    // Sem o Corte (já está), sem o inativo e sem o que o profissional não faz.
    expect(nomes.some((n) => n?.includes("Barba"))).toBe(true);
    expect(nomes.some((n) => n?.includes("Sobrancelha"))).toBe(true);
    expect(nomes.some((n) => n?.includes("Corte"))).toBe(false);
    expect(nomes.some((n) => n?.includes("Antigo"))).toBe(false);
    expect(nomes.some((n) => n?.includes("Pigmentação"))).toBe(false);
    expect(screen.getByText("Marque o que entra ou tire o que sai.")).toBeInTheDocument();
  });

  it("o que cabe: confirma os adicionais e volta pro detalhe com o aviso", async () => {
    const falso = semear();
    const mudar = espiarMudanca(falso);
    montarPainel(<ServicosDoAgendamento />, falso);

    await marcar(/sobrancelha/i);

    expect(await screen.findByText(/termina às 09:40/i)).toBeInTheDocument();
    expect(screen.getByText(/40 min · R\$\s?45,00/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Salvar" }));
    const janela = await screen.findByRole("dialog", { name: "Confirma os adicionais?" });
    expect(within(janela).getByText(/termina às 09:40\. cabe na sua agenda/i)).toBeInTheDocument();
    expect(within(janela).getByText(/\(era R\$\s?30,00\)/)).toBeInTheDocument();
    await userEvent.click(within(janela).getByRole("button", { name: "Confirmar" }));

    await waitFor(() =>
      expect(navegacaoFalsa.replace).toHaveBeenCalledWith("/painel/agendamentos/a1?servicos=salvos&avisado=1")
    );
    expect(mudar).toHaveBeenCalledWith("a1", { servicoIds: ["s1", "s3"], aceitaSemTempo: false, avisarCliente: true });
  });

  it("o que não cabe: diz até quando tem tempo e com quem bate, e pergunta se tem certeza", async () => {
    const falso = semear();
    const mudar = espiarMudanca(falso);
    montarPainel(<ServicosDoAgendamento />, falso);

    await marcar(/barba/i);

    expect(await screen.findByText("Passa das 09:40, quando começa Lucas Andrade: vira encaixe")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Salvar" }));
    const janela = await screen.findByRole("dialog", { name: "Confirma os adicionais?" });
    expect(
      within(janela).getByText(
        "O tempo previsto pra concluir os serviços é de 50 min (até 09:50), e na sua agenda só tem tempo até as 09:40, quando começa Lucas Andrade. Tem certeza?"
      )
    ).toBeInTheDocument();
    expect(within(janela).getByText(/fica como encaixe, das 09:00 às 09:40/i)).toBeInTheDocument();
    await userEvent.click(within(janela).getByRole("button", { name: "Sim, adicionar mesmo assim" }));

    await waitFor(() => expect(navegacaoFalsa.replace).toHaveBeenCalled());
    expect(mudar).toHaveBeenCalledWith("a1", { servicoIds: ["s1", "s2"], aceitaSemTempo: true, avisarCliente: true });
  });

  it("tirar: o tempo que sobra fica livre", async () => {
    const falso = semear({ servicos: [CORTE, SOBRANCELHA], horaFim: "09:40" });
    const mudar = espiarMudanca(falso);
    montarPainel(<ServicosDoAgendamento />, falso);

    await userEvent.click(await screen.findByRole("button", { name: "Tirar Sobrancelha" }));
    expect(screen.getByText("Sai do atendimento")).toBeInTheDocument();
    await userEvent.click(await screen.findByRole("button", { name: "Salvar" }));
    const janela = await screen.findByRole("dialog", { name: "Tirar do atendimento?" });
    expect(within(janela).getByText(/os 10 min que sobram ficam livres na agenda/i)).toBeInTheDocument();
    await userEvent.click(within(janela).getByRole("button", { name: "Confirmar" }));

    await waitFor(() => expect(mudar).toHaveBeenCalledWith("a1", expect.objectContaining({ servicoIds: ["s1"] })));
  });

  it("desfazer o tirar volta ao que estava", async () => {
    montarPainel(<ServicosDoAgendamento />, semear({ servicos: [CORTE, SOBRANCELHA], horaFim: "09:40" }));

    await userEvent.click(await screen.findByRole("button", { name: "Tirar Sobrancelha" }));
    await userEvent.click(screen.getByRole("button", { name: "Desfazer: manter Sobrancelha" }));

    expect(screen.getByText("Marque o que entra ou tire o que sai.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Salvar" })).toBeDisabled();
  });

  it("o último serviço não sai: trava com a frase", async () => {
    montarPainel(<ServicosDoAgendamento />, semear());

    const tirar = await screen.findByRole("button", { name: "Tirar Corte" });
    expect(tirar).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByText(/fica pelo menos um serviço/i)).toBeInTheDocument();
    await userEvent.click(tirar);
    expect(screen.queryByText("Sai do atendimento")).not.toBeInTheDocument();
  });

  it("desmarcar o aviso manda sem e-mail e o detalhe não promete e-mail", async () => {
    const falso = semear();
    const mudar = espiarMudanca(falso);
    montarPainel(<ServicosDoAgendamento />, falso);

    await marcar(/sobrancelha/i);
    await screen.findByText(/termina às 09:40/i);
    await userEvent.click(screen.getByRole("button", { name: "Salvar" }));
    const janela = await screen.findByRole("dialog");
    await userEvent.click(within(janela).getByRole("checkbox", { name: "Avisar Pedro por e-mail" }));
    await userEvent.click(within(janela).getByRole("button", { name: "Confirmar" }));

    await waitFor(() => expect(navegacaoFalsa.replace).toHaveBeenCalledWith("/painel/agendamentos/a1?servicos=salvos"));
    expect(mudar).toHaveBeenCalledWith("a1", expect.objectContaining({ avisarCliente: false }));
  });

  it("cliente sem e-mail: sem a caixa, com a nota", async () => {
    montarPainel(<ServicosDoAgendamento />, semear({ email: null }));

    await marcar(/sobrancelha/i);
    await screen.findByText(/termina às 09:40/i);
    await userEvent.click(screen.getByRole("button", { name: "Salvar" }));
    const janela = await screen.findByRole("dialog");

    expect(within(janela).queryByRole("checkbox")).not.toBeInTheDocument();
    expect(within(janela).getByText(/não tem e-mail/i)).toBeInTheDocument();
  });

  it("a agenda mudou no meio (409 sem_tempo): reabre com a prévia nova", async () => {
    const falso = semear();
    montarPainel(<ServicosDoAgendamento />, falso);

    await marcar(/sobrancelha/i);
    await screen.findByText(/termina às 09:40/i);
    await userEvent.click(screen.getByRole("button", { name: "Salvar" }));
    const janela = await screen.findByRole("dialog");
    // Alguém marcou outro cliente às 09:35 enquanto a janela estava aberta.
    falso.estado.limitesDaMudanca!.a1 = {
      limite: "09:35",
      proximo: { tipo: "atendimento", cliente: "Rui Costa", horaInicio: "09:35" },
    };
    await userEvent.click(within(janela).getByRole("button", { name: "Confirmar" }));

    expect(await within(janela).findByRole("button", { name: "Sim, adicionar mesmo assim" })).toBeInTheDocument();
    expect(within(janela).getByText(/quando começa Rui Costa\. Tem certeza\?/)).toBeInTheDocument();
    expect(navegacaoFalsa.replace).not.toHaveBeenCalled();
  });

  it("cancelado não muda: aviso e caminho de volta", async () => {
    const falso = semear();
    falso.estado.agendamentos[0]!.status = "cancelado";
    montarPainel(<ServicosDoAgendamento />, falso);

    expect(await screen.findByText(/não dá pra mudar os serviços/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Salvar" })).not.toBeInTheDocument();
  });
});
