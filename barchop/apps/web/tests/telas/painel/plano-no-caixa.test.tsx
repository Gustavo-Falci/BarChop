import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { criarApiClientFalso, type SementeFalsa } from "@barchop/api-client";
import type {
  AssinaturaDoPainel,
  MembroDaEquipe,
  MensalidadeDoCaixa,
  PagamentoDoAgendamento,
  PlanoDoPainel,
  RegistrarPagamento,
} from "@barchop/types";
import { CaixaDoDia } from "../../../src/telas/painel/CaixaDoDia";
import { DetalheDoAgendamento } from "../../../src/telas/painel/DetalheDoAgendamento";
import { navegacaoFalsa } from "../../ajudantes/navegacao";
import { montarPainel } from "../../ajudantes/painel";

// O plano de assinatura no caixa (Onda 2, marco 3, PR 7c do plano
// planos-de-assinatura): "Usar o plano" no pagamento do atendimento, com
// o que vai pelo plano e o que é cobrado à parte, e as mensalidades
// recebidas no Caixa do dia.

const DIA = "2026-10-23";

const RAFAEL: MembroDaEquipe = {
  id: "bb1",
  nome: "Rafael",
  email: "rafael@gr.com",
  telefone: null,
  papel: "dono",
  atende: true,
  ativo: true,
  fotoUrl: null,
  convitePendente: false,
  podeVenderPlanos: false,
};
const GUSTAVO: MembroDaEquipe = {
  ...RAFAEL,
  id: "bb0",
  nome: "Gustavo",
  email: "gustavo@gr.com",
  papel: "profissional",
  podeVenderPlanos: true,
};
const rafael = { id: "bb1", nome: "Rafael" };
const gustavo = { id: "bb0", nome: "Gustavo" };

// Da casa: corte sem limite, R$ 25,00 pra quem atende.
const DA_CASA: PlanoDoPainel = {
  id: "pl1",
  daCasa: true,
  vendedor: null,
  nome: "Corte ilimitado",
  descricao: null,
  ciclo: "mensal",
  precoCentavos: 12000,
  diasDeTeste: 0,
  fixoPorAtendimentoCentavos: 2500,
  aceitaOnline: false,
  aceitaNoBalcao: true,
  ativo: true,
  servicos: [{ servicoId: "s1", nome: "Corte", usosPorCiclo: null }],
  assinantes: 1,
};

// De Gustavo: 2 cortes por ciclo, sem fixo.
const DO_GUSTAVO: PlanoDoPainel = {
  ...DA_CASA,
  id: "pl2",
  daCasa: false,
  vendedor: gustavo,
  nome: "2 cortes",
  precoCentavos: 9000,
  fixoPorAtendimentoCentavos: null,
  servicos: [{ servicoId: "s1", nome: "Corte", usosPorCiclo: 2 }],
};

function assinatura(
  id: string,
  cliente: { id: string; nome: string },
  plano: PlanoDoPainel,
  extra: Partial<AssinaturaDoPainel> = {}
): AssinaturaDoPainel {
  return {
    id,
    situacao: "ativa",
    forma: "no_balcao",
    precoCentavos: plano.precoCentavos,
    ciclo: "mensal",
    cicloComecaEm: "2026-10-10",
    cicloTerminaEm: "2026-11-10",
    canceladaEm: null,
    criadoEm: "2026-10-10T12:00:00.000Z",
    cliente: { ...cliente, telefone: "(11) 99999-0000" },
    plano: { id: plano.id, nome: plano.nome, daCasa: plano.daCasa, vendedor: plano.vendedor },
    ...extra,
  };
}

const ANA = { id: "c1", nome: "Ana Souza" };
const BRUNO = { id: "c2", nome: "Bruno Lima" };
const CORTE = { servicoId: "s1", nome: "Corte", precoNoMomento: "45.00", duracaoNoMomento: 30 };
const BARBA = { servicoId: "s2", nome: "Barba", precoNoMomento: "30.00", duracaoNoMomento: 30 };

function agendamento(
  clienteId: string,
  barbeiro: { id: string; nome: string },
  servicos: (typeof CORTE)[],
  status: "confirmado" | "concluido" = "confirmado"
) {
  return {
    id: "a1",
    clienteId,
    data: DIA,
    horaInicio: "14:30",
    horaFim: "15:30",
    status,
    origem: "barbeiro" as const,
    observacoes: null,
    barbeiro,
    servicos,
  };
}

function semear(extra: SementeFalsa = {}) {
  return criarApiClientFalso({
    hoje: "2026-10-24",
    equipe: [RAFAEL, GUSTAVO],
    clientes: [ANA, BRUNO].map((c) => ({ ...c, telefone: "(11) 99999-0000", email: null, temConta: false })),
    planos: [DA_CASA, DO_GUSTAVO],
    assinaturas: [assinatura("as1", ANA, DA_CASA), assinatura("as2", BRUNO, DO_GUSTAVO)],
    agendamentos: [agendamento("c1", gustavo, [CORTE, BARBA])],
    divisao: { parteDaCasa: {}, matriz: [] },
    donosDosClientes: { c1: "bb0", c2: "bb0" },
    ...extra,
  });
}

function espiarRegistrar(falso: ReturnType<typeof semear>) {
  const original = falso.barbeiro.registrarPagamento;
  const registrar = vi.fn(async (id: string, dados: RegistrarPagamento) => original(id, dados));
  falso.barbeiro.registrarPagamento = registrar;
  return registrar;
}

async function abrirOPagamento() {
  await userEvent.click(await screen.findByRole("button", { name: /concluir e registrar pagamento/i }));
  return screen.getByRole("form", { name: /registrar pagamento/i });
}

function pagamento(extra: Partial<PagamentoDoAgendamento>): PagamentoDoAgendamento {
  return {
    id: "p1",
    agendamentoId: "a1",
    data: DIA,
    forma: "pix",
    servicosCentavos: 3000,
    descontoCentavos: 0,
    gorjetaCentavos: 0,
    totalCentavos: 3000,
    atendente: gustavo,
    donoDoCliente: gustavo,
    recebidoPor: gustavo,
    registradoPor: gustavo,
    registradoEm: `${DIA}T17:40:00.000Z`,
    partes: [
      { beneficiario: gustavo, motivo: "atendimento", valorCentavos: 3000 },
      { beneficiario: gustavo, motivo: "plano", valorCentavos: 2500 },
    ],
    assinatura: { id: "as1", plano: { id: "pl1", nome: "Corte ilimitado" } },
    servicosPeloPlano: [{ id: "s1", nome: "Corte" }],
    ...extra,
  };
}

describe("usar o plano no pagamento do atendimento", () => {
  beforeEach(() => {
    localStorage.clear();
    navegacaoFalsa.redefinir({ pathname: "/painel/agendamentos/a1", params: { id: "a1" } });
  });

  it("o plano vem escolhido: o corte vai pelo plano e a barba é cobrada à parte", async () => {
    const falso = semear();
    const registrar = espiarRegistrar(falso);
    montarPainel(<DetalheDoAgendamento />, falso);

    const formulario = await abrirOPagamento();
    const usar = within(formulario).getByRole("group", { name: "Usar o plano" });
    expect(within(usar).getByRole("radio", { name: /Corte ilimitado/ })).toBeChecked();
    expect(within(usar).getByRole("radio", { name: /não usar/i })).not.toBeChecked();
    const linhas = within(formulario).getByRole("list", { name: /serviços do atendimento/i });
    expect(within(linhas).getByText("Pelo plano · sem limite no ciclo")).toBeInTheDocument();
    expect(within(linhas).getByText("Fora do plano · avulso")).toBeInTheDocument();
    expect(within(formulario).getByLabelText(/valor dos serviços/i)).toHaveValue("30,00");

    await userEvent.click(within(formulario).getByRole("radio", { name: "Pix" }));
    await userEvent.click(within(formulario).getByRole("button", { name: /^Registrar R\$\s30,00$/ }));

    await waitFor(() =>
      expect(registrar).toHaveBeenCalledWith("a1", {
        forma: "pix",
        assinaturaId: "as1",
        servicosCentavos: 3000,
        descontoCentavos: 0,
        gorjetaCentavos: 0,
        recebidoPorId: "bb0",
      })
    );
    const resumo = await screen.findByRole("region", { name: /pagamento/i });
    expect(within(resumo).getByText("Pago: R$ 30,00 no pix, recebido por Gustavo.")).toBeInTheDocument();
    expect(within(resumo).getByText("Pelo plano Corte ilimitado: Corte.")).toBeInTheDocument();
    // O fixo não soma com o dinheiro da barba: quem paga é a casa.
    expect(
      within(resumo).getByText(
        "Gustavo fica com R$ 30,00. Gustavo ganha R$ 25,00 do plano da casa, que a casa repassa no acerto."
      )
    ).toBeInTheDocument();
  });

  it("não usar volta o valor à soma e registra avulso", async () => {
    const falso = semear();
    const registrar = espiarRegistrar(falso);
    montarPainel(<DetalheDoAgendamento />, falso);

    const formulario = await abrirOPagamento();
    await userEvent.click(within(formulario).getByRole("radio", { name: /não usar/i }));
    expect(within(formulario).getByLabelText(/valor dos serviços/i)).toHaveValue("75,00");
    expect(within(formulario).queryByRole("list", { name: /serviços do atendimento/i })).not.toBeInTheDocument();

    await userEvent.click(within(formulario).getByRole("radio", { name: "Dinheiro" }));
    await userEvent.click(within(formulario).getByRole("button", { name: /^Registrar R\$\s75,00$/ }));
    await waitFor(() =>
      expect(registrar).toHaveBeenCalledWith("a1", {
        forma: "dinheiro",
        servicosCentavos: 7500,
        descontoCentavos: 0,
        gorjetaCentavos: 0,
        recebidoPorId: "bb0",
      })
    );
  });

  it("tudo coberto: sem forma a escolher, registra pelo plano; com gorjeta, a forma volta", async () => {
    const falso = semear({ agendamentos: [agendamento("c1", gustavo, [CORTE])] });
    const registrar = espiarRegistrar(falso);
    montarPainel(<DetalheDoAgendamento />, falso);

    const formulario = await abrirOPagamento();
    expect(within(formulario).getByLabelText(/valor dos serviços/i)).toHaveValue("");
    expect(within(formulario).queryByRole("radio", { name: "Pix" })).not.toBeInTheDocument();
    expect(within(formulario).getByText(/nada a cobrar/i)).toBeInTheDocument();

    await userEvent.type(within(formulario).getByLabelText(/gorjeta/i), "5");
    expect(within(formulario).getByRole("radio", { name: "Pix" })).toBeInTheDocument();
    await userEvent.clear(within(formulario).getByLabelText(/gorjeta/i));

    await userEvent.click(within(formulario).getByRole("button", { name: /^Registrar R\$\s0,00$/ }));
    await waitFor(() =>
      expect(registrar).toHaveBeenCalledWith("a1", {
        forma: "plano",
        assinaturaId: "as1",
        servicosCentavos: 0,
        descontoCentavos: 0,
        gorjetaCentavos: 0,
      })
    );
    const resumo = await screen.findByRole("region", { name: /pagamento/i });
    expect(within(resumo).getByText("Pago pelo plano Corte ilimitado: Corte.")).toBeInTheDocument();
    expect(within(resumo).queryByText(/recebido por/)).not.toBeInTheDocument();
    expect(
      within(resumo).getByText("Gustavo ganha R$ 25,00 do plano da casa, que a casa repassa no acerto.")
    ).toBeInTheDocument();
  });

  it("plano de outro barbeiro: diz por quê, e o atendimento é avulso", async () => {
    const falso = semear({ agendamentos: [agendamento("c2", rafael, [CORTE])] });
    montarPainel(<DetalheDoAgendamento />, falso);

    const formulario = await abrirOPagamento();
    expect(within(formulario).queryByRole("group", { name: "Usar o plano" })).not.toBeInTheDocument();
    expect(
      within(formulario).getByText(
        'O plano "2 cortes" é de Gustavo e vale só nos atendimentos de Gustavo. Este atendimento é avulso.'
      )
    ).toBeInTheDocument();
    expect(within(formulario).getByLabelText(/valor dos serviços/i)).toHaveValue("45,00");
  });

  it("usos do ciclo acabados: diz por quê; com uso sobrando, conta qual é", async () => {
    const usado = pagamento({
      id: "p9",
      agendamentoId: "a9",
      data: "2026-10-15",
      forma: "plano",
      servicosCentavos: 0,
      totalCentavos: 0,
      partes: [],
      assinatura: { id: "as2", plano: { id: "pl2", nome: "2 cortes" } },
    });
    const esgotado = semear({
      agendamentos: [agendamento("c2", gustavo, [CORTE])],
      pagamentos: [usado, { ...usado, id: "p8", agendamentoId: "a8" }],
    });
    montarPainel(<DetalheDoAgendamento />, esgotado);
    const formulario = await abrirOPagamento();
    expect(
      within(formulario).getByText('O plano "2 cortes" já usou neste ciclo tudo o que cobre. Este atendimento é avulso.')
    ).toBeInTheDocument();
    cleanup();

    montarPainel(
      <DetalheDoAgendamento />,
      semear({ agendamentos: [agendamento("c2", gustavo, [CORTE])], pagamentos: [usado] })
    );
    const outro = await abrirOPagamento();
    expect(within(outro).getByText("Pelo plano · 2º uso de 2 no ciclo")).toBeInTheDocument();
  });

  it("editar um pagamento pelo plano mantém o plano, mesmo com a assinatura cancelada depois", async () => {
    const falso = semear({
      assinaturas: [assinatura("as1", ANA, DA_CASA, { situacao: "cancelada", canceladaEm: "2026-10-24T10:00:00.000Z" })],
      agendamentos: [agendamento("c1", gustavo, [CORTE, BARBA], "concluido")],
      pagamentos: [pagamento({})],
    });
    const registrar = espiarRegistrar(falso);
    montarPainel(<DetalheDoAgendamento />, falso);

    await userEvent.click(await screen.findByRole("button", { name: /editar pagamento/i }));
    const formulario = screen.getByRole("form", { name: /editar pagamento/i });
    expect(within(formulario).getByRole("radio", { name: /Corte ilimitado/ })).toBeChecked();
    expect(within(formulario).getByLabelText(/valor dos serviços/i)).toHaveValue("30,00");

    await userEvent.click(within(formulario).getByRole("button", { name: /^Salvar R\$\s30,00$/ }));
    await waitFor(() =>
      expect(registrar).toHaveBeenCalledWith("a1", expect.objectContaining({ forma: "pix", assinaturaId: "as1" }))
    );
  });

  it("plano de barbeiro, tudo coberto: o resumo diz que não há o que dividir", async () => {
    montarPainel(
      <DetalheDoAgendamento />,
      semear({
        agendamentos: [agendamento("c2", gustavo, [CORTE], "concluido")],
        pagamentos: [
          pagamento({
            forma: "plano",
            servicosCentavos: 0,
            totalCentavos: 0,
            partes: [],
            assinatura: { id: "as2", plano: { id: "pl2", nome: "2 cortes" } },
          }),
        ],
      })
    );

    const resumo = await screen.findByRole("region", { name: /pagamento/i });
    expect(within(resumo).getByText("Pago pelo plano 2 cortes: Corte.")).toBeInTheDocument();
    expect(within(resumo).getByText("A mensalidade já pagou este atendimento: não há o que dividir.")).toBeInTheDocument();
  });
});

describe("mensalidades no Caixa", () => {
  beforeEach(() => {
    localStorage.clear();
    navegacaoFalsa.redefinir({ pathname: "/painel/caixa", query: { data: DIA } });
  });

  const mensalidade = (extra: Partial<MensalidadeDoCaixa>): MensalidadeDoCaixa => ({
    id: "m1",
    assinaturaId: "as1",
    data: DIA,
    registradoEm: `${DIA}T13:05:00.000Z`,
    forma: "pix",
    valorCentavos: 12000,
    casaCentavos: 12000,
    recebidoPor: rafael,
    cliente: ANA,
    plano: { id: "pl1", nome: "Corte ilimitado", daCasa: true, vendedor: null },
    ...extra,
  });

  it("lista as mensalidades recebidas no dia, de quem é o plano e a parte da casa", async () => {
    const falso = semear({
      mensalidades: [
        mensalidade({}),
        mensalidade({
          id: "m2",
          assinaturaId: "as2",
          // Recebida às 23h30 de 22/10 com o dia 22 fechado: caiu no 23.
          registradoEm: "2026-10-23T02:30:00.000Z",
          forma: "dinheiro",
          valorCentavos: 9000,
          casaCentavos: 1800,
          cliente: BRUNO,
          plano: { id: "pl2", nome: "2 cortes", daCasa: false, vendedor: gustavo },
        }),
      ],
    });
    montarPainel(<CaixaDoDia />, falso);

    const secao = await screen.findByRole("region", { name: "Mensalidades" });
    const [daAna, doBruno] = within(secao).getAllByRole("listitem");
    expect(within(daAna).getByText("Ana Souza · Corte ilimitado")).toBeInTheDocument();
    expect(within(daAna).getByText("Da casa · recebida por Rafael")).toBeInTheDocument();
    expect(within(daAna).getByText("10:05")).toBeInTheDocument();
    expect(within(daAna).getByText(/R\$\s120,00 no pix/)).toBeInTheDocument();
    expect(
      within(doBruno).getByText("De Gustavo · recebida por Rafael em 22/10 · a casa fica com R$ 18,00")
    ).toBeInTheDocument();
    expect(within(doBruno).getByText(/R\$\s90,00 em dinheiro/)).toBeInTheDocument();

    const totais = screen.getByRole("region", { name: /entrou no dia/i });
    expect(within(totais).getByText(/R\$\s210,00/)).toBeInTheDocument();
  });

  it("o atendimento pelo plano diz o que o plano cobriu, com a nota de que não é dinheiro do dia", async () => {
    const falso = semear();
    await falso.barbeiro.registrarPagamento("a1", { forma: "pix", assinaturaId: "as1" });
    montarPainel(<CaixaDoDia />, falso);

    const pagamentos = await screen.findByRole("region", { name: "Pagamentos" });
    expect(within(pagamentos).getByText(/Corte pelo plano/)).toBeInTheDocument();
    expect(
      within(pagamentos).getByText(
        "Atendimento pelo plano não entra como dinheiro do dia: a mensalidade já entrou quando foi paga."
      )
    ).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Mensalidades" })).not.toBeInTheDocument();
  });

  it("sem plano no dia, nada muda", async () => {
    const falso = semear();
    await falso.barbeiro.registrarPagamento("a1", { forma: "pix" });
    montarPainel(<CaixaDoDia />, falso);

    const pagamentos = await screen.findByRole("region", { name: "Pagamentos" });
    expect(within(pagamentos).queryByText(/pelo plano/i)).not.toBeInTheDocument();
  });
});
