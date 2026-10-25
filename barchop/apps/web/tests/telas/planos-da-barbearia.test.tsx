import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
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
  ativo: true,
  servicos: [{ servicoId: "s1", nome: "Corte masculino", usosPorCiclo: 2 }],
  assinantes: 0,
};
const COM_TESTE: PlanoDoPainel = { ...CORTE, id: "pl2", nome: "Com teste", diasDeTeste: 7 };
const SO_BALCAO: PlanoDoPainel = { ...CORTE, id: "pl3", nome: "Só no balcão", aceitaOnline: false, aceitaNoBalcao: true };

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

  it("mostra cada plano com preço, com quem vale e o que inclui; o do balcão sem Assinar", async () => {
    montar(<PlanosDaBarbearia />);

    const corte = await cartaoDo("Corte ilimitado");
    expect(within(corte).getByText(/r\$\s?120,00 por mês/i)).toBeInTheDocument();
    expect(within(corte).getByText("Vale com qualquer profissional")).toBeInTheDocument();
    expect(within(corte).getByText(/2× Corte masculino/)).toBeInTheDocument();
    expect(within(await cartaoDo("Com teste")).getByText("7 dias grátis pra começar")).toBeInTheDocument();

    const balcao = await cartaoDo("Só no balcão");
    expect(within(balcao).queryByRole("button", { name: "Assinar" })).not.toBeInTheDocument();
    expect(within(balcao).getByText(/combinado no balcão/i)).toBeInTheDocument();
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

  it("com CPF no cadastro e teste grátis: direto pra fatura, com o fim do teste", async () => {
    sessaoDoCliente("gr-barber").gravar("jwt-do-cliente");
    montar(<PlanosDaBarbearia />, semear({ cpfDoCliente: "52998224725" }));
    const comTeste = await cartaoDo("Com teste");

    await userEvent.click(within(comTeste).getByRole("button", { name: "Assinar" }));

    expect(await within(comTeste).findByText(/teste grátis vai até 01\/11/i)).toBeInTheDocument();
    expect(within(comTeste).getByRole("link", { name: "Abrir a fatura" })).toBeInTheDocument();
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
    const falso = montar(<PlanosNaPagina slug="gr-barber" />, semear({ vitrineDePlanos: false }));
    await waitFor(() => expect(falso.estado.vitrineDePlanos).toBe(false));
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

    const secao = await screen.findByRole("region", { name: "Minhas assinaturas" });
    expect(within(secao).getByText("Corte ilimitado")).toBeInTheDocument();
    expect(within(secao).getByText("Renova em 20/11")).toBeInTheDocument();
    expect(within(secao).getByText("Corte masculino: sobra 1 de 2 neste ciclo")).toBeInTheDocument();
    expect(within(secao).queryByText("Com teste")).not.toBeInTheDocument();
  });

  it("a pendente online tem o Pagar, que mostra a fatura; sem usos", async () => {
    montar(
      <MinhaConta />,
      semear({
        assinaturas: [assinatura({ situacao: "pendente", cicloComecaEm: null, cicloTerminaEm: null })],
      })
    );
    const secao = await screen.findByRole("region", { name: "Minhas assinaturas" });
    expect(within(secao).queryByText(/neste ciclo/)).not.toBeInTheDocument();

    await userEvent.click(within(secao).getByRole("button", { name: "Pagar" }));

    expect(await within(secao).findByRole("link", { name: "Abrir a fatura" })).toHaveAttribute(
      "href",
      "https://sandbox.asaas.com/i/exemplo-as1"
    );
  });

  it("cancelar pede confirmação e tira da lista", async () => {
    const falso = montar(
      <MinhaConta />,
      semear({
        assinaturas: [assinatura({})],
      })
    );
    const secao = await screen.findByRole("region", { name: "Minhas assinaturas" });

    await userEvent.click(within(secao).getByRole("button", { name: "Cancelar assinatura" }));
    expect(within(secao).getByText(/o asaas para de cobrar/i)).toBeInTheDocument();
    await userEvent.click(within(secao).getByRole("button", { name: "Sim, cancelar" }));

    await waitFor(() =>
      expect(screen.queryByRole("region", { name: "Minhas assinaturas" })).not.toBeInTheDocument()
    );
    expect(falso.estado.assinaturas![0].situacao).toBe("cancelada");
  });
});
