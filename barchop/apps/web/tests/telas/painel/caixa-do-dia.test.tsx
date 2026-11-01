import { readFileSync } from "node:fs";
import { join } from "node:path";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { criarApiClientFalso, type SementeFalsa } from "@barchop/api-client";
import type { MembroDaEquipe } from "@barchop/types";
import { CaixaDoDia } from "../../../src/telas/painel/CaixaDoDia";
import { navegacaoFalsa } from "../../ajudantes/navegacao";
import { montarPainel } from "../../ajudantes/painel";
import { comTelaDeCelular } from "../../ajudantes/tela";

// A tela do Caixa (Onda 2, marco 2, PR 7 do plano caixa-do-dia): o que
// entrou no dia, quem tem de repassar quanto a quem, o que ainda falta
// registrar e o "Fechar o dia" do dono.

const DIA = "2026-09-08";

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
const GUSTAVO: MembroDaEquipe = { ...RAFAEL, id: "bb0", nome: "Gustavo", email: "gustavo@gr.com", papel: "profissional" };

function agendamento(id: string, horaInicio: string, barbeiro: { id: string; nome: string }, status = "confirmado") {
  return {
    id,
    clienteId: "c1",
    data: DIA,
    horaInicio,
    horaFim: `${horaInicio.slice(0, 2)}:45`,
    status: status as "confirmado",
    origem: "barbeiro" as const,
    observacoes: null,
    barbeiro,
    servicos: [{ servicoId: "s1", nome: "Corte", precoNoMomento: "40.00", duracaoNoMomento: 45 }],
  };
}

// O dia da GR: o cliente é do Rafael. Rafael atende às 9 (R$ 40, pix);
// Gustavo atende às 10 (R$ 100, dinheiro na mão dele) e a matriz dá 60%
// ao Rafael. Às 11, um atendimento do Rafael ainda marcado.
async function semear(extra: SementeFalsa = {}) {
  const falso = criarApiClientFalso({
    clientes: [{ id: "c1", nome: "João Silva", telefone: "(11) 99999-0001", email: null, temConta: false }],
    equipe: [RAFAEL, GUSTAVO],
    agendamentos: [
      agendamento("a1", "09:00", { id: "bb1", nome: "Rafael" }),
      agendamento("a2", "10:00", { id: "bb0", nome: "Gustavo" }),
      agendamento("a3", "11:00", { id: "bb1", nome: "Rafael" }),
    ],
    divisao: { parteDaCasa: {}, matriz: [{ donoDoCliente: "bb1", atendente: "bb0", percentual: 60 }] },
    donosDosClientes: { c1: "bb1" },
    ...extra,
  });
  await falso.barbeiro.registrarPagamento("a1", { forma: "pix" });
  await falso.barbeiro.registrarPagamento("a2", { forma: "dinheiro", servicosCentavos: 10000 });
  return falso;
}

describe("tela do Caixa", () => {
  beforeEach(() => {
    localStorage.clear();
    navegacaoFalsa.redefinir({ pathname: "/painel/caixa", query: { data: DIA } });
  });

  it("o total do dia e os totais por forma", async () => {
    montarPainel(<CaixaDoDia />, await semear());

    const totais = await screen.findByRole("region", { name: /entrou no dia/i });
    expect(within(totais).getByText(/R\$\s140,00/)).toBeInTheDocument();
    expect(within(totais).getByText("Pix")).toBeInTheDocument();
    expect(within(totais).getByText(/R\$\s40,00/)).toBeInTheDocument();
    expect(within(totais).getByText("Dinheiro")).toBeInTheDocument();
    expect(within(totais).getByText(/R\$\s100,00/)).toBeInTheDocument();
  });

  it("o acerto por pessoa e os repasses em frases", async () => {
    montarPainel(<CaixaDoDia />, await semear());

    const acerto = await screen.findByRole("region", { name: /acerto/i });
    const rafael = within(acerto).getByRole("group", { name: "Rafael" });
    expect(within(rafael).getByText(/tem a receber R\$\s60,00/i)).toBeInTheDocument();
    const gustavo = within(acerto).getByRole("group", { name: "Gustavo" });
    expect(within(gustavo).getByText(/tem a repassar R\$\s60,00/i)).toBeInTheDocument();
    expect(within(acerto).getByText(/Gustavo repassa R\$\s60,00 para Rafael\./)).toBeInTheDocument();
  });

  it("os pagamentos na ordem do dia, cada um levando ao atendimento", async () => {
    montarPainel(<CaixaDoDia />, await semear());

    const lista = await screen.findByRole("region", { name: /pagamentos/i });
    const links = within(lista).getAllByRole("link");
    expect(links.map((l) => l.getAttribute("href"))).toEqual(["/painel/agendamentos/a1", "/painel/agendamentos/a2"]);
    expect(links[1]).toHaveTextContent(/10:00/);
    expect(links[1]).toHaveTextContent(/João Silva/);
    expect(links[1]).toHaveTextContent(/em dinheiro/);
  });

  it("as pendências levam ao atendimento que falta registrar", async () => {
    montarPainel(<CaixaDoDia />, await semear());

    const pendencias = await screen.findByRole("region", { name: /pendências/i });
    const link = within(pendencias).getByRole("link", { name: /11:00/ });
    expect(link).toHaveAttribute("href", "/painel/agendamentos/a3");
    expect(link).toHaveTextContent(/ainda confirmado/i);
  });

  it("anda pelos dias: anterior, hoje e próximo", async () => {
    montarPainel(<CaixaDoDia agora={new Date(2026, 8, 20, 12)} />, await semear());

    expect(await screen.findByRole("link", { name: /dia anterior/i })).toHaveAttribute(
      "href",
      "/painel/caixa?data=2026-09-07"
    );
    expect(screen.getByRole("link", { name: /próximo dia/i })).toHaveAttribute("href", "/painel/caixa?data=2026-09-09");
    expect(screen.getByRole("link", { name: /^hoje$/i })).toHaveAttribute("href", "/painel/caixa");
  });

  it("fechar com pendência avisa antes; fechado, o dono reabre", async () => {
    montarPainel(<CaixaDoDia />, await semear());

    await userEvent.click(await screen.findByRole("button", { name: /fechar o dia/i }));
    expect(screen.getByText(/1 atendimento ainda sem pagamento/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /sim, fechar/i }));

    expect(await screen.findByText(/dia fechado/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /reabrir o dia/i }));
    expect(await screen.findByRole("button", { name: /fechar o dia/i })).toBeInTheDocument();
  });

  // A confirmação numa janela, com a lista do que fica de fora (17/10):
  // a frase longa ao lado dos botões não dizia quais atendimentos eram.
  it("com pendência, a confirmação abre numa janela que lista o que fica de fora", async () => {
    montarPainel(<CaixaDoDia />, await semear());

    await userEvent.click(await screen.findByRole("button", { name: /fechar o dia/i }));

    const janela = screen.getByRole("dialog", { name: /fechar o dia/i });
    expect(within(janela).getByText(/1 atendimento ainda sem pagamento/i)).toBeInTheDocument();
    expect(within(janela).getByRole("listitem")).toHaveTextContent(/ainda confirmado/i);
    await userEvent.click(within(janela).getByRole("button", { name: "Não" }));
    expect(screen.queryByRole("dialog", { name: /fechar o dia/i })).not.toBeInTheDocument();
  });

  it("sem pendência, fecha no primeiro clique", async () => {
    const falso = await semear();
    await falso.barbeiro.atualizarAgendamento("a3", { status: "cancelado" });
    montarPainel(<CaixaDoDia />, falso);

    await userEvent.click(await screen.findByRole("button", { name: /fechar o dia/i }));

    expect(await screen.findByRole("button", { name: /reabrir o dia/i })).toBeInTheDocument();
  });

  it("o profissional vê o caixa, mas não fecha nem reabre", async () => {
    // O papel do logado vem do membro bb1 da equipe: o Rafael passa a
    // profissional e o Gustavo, a dono.
    montarPainel(
      <CaixaDoDia />,
      await semear({
        papel: "profissional",
        equipe: [
          { ...RAFAEL, papel: "profissional" },
          { ...GUSTAVO, papel: "dono" },
        ],
      })
    );

    expect(await screen.findByRole("region", { name: /acerto/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /fechar o dia/i })).not.toBeInTheDocument();
  });

  it("dia sem nada diz isso, sem tabela vazia", async () => {
    navegacaoFalsa.redefinir({ pathname: "/painel/caixa", query: { data: "2026-09-10" } });
    montarPainel(<CaixaDoDia />, await semear());

    expect(await screen.findByText(/nenhum pagamento neste dia/i)).toBeInTheDocument();
  });

  it("plano sem caixa: o convite para o dono escolher um plano", async () => {
    const falso = criarApiClientFalso();
    falso.estado.assinatura = { ...falso.estado.assinatura!, situacao: "gratis", plano: "gratis", planoEfetivo: "gratis" };
    montarPainel(<CaixaDoDia />, falso);

    expect(await screen.findByText(/o caixa do dia é dos planos essencial e completo/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /ver os planos/i })).toHaveAttribute("href", "/painel/faturas");
  });
});

// Redesenho do celular, PR 4. No celular, "Fechar o dia" ficava no
// topo, antes de qualquer número: a ação vinha antes do que ela fecha.
// Agora vem depois dos valores (o acerto e o que entrou), fora do
// cabeçalho. No desktop segue no cabeçalho.
describe("Caixa no celular", () => {
  let desfazer: () => void;
  beforeEach(() => {
    localStorage.clear();
    navegacaoFalsa.redefinir({ pathname: "/painel/caixa", query: { data: DIA } });
    desfazer = comTelaDeCelular();
  });
  afterEach(() => desfazer());

  function depois(a: Element, b: Element) {
    return Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
  }

  it("Fechar o dia vem depois dos valores, fora do cabeçalho", async () => {
    montarPainel(<CaixaDoDia />, await semear());

    const botao = await screen.findByRole("button", { name: /fechar o dia/i });
    const entrou = screen.getByRole("region", { name: /entrou no dia/i });
    const pagamentos = screen.getByRole("region", { name: /pagamentos/i });

    expect(botao.closest("header")).toBeNull();
    expect(depois(entrou, botao)).toBe(true);
    expect(depois(botao, pagamentos)).toBe(true);
  });

  it("fechado, o Reabrir fica no mesmo lugar", async () => {
    const falso = await semear();
    await falso.barbeiro.atualizarAgendamento("a3", { status: "cancelado" });
    montarPainel(<CaixaDoDia />, falso);

    await userEvent.click(await screen.findByRole("button", { name: /fechar o dia/i }));
    const reabrir = await screen.findByRole("button", { name: /reabrir o dia/i });

    expect(reabrir.closest("header")).toBeNull();
    expect(depois(screen.getByRole("region", { name: /entrou no dia/i }), reabrir)).toBe(true);
  });

  it("anterior, hoje e próximo numa linha só, sem quebrar", () => {
    const css = readFileSync(join(__dirname, "../../../src/telas/painel/CaixaDoDia.module.css"), "utf8").replace(
      /\r\n/g,
      "\n"
    );
    const inicio = css.indexOf("@media (max-width: 30rem)");
    const celular = inicio < 0 ? "" : css.slice(inicio, css.indexOf("\n}\n", inicio) + 2);

    expect(celular).toMatch(/\.dias\s*\{[^}]*grid-template-columns:\s*1fr auto 1fr/);
  });
});

describe("Caixa no desktop", () => {
  beforeEach(() => {
    localStorage.clear();
    navegacaoFalsa.redefinir({ pathname: "/painel/caixa", query: { data: DIA } });
  });

  it("Fechar o dia segue no cabeçalho", async () => {
    montarPainel(<CaixaDoDia />, await semear());

    expect((await screen.findByRole("button", { name: /fechar o dia/i })).closest("header")).not.toBeNull();
  });
});
