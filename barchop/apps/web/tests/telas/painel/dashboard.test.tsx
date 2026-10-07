import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { criarApiClientFalso } from "@barchop/api-client";
import type { MembroDaEquipe } from "@barchop/types";
import { DashboardDoDia } from "../../../src/telas/painel/DashboardDoDia";
import { navegacaoFalsa } from "../../ajudantes/navegacao";
import { montarPainel } from "../../ajudantes/painel";

// Data fixa e instante fixo: teste que compara data fixa com o relógio
// real passa hoje e falha sozinho depois. Uma terça, às 10:00.
const AGORA = new Date("2026-09-08T10:00:00-03:00");
const HOJE = "2026-09-08";

const CLIENTES = [{ id: "c1", nome: "João Silva", telefone: "(11) 99999-0001", email: null, temConta: false }];

function marcado(id: string, horaInicio: string, horaFim: string, extra: { status?: string; barbeiro?: { id: string; nome: string } } = {}) {
  return {
    id,
    clienteId: "c1",
    data: HOJE,
    horaInicio,
    horaFim,
    status: extra.status ?? "confirmado",
    origem: "cliente",
    observacoes: null,
    ...(extra.barbeiro ? { barbeiro: extra.barbeiro } : {}),
    servicos: [{ servicoId: "s1", nome: "Corte", precoNoMomento: "40.00", duracaoNoMomento: 30 }],
  };
}

function membro(id: string, nome: string, papel: MembroDaEquipe["papel"]): MembroDaEquipe {
  return { id, nome, email: null, telefone: null, papel, atende: true, ativo: true, fotoUrl: null, convitePendente: false };
}

function semear(agendamentos = [marcado("a1", "11:00", "11:30")]) {
  return criarApiClientFalso({ clientes: CLIENTES, agendamentos });
}

function numeroDe(legenda: RegExp) {
  return screen.getByText(legenda).previousSibling?.textContent;
}

async function proximosAtendimentos() {
  return screen.findByRole("region", { name: /próximos atendimentos/i });
}

async function ocupacao() {
  return screen.findByRole("region", { name: /^ocupação$/i });
}

describe("Hoje", () => {
  beforeEach(() => {
    localStorage.clear();
    navegacaoFalsa.redefinir({ pathname: "/painel" });
  });

  it("mostra quantos são hoje, quantos ainda vêm e o previsto", async () => {
    montarPainel(
      <DashboardDoDia agora={AGORA} />,
      semear([marcado("a0", "08:00", "08:30"), marcado("a1", "11:00", "11:30")])
    );

    await proximosAtendimentos();
    expect(numeroDe(/agendamentos hoje/i)).toBe("2");
    expect(numeroDe(/ainda hoje/i)).toBe("1");
    // "Previsto", não "faturamento": o número é promessa, não caixa.
    expect(numeroDe(/previsto hoje/i)).toBe("R$ 80,00");
  });

  it("lista os próximos atendimentos e leva ao detalhe", async () => {
    montarPainel(<DashboardDoDia agora={AGORA} />, semear());

    await userEvent.click(
      within(await proximosAtendimentos()).getByRole("button", { name: /11:00.*João Silva.*Corte/ })
    );

    expect(navegacaoFalsa.push).toHaveBeenCalledWith("/painel/agendamentos/a1");
  });

  it("o que já passou sai da lista; o que está acontecendo ganha \"Agora\"", async () => {
    montarPainel(
      <DashboardDoDia agora={AGORA} />,
      semear([marcado("a0", "08:00", "08:30"), marcado("a1", "09:45", "10:30"), marcado("a2", "11:00", "11:30")])
    );

    const lista = await proximosAtendimentos();

    expect(within(lista).queryByRole("button", { name: /08:00/ })).toBeNull();
    expect(within(lista).getByRole("button", { name: /09:45.*agora/i })).toBeInTheDocument();
    expect(within(lista).getByRole("button", { name: /11:00/ })).not.toHaveTextContent(/agora/i);
  });

  it("mostra até cinco e leva pro dia inteiro na agenda", async () => {
    const horas = ["11", "12", "13", "14", "15", "16", "17"];
    montarPainel(
      <DashboardDoDia agora={AGORA} />,
      semear(horas.map((h) => marcado(`a${h}`, `${h}:00`, `${h}:30`)))
    );

    const lista = await proximosAtendimentos();

    expect(within(lista).getAllByRole("button")).toHaveLength(5);
    expect(within(lista).getByRole("link", { name: /ver o dia na agenda/i })).toHaveAttribute(
      "href",
      "/painel/agenda"
    );
  });

  it("num dia sem agendamento diz isso em vez de mostrar lista vazia", async () => {
    montarPainel(<DashboardDoDia agora={AGORA} />, semear([]));

    expect(await within(await proximosAtendimentos()).findByText(/nenhum agendamento hoje/i)).toBeInTheDocument();
  });

  it("quando o que tinha hoje já passou, diz que acabou", async () => {
    montarPainel(<DashboardDoDia agora={AGORA} />, semear([marcado("a0", "08:00", "08:30")]));

    expect(await within(await proximosAtendimentos()).findByText(/nada mais pra hoje/i)).toBeInTheDocument();
  });
});

// A conta é da API (GET /barbearias/me/ocupacao); o dublê usa o horário
// da casa, 09:00–18:00 = 9h, pra cada um que atende.
describe("Hoje — ocupação", () => {
  beforeEach(() => {
    localStorage.clear();
    navegacaoFalsa.redefinir({ pathname: "/painel" });
  });

  it("mostra a ocupação da casa, em porcentagem e em horas", async () => {
    montarPainel(<DashboardDoDia agora={AGORA} />, semear());

    const regiao = await ocupacao();
    const barra = await within(regiao).findByRole("meter", { name: /ocupação da casa/i });

    expect(barra).toHaveAttribute("aria-valuenow", "6");
    expect(regiao).toHaveTextContent("6%");
    expect(regiao).toHaveTextContent(/30 min de 9h/);
  });

  it("com equipe, uma barra por profissional", async () => {
    const falso = criarApiClientFalso({
      clientes: CLIENTES,
      equipe: [membro("bb1", "Rafael", "dono"), membro("bb2", "Ana", "profissional")],
      agendamentos: [marcado("a1", "11:00", "12:00", { barbeiro: { id: "bb2", nome: "Ana" } })],
    });
    montarPainel(<DashboardDoDia agora={AGORA} />, falso);

    const regiao = await ocupacao();

    expect(await within(regiao).findByRole("meter", { name: /ocupação de rafael/i })).toHaveAttribute(
      "aria-valuenow",
      "0"
    );
    expect(within(regiao).getByRole("meter", { name: /ocupação de ana/i })).toHaveAttribute("aria-valuenow", "11");
  });

  it("dia sem trabalho diz que está fechado, sem barra", async () => {
    // Domingo: o horário padrão do dublê não abre.
    montarPainel(<DashboardDoDia agora={new Date("2026-09-06T10:00:00-03:00")} />, semear([]));

    const regiao = await ocupacao();

    expect(await within(regiao).findByText(/fechado hoje/i)).toBeInTheDocument();
    expect(within(regiao).queryByRole("meter")).toBeNull();
  });
});
