import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { criarApiClientFalso, type SementeFalsa } from "@barchop/api-client";
import type { AssinaturaDoPainel, ContaDePagamentoOnline, MembroDaEquipe, PlanoDoPainel } from "@barchop/types";
import { IndiceDeConfiguracoes } from "../../../src/telas/painel/configuracoes/IndiceDeConfiguracoes";
import { PagamentosOnline } from "../../../src/telas/painel/configuracoes/PagamentosOnline";
import { navegacaoFalsa } from "../../ajudantes/navegacao";
import { montarPainel } from "../../ajudantes/painel";

// Pagamentos online (Onda 2, marco 3, PR 11 do plano
// planos-de-assinatura): a conta do Asaas de quem vende. A chave nunca
// volta; a tela mostra só a final, e a recusa do desconectar diz quem
// trava.

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

const CONTA: ContaDePagamentoOnline = {
  provedor: "asaas",
  modo: "teste",
  chaveFinal: "1234",
  conectadaEm: "2026-10-25T15:00:00.000Z",
  infiniteTag: null,
  diasParaCancelar: null,
};

const CONTA_DA_STRIPE: ContaDePagamentoOnline = { ...CONTA, provedor: "stripe", chaveFinal: "5678" };

const PLANO: PlanoDoPainel = {
  id: "pl1",
  daCasa: true,
  vendedor: null,
  nome: "Corte ilimitado",
  descricao: null,
  ciclo: "mensal",
  precoCentavos: 12000,
  diasDeTeste: 0,
  fixoPorAtendimentoCentavos: 2500,
  aceitaOnline: true,
  aceitaNoBalcao: false,
  onlineIndisponivel: false,
  ativo: true,
  servicos: [{ servicoId: "s1", nome: "Corte", usosPorCiclo: null }],
  assinantes: 1,
};

const VIVA: AssinaturaDoPainel = {
  id: "as1",
  situacao: "ativa",
  forma: "online",
  precoCentavos: 12000,
  ciclo: "mensal",
  cicloComecaEm: "2026-10-01",
  cicloTerminaEm: "2026-11-01",
  canceladaEm: null,
  criadoEm: "2026-10-01T12:00:00.000Z",
  cliente: { id: "c1", nome: "Caio Rocha", telefone: "+5511999998888" },
  plano: { id: "pl1", nome: "Corte ilimitado", daCasa: true, vendedor: null },
};

function semear(extra: SementeFalsa = {}) {
  return criarApiClientFalso({ equipe: [RAFAEL], ...extra });
}

describe("pagamentos online", () => {
  beforeEach(() => {
    localStorage.clear();
    navegacaoFalsa.redefinir({ pathname: "/painel/configuracoes/pagamentos-online" });
  });

  it("o dono conecta a conta da casa; a chave sai do campo e só a final aparece", async () => {
    const falso = montarPainel(<PagamentosOnline />, semear());

    const casa = await screen.findByRole("region", { name: "Conta da casa" });
    const campo = within(casa).getByLabelText("Chave de API do Asaas");
    expect(campo).toHaveAttribute("type", "password");
    expect(within(casa).getByText(/chave do sandbox do asaas/i)).toBeInTheDocument();

    await userEvent.type(campo, "$aact_hmlg_chave-secreta-9876");
    await userEvent.click(within(casa).getByRole("button", { name: "Conectar" }));

    expect(await within(casa).findByText(/chave terminando em 9876/i)).toBeInTheDocument();
    expect(within(casa).getByText("Sandbox")).toBeInTheDocument();
    expect(within(casa).getByRole("status")).toHaveTextContent("Conta conectada.");
    expect(screen.queryByDisplayValue(/chave-secreta/)).not.toBeInTheDocument();
    expect(falso.estado.contasOnline!.casa).toMatchObject({ chaveFinal: "9876" });
  });

  it("a chave errada fica no campo, com a frase da API", async () => {
    montarPainel(<PagamentosOnline />, semear());
    const casa = await screen.findByRole("region", { name: "Conta da casa" });

    await userEvent.type(within(casa).getByLabelText("Chave de API do Asaas"), "$aact_prod_x");
    await userEvent.click(within(casa).getByRole("button", { name: "Conectar" }));

    expect(await within(casa).findByText(/chave de produção do asaas/i)).toBeInTheDocument();
    expect(within(casa).getByLabelText("Chave de API do Asaas")).toHaveAttribute("aria-invalid", "true");
  });

  it("desconectar pede confirmação; com assinatura viva, diz quem trava", async () => {
    montarPainel(
      <PagamentosOnline />,
      semear({ planos: [PLANO], assinaturas: [VIVA], contasOnline: { casa: CONTA } })
    );
    const casa = await screen.findByRole("region", { name: "Conta da casa" });

    await userEvent.click(within(casa).getByRole("button", { name: "Desconectar" }));
    expect(within(casa).getByText(/para de avisar o barchop/i)).toBeInTheDocument();
    await userEvent.click(within(casa).getByRole("button", { name: "Sim, desconectar" }));

    expect(await within(casa).findByText(/há 1 assinatura online viva/i)).toBeInTheDocument();
    expect(await within(casa).findByRole("link", { name: "Caio Rocha" })).toHaveAttribute("href", "/painel/clientes/c1");
    expect(within(casa).getByText(/chave terminando em 1234/i)).toBeInTheDocument();
  });

  it("sem assinatura viva, desconecta", async () => {
    const falso = montarPainel(<PagamentosOnline />, semear({ contasOnline: { casa: CONTA } }));
    const casa = await screen.findByRole("region", { name: "Conta da casa" });

    await userEvent.click(within(casa).getByRole("button", { name: "Desconectar" }));
    await userEvent.click(within(casa).getByRole("button", { name: "Sim, desconectar" }));

    expect(await within(casa).findByRole("status")).toHaveTextContent("Conta desconectada.");
    expect(within(casa).getByLabelText("Chave de API do Asaas")).toBeInTheDocument();
    expect(falso.estado.contasOnline!.casa).toBeUndefined();
  });

  it("o profissional sem a liberação não conecta; com conta, ainda vê e desconecta", async () => {
    const gustavo: MembroDaEquipe = { ...RAFAEL, id: "bb1", nome: "Gustavo", papel: "profissional" };
    montarPainel(<PagamentosOnline />, semear({ papel: "profissional", equipe: [gustavo, { ...RAFAEL, id: "bb9" }] }));
    expect(await screen.findByText(/o dono libera a venda de planos/i)).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Conta da casa" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Chave de API do Asaas")).not.toBeInTheDocument();
  });

  it("o profissional liberado conecta só a dele", async () => {
    const gustavo: MembroDaEquipe = { ...RAFAEL, nome: "Gustavo", papel: "profissional", podeVenderPlanos: true };
    montarPainel(<PagamentosOnline />, semear({ papel: "profissional", equipe: [gustavo, { ...RAFAEL, id: "bb9" }] }));
    const minha = await screen.findByRole("region", { name: "Sua conta" });
    expect(within(minha).getByLabelText("Chave de API do Asaas")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Conta da casa" })).not.toBeInTheDocument();
  });

  it("fora do Completo: não conecta, e a conta que existe segue com o desconectar", async () => {
    const gratis = { ...criarApiClientFalso().estado.assinatura!, plano: "gratis" as const, planoEfetivo: "gratis" as const };
    montarPainel(<PagamentosOnline />, semear({ assinatura: gratis, contasOnline: { casa: CONTA } }));

    expect(await screen.findByText(/conectar uma conta é do plano completo/i)).toBeInTheDocument();
    const casa = screen.getByRole("region", { name: "Conta da casa" });
    expect(within(casa).getByRole("button", { name: "Desconectar" })).toBeInTheDocument();
    expect(within(casa).queryByRole("button", { name: "Trocar a chave" })).not.toBeInTheDocument();
  });

  it("sem conta, o guia diz como pegar a chave de produção no Asaas", async () => {
    montarPainel(<PagamentosOnline />, semear({ modoAceito: "real" }));

    const guia = await screen.findByRole("region", { name: "Como pegar a chave no Asaas" });
    const passos = within(guia).getAllByRole("listitem");
    expect(passos).toHaveLength(3);
    expect(passos[0]).toHaveTextContent(/crie a conta/i);
    expect(passos[1]).toHaveTextContent(/integrações › chaves de api/i);
    expect(passos[2]).toHaveTextContent(/uma vez só/i);
    expect(passos[2]).toHaveTextContent("$aact_prod_");
    expect(within(guia).getByRole("link", { name: /chaves de api no asaas/i })).toHaveAttribute(
      "href",
      "https://www.asaas.com/customerApiAccessToken/index"
    );
    expect(within(guia).getByRole("link", { name: /criar a conta/i })).toHaveAttribute("href", "https://www.asaas.com/");
  });

  it("no sandbox, o guia aponta pro sandbox do Asaas", async () => {
    montarPainel(<PagamentosOnline />, semear());

    const guia = await screen.findByRole("region", { name: "Como pegar a chave no Asaas" });
    expect(within(guia).getByText("$aact_hmlg_", { exact: false })).toBeInTheDocument();
    expect(within(guia).getByRole("link", { name: /chaves de api no asaas/i })).toHaveAttribute(
      "href",
      "https://sandbox.asaas.com/customerApiAccessToken/index"
    );
  });

  it("o guia some quando a conta conecta", async () => {
    // O dono que não atende só tem a conta da casa pra conectar.
    montarPainel(<PagamentosOnline />, semear({ equipe: [{ ...RAFAEL, atende: false }] }));
    const casa = await screen.findByRole("region", { name: "Conta da casa" });
    expect(screen.getByRole("region", { name: "Como pegar a chave no Asaas" })).toBeInTheDocument();

    await userEvent.type(within(casa).getByLabelText("Chave de API do Asaas"), "$aact_hmlg_chave-9876");
    await userEvent.click(within(casa).getByRole("button", { name: "Conectar" }));

    await within(casa).findByText(/chave terminando em 9876/i);
    expect(screen.queryByRole("region", { name: "Como pegar a chave no Asaas" })).not.toBeInTheDocument();
  });

  it("com a conta conectada, não há guia", async () => {
    montarPainel(
      <PagamentosOnline />,
      semear({ equipe: [{ ...RAFAEL, atende: false }], contasOnline: { casa: CONTA } })
    );
    await screen.findByRole("region", { name: "Conta da casa" });
    expect(screen.queryByRole("region", { name: "Como pegar a chave no Asaas" })).not.toBeInTheDocument();
  });

  it("o profissional sem a liberação não vê o guia", async () => {
    const gustavo: MembroDaEquipe = { ...RAFAEL, id: "bb1", nome: "Gustavo", papel: "profissional" };
    montarPainel(<PagamentosOnline />, semear({ papel: "profissional", equipe: [gustavo, { ...RAFAEL, id: "bb9" }] }));
    await screen.findByText(/o dono libera a venda de planos/i);
    expect(screen.queryByRole("region", { name: "Como pegar a chave no Asaas" })).not.toBeInTheDocument();
  });

  it("escolher a Stripe troca o guia e o campo, e conecta na Stripe", async () => {
    // O dono que não atende só tem a conta da casa pra conectar.
    const falso = montarPainel(<PagamentosOnline />, semear({ equipe: [{ ...RAFAEL, atende: false }] }));
    const casa = await screen.findByRole("region", { name: "Conta da casa" });
    expect(screen.getByRole("radio", { name: "Asaas" })).toBeChecked();
    expect(screen.getByText(/pix, cartão ou boleto/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("radio", { name: "Stripe" }));

    expect(screen.getByText(/só cartão, e não pede o cpf/i)).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Como pegar a chave no Asaas" })).not.toBeInTheDocument();
    const guia = screen.getByRole("region", { name: "Como pegar a chave na Stripe" });
    const passos = within(guia).getAllByRole("listitem");
    expect(passos).toHaveLength(3);
    expect(passos[1]).toHaveTextContent(/desenvolvedores › chaves de api/i);
    expect(passos[1]).toHaveTextContent(/chave restrita/i);
    for (const permissao of [
      "Customers",
      "Products",
      "Prices",
      "Subscriptions",
      "Webhook Endpoints",
      "Invoices",
      "Invoice Payments",
      "PaymentIntents",
    ]) {
      expect(passos[1]).toHaveTextContent(permissao);
    }
    expect(passos[2]).toHaveTextContent("rk_test_");
    expect(within(guia).getByRole("link", { name: /chaves de api na stripe/i })).toHaveAttribute(
      "href",
      "https://dashboard.stripe.com/test/apikeys"
    );

    const campo = within(casa).getByLabelText("Chave restrita da Stripe");
    expect(campo).toHaveAttribute("type", "password");
    await userEvent.type(campo, "rk_test_chave-secreta-9876");
    await userEvent.click(within(casa).getByRole("button", { name: "Conectar" }));

    expect(await within(casa).findByText(/chave terminando em 9876/i)).toBeInTheDocument();
    expect(within(casa).getByText("Stripe", { selector: "strong" })).toBeInTheDocument();
    expect(within(casa).getByText("Teste")).toBeInTheDocument();
    expect(falso.estado.contasOnline!.casa).toMatchObject({ provedor: "stripe", chaveFinal: "9876" });
    // Conectada, a escolha e o guia somem.
    expect(screen.queryByRole("radio", { name: "Stripe" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Como pegar a chave na Stripe" })).not.toBeInTheDocument();
  });

  it("no modo real, o guia da Stripe aponta pras chaves de produção", async () => {
    montarPainel(<PagamentosOnline />, semear({ modoAceito: "real" }));
    await userEvent.click(await screen.findByRole("radio", { name: "Stripe" }));

    const guia = screen.getByRole("region", { name: "Como pegar a chave na Stripe" });
    expect(within(guia).getByText("rk_live_", { exact: false })).toBeInTheDocument();
    expect(within(guia).getByRole("link", { name: /chaves de api na stripe/i })).toHaveAttribute(
      "href",
      "https://dashboard.stripe.com/apikeys"
    );
    expect(within(guia).getByRole("link", { name: /criar a conta/i })).toHaveAttribute(
      "href",
      "https://dashboard.stripe.com/register"
    );
  });

  it("a conta ligada fala pelo provedor dela, e não pela escolha da página", async () => {
    // A casa na Stripe; a do Rafael, sem conta, deixa a escolha à vista.
    const falso = montarPainel(<PagamentosOnline />, semear({ contasOnline: { casa: CONTA_DA_STRIPE } }));
    const casa = await screen.findByRole("region", { name: "Conta da casa" });
    expect(screen.getByRole("radio", { name: "Asaas" })).toBeChecked();
    expect(within(casa).getByText(/chave terminando em 5678/i)).toBeInTheDocument();

    await userEvent.click(within(casa).getByRole("button", { name: "Trocar a chave" }));
    const campo = within(casa).getByLabelText("Chave restrita da Stripe");
    expect(within(casa).getByText(/mesma conta da stripe/i)).toBeInTheDocument();
    await userEvent.type(campo, "sk_test_chave-nova-4321");
    await userEvent.click(within(casa).getByRole("button", { name: "Salvar a chave nova" }));

    expect(await within(casa).findByText(/chave terminando em 4321/i)).toBeInTheDocument();
    expect(falso.estado.contasOnline!.casa).toMatchObject({ provedor: "stripe", chaveFinal: "4321" });

    await userEvent.click(within(casa).getByRole("button", { name: "Desconectar" }));
    expect(within(casa).getByText(/a stripe para de avisar o barchop/i)).toBeInTheDocument();
  });

  it("no índice do dono, a linha diz a conta da casa", async () => {
    navegacaoFalsa.redefinir({ pathname: "/painel/configuracoes" });
    montarPainel(<IndiceDeConfiguracoes />, semear({ contasOnline: { casa: CONTA } }));

    const linha = await screen.findByRole("link", { name: /pagamentos online/i });
    expect(linha).toHaveAttribute("href", "/painel/configuracoes/pagamentos-online");
    await waitFor(() => expect(linha).toHaveTextContent(/chave terminando em 1234/i));
  });
});
