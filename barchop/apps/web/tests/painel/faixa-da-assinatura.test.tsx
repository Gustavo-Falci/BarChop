import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { criarApiClientFalso, type SementeFalsa } from "@barchop/api-client";
import type { ResumoDaAssinatura } from "@barchop/types";
import { LayoutDoPainel } from "../../src/painel/LayoutDoPainel";
import { ProvedorDoPainel } from "../../src/painel/ProvedorDoPainel";
import { SessaoDoPainel } from "../../src/painel/SessaoDoPainel";
import { irParaAStripe } from "../../src/painel/stripe";
import { sessaoDaBarbearia, sessaoDoBarbeiro } from "../../src/sessao/armazenamento";
import { navegacaoFalsa } from "../ajudantes/navegacao";

// A faixa da assinatura no topo do painel e os itens Plano e Faturas no
// menu da conta (Onda 2, marco 1, PR 5). Só o dono vê a assinatura: os
// outros papéis nem pedem, e a API responderia 403.

vi.mock("../../src/painel/stripe", () => ({ irParaAStripe: vi.fn() }));

// jsdom não implementa matchMedia. Ver tests/painel/tema.test.ts.
function stubMatchMedia(): void {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

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
    profissionais: 1,
    limiteDeProfissionais: null,
    excedente: false,
    foraDoLink: [],
    temPortal: false,
    usoNoTeste: null,
    ...parcial,
  };
}

const ATIVA = resumo({
  situacao: "ativa",
  plano: "essencial",
  planoEfetivo: "essencial",
  diasDeTesteRestantes: null,
  periodoTerminaEm: "2026-11-28T14:11:00Z",
  limiteDeProfissionais: 3,
  temPortal: true,
});

function montar(semente: SementeFalsa) {
  const falso = criarApiClientFalso(semente);
  const leitura = vi.spyOn(falso.barbeiro, "assinatura");
  render(
    <ProvedorDoPainel valor={{ barbeiro: falso.barbeiro, publico: falso.publico }}>
      <SessaoDoPainel>
        <LayoutDoPainel>
          <p>conteúdo da tela</p>
        </LayoutDoPainel>
      </SessaoDoPainel>
    </ProvedorDoPainel>
  );
  return { falso, leitura };
}

async function faixa() {
  return screen.findByRole("region", { name: "Assinatura" });
}

async function abrirAConta() {
  await userEvent.click(await screen.findByRole("button", { name: /Rafael/ }));
}

describe("faixa da assinatura", () => {
  beforeEach(() => {
    localStorage.clear();
    stubMatchMedia();
    vi.mocked(irParaAStripe).mockClear();
    navegacaoFalsa.redefinir({ pathname: "/painel" });
    sessaoDoBarbeiro.gravar("jwt");
    sessaoDaBarbearia.gravar("gr-barber");
  });

  it("em teste: quantos dias faltam, com o caminho pro plano", async () => {
    montar({ assinatura: resumo() });

    const regiao = await faixa();

    expect(regiao).toHaveTextContent("Teste grátis: faltam 10 dias");
    expect(within(regiao).getByRole("link", { name: "Escolher plano" })).toHaveAttribute("href", "/painel/assinatura");
  });

  it("no último dia, fala no singular", async () => {
    montar({ assinatura: resumo({ diasDeTesteRestantes: 1 }) });

    expect(await faixa()).toHaveTextContent("Teste grátis: falta 1 dia");
  });

  it("pagamento pendente: pede pra atualizar o cartão", async () => {
    montar({ assinatura: resumo({ ...ATIVA, situacao: "em_atraso" }) });

    expect(await faixa()).toHaveTextContent(/Pagamento pendente/);
  });

  it("no Grátis acima do limite: diz quem saiu do link", async () => {
    montar({
      assinatura: resumo({
        situacao: "gratis",
        planoEfetivo: "gratis",
        testeTerminaEm: null,
        diasDeTesteRestantes: null,
        profissionais: 3,
        limiteDeProfissionais: 1,
        excedente: true,
        foraDoLink: [
          { id: "m2", nome: "Ana Souza" },
          { id: "m3", nome: "João Lima" },
        ],
      }),
    });

    const regiao = await faixa();

    expect(regiao).toHaveTextContent("No Grátis, só 1 profissional aparece no seu link");
    expect(regiao).toHaveTextContent("Fora do link: Ana Souza e João Lima");
  });

  it("cancelada no Portal: até quando o plano vale", async () => {
    montar({ assinatura: resumo({ ...ATIVA, cancelaEm: "2026-11-28T14:11:00Z" }) });

    expect(await faixa()).toHaveTextContent("Assinatura cancelada: o Essencial vale até 28/11");
  });

  it("o cancelamento já terminou: o que vale é o Grátis, não a data que passou", async () => {
    montar({
      assinatura: resumo({
        situacao: "cancelada",
        plano: "essencial",
        planoEfetivo: "gratis",
        testeTerminaEm: null,
        diasDeTesteRestantes: null,
        cancelaEm: "2026-10-28T14:11:00Z",
        profissionais: 2,
        limiteDeProfissionais: 1,
        excedente: true,
        foraDoLink: [{ id: "m2", nome: "Ana Souza" }],
      }),
    });

    const regiao = await faixa();

    expect(regiao).toHaveTextContent("Fora do link: Ana Souza");
    expect(regiao).not.toHaveTextContent(/vale até/);
  });

  it("ativa e em dia: nenhuma faixa", async () => {
    const { leitura } = montar({ assinatura: ATIVA });

    await waitFor(() => expect(leitura).toHaveBeenCalled());
    await screen.findByText("conteúdo da tela");
    expect(screen.queryByRole("region", { name: "Assinatura" })).not.toBeInTheDocument();
  });

  it("quem não é dono não vê a faixa, e a assinatura nem é pedida", async () => {
    const { leitura } = montar({ papel: "profissional", assinatura: resumo() });

    await screen.findByText("conteúdo da tela");
    await screen.findByRole("button", { name: /Rafael/ });
    expect(screen.queryByRole("region", { name: "Assinatura" })).not.toBeInTheDocument();
    expect(leitura).not.toHaveBeenCalled();
  });
});

describe("menu da conta", () => {
  beforeEach(() => {
    localStorage.clear();
    stubMatchMedia();
    vi.mocked(irParaAStripe).mockClear();
    navegacaoFalsa.redefinir({ pathname: "/painel" });
    sessaoDoBarbeiro.gravar("jwt");
    sessaoDaBarbearia.gravar("gr-barber");
  });

  it("o dono tem Plano, que leva à tela do plano", async () => {
    montar({ assinatura: resumo() });

    await abrirAConta();

    expect(screen.getByRole("link", { name: /Plano/ })).toHaveAttribute("href", "/painel/assinatura");
  });

  it("com o Portal, Faturas abre o Portal da Stripe", async () => {
    const { falso } = montar({ assinatura: ATIVA });
    const portal = vi.spyOn(falso.barbeiro, "portalDaAssinatura");

    await abrirAConta();
    await userEvent.click(await screen.findByRole("button", { name: /Faturas/ }));

    expect(portal).toHaveBeenCalled();
    await waitFor(() => expect(irParaAStripe).toHaveBeenCalled());
  });

  it("antes de assinar, Faturas fica desligada", async () => {
    montar({ assinatura: resumo() });

    await abrirAConta();

    expect(await screen.findByRole("button", { name: /Faturas/ })).toBeDisabled();
  });

  it("quem não é dono não vê Plano nem Faturas", async () => {
    montar({ papel: "profissional", assinatura: resumo() });

    await abrirAConta();

    expect(screen.queryByRole("link", { name: /Plano/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Faturas/ })).not.toBeInTheDocument();
  });
});
