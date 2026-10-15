import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { criarApiClientFalso, type SementeFalsa } from "@barchop/api-client";
import type { ResumoDaAssinatura } from "@barchop/types";
import { ProvedorDaAssinatura } from "../../../src/painel/ProvedorDaAssinatura";
import { ProvedorDoPainel } from "../../../src/painel/ProvedorDoPainel";
import { SessaoDoPainel } from "../../../src/painel/SessaoDoPainel";
import { irParaAStripe } from "../../../src/painel/stripe";
import { sessaoDaBarbearia, sessaoDoBarbeiro } from "../../../src/sessao/armazenamento";
import { Assinatura } from "../../../src/telas/painel/Assinatura";
import { navegacaoFalsa } from "../../ajudantes/navegacao";

// A tela do plano (Onda 2, marco 1, PR 5): o dono escolhe plano,
// profissionais e ciclo, vê o preço lido de @barchop/formato/planos e
// vai pra Stripe. Pagar e gerenciar acontecem lá; aqui é só o caminho.

vi.mock("../../../src/painel/stripe", () => ({ irParaAStripe: vi.fn() }));

const AGORA = new Date("2026-10-18T12:00:00Z");

function resumo(parcial: Partial<ResumoDaAssinatura> = {}): ResumoDaAssinatura {
  return {
    situacao: "teste",
    plano: "gratis",
    ciclo: "mensal",
    planoEfetivo: "completo",
    testeTerminaEm: "2026-10-28T14:11:00.659Z",
    diasDeTesteRestantes: 10,
    periodoTerminaEm: null,
    primeiraCobrancaPendente: false,
    cancelaEm: null,
    profissionais: 2,
    limiteDeProfissionais: null,
    excedente: false,
    foraDoLink: [],
    temPortal: false,
    usoNoTeste: null,
    ...parcial,
  };
}

function montar(assinatura: ResumoDaAssinatura, semente: SementeFalsa = {}, intervaloDeConsulta?: number) {
  const falso = criarApiClientFalso({ ...semente, assinatura });
  render(
    <ProvedorDoPainel valor={{ barbeiro: falso.barbeiro, publico: falso.publico }}>
      <SessaoDoPainel>
        <ProvedorDaAssinatura>
          <Assinatura agora={AGORA} intervaloDeConsulta={intervaloDeConsulta} />
        </ProvedorDaAssinatura>
      </SessaoDoPainel>
    </ProvedorDoPainel>
  );
  return falso;
}

// O preço grande do cartão do plano: valor e unidade. O Intl separa o
// "R$" com espaço inquebrável.
async function preco() {
  return (await screen.findByTestId("preco-do-plano")).textContent?.replaceAll(String.fromCharCode(160), " ");
}

describe("tela do plano", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(irParaAStripe).mockClear();
    navegacaoFalsa.redefinir({ pathname: "/painel/assinatura" });
    sessaoDoBarbeiro.gravar("jwt");
    sessaoDaBarbearia.gravar("gr-barber");
  });

  it("em teste: diz quantos dias faltam e começa com a equipe de hoje", async () => {
    montar(resumo());

    expect(await screen.findByRole("heading", { name: "Plano" })).toBeInTheDocument();
    // O título vem antes: a assinatura chega depois do perfil.
    expect(await screen.findByText("Teste grátis · faltam 10 dias")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Essencial" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Mensal" })).toBeChecked();
    expect(screen.getByLabelText("Profissionais")).toHaveTextContent("2");
    expect(await preco()).toBe("R$ 44,90/mês");
  });

  it("o + e o − recalculam; o Essencial para no limite e convida pro Completo", async () => {
    montar(resumo());
    await screen.findByTestId("preco-do-plano");

    await userEvent.click(screen.getByRole("button", { name: "Mais um profissional" }));

    expect(await preco()).toBe("R$ 54,90/mês");
    expect(screen.getByText("2 × R$ 10,00")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mais um profissional" })).toBeDisabled();
    expect(screen.getByText(/O Essencial vai até 3 profissionais/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("radio", { name: "Completo" }));

    expect(await preco()).toBe("R$ 74,90/mês");
    expect(screen.getByRole("button", { name: "Mais um profissional" })).toBeEnabled();
  });

  it("não deixa assinar para menos gente que a equipe", async () => {
    montar(resumo());
    await screen.findByTestId("preco-do-plano");

    expect(screen.getByRole("button", { name: "Menos um profissional" })).toBeDisabled();
    expect(screen.getByText(/Sua equipe tem 2 profissionais/)).toBeInTheDocument();
  });

  it("anual: o preço do ano, 2 meses grátis, e quanto economiza", async () => {
    montar(resumo());
    await screen.findByTestId("preco-do-plano");

    await userEvent.click(screen.getByRole("radio", { name: /Anual/ }));

    expect(await preco()).toBe("R$ 449,00/ano");
    expect(screen.getByText("Você economiza R$ 89,80 por ano")).toBeInTheDocument();
  });

  it("equipe maior que o Essencial: ele fica desligado e começa no Completo", async () => {
    montar(resumo({ profissionais: 4 }));

    expect(await screen.findByRole("radio", { name: "Essencial" })).toBeDisabled();
    expect(screen.getByRole("radio", { name: "Completo" })).toBeChecked();
    expect(await preco()).toBe("R$ 89,90/mês");
  });

  it("em teste, a 1ª cobrança fica pro fim dele", async () => {
    montar(resumo());

    expect(await screen.findByText(/A 1ª cobrança é só em 28\/10/)).toBeInTheDocument();
  });

  it("Assinar leva ao Checkout da Stripe com o que foi escolhido", async () => {
    const falso = montar(resumo());
    const checkout = vi.spyOn(falso.barbeiro, "checkoutDaAssinatura");
    await screen.findByTestId("preco-do-plano");

    await userEvent.click(screen.getByRole("radio", { name: /Anual/ }));
    await userEvent.click(screen.getByRole("button", { name: /^Assinar o Essencial · R\$\s449,00\/ano$/ }));

    expect(checkout).toHaveBeenCalledWith({ plano: "essencial", ciclo: "anual", profissionais: 2 });
    await waitFor(() => expect(irParaAStripe).toHaveBeenCalledWith(expect.stringMatching(/^https:\/\//)));
  });

  it("ativa: mostra o plano, a próxima cobrança, e Gerenciar abre o Portal", async () => {
    const falso = montar(
      resumo({
        situacao: "ativa",
        plano: "essencial",
        planoEfetivo: "essencial",
        diasDeTesteRestantes: null,
        periodoTerminaEm: "2026-11-28T14:11:00Z",
        limiteDeProfissionais: 3,
        temPortal: true,
      })
    );
    const portal = vi.spyOn(falso.barbeiro, "portalDaAssinatura");

    expect(await screen.findByText("Próxima cobrança em 28/11")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Assinar/ })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Gerenciar pagamento e faturas" }));

    expect(portal).toHaveBeenCalled();
    await waitFor(() => expect(irParaAStripe).toHaveBeenCalled());
  });

  it("assinou durante o teste: diz quando vem a 1ª cobrança", async () => {
    montar(
      resumo({
        situacao: "ativa",
        plano: "essencial",
        planoEfetivo: "essencial",
        diasDeTesteRestantes: null,
        periodoTerminaEm: "2026-10-28T14:11:00Z",
        primeiraCobrancaPendente: true,
        temPortal: true,
      })
    );

    expect(await screen.findByText("1ª cobrança em 28/10")).toBeInTheDocument();
  });

  it("cancelada no Portal: diz até quando vale, sem anunciar cobrança", async () => {
    montar(
      resumo({
        situacao: "ativa",
        plano: "essencial",
        planoEfetivo: "essencial",
        diasDeTesteRestantes: null,
        periodoTerminaEm: "2026-11-28T14:11:00Z",
        cancelaEm: "2026-11-28T14:11:00Z",
        temPortal: true,
      })
    );

    expect(await screen.findByText("Cancelada: o Essencial vale até 28/11")).toBeInTheDocument();
    expect(screen.queryByText(/cobrança em/)).not.toBeInTheDocument();
  });

  it("pagamento pendente: pede pra atualizar o cartão", async () => {
    montar(
      resumo({
        situacao: "em_atraso",
        plano: "completo",
        planoEfetivo: "completo",
        diasDeTesteRestantes: null,
        periodoTerminaEm: "2026-11-28T14:11:00Z",
        temPortal: true,
      })
    );

    expect(await screen.findByText(/Pagamento pendente/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Gerenciar pagamento e faturas" })).toBeInTheDocument();
  });

  it("na volta do Checkout, consulta de novo até a Stripe confirmar", async () => {
    navegacaoFalsa.redefinir({ pathname: "/painel/assinatura", query: { ok: "1" } });
    const falso = montar(resumo(), {}, 5);
    const ativa = resumo({
      situacao: "ativa",
      plano: "essencial",
      planoEfetivo: "essencial",
      diasDeTesteRestantes: null,
      periodoTerminaEm: "2026-10-28T14:11:00Z",
      primeiraCobrancaPendente: true,
      temPortal: true,
    });
    vi.spyOn(falso.barbeiro, "assinatura")
      .mockResolvedValueOnce(resumo())
      .mockResolvedValueOnce(resumo())
      .mockResolvedValue(ativa);

    expect(await screen.findByText(/Pagamento recebido/)).toBeInTheDocument();
    expect(await screen.findByText("1ª cobrança em 28/10")).toBeInTheDocument();
    expect(screen.queryByText(/Pagamento recebido/)).not.toBeInTheDocument();
  });
});
