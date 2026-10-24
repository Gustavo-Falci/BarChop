import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { criarApiClientFalso, type SementeFalsa } from "@barchop/api-client";
import type { MembroDaEquipe, PagamentoDoAgendamento, RegistrarPagamento } from "@barchop/types";
import { DetalheDoAgendamento } from "../../../src/telas/painel/DetalheDoAgendamento";
import { navegacaoFalsa } from "../../ajudantes/navegacao";
import { montarPainel } from "../../ajudantes/painel";

// Registrar o pagamento no detalhe do agendamento (Onda 2, marco 2, PR 6
// do plano caixa-do-dia). Concluir e registrar é o passo principal; o
// valor começa com a soma dos serviços; forma e quem recebeu em pílulas;
// com o pagamento feito, o resumo diz como o dinheiro se divide.

const GUSTAVO: MembroDaEquipe = {
  id: "bb0",
  nome: "Gustavo",
  email: "gustavo@gr.com",
  telefone: null,
  papel: "profissional",
  atende: true,
  ativo: true,
  fotoUrl: null,
  convitePendente: false,
  podeVenderPlanos: false,
};

const RAFAEL: MembroDaEquipe = { ...GUSTAVO, id: "bb1", nome: "Rafael", email: "rafael@gr.com", papel: "dono" };

function semear(extra: SementeFalsa = {}, status: "confirmado" | "concluido" = "confirmado") {
  return criarApiClientFalso({
    clientes: [{ id: "c1", nome: "João Silva", telefone: "(11) 99999-0001", email: null, temConta: false }],
    equipe: [RAFAEL, GUSTAVO],
    agendamentos: [
      {
        id: "a1",
        clienteId: "c1",
        data: "2026-09-08",
        horaInicio: "09:00",
        horaFim: "09:30",
        status,
        origem: "cliente",
        observacoes: null,
        servicos: [{ servicoId: "s1", nome: "Corte", precoNoMomento: "40.00", duracaoNoMomento: 30 }],
      },
    ],
    ...extra,
  });
}

// O pagamento já registrado: cliente do Gustavo atendido pelo Rafael, e
// a matriz dá 60% ao Gustavo.
function pagamentoFeito(): PagamentoDoAgendamento {
  const rafael = { id: "bb1", nome: "Rafael" };
  const gustavo = { id: "bb0", nome: "Gustavo" };
  return {
    id: "p1",
    agendamentoId: "a1",
    data: "2026-09-08",
    forma: "pix",
    servicosCentavos: 4000,
    descontoCentavos: 0,
    gorjetaCentavos: 0,
    totalCentavos: 4000,
    atendente: rafael,
    donoDoCliente: gustavo,
    recebidoPor: rafael,
    registradoPor: rafael,
    registradoEm: "2026-09-08T12:40:00.000Z",
    partes: [
      { beneficiario: rafael, motivo: "atendimento", valorCentavos: 1600 },
      { beneficiario: gustavo, motivo: "cliente", valorCentavos: 2400 },
    ],
    assinatura: null,
    servicosPeloPlano: [],
  };
}

describe("registrar o pagamento no detalhe do agendamento", () => {
  beforeEach(() => {
    localStorage.clear();
    navegacaoFalsa.redefinir({ pathname: "/painel/agendamentos/a1", params: { id: "a1" } });
  });

  it("concluir e registrar é o passo principal; o valor começa com a soma dos serviços", async () => {
    const falso = semear();
    const original = falso.barbeiro.registrarPagamento;
    const registrar = vi.fn(async (id: string, dados: RegistrarPagamento) => original(id, dados));
    falso.barbeiro.registrarPagamento = registrar;
    montarPainel(<DetalheDoAgendamento />, falso);

    await userEvent.click(await screen.findByRole("button", { name: /concluir e registrar pagamento/i }));

    const valor = screen.getByLabelText(/valor dos serviços/i);
    expect(valor).toHaveValue("40,00");
    // Sem forma escolhida, não registra: a forma errada estraga o caixa.
    expect(screen.getByRole("button", { name: /registrar r\$/i })).toBeDisabled();

    await userEvent.click(screen.getByRole("radio", { name: "Dinheiro" }));
    await userEvent.type(screen.getByLabelText(/gorjeta/i), "5");
    // `\s`: o Intl põe espaço não separável entre "R$" e o número.
    await userEvent.click(screen.getByRole("button", { name: /^Registrar R\$\s45,00$/ }));

    await waitFor(() =>
      expect(registrar).toHaveBeenCalledWith("a1", {
        forma: "dinheiro",
        servicosCentavos: 4000,
        descontoCentavos: 0,
        gorjetaCentavos: 500,
        recebidoPorId: "bb1",
      })
    );
    // O resumo fica no lugar do formulário, com a frase da divisão.
    const resumo = await screen.findByRole("region", { name: /pagamento/i });
    expect(within(resumo).getByText(/R\$ 45,00 em dinheiro/)).toBeInTheDocument();
    expect(within(resumo).getByText("Rafael fica com R$ 45,00.")).toBeInTheDocument();
    expect(screen.getByText("Concluído", { selector: "li" })).toHaveAttribute("aria-current", "step");
  });

  it("quem recebeu começa em quem atendeu e troca por outro membro", async () => {
    const falso = semear();
    const original = falso.barbeiro.registrarPagamento;
    const registrar = vi.fn(async (id: string, dados: RegistrarPagamento) => original(id, dados));
    falso.barbeiro.registrarPagamento = registrar;
    montarPainel(<DetalheDoAgendamento />, falso);

    await userEvent.click(await screen.findByRole("button", { name: /concluir e registrar pagamento/i }));
    const quem = screen.getByRole("group", { name: /quem recebeu/i });
    expect(within(quem).getByRole("radio", { name: "Rafael" })).toBeChecked();

    await userEvent.click(within(quem).getByRole("radio", { name: "Gustavo" }));
    await userEvent.click(screen.getByRole("radio", { name: "Pix" }));
    await userEvent.click(screen.getByRole("button", { name: /^Registrar R\$\s40,00$/ }));

    await waitFor(() => expect(registrar).toHaveBeenCalledWith("a1", expect.objectContaining({ recebidoPorId: "bb0" })));
  });

  it("desconto maior que o valor não deixa registrar", async () => {
    const falso = semear();
    const registrar = vi.fn();
    falso.barbeiro.registrarPagamento = registrar;
    montarPainel(<DetalheDoAgendamento />, falso);

    await userEvent.click(await screen.findByRole("button", { name: /concluir e registrar pagamento/i }));
    await userEvent.click(screen.getByRole("radio", { name: "Pix" }));
    await userEvent.type(screen.getByLabelText(/desconto/i), "50");

    expect(screen.getByText(/o desconto passa do valor/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /registrar r\$/i })).toBeDisabled();
    expect(registrar).not.toHaveBeenCalled();
  });

  it("atendimento concluído sem pagamento oferece registrar", async () => {
    montarPainel(<DetalheDoAgendamento />, semear({}, "concluido"));

    expect(await screen.findByRole("button", { name: /^registrar pagamento$/i })).toBeInTheDocument();
  });

  it("com o pagamento feito: resumo com a divisão, editar e remover", async () => {
    const falso = semear({ pagamentos: [pagamentoFeito()] }, "concluido");
    montarPainel(<DetalheDoAgendamento />, falso);

    const resumo = await screen.findByRole("region", { name: /pagamento/i });
    expect(within(resumo).getByText(/R\$ 40,00 no pix/)).toBeInTheDocument();
    expect(within(resumo).getByText(/recebido por Rafael/)).toBeInTheDocument();
    expect(within(resumo).getByText("Rafael fica com R$ 16,00 e Gustavo com R$ 24,00.")).toBeInTheDocument();

    // Editar abre o formulário com o que está gravado.
    await userEvent.click(within(resumo).getByRole("button", { name: /editar pagamento/i }));
    expect(screen.getByRole("radio", { name: "Pix" })).toBeChecked();
    expect(screen.getByLabelText(/valor dos serviços/i)).toHaveValue("40,00");
    await userEvent.click(screen.getByRole("button", { name: /^cancelar$/i }));

    // Remover pede um segundo clique.
    await userEvent.click(screen.getByRole("button", { name: /remover pagamento/i }));
    await userEvent.click(screen.getByRole("button", { name: /sim, remover/i }));

    expect(await screen.findByRole("button", { name: /^registrar pagamento$/i })).toBeInTheDocument();
    expect((await falso.barbeiro.pagamentoDoAgendamento("a1")).pagamento).toBeNull();
  });

  it("reabrir um atendimento pago avisa que o pagamento sai do caixa", async () => {
    const falso = semear({ pagamentos: [pagamentoFeito()] }, "concluido");
    montarPainel(<DetalheDoAgendamento />, falso);

    await userEvent.click(await screen.findByRole("button", { name: /reabrir/i }));
    expect(screen.getByText(/o pagamento registrado sai do caixa/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /sim, reabrir/i }));

    expect(await screen.findByText("Confirmado", { selector: "li" })).toHaveAttribute("aria-current", "step");
    expect((await falso.barbeiro.pagamentoDoAgendamento("a1")).pagamento).toBeNull();
  });

  it("dia fechado: só o resumo, com o aviso, sem editar, remover nem reabrir", async () => {
    montarPainel(
      <DetalheDoAgendamento />,
      semear({ pagamentos: [pagamentoFeito()], diasFechados: ["2026-09-08"] }, "concluido")
    );

    const resumo = await screen.findByRole("region", { name: /pagamento/i });
    expect(within(resumo).getByText(/o caixa deste dia está fechado/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /editar pagamento/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /remover pagamento/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /reabrir/i })).not.toBeInTheDocument();
  });

  it("plano sem caixa: concluir como antes, e o convite para o dono escolher um plano", async () => {
    const falso = semear();
    falso.estado.assinatura = { ...falso.estado.assinatura!, situacao: "gratis", plano: "gratis", planoEfetivo: "gratis" };
    montarPainel(<DetalheDoAgendamento />, falso);

    expect(await screen.findByRole("button", { name: /^concluir atendimento$/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /registrar pagamento/i })).not.toBeInTheDocument();
    expect(screen.getByText(/registrar o pagamento e ver o caixa do dia/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /ver os planos/i })).toHaveAttribute("href", "/painel/faturas");
  });
});
