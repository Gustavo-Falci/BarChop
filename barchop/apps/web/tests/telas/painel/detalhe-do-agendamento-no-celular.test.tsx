import { readFileSync } from "node:fs";
import { join } from "node:path";
import { screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { criarApiClientFalso } from "@barchop/api-client";
import { DetalheDoAgendamento } from "../../../src/telas/painel/DetalheDoAgendamento";
import { navegacaoFalsa } from "../../ajudantes/navegacao";
import { montarPainel } from "../../ajudantes/painel";

// Redesenho dos detalhes e cadastros, PR 1 (plano
// .claude/plans/redesenho-detalhes.plan.md, canvas aprovado em 01/11):
// o andamento numa linha, as ações do cartão numa lista e os títulos de
// seção como nas Configurações. O jsdom não faz layout: as regras de
// CSS se conferem lendo o .module.css.

function lerCss(): string {
  return readFileSync(join(__dirname, "../../../src/telas/painel/DetalheDoAgendamento.module.css"), "utf8").replace(
    /\r\n/g,
    "\n"
  );
}

function blocoDaMedia(css: string, abertura: string): string {
  const inicio = css.indexOf(abertura);
  if (inicio < 0) return "";
  const resto = css.slice(inicio);
  return resto.slice(0, resto.indexOf("\n}\n") + 2);
}

function regra(css: string, seletor: string): string {
  const escapado = seletor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return css.match(new RegExp(`(?:^|\\n)\\s*${escapado}\\s*\\{([^}]*)\\}`))?.[1] ?? "";
}

function semear() {
  return criarApiClientFalso({
    clientes: [{ id: "c1", nome: "João Silva", telefone: "(11) 99999-0001", email: null, temConta: false }],
    agendamentos: [
      {
        id: "a1",
        clienteId: "c1",
        // No futuro: só o que ainda não passou muda de horário.
        data: "2026-12-08",
        horaInicio: "09:00",
        horaFim: "09:30",
        status: "confirmado",
        origem: "cliente",
        observacoes: null,
        servicos: [{ servicoId: "s1", nome: "Corte", precoNoMomento: "40.00", duracaoNoMomento: 30 }],
      },
    ],
  });
}

describe("detalhe do agendamento no celular", () => {
  beforeEach(() => {
    localStorage.clear();
    navegacaoFalsa.redefinir({ pathname: "/painel/agendamentos/a1", params: { id: "a1" } });
  });

  it("Mudar horário entra na lista de ações, antes de Marcar falta", async () => {
    montarPainel(<DetalheDoAgendamento />, semear());

    const faixa = await screen.findByRole("region", { name: "Situação do atendimento" });
    const mudar = await within(faixa).findByRole("button", { name: "Mudar horário" });
    const falta = within(faixa).getByRole("button", { name: "Marcar falta" });
    // Junto das outras (a mesma lista), e não solto embaixo do cartão.
    expect(mudar.parentElement).toBe(falta.parentElement);
    expect(mudar.compareDocumentPosition(falta) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("o andamento fica numa linha: um passo por coluna, o nome embaixo da bolinha", () => {
    // Pendente, Confirmado e Concluído pediam 381px lado a lado e
    // quebravam em duas linhas em qualquer celular.
    const css = lerCss();
    expect(regra(css, ".caminho")).toMatch(/grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/);
    expect(regra(css, ".etapa")).toMatch(/flex-direction:\s*column/);
  });

  it("no computador, o andamento tem largura pros três nomes e o próximo passo vem primeiro", () => {
    const css = lerCss();
    expect(regra(css, ".faixa")).toMatch(/grid-template-columns:\s*minmax\(20rem, 1fr\) auto/);
    expect(regra(css, ".principal")).toMatch(/order:\s*-1/);
  });

  it("sem o vão de 72px reservado pro botão preso no pé", () => {
    // O espaço do botão fixo fica no fim da página, não no meio do
    // cartão (eram 88px entre "Cancelar agendamento" e "Mudar horário").
    const celular = blocoDaMedia(lerCss(), "@media (max-width: 900px)");
    expect(regra(celular, ".acoes:has(.principal)")).not.toMatch(/padding-block-end/);
    expect(regra(celular, ".pagina:has(.principal)")).toMatch(/padding-block-end/);
  });

  it("no celular, as ações secundárias viram linhas do cartão", () => {
    const celular = blocoDaMedia(lerCss(), "@media (max-width: 900px)");
    const linha = regra(celular, ".acoes:has(.principal) > :not(.principal)");
    expect(linha).toMatch(/min-height:\s*56px/);
    expect(linha).toMatch(/border-radius:\s*0/);
  });

  it("os títulos de seção são títulos, como nas Configurações, e não rótulos em caixa alta", () => {
    expect(regra(lerCss(), ".rotuloDoGrupo")).not.toMatch(/text-transform:\s*uppercase/);
  });
});
