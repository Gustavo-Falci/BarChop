import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { criarApiClientFalso, type SementeFalsa } from "@barchop/api-client";
import type { AssinaturaDoPainel, ContaDePagamentoOnline, PlanoDoPainel } from "@barchop/types";
import { ProvedorDaApi } from "../../src/api/ProvedorDaApi";
import { MinhaConta } from "../../src/telas/MinhaConta";
import { PlanosDaBarbearia } from "../../src/telas/PlanosDaBarbearia";
import { PlanosNaPagina } from "../../src/telas/PlanosNaPagina";
import { sessaoDoCliente } from "../../src/sessao/armazenamento";
import { navegacaoFalsa } from "../ajudantes/navegacao";

// Os planos na página pública (Onda 2, marco 3, PR 11 do plano
// planos-de-assinatura): a vitrine, o assinar online (login, CPF, fatura
// do Asaas) e as assinaturas na Minha conta.

const CONTA: ContaDePagamentoOnline = {
  provedor: "asaas",
  modo: "teste",
  chaveFinal: "1234",
  conectadaEm: "2026-10-25T15:00:00.000Z",
  infiniteTag: null,
  diasParaCancelar: null,
};

const CORTE: PlanoDoPainel = {
  id: "pl1",
  daCasa: true,
  vendedor: null,
  nome: "Corte ilimitado",
  descricao: "Pra quem corta toda semana.",
  ciclo: "mensal",
  precoCentavos: 12000,
  diasDeTeste: 0,
  fixoPorAtendimentoCentavos: 2500,
  aceitaOnline: true,
  aceitaNoBalcao: false,
  onlineIndisponivel: false,
  ativo: true,
  servicos: [{ servicoId: "s1", nome: "Corte masculino", usosPorCiclo: 2 }],
  assinantes: 0,
};
const COM_TESTE: PlanoDoPainel = { ...CORTE, id: "pl2", nome: "Com teste", diasDeTeste: 7 };
const SO_BALCAO: PlanoDoPainel = { ...CORTE, id: "pl3", nome: "Só no balcão", aceitaOnline: false, aceitaNoBalcao: true };
// De barbeiro, só no balcão: o Rafael (bb1) é o dono no dublê, e o dono
// pode vender.
const DO_RAFAEL: PlanoDoPainel = {
  ...SO_BALCAO,
  id: "pl4",
  nome: "Corte com o Rafael",
  daCasa: false,
  vendedor: { id: "bb1", nome: "Rafael" },
};
const NOS_DOIS: PlanoDoPainel = { ...CORTE, id: "pl5", nome: "Online ou balcão", aceitaNoBalcao: true };

const CONTA_DA_STRIPE: ContaDePagamentoOnline = { ...CONTA, provedor: "stripe" };

function semear(extra: SementeFalsa = {}) {
  return criarApiClientFalso({
    vitrineDePlanos: true,
    planos: [CORTE, COM_TESTE, SO_BALCAO],
    contasOnline: { casa: CONTA },
    hoje: "2026-10-25",
    ...extra,
  });
}

function montar(tela: React.ReactElement, falso = semear()) {
  render(<ProvedorDaApi valor={falso}>{tela}</ProvedorDaApi>);
  return falso;
}

const cartaoDo = async (nome: string) =>
  (await screen.findByRole("heading", { name: nome })).closest("li") as HTMLElement;

describe("planos da barbearia", () => {
  beforeEach(() => {
    localStorage.clear();
    navegacaoFalsa.redefinir({ pathname: "/gr-barber/planos" });
  });

  it("mostra cada plano com o preço em destaque, com quem vale e a lista do que inclui", async () => {
    montar(<PlanosDaBarbearia />);

    const corte = await cartaoDo("Corte ilimitado");
    expect(within(corte).getByText(/^r\$\s?120,00$/i)).toBeInTheDocument();
    expect(within(corte).getByText("por mês")).toBeInTheDocument();
    expect(within(corte).getByText("Vale com qualquer profissional")).toBeInTheDocument();
    const inclui = within(corte).getByRole("list", { name: "Inclui a cada mês" });
    expect(within(inclui).getByRole("listitem")).toHaveTextContent("2× Corte masculino");
    expect(within(await cartaoDo("Com teste")).getByText("7 dias grátis")).toBeInTheDocument();
  });

  it("o plano do balcão não tem Assinar e leva pra agendar", async () => {
    montar(<PlanosDaBarbearia />, semear({ planos: [SO_BALCAO, DO_RAFAEL] }));

    const balcao = await cartaoDo("Só no balcão");
    expect(within(balcao).queryByRole("button", { name: "Assinar" })).not.toBeInTheDocument();
    expect(within(balcao).getByText(/combinado no balcão/i)).toBeInTheDocument();
    expect(within(balcao).getByRole("link", { name: "Agendar um horário" })).toHaveAttribute("href", "/gr-barber/agendar");

    const doRafael = await cartaoDo("Corte com o Rafael");
    expect(within(doRafael).getByRole("link", { name: "Agendar com Rafael" })).toHaveAttribute(
      "href",
      "/gr-barber/agendar?profissional=bb1"
    );
  });

  it("o que aceita online e balcão diz as duas formas embaixo do Assinar", async () => {
    montar(<PlanosDaBarbearia />, semear({ planos: [NOS_DOIS] }));

    const nosDois = await cartaoDo("Online ou balcão");
    expect(within(nosDois).getByRole("button", { name: "Assinar" })).toBeInTheDocument();
    expect(within(nosDois).getByText("Pix, cartão ou boleto. Ou assine no balcão.")).toBeInTheDocument();
  });

  it("só online e sem a conta de quem vende: o plano aparece com o pagamento online indisponível", async () => {
    montar(<PlanosDaBarbearia />, semear({ planos: [CORTE], contasOnline: {} }));

    const corte = await cartaoDo("Corte ilimitado");
    expect(within(corte).getByText("Pagamento online indisponível")).toBeInTheDocument();
    expect(within(corte).queryByRole("button", { name: "Assinar" })).not.toBeInTheDocument();
    expect(within(corte).queryByRole("link", { name: /agendar/i })).not.toBeInTheDocument();
  });

  it("online e balcão sem a conta: avisa o online indisponível e segue com o balcão", async () => {
    montar(<PlanosDaBarbearia />, semear({ planos: [NOS_DOIS], contasOnline: {} }));

    const nosDois = await cartaoDo("Online ou balcão");
    expect(within(nosDois).getByText("Pagamento online indisponível")).toBeInTheDocument();
    expect(within(nosDois).getByText(/combinado no balcão/i)).toBeInTheDocument();
    expect(within(nosDois).getByRole("link", { name: "Agendar um horário" })).toBeInTheDocument();
  });

  it("tem a volta pra barbearia e o caminho pra Minha conta", async () => {
    montar(<PlanosDaBarbearia />);

    await cartaoDo("Corte ilimitado");
    expect(screen.getByRole("link", { name: "Voltar pra barbearia" })).toHaveAttribute("href", "/gr-barber");
    expect(screen.getByRole("link", { name: "Veja em Minha conta" })).toHaveAttribute("href", "/gr-barber/minha-conta");
  });

  it("explica como funciona, com o pagamento online só quando algum plano aceita", async () => {
    montar(<PlanosDaBarbearia />);
    const comOnline = await screen.findByRole("region", { name: "Como funciona" });
    expect(within(comOnline).getByText("Pague online ou no balcão")).toBeInTheDocument();
    expect(within(comOnline).getByText(/nunca vê seu cartão/i)).toBeInTheDocument();
    expect(within(comOnline).getByText("Agende como sempre")).toBeInTheDocument();
    expect(
      within(comOnline).getByText("No dia, você não paga o que o plano cobre. O resto é pago na hora.")
    ).toBeInTheDocument();
  });

  it("só com planos de balcão, o como funciona não fala de pagamento online", async () => {
    montar(<PlanosDaBarbearia />, semear({ planos: [SO_BALCAO] }));
    const soBalcao = await screen.findByRole("region", { name: "Como funciona" });
    expect(within(soBalcao).getByText("Pague no balcão")).toBeInTheDocument();
    expect(within(soBalcao).queryByText(/asaas|cartão/i)).not.toBeInTheDocument();
  });

  it("sem login, Assinar leva ao login com o plano, e nada é criado", async () => {
    const falso = montar(<PlanosDaBarbearia />);

    await userEvent.click(within(await cartaoDo("Corte ilimitado")).getByRole("button", { name: "Assinar" }));

    expect(navegacaoFalsa.push).toHaveBeenCalledWith("/gr-barber/entrar?voltar=planos&plano=pl1");
    expect(falso.estado.assinaturas).toEqual([]);
  });

  it("logado: pede o CPF, confere antes de mandar e abre a fatura em outra aba", async () => {
    sessaoDoCliente("gr-barber").gravar("jwt-do-cliente");
    const falso = montar(<PlanosDaBarbearia />);
    const corte = await cartaoDo("Corte ilimitado");

    await userEvent.click(within(corte).getByRole("button", { name: "Assinar" }));
    const cpf = await within(corte).findByLabelText("CPF");
    await userEvent.type(cpf, "529.982.247-24");
    await userEvent.click(within(corte).getByRole("button", { name: "Continuar pro pagamento" }));
    expect(within(corte).getByText(/os números não batem/i)).toBeInTheDocument();
    expect(falso.estado.assinaturas).toEqual([]);

    await userEvent.clear(cpf);
    await userEvent.type(cpf, "529.982.247-25");
    await userEvent.click(within(corte).getByRole("button", { name: "Continuar pro pagamento" }));

    const fatura = await within(corte).findByRole("link", { name: "Abrir a fatura" });
    expect(fatura).toHaveAttribute("href", "https://sandbox.asaas.com/i/exemplo-as1");
    expect(fatura).toHaveAttribute("target", "_blank");
    expect(within(corte).getByRole("link", { name: "Ver em Minha conta" })).toHaveAttribute(
      "href",
      "/gr-barber/minha-conta"
    );
    expect(within(corte).getByText(/falta pagar a primeira mensalidade/i)).toBeInTheDocument();
    expect(falso.estado.cpfDoCliente).toBe("52998224725");
  });

  it("na conta da Stripe: sem CPF, direto pra fatura, e a página diz que é cartão na Stripe", async () => {
    sessaoDoCliente("gr-barber").gravar("jwt-do-cliente");
    const falso = montar(<PlanosDaBarbearia />, semear({ planos: [CORTE], contasOnline: { casa: CONTA_DA_STRIPE } }));
    const corte = await cartaoDo("Corte ilimitado");
    expect(within(corte).getByText("Cartão.")).toBeInTheDocument();
    const como = screen.getByRole("region", { name: "Como funciona" });
    expect(within(como).getByText(/na página da stripe/i)).toBeInTheDocument();

    await userEvent.click(within(corte).getByRole("button", { name: "Assinar" }));

    const fatura = await within(corte).findByRole("link", { name: "Abrir a fatura" });
    expect(fatura.getAttribute("href")).toMatch(/^https:[/][/]invoice[.]stripe[.]com[/]/);
    expect(within(corte).queryByLabelText("CPF")).not.toBeInTheDocument();
    expect(within(corte).getByText(/cartão, na página da stripe/i)).toBeInTheDocument();
    expect(falso.estado.cpfDoCliente ?? null).toBeNull();
  });

  it("planos em provedores diferentes: o como funciona não nomeia nenhum", async () => {
    const doRafael: PlanoDoPainel = { ...DO_RAFAEL, aceitaOnline: true, aceitaNoBalcao: false };
    montar(
      <PlanosDaBarbearia />,
      semear({ planos: [CORTE, doRafael], contasOnline: { casa: CONTA, bb1: CONTA_DA_STRIPE } })
    );
    const como = await screen.findByRole("region", { name: "Como funciona" });
    expect(within(como).getByText(/nunca vê seu cartão/i)).toBeInTheDocument();
    expect(within(como).queryByText(/asaas|stripe/i)).not.toBeInTheDocument();
    expect(within(await cartaoDo("Corte ilimitado")).getByText("Pix, cartão ou boleto.")).toBeInTheDocument();
    expect(within(await cartaoDo("Corte com o Rafael")).getByText("Cartão.")).toBeInTheDocument();
  });

  it("com CPF no cadastro e teste grátis: direto pra fatura, com o fim do teste", async () => {
    sessaoDoCliente("gr-barber").gravar("jwt-do-cliente");
    montar(<PlanosDaBarbearia />, semear({ cpfDoCliente: "52998224725" }));
    const comTeste = await cartaoDo("Com teste");

    await userEvent.click(within(comTeste).getByRole("button", { name: "Assinar" }));

    expect(await within(comTeste).findByText(/teste grátis vai até 01\/11/i)).toBeInTheDocument();
    expect(within(comTeste).getByText(/o plano já vale no teste grátis/i)).toBeInTheDocument();
    expect(within(comTeste).getByRole("link", { name: "Abrir a fatura" })).toBeInTheDocument();
  });

  it("teste grátis na Stripe: sem fatura agora, e a primeira chega no fim do teste", async () => {
    sessaoDoCliente("gr-barber").gravar("jwt-do-cliente");
    montar(<PlanosDaBarbearia />, semear({ planos: [COM_TESTE], contasOnline: { casa: CONTA_DA_STRIPE } }));
    const comTeste = await cartaoDo("Com teste");

    await userEvent.click(within(comTeste).getByRole("button", { name: "Assinar" }));

    expect(await within(comTeste).findByText(/teste grátis vai até/i)).toBeInTheDocument();
    expect(within(comTeste).queryByRole("link", { name: "Abrir a fatura" })).not.toBeInTheDocument();
    expect(within(comTeste).queryByText(/não abriu/i)).not.toBeInTheDocument();
    expect(within(comTeste).getByText(/o plano já vale no teste grátis/i)).toBeInTheDocument();
    expect(within(comTeste).getByText(/a primeira fatura chega no fim do teste/i)).toBeInTheDocument();
    expect(within(comTeste).getByRole("link", { name: "Minha conta" })).toHaveAttribute(
      "href",
      "/gr-barber/minha-conta"
    );
  });

  it("volta do login com o plano marcado, mas só assina no toque", async () => {
    sessaoDoCliente("gr-barber").gravar("jwt-do-cliente");
    navegacaoFalsa.redefinir({ pathname: "/gr-barber/planos", query: { plano: "pl1" } });
    const falso = montar(<PlanosDaBarbearia />, semear({ cpfDoCliente: "52998224725" }));

    const corte = await cartaoDo("Corte ilimitado");
    expect(within(corte).getByText(/toque em assinar pra continuar/i)).toBeInTheDocument();
    expect(falso.estado.assinaturas).toEqual([]);
  });

  it("quem já assina ouve a frase da API, com o caminho pra Minha conta", async () => {
    sessaoDoCliente("gr-barber").gravar("jwt-do-cliente");
    const falso = semear({ cpfDoCliente: "52998224725" });
    const { assinatura } = await falso.cliente.assinarPlano("pl1");
    falso.estado.assinaturas!.find((a) => a.id === assinatura.id)!.situacao = "ativa";
    montar(<PlanosDaBarbearia />, falso);

    await userEvent.click(within(await cartaoDo("Corte ilimitado")).getByRole("button", { name: "Assinar" }));

    expect(await screen.findByText(/você já assina este plano/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver em Minha conta" })).toBeInTheDocument();
  });

  it("sem plano à venda, diz isso", async () => {
    montar(<PlanosDaBarbearia />, semear({ vitrineDePlanos: false }));
    expect(await screen.findByText(/não tem planos à venda agora/i)).toBeInTheDocument();
  });
});

describe("os planos na página da barbearia", () => {
  beforeEach(() => {
    localStorage.clear();
    navegacaoFalsa.redefinir({ pathname: "/gr-barber" });
  });

  it("resume os planos e leva pra tela de assinar", async () => {
    montar(<PlanosNaPagina slug="gr-barber" />);
    const secao = await screen.findByRole("region", { name: "Planos de assinatura" });
    expect(within(secao).getByText("Corte ilimitado")).toBeInTheDocument();
    expect(within(secao).getByRole("link", { name: "Conhecer os planos" })).toHaveAttribute("href", "/gr-barber/planos");
  });

  it("sem plano, a seção não aparece", async () => {
    // Espera a resposta de verdade: antes dela a seção também não existe.
    const falso = semear({ vitrineDePlanos: false });
    const pedido = vi.spyOn(falso.publico, "planos");
    montar(<PlanosNaPagina slug="gr-barber" />, falso);
    await waitFor(() => expect(pedido).toHaveBeenCalled());
    await pedido.mock.results[0].value;
    await act(async () => {});
    expect(screen.queryByRole("region", { name: "Planos de assinatura" })).not.toBeInTheDocument();
  });
});

describe("minhas assinaturas", () => {
  const assinatura = (extra: Partial<AssinaturaDoPainel>): AssinaturaDoPainel => ({
    id: "as1",
    situacao: "ativa",
    forma: "online",
    precoCentavos: 12000,
    ciclo: "mensal",
    cicloComecaEm: "2026-10-20",
    cicloTerminaEm: "2026-11-20",
    canceladaEm: null,
    linkDoCiclo: null,
    criadoEm: "2026-10-20T12:00:00.000Z",
    cliente: { id: "c1", nome: "João", telefone: "+5511999998888" },
    plano: { id: "pl1", nome: "Corte ilimitado", daCasa: true, vendedor: null },
    ...extra,
  });

  beforeEach(() => {
    localStorage.clear();
    navegacaoFalsa.redefinir({ pathname: "/gr-barber/minha-conta" });
    sessaoDoCliente("gr-barber").gravar("jwt-do-cliente");
  });

  it("a ativa mostra até quando vale e os usos que sobram; a cancelada fica fora", async () => {
    montar(
      <MinhaConta />,
      semear({
        assinaturas: [
          assinatura({}),
          assinatura({ id: "as2", situacao: "cancelada", plano: { ...assinatura({}).plano, id: "pl2", nome: "Com teste" } }),
        ],
        usosNoCiclo: { "as1:s1": 1 },
      })
    );

    const secao = await screen.findByRole("region", { name: "Meu plano" });
    expect(within(secao).getByText("Corte ilimitado")).toBeInTheDocument();
    expect(within(secao).getByText("Renova em 20/11")).toBeInTheDocument();
    // Os usos viram uma linha por serviço, com o que sobra e a barra.
    const uso = within(secao).getByText("Corte masculino").closest("li") as HTMLElement;
    expect(within(uso).getByText("sobra 1 de 2")).toBeInTheDocument();
    expect(within(secao).getByText("Neste ciclo")).toBeInTheDocument();
    expect(within(secao).getByText("Pago online")).toBeInTheDocument();
    expect(within(secao).queryByText("Com teste")).not.toBeInTheDocument();
  });

  it("a pendente online tem o Pagar, que mostra a fatura; sem usos", async () => {
    montar(
      <MinhaConta />,
      semear({
        assinaturas: [assinatura({ situacao: "pendente", cicloComecaEm: null, cicloTerminaEm: null })],
      })
    );
    const secao = await screen.findByRole("region", { name: "Meu plano" });
    expect(within(secao).queryByText(/neste ciclo/)).not.toBeInTheDocument();

    await userEvent.click(within(secao).getByRole("button", { name: "Pagar" }));

    expect(await within(secao).findByRole("link", { name: "Abrir a fatura" })).toHaveAttribute(
      "href",
      "https://sandbox.asaas.com/i/exemplo-as1"
    );
  });

  it("o horário marcado que o plano cobre diz \"pelo plano\"; o que passa dos usos, não", async () => {
    const marcado = (id: string, data: string, servicos: { servicoId: string; nome: string }[]) => ({
      id,
      data,
      horaInicio: "17:00",
      horaFim: "17:50",
      status: "confirmado",
      origem: "cliente",
      observacoes: null,
      presencaConfirmadaEm: null,
      barbeiro: { id: "bb1", nome: "Rafael" },
      servicos: servicos.map((s) => ({ ...s, precoNoMomento: "40.00", duracaoNoMomento: 25 })),
    });
    const corte = { servicoId: "s1", nome: "Corte masculino" };
    const barba = { servicoId: "s2", nome: "Barba" };
    montar(
      <MinhaConta />,
      semear({
        assinaturas: [assinatura({})],
        usosNoCiclo: { "as1:s1": 1 },
        agendamentos: [marcado("a1", "2026-10-30", [corte, barba]), marcado("a2", "2026-11-02", [corte])],
      })
    );

    const primeiro = (await screen.findByText("Corte masculino e Barba com Rafael")).closest("article") as HTMLElement;
    expect(within(primeiro).getByText("Corte masculino pelo plano")).toBeInTheDocument();
    const segundo = screen.getByText("Corte masculino com Rafael").closest("article") as HTMLElement;
    expect(within(segundo).queryByText(/pelo plano/)).not.toBeInTheDocument();
  });

  it("cancelar pede confirmação e tira da lista", async () => {
    const falso = montar(
      <MinhaConta />,
      semear({
        assinaturas: [assinatura({})],
      })
    );
    const secao = await screen.findByRole("region", { name: "Meu plano" });

    await userEvent.click(within(secao).getByRole("button", { name: "Cancelar assinatura" }));
    expect(within(secao).getByText(/a cobrança online para/i)).toBeInTheDocument();
    await userEvent.click(within(secao).getByRole("button", { name: "Sim, cancelar" }));

    // Sem assinatura viva, e com a vitrine ligada: o convite pros planos.
    expect(await within(secao).findByText("Você não assina um plano")).toBeInTheDocument();
    expect(within(secao).queryByText("Corte ilimitado")).not.toBeInTheDocument();
    expect(falso.estado.assinaturas![0].situacao).toBe("cancelada");
  });

  it("sem plano e com a vitrine ligada, convida pros planos da barbearia", async () => {
    montar(<MinhaConta />, semear({ assinaturas: [] }));

    const secao = await screen.findByRole("region", { name: "Meu plano" });
    expect(within(secao).getByText("Você não assina um plano")).toBeInTheDocument();
    expect(within(secao).getByRole("link", { name: "Ver os planos" })).toHaveAttribute("href", "/gr-barber/planos");
  });

  it("sem plano e com a vitrine desligada, a seção não aparece", async () => {
    const falso = semear({ assinaturas: [], vitrineDePlanos: false });
    const pedido = vi.spyOn(falso.publico, "planos");
    montar(<MinhaConta />, falso);
    await waitFor(() => expect(pedido).toHaveBeenCalled());
    await pedido.mock.results[0].value;
    await act(async () => {});
    expect(screen.queryByRole("region", { name: "Meu plano" })).not.toBeInTheDocument();
  });

  it("no balcão, diz que é pago no balcão", async () => {
    montar(
      <MinhaConta />,
      semear({
        assinaturas: [
          assinatura({ forma: "no_balcao", plano: { id: "pl3", nome: "Só no balcão", daCasa: true, vendedor: null } }),
        ],
      })
    );
    const secao = await screen.findByRole("region", { name: "Meu plano" });
    expect(within(secao).getByText("Pago no balcão")).toBeInTheDocument();
  });
});
