import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
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
    expect(within(regiao).getByRole("link", { name: "Escolher plano" })).toHaveAttribute("href", "/painel/faturas");
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

  // A faixa ocupava 38px em todas as telas, sem fechar. O recado neutro
  // (teste correndo, cancelamento marcado) fecha por 24h; nos últimos 3
  // dias ele fica, e o de atenção nunca fecha.
  describe("fechar a faixa", () => {
    const DIA = 24 * 60 * 60 * 1000;
    const daqui = (dias: number) => new Date(Date.now() + dias * DIA).toISOString();

    it("o recado neutro fecha e some", async () => {
      montar({ assinatura: resumo({ diasDeTesteRestantes: 10 }) });

      await userEvent.click(within(await faixa()).getByRole("button", { name: "Fechar aviso" }));

      expect(screen.queryByRole("region", { name: "Assinatura" })).not.toBeInTheDocument();
    });

    it("fechada, continua fechada ao voltar ao painel no mesmo dia", async () => {
      const primeiro = montar({ assinatura: resumo({ diasDeTesteRestantes: 10 }) });
      await userEvent.click(within(await faixa()).getByRole("button", { name: "Fechar aviso" }));
      cleanup();

      const { leitura } = montar({ assinatura: resumo({ diasDeTesteRestantes: 10 }) });

      await waitFor(() => expect(leitura).toHaveBeenCalled());
      await screen.findByText("conteúdo da tela");
      expect(screen.queryByRole("region", { name: "Assinatura" })).not.toBeInTheDocument();
      expect(primeiro.leitura).toHaveBeenCalled();
    });

    it("passadas 24h, volta", async () => {
      montar({ assinatura: resumo({ diasDeTesteRestantes: 10 }) });
      await userEvent.click(within(await faixa()).getByRole("button", { name: "Fechar aviso" }));
      cleanup();
      const agora = Date.now();
      const relogio = vi.spyOn(Date, "now").mockReturnValue(agora + DIA + 1000);

      montar({ assinatura: resumo({ diasDeTesteRestantes: 9 }) });

      expect(await faixa()).toHaveTextContent("Teste grátis: faltam 9 dias");
      relogio.mockRestore();
    });

    it("a contagem de dias virar no meio das 24h não traz a faixa de volta", async () => {
      // "faltam 10 dias" vira "faltam 9 dias" à meia-noite (ou na hora
      // em que o teste começou); o recado é o mesmo, e fechado continua.
      montar({ assinatura: resumo({ diasDeTesteRestantes: 10 }) });
      await userEvent.click(within(await faixa()).getByRole("button", { name: "Fechar aviso" }));
      cleanup();

      const { leitura } = montar({ assinatura: resumo({ diasDeTesteRestantes: 9 }) });

      await waitFor(() => expect(leitura).toHaveBeenCalled());
      await screen.findByText("conteúdo da tela");
      expect(screen.queryByRole("region", { name: "Assinatura" })).not.toBeInTheDocument();
    });

    it("nos últimos 3 dias do teste, não fecha", async () => {
      montar({ assinatura: resumo({ diasDeTesteRestantes: 3 }) });

      const regiao = await faixa();

      expect(within(regiao).queryByRole("button", { name: "Fechar aviso" })).not.toBeInTheDocument();
    });

    it("nos últimos 3 dias do plano cancelado, não fecha", async () => {
      montar({ assinatura: resumo({ ...ATIVA, cancelaEm: daqui(2) }) });

      const regiao = await faixa();

      expect(regiao).toHaveTextContent(/Assinatura cancelada/);
      expect(within(regiao).queryByRole("button", { name: "Fechar aviso" })).not.toBeInTheDocument();
    });

    it("cancelado com mais de 3 dias pela frente, fecha", async () => {
      montar({ assinatura: resumo({ ...ATIVA, cancelaEm: daqui(20) }) });

      expect(within(await faixa()).getByRole("button", { name: "Fechar aviso" })).toBeInTheDocument();
    });

    it("o recado de atenção não fecha", async () => {
      montar({ assinatura: resumo({ ...ATIVA, situacao: "em_atraso" }) });

      const regiao = await faixa();

      expect(within(regiao).queryByRole("button", { name: "Fechar aviso" })).not.toBeInTheDocument();
    });

    it("fechar um recado não esconde outro que chegue depois", async () => {
      montar({ assinatura: resumo({ diasDeTesteRestantes: 10 }) });
      await userEvent.click(within(await faixa()).getByRole("button", { name: "Fechar aviso" }));
      cleanup();

      montar({ assinatura: resumo({ ...ATIVA, cancelaEm: daqui(20) }) });

      expect(await faixa()).toHaveTextContent(/Assinatura cancelada/);
    });
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

  // Tudo da assinatura mora em Faturas (decisão do dono, 15/10): o
  // item Plano saiu, e Faturas leva à tela, antes ou depois de assinar.
  it("antes de assinar, Faturas leva à tela de Faturas, e não há item Plano", async () => {
    montar({ assinatura: resumo() });

    await abrirAConta();

    expect(screen.getByRole("link", { name: /Faturas/ })).toHaveAttribute("href", "/painel/faturas");
    expect(screen.queryByRole("link", { name: /^Plano$/ })).not.toBeInTheDocument();
  });

  it("com plano pago, Faturas também leva à tela, e não abre a Stripe direto", async () => {
    montar({ assinatura: ATIVA });

    await abrirAConta();

    expect(screen.getByRole("link", { name: /Faturas/ })).toHaveAttribute("href", "/painel/faturas");
    expect(irParaAStripe).not.toHaveBeenCalled();
  });

  it("quem não é dono não vê Faturas", async () => {
    montar({ papel: "profissional", assinatura: resumo() });

    await abrirAConta();

    expect(screen.queryByRole("link", { name: /Faturas/ })).not.toBeInTheDocument();
  });
});
