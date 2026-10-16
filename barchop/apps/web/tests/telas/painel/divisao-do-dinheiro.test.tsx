import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { criarApiClientFalso, type SementeFalsa } from "@barchop/api-client";
import type { MembroDaEquipe, SalvarDivisao } from "@barchop/types";
import { DivisaoDoDinheiro } from "../../../src/telas/painel/configuracoes/DivisaoDoDinheiro";
import { navegacaoFalsa } from "../../ajudantes/navegacao";
import { montarPainel } from "../../ajudantes/painel";

// A divisão do dinheiro (Onda 2, marco 2, PR 8 do plano caixa-do-dia):
// a parte da casa de cada um e a grade "cliente de ↓ × atendeu →", com
// um exemplo do efeito. Só o dono; fora do "X de N decididas".

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
};
const GUSTAVO: MembroDaEquipe = { ...RAFAEL, id: "bb0", nome: "Gustavo", email: "gustavo@gr.com", papel: "profissional" };

// A regra da GR: cliente do Rafael atendido pelo Gustavo, 60% pro Rafael;
// a casa leva 10% do que o Gustavo atende.
function semear(extra: SementeFalsa = {}) {
  return criarApiClientFalso({
    equipe: [RAFAEL, GUSTAVO],
    divisao: { parteDaCasa: { bb0: 10 }, matriz: [{ donoDoCliente: "bb1", atendente: "bb0", percentual: 60 }] },
    ...extra,
  });
}

describe("divisão do dinheiro", () => {
  beforeEach(() => {
    localStorage.clear();
    navegacaoFalsa.redefinir({ pathname: "/painel/configuracoes/divisao" });
  });

  it("mostra a parte da casa de cada um e a grade preenchida", async () => {
    montarPainel(<DivisaoDoDinheiro />, semear());

    const casa = await screen.findByRole("group", { name: /parte da casa/i });
    expect(within(casa).getByLabelText("Rafael")).toHaveValue("0");
    expect(within(casa).getByLabelText("Gustavo")).toHaveValue("10");

    expect(screen.getByLabelText("Cliente de Rafael atendido por Gustavo")).toHaveValue("60");
    expect(screen.getByLabelText("Cliente de Gustavo atendido por Rafael")).toHaveValue("0");
    // Com o próprio cliente, quem atende fica com tudo: não há campo.
    expect(screen.queryByLabelText("Cliente de Rafael atendido por Rafael")).not.toBeInTheDocument();
  });

  it("o exemplo do efeito acompanha o que se digita", async () => {
    montarPainel(<DivisaoDoDinheiro />, semear());

    expect(
      await screen.findByText(/Gustavo fica com R\$\s36,00, Rafael com R\$\s54,00 e a casa com R\$\s10,00/)
    ).toBeInTheDocument();

    const celula = screen.getByLabelText("Cliente de Rafael atendido por Gustavo");
    await userEvent.clear(celula);
    await userEvent.type(celula, "50");

    expect(screen.getByText(/Gustavo fica com R\$\s45,00, Rafael com R\$\s45,00 e a casa com R\$\s10,00/)).toBeInTheDocument();
  });

  it("Salvar só aparece quando muda, e grava a grade inteira", async () => {
    const falso = semear();
    const original = falso.barbeiro.salvarDivisao;
    const salvar = vi.fn(async (divisao: SalvarDivisao) => original(divisao));
    falso.barbeiro.salvarDivisao = salvar;
    montarPainel(<DivisaoDoDinheiro />, falso);

    const casa = await screen.findByRole("group", { name: /parte da casa/i });
    expect(screen.queryByRole("button", { name: /^salvar$/i })).not.toBeInTheDocument();

    await userEvent.clear(within(casa).getByLabelText("Gustavo"));
    await userEvent.type(within(casa).getByLabelText("Gustavo"), "20");
    await userEvent.click(screen.getByRole("button", { name: /^salvar$/i }));

    await waitFor(() =>
      expect(salvar).toHaveBeenCalledWith({
        parteDaCasa: [
          { membroId: "bb1", percentual: 0 },
          { membroId: "bb0", percentual: 20 },
        ],
        matriz: [
          { donoDoClienteId: "bb1", atendenteId: "bb0", percentual: 60 },
          { donoDoClienteId: "bb0", atendenteId: "bb1", percentual: 0 },
        ],
      })
    );
    await waitFor(() => expect(screen.queryByRole("button", { name: /^salvar$/i })).not.toBeInTheDocument());
    expect((await falso.barbeiro.divisao()).membros.find((m) => m.id === "bb0")?.parteDaCasa).toBe(20);
  });

  it("Descartar volta ao que está gravado", async () => {
    montarPainel(<DivisaoDoDinheiro />, semear());

    const celula = await screen.findByLabelText("Cliente de Rafael atendido por Gustavo");
    await userEvent.clear(celula);
    await userEvent.type(celula, "30");
    await userEvent.click(screen.getByRole("button", { name: /descartar/i }));

    expect(celula).toHaveValue("60");
  });

  it("percentual fora de 0 a 100 não deixa salvar", async () => {
    montarPainel(<DivisaoDoDinheiro />, semear());

    const celula = await screen.findByLabelText("Cliente de Rafael atendido por Gustavo");
    await userEvent.clear(celula);
    await userEvent.type(celula, "150");

    expect(screen.getByText(/de 0 a 100/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^salvar$/i })).toBeDisabled();
  });

  it("com uma pessoa só, não há grade entre profissionais", async () => {
    montarPainel(<DivisaoDoDinheiro />, semear({ equipe: [RAFAEL], divisao: { parteDaCasa: {}, matriz: [] } }));

    expect(await screen.findByText(/não há o que dividir entre profissionais/i)).toBeInTheDocument();
    expect(screen.getByRole("group", { name: /parte da casa/i })).toBeInTheDocument();
  });

  it("quem não é dono vê o recado, sem a grade", async () => {
    montarPainel(
      <DivisaoDoDinheiro />,
      semear({ papel: "profissional", equipe: [{ ...RAFAEL, papel: "profissional" }, { ...GUSTAVO, papel: "dono" }] })
    );

    expect(await screen.findByText(/só o dono/i)).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: /parte da casa/i })).not.toBeInTheDocument();
  });

  it("plano sem caixa: o convite para escolher um plano", async () => {
    const falso = semear();
    falso.estado.assinatura = { ...falso.estado.assinatura!, situacao: "gratis", plano: "gratis", planoEfetivo: "gratis" };
    montarPainel(<DivisaoDoDinheiro />, falso);

    expect(await screen.findByText(/dos planos essencial e completo/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /ver os planos/i })).toHaveAttribute("href", "/painel/faturas");
  });
});
