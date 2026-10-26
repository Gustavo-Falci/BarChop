import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { criarApiClientFalso } from "@barchop/api-client";
import type { AssinaturaDoPainel, MembroDaEquipe, PlanoDoPainel } from "@barchop/types";

import { DetalheDoCliente } from "../../../src/telas/painel/DetalheDoCliente";
import { ListaDePlanos } from "../../../src/telas/painel/ListaDePlanos";
import { navegacaoFalsa } from "../../ajudantes/navegacao";
import { montarPainel } from "../../ajudantes/painel";

// O assinante no balcão (Onda 2, marco 3, PR 7b do plano
// planos-de-assinatura): a aba Assinantes na tela dos planos e, no
// detalhe do cliente, assinar, "Recebi" e cancelar. A lista, o "Recebi"
// e o cancelar seguem fora do Completo; só assinar pede o Completo.

const AGORA = new Date("2026-10-24T10:00:00-03:00");

const gustavo: MembroDaEquipe = {
  id: "bb0",
  nome: "Gustavo",
  email: "gustavo@gr.com",
  telefone: null,
  papel: "profissional",
  atende: true,
  ativo: true,
  fotoUrl: null,
  convitePendente: false,
  podeVenderPlanos: true,
};

const daCasa: PlanoDoPainel = {
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
  onlineIndisponivel: false,
  ativo: true,
  servicos: [{ servicoId: "s1", nome: "Corte", usosPorCiclo: null }],
  assinantes: 1,
};

const doGustavo: PlanoDoPainel = {
  ...daCasa,
  id: "pl2",
  daCasa: false,
  vendedor: { id: "bb0", nome: "Gustavo" },
  nome: "2 cortes",
  fixoPorAtendimentoCentavos: null,
  diasDeTeste: 7,
  servicos: [{ servicoId: "s1", nome: "Corte", usosPorCiclo: 2 }],
  assinantes: 1,
};

const desativado: PlanoDoPainel = { ...daCasa, id: "pl3", nome: "Barba antiga", ativo: false, assinantes: 0 };
const soOnline: PlanoDoPainel = {
  ...daCasa,
  id: "pl4",
  nome: "Só na página",
  aceitaOnline: true,
  aceitaNoBalcao: false,
  assinantes: 0,
};

const joao = { id: "c1", nome: "João Silva", telefone: "(11) 99999-0001", email: null, temConta: false };
const carlos = { id: "c2", nome: "Carlos Mendes", telefone: "(11) 99999-0002", email: null, temConta: false };

// Carlos no plano da casa, com o ciclo vencido em 20/10: em atraso.
const carlosAtrasado: AssinaturaDoPainel = {
  id: "as1",
  situacao: "ativa",
  forma: "no_balcao",
  precoCentavos: 12000,
  ciclo: "mensal",
  cicloComecaEm: "2026-09-20",
  cicloTerminaEm: "2026-10-20",
  canceladaEm: null,
  criadoEm: "2026-09-20T12:00:00.000Z",
  cliente: { id: "c2", nome: "Carlos Mendes", telefone: "(11) 99999-0002" },
  plano: { id: "pl1", nome: "Corte ilimitado", daCasa: true, vendedor: null },
};

// João no plano do Gustavo, em dia até 10/11.
const joaoEmDia: AssinaturaDoPainel = {
  ...carlosAtrasado,
  id: "as2",
  cicloComecaEm: "2026-10-10",
  cicloTerminaEm: "2026-11-10",
  criadoEm: "2026-10-10T12:00:00.000Z",
  cliente: { id: "c1", nome: "João Silva", telefone: "(11) 99999-0001" },
  plano: { id: "pl2", nome: "2 cortes", daCasa: false, vendedor: { id: "bb0", nome: "Gustavo" } },
};

function semear(extra: Parameters<typeof criarApiClientFalso>[0] = {}) {
  const falso = criarApiClientFalso({
    hoje: "2026-10-24",
    clientes: [joao, carlos],
    planos: [daCasa, doGustavo, desativado, soOnline],
    assinaturas: [carlosAtrasado, joaoEmDia],
    ...extra,
  });
  falso.estado.equipe!.push({ ...gustavo });
  return falso;
}

function semCompleto(falso: ReturnType<typeof semear>) {
  falso.estado.assinatura = { ...falso.estado.assinatura!, situacao: "ativa", plano: "essencial", planoEfetivo: "essencial" };
  return falso;
}

// A linha da tabela, pelo nome do cliente.
function linhaDe(nome: string): HTMLElement {
  return screen.getByText(nome).closest("tr")!;
}

async function abrirAssinantes() {
  await userEvent.click(await screen.findByRole("tab", { name: /assinantes/i }));
}

beforeEach(() => {
  localStorage.clear();
  navegacaoFalsa.redefinir({ pathname: "/painel/planos" });
});

describe("a aba Assinantes", () => {
  it("lista quem assina, de quem é o plano, a situação e o ciclo", async () => {
    montarPainel(<ListaDePlanos agora={AGORA} />, semear());
    expect(await screen.findByRole("tab", { name: "Assinantes 2" })).toBeInTheDocument();
    await abrirAssinantes();

    const carlosNaLista = linhaDe("Carlos Mendes");
    expect(within(carlosNaLista).getByText("Corte ilimitado")).toBeInTheDocument();
    expect(within(carlosNaLista).getByText("Da casa")).toBeInTheDocument();
    expect(within(carlosNaLista).getByText("Em atraso")).toBeInTheDocument();
    expect(within(carlosNaLista).getByText(/venceu em 20\/10/i)).toBeInTheDocument();
    expect(within(carlosNaLista).getByRole("button", { name: /recebi/i })).toBeInTheDocument();

    const joaoNaLista = linhaDe("João Silva");
    expect(within(joaoNaLista).getByText("De Gustavo")).toBeInTheDocument();
    expect(within(joaoNaLista).getByText("Ativa")).toBeInTheDocument();
    expect(within(joaoNaLista).getByText(/renova em 10\/11/i)).toBeInTheDocument();
    // Em dia: o "Recebi" seria recusado (ciclo_em_dia).
    expect(within(joaoNaLista).queryByRole("button", { name: /recebi/i })).not.toBeInTheDocument();
  });

  it("filtra pela situação, com quantas há em cada", async () => {
    montarPainel(<ListaDePlanos agora={AGORA} />, semear());
    await abrirAssinantes();
    await userEvent.click(await screen.findByRole("button", { name: "Em atraso 1" }));
    expect(screen.getByText("Carlos Mendes")).toBeInTheDocument();
    expect(screen.queryByText("João Silva")).not.toBeInTheDocument();
  });

  it("a linha abre o cliente", async () => {
    montarPainel(<ListaDePlanos agora={AGORA} />, semear());
    await abrirAssinantes();
    await userEvent.click(await screen.findByRole("button", { name: /carlos mendes/i }));
    expect(navegacaoFalsa.push).toHaveBeenCalledWith("/painel/clientes/c2");
  });

  it("Recebi pergunta a forma, lança e a assinatura volta a valer", async () => {
    const falso = semear();
    const receber = vi.spyOn(falso.barbeiro, "receberMensalidade");
    montarPainel(<ListaDePlanos agora={AGORA} />, falso);
    await abrirAssinantes();

    await userEvent.click(await within(linhaDe("Carlos Mendes")).findByRole("button", { name: /recebi/i }));
    const janela = await screen.findByRole("dialog", { name: /recebi a mensalidade/i });
    expect(within(janela).getByText(/carlos mendes/i)).toBeInTheDocument();
    await userEvent.click(within(janela).getByRole("radio", { name: "Dinheiro" }));
    await userEvent.click(within(janela).getByRole("button", { name: /confirmar/i }));

    await waitFor(() => expect(receber).toHaveBeenCalledWith("as1", "dinheiro"));
    expect(await screen.findByText(/r\$\s?120,00 em dinheiro no caixa de hoje/i)).toBeInTheDocument();
    expect(await within(linhaDe("Carlos Mendes")).findByText("Ativa")).toBeInTheDocument();
  });

  it("sem assinante, diz onde se assina", async () => {
    montarPainel(<ListaDePlanos agora={AGORA} />, semear({ assinaturas: [] }));
    await abrirAssinantes();
    expect(await screen.findByText(/nenhum assinante ainda/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /abrir os clientes/i })).toHaveAttribute("href", "/painel/clientes");
  });

  it("fora do Completo, o convite fica nos planos e os assinantes seguem com o Recebi", async () => {
    montarPainel(<ListaDePlanos agora={AGORA} />, semCompleto(semear()));
    expect(await screen.findByText(/planos de assinatura são do plano completo/i)).toBeInTheDocument();
    await abrirAssinantes();
    expect(within(linhaDe("Carlos Mendes")).getByRole("button", { name: /recebi/i })).toBeInTheDocument();
  });

  it("fora do Completo e sem assinante, só o convite", async () => {
    montarPainel(<ListaDePlanos agora={AGORA} />, semCompleto(semear({ assinaturas: [] })));
    expect(await screen.findByText(/planos de assinatura são do plano completo/i)).toBeInTheDocument();
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
  });
});

describe("os planos no detalhe do cliente", () => {
  function montar(falso: ReturnType<typeof semear>, clienteId = "c1") {
    navegacaoFalsa.redefinir({ pathname: `/painel/clientes/${clienteId}`, params: { id: clienteId } });
    montarPainel(<DetalheDoCliente agora={AGORA} />, falso);
  }

  function secaoDosPlanos(): Promise<HTMLElement> {
    return screen.findByRole("region", { name: "Planos" });
  }

  it("mostra o plano que o cliente assina, de quem é e até quando vale", async () => {
    montar(semear());
    const planos = await secaoDosPlanos();
    expect(await within(planos).findByText("2 cortes")).toBeInTheDocument();
    expect(within(planos).getByText("Ativa")).toBeInTheDocument();
    expect(within(planos).getByText(/de gustavo/i)).toBeInTheDocument();
    expect(within(planos).getByText(/renova em 10\/11/i)).toBeInTheDocument();
  });

  it("assinar oferece só os planos ativos no balcão que o cliente ainda não tem", async () => {
    const falso = semear();
    const assinar = vi.spyOn(falso.barbeiro, "assinarPlano");
    montar(falso);
    const planos = await secaoDosPlanos();

    await userEvent.click(await within(planos).findByRole("button", { name: /assinar plano/i }));
    expect(within(planos).getByRole("radio", { name: /corte ilimitado/i })).toBeInTheDocument();
    expect(within(planos).queryByRole("radio", { name: /2 cortes/i })).not.toBeInTheDocument();
    expect(within(planos).queryByRole("radio", { name: /barba antiga/i })).not.toBeInTheDocument();
    expect(within(planos).queryByRole("radio", { name: /só na página/i })).not.toBeInTheDocument();

    await userEvent.click(within(planos).getByRole("radio", { name: /corte ilimitado/i }));
    expect(within(planos).getByText(/fica pendente até o primeiro recebi/i)).toBeInTheDocument();
    await userEvent.click(within(planos).getByRole("button", { name: /^assinar$/i }));

    await waitFor(() => expect(assinar).toHaveBeenCalledWith("c1", "pl1"));
    expect(await within(planos).findByText("Pendente")).toBeInTheDocument();
    expect(within(planos).getByRole("button", { name: /recebi/i })).toBeInTheDocument();
  });

  it("plano com dias grátis diz até quando vai o teste", async () => {
    montar(semear(), "c2");
    const planos = await secaoDosPlanos();
    await userEvent.click(await within(planos).findByRole("button", { name: /assinar plano/i }));
    await userEvent.click(within(planos).getByRole("radio", { name: /2 cortes/i }));
    expect(within(planos).getByText(/7 dias grátis, até 31\/10/i)).toBeInTheDocument();
  });

  it("Recebi com o dia de hoje fechado diz em que caixa entrou", async () => {
    montar(semear({ diasFechados: ["2026-10-24"] }), "c2");
    const planos = await secaoDosPlanos();
    await userEvent.click(await within(planos).findByRole("button", { name: /recebi/i }));
    const janela = await screen.findByRole("dialog", { name: /recebi a mensalidade/i });
    await userEvent.click(within(janela).getByRole("button", { name: /confirmar/i }));
    expect(await screen.findByText(/no caixa de 25\/10/i)).toBeInTheDocument();
  });

  it("cancelar pede confirmação e tira o plano do cliente", async () => {
    const falso = semear();
    const cancelar = vi.spyOn(falso.barbeiro, "cancelarAssinaturaDoPlano");
    montar(falso);
    const planos = await secaoDosPlanos();

    await userEvent.click(await within(planos).findByRole("button", { name: /cancelar assinatura/i }));
    expect(within(planos).getByText(/deixa de valer nos atendimentos/i)).toBeInTheDocument();
    expect(cancelar).not.toHaveBeenCalled();
    await userEvent.click(within(planos).getByRole("button", { name: /sim, cancelar/i }));

    await waitFor(() => expect(cancelar).toHaveBeenCalledWith("as2"));
    await waitFor(() => expect(within(planos).queryByText("2 cortes")).not.toBeInTheDocument());
  });

  it("fora do Completo, sem Assinar, mas o Recebi segue", async () => {
    montar(semCompleto(semear()), "c2");
    const planos = await secaoDosPlanos();
    expect(await within(planos).findByRole("button", { name: /recebi/i })).toBeInTheDocument();
    expect(within(planos).queryByRole("button", { name: /assinar plano/i })).not.toBeInTheDocument();
  });

  it("sem plano pra oferecer e sem assinatura, a seção não aparece", async () => {
    montar(semear({ planos: [], assinaturas: [] }));
    expect(await screen.findByRole("region", { name: "Dados" })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("region", { name: "Planos" })).not.toBeInTheDocument());
  });
});
