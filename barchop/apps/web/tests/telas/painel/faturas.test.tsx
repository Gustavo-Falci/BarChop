import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { criarApiClientFalso, type SementeFalsa } from "@barchop/api-client";
import type { FaturaDaAssinatura, ResumoDaAssinatura } from "@barchop/types";
import { ProvedorDaAssinatura } from "../../../src/painel/ProvedorDaAssinatura";
import { ProvedorDoPainel } from "../../../src/painel/ProvedorDoPainel";
import { SessaoDoPainel } from "../../../src/painel/SessaoDoPainel";
import { irParaAStripe } from "../../../src/painel/stripe";
import { sessaoDaBarbearia, sessaoDoBarbeiro } from "../../../src/sessao/armazenamento";
import { Faturas } from "../../../src/telas/painel/Faturas";
import { navegacaoFalsa } from "../../ajudantes/navegacao";

// Faturas (Onda 2, marco 1, PR 5), no modelo da tela de assinatura do
// Barbeiro.app: sem plano pago, o caminho Plano → Pagamento → Acesso
// liberado com o pedido ao lado; com plano pago, o plano e as faturas
// lidas da Stripe. Pagar e gerenciar acontecem na Stripe.

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
    usoNoTeste: {
      desde: "2026-10-14T14:11:00.659Z",
      ate: "2026-10-28T14:11:00.659Z",
      agendamentos: 7,
      servicos: 3,
    },
    ...parcial,
  };
}

const PAGA: Partial<ResumoDaAssinatura> = {
  situacao: "ativa",
  plano: "essencial",
  planoEfetivo: "essencial",
  diasDeTesteRestantes: null,
  periodoTerminaEm: "2026-11-28T14:11:00Z",
  limiteDeProfissionais: 3,
  temPortal: true,
  usoNoTeste: null,
};

function fatura(parcial: Partial<FaturaDaAssinatura> = {}): FaturaDaAssinatura {
  return {
    id: "in_1",
    numero: "BARCHOP-0001",
    emitidaEm: "2026-10-28T15:00:00Z",
    valorCentavos: 4490,
    situacao: "paga",
    pdfUrl: "https://pay.stripe.test/in_1.pdf",
    paginaUrl: "https://pay.stripe.test/in_1",
    ...parcial,
  };
}

function montar(assinatura: ResumoDaAssinatura, semente: SementeFalsa = {}, intervaloDeConsulta?: number) {
  const falso = criarApiClientFalso({ ...semente, assinatura });
  render(
    <ProvedorDoPainel valor={{ barbeiro: falso.barbeiro, publico: falso.publico }}>
      <SessaoDoPainel>
        <ProvedorDaAssinatura>
          <Faturas agora={AGORA} intervaloDeConsulta={intervaloDeConsulta} />
        </ProvedorDaAssinatura>
      </SessaoDoPainel>
    </ProvedorDoPainel>
  );
  return falso;
}

// O Intl separa o "R$" com espaço inquebrável.
function texto(elemento: HTMLElement): string {
  return (elemento.textContent ?? "").replaceAll(String.fromCharCode(160), " ");
}

async function preco() {
  return texto(await screen.findByTestId("preco-do-plano"));
}

function etapaAtual() {
  const trilha = screen.getByRole("list", { name: "Etapas da assinatura" });
  return within(trilha)
    .getAllByRole("listitem")
    .find((item) => item.getAttribute("aria-current") === "step")?.textContent;
}

function pedido() {
  return screen.getByRole("complementary", { name: "Seu pedido" });
}

async function continuar() {
  await userEvent.click(await screen.findByRole("button", { name: /^Continuar com o/ }));
}

beforeEach(() => {
  localStorage.clear();
  vi.mocked(irParaAStripe).mockClear();
  navegacaoFalsa.redefinir({ pathname: "/painel/faturas" });
  sessaoDoBarbeiro.gravar("jwt");
  sessaoDaBarbearia.gravar("gr-barber");
});

describe("Faturas sem plano pago: etapa Plano", () => {
  it("em teste: título Faturas, os dias que faltam, e a trilha começa no Plano", async () => {
    montar(resumo());

    expect(await screen.findByRole("heading", { name: "Faturas" })).toBeInTheDocument();
    expect(await screen.findByText("Teste grátis · faltam 10 dias")).toBeInTheDocument();
    expect(etapaAtual()).toMatch(/Plano/);
  });

  it("recomenda pelo uso no teste: mostra o que a barbearia fez e marca o plano que cabe na equipe", async () => {
    montar(resumo());

    expect(await screen.findByText("Recomendado pelo seu uso no teste")).toBeInTheDocument();
    const uso = screen.getByTestId("uso-no-teste");
    expect(uso).toHaveTextContent("14/10 a 28/10");
    expect(uso).toHaveTextContent("Profissionais 2");
    expect(uso).toHaveTextContent("Agendamentos 7");
    expect(uso).toHaveTextContent("Serviços 3");
    const essencial = screen.getByRole("radio", { name: /Essencial/ });
    expect(essencial).toBeChecked();
    expect(essencial).toHaveAccessibleName(/Recomendado/);
    expect(screen.getByRole("radio", { name: /Completo/ })).not.toHaveAccessibleName(/Recomendado/);
  });

  it("equipe maior que o Essencial: ele fica desligado, e o Completo é o recomendado", async () => {
    montar(resumo({ profissionais: 4 }));

    expect(await screen.findByRole("radio", { name: /Essencial/ })).toBeDisabled();
    expect(screen.getByRole("radio", { name: /Completo/ })).toBeChecked();
    expect(screen.getByRole("radio", { name: /Completo/ })).toHaveAccessibleName(/Recomendado/);
    expect(await preco()).toBe("R$ 114,90/mês");
  });

  it("o + e o − recalculam; o Essencial para no limite e convida pro Completo", async () => {
    montar(resumo());
    expect(await preco()).toBe("R$ 59,90/mês");

    await userEvent.click(screen.getByRole("button", { name: "Mais um profissional" }));

    expect(await preco()).toBe("R$ 74,90/mês");
    expect(screen.getByText("2 × R$ 15,00")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mais um profissional" })).toBeDisabled();
    expect(screen.getByText(/O Essencial vai até 3 profissionais/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("radio", { name: /Completo/ }));

    expect(await preco()).toBe("R$ 94,90/mês");
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

    expect(await preco()).toBe("R$ 599,00/ano");
    expect(screen.getByText("Você economiza R$ 119,80 por ano")).toBeInTheDocument();
  });

  it("o Seu pedido acompanha a escolha; no teste, hoje não cobra nada", async () => {
    montar(resumo());
    await screen.findByTestId("preco-do-plano");

    const lado = pedido();
    expect(lado).toHaveTextContent("Essencial");
    expect(lado).toHaveTextContent("2 profissionais");
    expect(lado).toHaveTextContent("Mensal");
    expect(texto(within(lado).getByTestId("hoje"))).toBe("R$ 0,00");
    expect(texto(lado)).toContain("depois R$ 59,90/mês a partir de 28/10");

    await userEvent.click(within(lado).getByRole("button", { name: "Trocar para o anual" }));

    expect(screen.getByRole("radio", { name: /Anual/ })).toBeChecked();
    expect(pedido()).toHaveTextContent("Anual");
    expect(texto(pedido())).toContain("depois R$ 599,00/ano a partir de 28/10");
  });

  it("fora do teste, no Grátis: hoje cobra o valor cheio, e lembra que nada foi apagado", async () => {
    montar(resumo({ situacao: "gratis", planoEfetivo: "gratis", diasDeTesteRestantes: null, testeTerminaEm: null }));
    await screen.findByTestId("preco-do-plano");

    expect(texto(within(pedido()).getByTestId("hoje"))).toBe("R$ 59,90");
    expect(screen.getByText(/Nada foi apagado/)).toBeInTheDocument();
  });

  it("o comparativo sai de planos.ts: limites e o preço por mês de cada plano", async () => {
    montar(resumo());

    const tabela = await screen.findByRole("table", { name: "Comparar planos" });
    const profissionais = within(tabela).getByRole("row", { name: /^Profissionais/ });
    expect(profissionais).toHaveTextContent("1");
    expect(profissionais).toHaveTextContent("Até 3");
    expect(profissionais).toHaveTextContent("Sem limite");
    const porMes = within(tabela).getByRole("row", { name: /^Por mês/ });
    expect(texto(porMes)).toContain("R$ 0,00");
    expect(texto(porMes)).toContain("R$ 44,90");
    expect(texto(porMes)).toContain("R$ 54,90");
  });

  it("promete a troca de plano, que o Portal da Stripe faz", async () => {
    montar(resumo());

    expect(await screen.findByText("Troque de plano quando quiser")).toBeInTheDocument();
  });
});

describe("Faturas sem plano pago: etapa Pagamento", () => {
  it("Continuar leva ao Pagamento: Cartão marcado, Pix e Boleto à vista mas em breve", async () => {
    montar(resumo());

    await continuar();

    expect(etapaAtual()).toMatch(/Pagamento/);
    expect(screen.getByRole("heading", { name: "Como você prefere pagar?" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Cartão/ })).toBeChecked();
    expect(screen.getByRole("radio", { name: /Pix/ })).toBeDisabled();
    expect(screen.getByRole("radio", { name: /Pix/ })).toHaveAccessibleName(/Em breve/);
    expect(screen.getByRole("radio", { name: /Boleto/ })).toBeDisabled();
    expect(screen.getByText(/página segura da Stripe/)).toBeInTheDocument();
  });

  it("Mudar plano volta pra etapa Plano sem perder a escolha", async () => {
    montar(resumo());
    await screen.findByTestId("preco-do-plano");
    await userEvent.click(screen.getByRole("radio", { name: /Completo/ }));
    await userEvent.click(screen.getByRole("radio", { name: /Anual/ }));
    await continuar();

    await userEvent.click(screen.getByRole("button", { name: /Mudar plano/ }));

    expect(etapaAtual()).toMatch(/Plano/);
    expect(screen.getByRole("radio", { name: /Completo/ })).toBeChecked();
    expect(screen.getByRole("radio", { name: /Anual/ })).toBeChecked();
  });

  it("Assinar leva ao Checkout da Stripe com o que foi escolhido", async () => {
    const falso = montar(resumo());
    const checkout = vi.spyOn(falso.barbeiro, "checkoutDaAssinatura");
    await screen.findByTestId("preco-do-plano");
    await userEvent.click(screen.getByRole("radio", { name: /Anual/ }));
    await continuar();

    await userEvent.click(screen.getByRole("button", { name: /^Assinar o Essencial · R\$\s0,00 hoje$/ }));

    expect(checkout).toHaveBeenCalledWith({ plano: "essencial", ciclo: "anual", profissionais: 2 });
    await waitFor(() => expect(irParaAStripe).toHaveBeenCalledWith(expect.stringMatching(/^https:\/\//)));
  });
});

describe("Faturas sem plano pago: etapa Acesso liberado", () => {
  it("na volta do Checkout, confirma com a Stripe e libera o acesso", async () => {
    navegacaoFalsa.redefinir({ pathname: "/painel/faturas", query: { ok: "1" } });
    const falso = montar(resumo(), {}, 5);
    const ativa = resumo({ ...PAGA, periodoTerminaEm: "2026-10-28T14:11:00Z", primeiraCobrancaPendente: true });
    vi.spyOn(falso.barbeiro, "assinatura")
      .mockResolvedValueOnce(resumo())
      .mockResolvedValueOnce(resumo())
      .mockResolvedValue(ativa);

    expect(await screen.findByText(/Confirmando com a Stripe/)).toBeInTheDocument();
    expect(etapaAtual()).toMatch(/Acesso liberado/);

    expect(await screen.findByRole("heading", { name: "Acesso liberado" })).toBeInTheDocument();
    expect(screen.getByText(/1ª cobrança em 28\/10/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver faturas" })).toHaveAttribute("href", "/painel/faturas");
    expect(screen.getByRole("link", { name: "Ir para a agenda" })).toHaveAttribute("href", "/painel/agenda");
    expect(screen.queryByText(/Confirmando com a Stripe/)).not.toBeInTheDocument();
  });
});

describe("Faturas com plano pago", () => {
  it("mostra o plano, a próxima cobrança e as faturas da Stripe, sem a trilha", async () => {
    montar(resumo(PAGA), {
      faturas: [fatura(), fatura({ id: "in_2", numero: "BARCHOP-0002", situacao: "falhou", pdfUrl: null })],
    });

    expect(await screen.findByText("Próxima cobrança em 28/11")).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Etapas da assinatura" })).not.toBeInTheDocument();
    const tabela = await screen.findByRole("table", { name: "Faturas" });
    const paga = within(tabela).getByRole("row", { name: /BARCHOP-0001/ });
    expect(texto(paga)).toContain("28/10");
    expect(texto(paga)).toContain("R$ 44,90");
    expect(paga).toHaveTextContent("Paga");
    expect(within(paga).getByRole("link", { name: /PDF/ })).toHaveAttribute("href", "https://pay.stripe.test/in_1.pdf");
    const falhou = within(tabela).getByRole("row", { name: /BARCHOP-0002/ });
    expect(falhou).toHaveTextContent("Não paga");
    expect(within(falhou).queryByRole("link", { name: /PDF/ })).not.toBeInTheDocument();
  });

  it("fatura reembolsada diz quanto voltou, e o PDF continua lá", async () => {
    montar(resumo(PAGA), {
      faturas: [
        fatura({ situacao: "reembolsada" }),
        fatura({ id: "in_2", numero: "BARCHOP-0002", situacao: "reembolsada_em_parte" }),
      ],
    });

    const tabela = await screen.findByRole("table", { name: "Faturas" });
    const inteira = within(tabela).getByRole("row", { name: /BARCHOP-0001/ });
    expect(inteira).toHaveTextContent("Reembolsada");
    expect(inteira).not.toHaveTextContent("Paga");
    expect(within(inteira).getByRole("link", { name: /PDF/ })).toHaveAttribute("href", "https://pay.stripe.test/in_1.pdf");
    const parte = within(tabela).getByRole("row", { name: /BARCHOP-0002/ });
    expect(parte).toHaveTextContent("Reembolsada em parte");
  });

  it("a fatura de R$ 0 do teste diz que não houve cobrança", async () => {
    montar(resumo(PAGA), { faturas: [fatura({ valorCentavos: 0 })] });

    const tabela = await screen.findByRole("table", { name: "Faturas" });
    expect(within(tabela).getByRole("row", { name: /BARCHOP-0001/ })).toHaveTextContent("Sem cobrança (teste)");
  });

  it("sem fatura nenhuma ainda, diz quando vem a primeira", async () => {
    montar(resumo({ ...PAGA, periodoTerminaEm: "2026-10-28T14:11:00Z", primeiraCobrancaPendente: true }));

    expect(await screen.findByText("Nenhuma fatura ainda.")).toBeInTheDocument();
    expect(screen.getAllByText(/1ª cobrança em 28\/10/).length).toBeGreaterThan(0);
  });

  it("se as faturas não carregam, o plano continua à vista", async () => {
    const falso = criarApiClientFalso({ assinatura: resumo(PAGA) });
    vi.spyOn(falso.barbeiro, "faturasDaAssinatura").mockRejectedValue(new Error("rede"));
    render(
      <ProvedorDoPainel valor={{ barbeiro: falso.barbeiro, publico: falso.publico }}>
        <SessaoDoPainel>
          <ProvedorDaAssinatura>
            <Faturas agora={AGORA} />
          </ProvedorDaAssinatura>
        </SessaoDoPainel>
      </ProvedorDoPainel>
    );

    expect(await screen.findByText(/Não deu para carregar as faturas/)).toBeInTheDocument();
    expect(screen.getByText("Próxima cobrança em 28/11")).toBeInTheDocument();
  });

  it("Gerenciar abre o Portal da Stripe, onde também se troca de plano", async () => {
    const falso = montar(resumo(PAGA));
    expect(await screen.findByText(/Trocar de plano, trocar o cartão/)).toBeInTheDocument();
    const portal = vi.spyOn(falso.barbeiro, "portalDaAssinatura");

    await userEvent.click(await screen.findByRole("button", { name: "Gerenciar assinatura" }));

    expect(portal).toHaveBeenCalled();
    await waitFor(() => expect(irParaAStripe).toHaveBeenCalled());
  });

  it("as perguntas explicam a troca no meio do período: sobe pagando a diferença, desce no fim", async () => {
    montar(resumo(PAGA));

    const pergunta = await screen.findByText("Mudei de plano no meio do mês, quanto pago?");
    const resposta = pergunta.nextElementSibling as HTMLElement;
    expect(resposta).toHaveTextContent(/na hora só a diferença pelos dias que faltam/);
    expect(resposta).toHaveTextContent(/no fim do período já pago/);
    expect(resposta).toHaveTextContent(/Durante o teste, trocar de plano não cobra nada/);
  });

  it("cancelada no Portal: diz até quando vale, sem anunciar cobrança", async () => {
    montar(resumo({ ...PAGA, cancelaEm: "2026-11-28T14:11:00Z" }));

    expect(await screen.findByText("Cancelada: o Essencial vale até 28/11")).toBeInTheDocument();
    expect(screen.queryByText(/cobrança em/)).not.toBeInTheDocument();
  });

  it("pagamento pendente: pede pra atualizar o cartão", async () => {
    montar(resumo({ ...PAGA, situacao: "em_atraso", plano: "completo", planoEfetivo: "completo" }));

    expect(await screen.findByText(/A Stripe não conseguiu cobrar/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Gerenciar assinatura" })).toBeInTheDocument();
  });
});
