import { render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { criarApiClientFalso, ErroDaApi } from "@barchop/api-client";
import type { NumerosDoDia } from "@barchop/types";
import { sessaoDoSuporte } from "../../../src/sessao/armazenamento";
import { ProvedorDoSuporte } from "../../../src/suporte/ProvedorDoSuporte";
import { NumerosDoSuporte } from "../../../src/telas/suporte/NumerosDoSuporte";
import { navegacaoFalsa } from "../../ajudantes/navegacao";

// Home nova, marco 1 (PR B): o dono do produto vê a linha de base da home
// atual — visitas, cadastros vindos dela e a taxa — em 7 e 30 dias, antes
// da troca pela home nova.

// 30 dias, de 14/10 a 12/11 (hoje), zerados; os de `com` por cima.
function trintaDias(com: Record<number, Partial<NumerosDoDia>> = {}): NumerosDoDia[] {
  return Array.from({ length: 30 }, (_, i) => {
    const data = new Date(Date.UTC(2026, 9, 14 + i)).toISOString().slice(0, 10);
    return { dia: data, visitas: 0, cadastros: 0, cadastrosDaHome: 0, ...com[i] };
  });
}

// Hoje (29) e 6 dias atrás (23) caem nos 7 dias; 7 dias atrás (22), só nos 30.
const COM_VISITAS = trintaDias({
  29: { visitas: 30, cadastros: 2, cadastrosDaHome: 1 },
  23: { visitas: 10, cadastros: 3, cadastrosDaHome: 1 },
  22: { visitas: 60, cadastrosDaHome: 2 },
});

function montar(numerosDoSite: NumerosDoDia[] = COM_VISITAS) {
  const falso = criarApiClientFalso({ numerosDoSite });
  render(
    <ProvedorDoSuporte valor={falso.suporte}>
      <NumerosDoSuporte />
    </ProvedorDoSuporte>
  );
  return falso;
}

describe("números do suporte", () => {
  beforeEach(() => {
    localStorage.clear();
    navegacaoFalsa.redefinir({ pathname: "/painel/suporte/numeros" });
  });

  it("sem sessão do suporte, manda pro entrar do suporte", async () => {
    montar();

    await waitFor(() => expect(navegacaoFalsa.replace).toHaveBeenCalledWith("/painel/suporte/entrar"));
  });

  it("a aba Números fica marcada na casca do suporte", async () => {
    sessaoDoSuporte.gravar("jwt-falso-suporte");
    montar();

    const abas = screen.getByRole("navigation", { name: "Áreas do suporte" });
    expect(within(abas).getByRole("link", { name: "Números" })).toHaveAttribute("aria-current", "page");
    expect(within(abas).getByRole("link", { name: "Números" })).toHaveAttribute("href", "/painel/suporte/numeros");
  });

  it("mostra os últimos 7 e 30 dias, com a taxa e os volumes ao lado", async () => {
    sessaoDoSuporte.gravar("jwt-falso-suporte");
    montar();

    const semana = await screen.findByRole("region", { name: "Últimos 7 dias" });
    expect(semana).toHaveTextContent(/5,0\s?%/);
    expect(semana).toHaveTextContent("40 visitas da home");
    expect(semana).toHaveTextContent("2 cadastros vindos da home");
    expect(semana).toHaveTextContent("5 cadastros no total");

    const mes = screen.getByRole("region", { name: "Últimos 30 dias" });
    expect(mes).toHaveTextContent(/4,0\s?%/);
    expect(mes).toHaveTextContent("100 visitas da home");
    expect(mes).toHaveTextContent("4 cadastros vindos da home");
  });

  it("dia a dia, de hoje pra trás, com os dias zerados também", async () => {
    sessaoDoSuporte.gravar("jwt-falso-suporte");
    montar();

    const tabela = await screen.findByRole("table", { name: "Por dia" });
    const linhas = within(tabela).getAllByRole("row").slice(1);
    expect(linhas).toHaveLength(30);
    expect(within(linhas[0]).getAllByRole("cell").map((c) => c.textContent)).toEqual(["12/11", "30", "1", "2"]);
    expect(within(linhas[29]).getAllByRole("cell").map((c) => c.textContent)).toEqual(["14/10", "0", "0", "0"]);
  });

  it("sem visitas contadas, diz isso no lugar da taxa", async () => {
    sessaoDoSuporte.gravar("jwt-falso-suporte");
    montar(trintaDias());

    const semana = await screen.findByRole("region", { name: "Últimos 7 dias" });
    expect(semana).toHaveTextContent("Ainda sem visitas contadas");
    expect(semana).not.toHaveTextContent("%");
  });

  it("sessão vencida volta pro entrar do suporte", async () => {
    sessaoDoSuporte.gravar("jwt-falso-suporte");
    const falso = criarApiClientFalso();
    falso.suporte.numeros = async () => {
      throw new ErroDaApi(401, "nao_autenticado", "");
    };
    render(
      <ProvedorDoSuporte valor={falso.suporte}>
        <NumerosDoSuporte />
      </ProvedorDoSuporte>
    );

    await waitFor(() => expect(navegacaoFalsa.replace).toHaveBeenCalledWith("/painel/suporte/entrar"));
    expect(sessaoDoSuporte.ler()).toBeNull();
  });

  it("falha da API vira aviso com a mensagem", async () => {
    sessaoDoSuporte.gravar("jwt-falso-suporte");
    const falso = criarApiClientFalso();
    falso.suporte.numeros = async () => {
      throw new ErroDaApi(500, "erro_interno", "");
    };
    render(
      <ProvedorDoSuporte valor={falso.suporte}>
        <NumerosDoSuporte />
      </ProvedorDoSuporte>
    );

    expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível carregar os números agora.");
  });
});
